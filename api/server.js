import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import http from "node:http";
import pg from "pg";

const { Pool } = pg;

const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
const appPassword = process.env.APP_PASSWORD;
const jwtSecret = process.env.JWT_SECRET || appPassword;
const apiToken = process.env.API_TOKEN || "";
const corsOrigin = process.env.CORS_ORIGIN || "*";

if (!databaseUrl) {
  throw new Error("DATABASE_URL nao configurado.");
}

if (!appPassword) {
  throw new Error("APP_PASSWORD nao configurado.");
}

const pool = new Pool({ connectionString: databaseUrl });

async function initDatabase() {
  await pool.query(`
    create table if not exists shipments (
      id text primary key,
      code text not null unique,
      carrier text not null,
      invoice_number text not null default 'Sem nota',
      issuer text not null default 'Nao informado',
      file_name text not null default 'Sem XML',
      items jsonb not null default '[]'::jsonb,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Payload muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON invalido."));
      }
    });
  });
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(data) {
  return createHmac("sha256", jwtSecret).update(data).digest("base64url");
}

function createToken() {
  const payload = base64url(JSON.stringify({
    sub: "shared-access",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return false;
  if (apiToken && token === apiToken) return true;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) return false;
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireAuth(req, res) {
  if (verifyToken(getBearerToken(req))) {
    return true;
  }

  send(res, 401, { error: "Nao autorizado." });
  return false;
}

function normalizeShipment(input) {
  const code = String(input.code || "").trim().toUpperCase();
  const carrier = String(input.carrier || "").trim();

  if (!code || !carrier) {
    throw new Error("Rastreio e transportadora sao obrigatorios.");
  }

  const items = Array.isArray(input.items) ? input.items : [];
  const digits = code.replace(/^LTM-?/, "").replace(/\D/g, "");
  const latamFields = carrier === "LATAM Cargo" && digits.length === 11
    ? { prefix: input.prefix || digits.slice(0, 3), awb: input.awb || digits.slice(3) }
    : {};

  return {
    id: String(input.id || randomUUID()),
    code,
    carrier,
    ...latamFields,
    invoiceNumber: String(input.invoiceNumber || "Sem nota"),
    issuer: String(input.issuer || "Nao informado"),
    fileName: String(input.fileName || "Sem XML"),
    items,
    createdAt: String(input.createdAt || new Date().toLocaleString("pt-BR")),
  };
}

function rowToShipment(row) {
  return normalizeShipment({
    ...row.payload,
    id: row.id,
    code: row.code,
    carrier: row.carrier,
    invoiceNumber: row.invoice_number,
    issuer: row.issuer,
    fileName: row.file_name,
    items: row.items || [],
  });
}

async function listShipments() {
  const result = await pool.query(`
    select *
    from shipments
    order by created_at desc, updated_at desc
  `);
  return result.rows.map(rowToShipment);
}

async function upsertShipment(shipment) {
  const normalized = normalizeShipment(shipment);
  await pool.query(`
    insert into shipments (id, code, carrier, invoice_number, issuer, file_name, items, payload)
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
    on conflict (code) do update set
      carrier = excluded.carrier,
      invoice_number = excluded.invoice_number,
      issuer = excluded.issuer,
      file_name = excluded.file_name,
      items = excluded.items,
      payload = excluded.payload,
      updated_at = now()
  `, [
    normalized.id,
    normalized.code,
    normalized.carrier,
    normalized.invoiceNumber,
    normalized.issuer,
    normalized.fileName,
    JSON.stringify(normalized.items),
    JSON.stringify(normalized),
  ]);
  return normalized;
}

async function handle(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/health") {
      send(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      const body = await readJson(req);
      if (body.password !== appPassword) {
        send(res, 401, { error: "Senha invalida." });
        return;
      }

      send(res, 200, { token: createToken() });
      return;
    }

    if (url.pathname === "/api/me" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      send(res, 200, { authenticated: true });
      return;
    }

    if (url.pathname === "/api/shipments" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      send(res, 200, { shipments: await listShipments() });
      return;
    }

    if (url.pathname === "/api/shipments" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const body = await readJson(req);
      const saved = await upsertShipment(body);
      send(res, 201, { shipment: saved });
      return;
    }

    if (url.pathname === "/api/shipments" && req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      await pool.query("delete from shipments");
      send(res, 200, { ok: true });
      return;
    }

    const deleteMatch = url.pathname.match(/^\/api\/shipments\/([^/]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      await pool.query("delete from shipments where id = $1 or code = $1", [decodeURIComponent(deleteMatch[1])]);
      send(res, 200, { ok: true });
      return;
    }

    send(res, 404, { error: "Nao encontrado." });
  } catch (error) {
    send(res, 400, { error: error.message || "Erro inesperado." });
  }
}

await initDatabase();

http.createServer(handle).listen(port, () => {
  console.log(`Controle de Remessas API ouvindo na porta ${port}`);
});
