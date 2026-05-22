# Controle de Remessas

Sistema simples para cadastrar rastreios de envio, anexar o XML da nota fiscal e consultar quais itens foram enviados em cada rastreio.

## Requisitos

### Cadastro de rastreio

- O usuario deve informar um numero de rastreio.
- O sistema deve aceitar rastreios no formato `LTM-95728114925`.
- O sistema deve identificar automaticamente:
  - prefixo do documento: `957`;
  - numero AWB: `28114925`;
  - tipo de consulta LATAM: `SO`.
- O sistema deve gerar o link oficial de rastreio da LATAM Cargo.
- O botao **Rastrear** deve abrir o link oficial em outra aba.

### Upload da nota fiscal

- O usuario deve anexar o XML da NF-e referente ao material enviado.
- O sistema deve ler o XML diretamente no navegador.
- O sistema deve extrair:
  - numero da nota fiscal;
  - emitente;
  - codigo do item;
  - descricao do item;
  - quantidade;
  - unidade.

### Lista de rastreios cadastrados

- O sistema deve mostrar uma lista simples com todos os rastreios cadastrados.
- Cada rastreio deve aparecer como um link clicavel.
- Cada rastreio deve ter um botao para copiar o numero.
- A lista deve ser atualizada automaticamente depois de cada cadastro.

### Visualizacao dos itens enviados

- Cada rastreio cadastrado deve ter o botao **Ver itens**.
- Ao clicar em **Ver itens**, o sistema deve mostrar os produtos enviados naquele rastreio.
- A lista de itens deve exibir codigo, descricao, quantidade e unidade.

### Localizacao de item

- O sistema deve permitir buscar um item por parte do nome ou codigo.
- Ao localizar o item, o sistema deve mostrar em qual rastreio ele esta.
- O resultado deve mostrar tambem a quantidade e a nota fiscal relacionada.

### Persistencia dos dados

- Os cadastros devem ficar salvos no navegador.
- O sistema deve permitir limpar todos os cadastros.
- Nesta primeira versao, nao ha login, servidor ou banco de dados externo.

## Tecnologia utilizada

- **HTML5**: estrutura da interface.
- **CSS3**: layout, responsividade e estilos visuais.
- **JavaScript puro**: regras de cadastro, leitura da nota, busca e interacao da tela.
- **DOMParser**: leitura e interpretacao do XML da NF-e.
- **FileReader API**: leitura do arquivo XML selecionado pelo usuario.
- **localStorage**: armazenamento local dos rastreios cadastrados no navegador.
- **LATAM Cargo Tracking URL**: abertura do rastreio oficial em outra aba.
- **Docker**: empacotamento da aplicacao para homologacao e producao.
- **Nginx Alpine**: servidor web usado dentro do container.
- **Docker Compose**: execucao local em homologacao no PC.
- **Portainer / Docker Swarm**: publicacao em producao na VPS.
- **Traefik**: roteamento HTTPS na VPS.

## Arquivos do projeto

- `index.html`: aplicacao principal.
- `sample-nfe.xml`: XML de exemplo para teste de cadastro.
- `README.md`: documentacao do projeto.
- `Dockerfile`: imagem Docker da aplicacao.
- `nginx.conf`: configuracao do Nginx usado no container.
- `docker-compose.homologacao-pc.yml`: compose para rodar no PC.
- `docker-compose.producao-vps.yml`: stack para Portainer/Traefik na VPS.
- `.env.example`: exemplo das variaveis de ambiente.

## Ambientes

### Homologacao no PC

Usado para testar a aplicacao localmente em Docker.

```bash
docker compose -f docker-compose.homologacao-pc.yml up --build
```

URL padrao:

```text
http://localhost:4173
```

Para usar outra porta:

```bash
APP_PORT=8080 docker compose -f docker-compose.homologacao-pc.yml up --build
```

### Producao na VPS com Portainer

O arquivo `docker-compose.producao-vps.yml` foi preparado para uso como Stack no Portainer.

Ele espera que a imagem ja esteja publicada em um registry:

```text
APP_IMAGE=registry.example.com/controle-remessas-web:latest
```

Variaveis principais:

```text
APP_IMAGE=registry.example.com/controle-remessas-web:latest
APP_HOST=remessas.3dhmanaus.shop
APP_REPLICAS=1
TRAEFIK_ENTRYPOINTS=websecure
TRAEFIK_CERTRESOLVER=letsencryptresolver
```

Requisitos da VPS:

- Docker Swarm habilitado.
- Portainer instalado.
- Traefik rodando na rede externa `PortainerRede`.
- DNS do dominio apontando para a VPS.
- Certresolver do Traefik configurado.

Labels Traefik usadas em producao:

```text
traefik.enable=true
traefik.docker.network=PortainerRede
traefik.http.routers.controle-remessas-prod.rule=Host(`${APP_HOST}`)
traefik.http.routers.controle-remessas-prod.entrypoints=${TRAEFIK_ENTRYPOINTS}
traefik.http.routers.controle-remessas-prod.tls=true
traefik.http.routers.controle-remessas-prod.tls.certresolver=${TRAEFIK_CERTRESOLVER}
traefik.http.services.controle-remessas-prod.loadbalancer.server.port=80
```

## Build da imagem

Build local:

```bash
docker build -t controle-remessas-web:latest .
```

Exemplo para publicar em registry:

```bash
docker tag controle-remessas-web:latest registry.example.com/controle-remessas-web:latest
docker push registry.example.com/controle-remessas-web:latest
```

## Limitacoes da primeira versao

- O sistema trabalha com XML da NF-e, nao com PDF/DANFE.
- Os dados ficam salvos apenas no navegador usado.
- Se o cache ou dados do navegador forem limpos, os cadastros tambem sao removidos.
- Nao ha controle de usuarios.
- Nao ha banco de dados centralizado.
- Em producao, os dados continuam ficando no navegador do usuario, pois a primeira versao e 100% frontend.

## Proximas melhorias sugeridas

- Criar um backend com banco de dados.
- Permitir login de usuarios.
- Exportar lista de rastreios e itens para Excel.
- Adicionar status manual do envio.
- Permitir anexar mais de uma nota fiscal no mesmo rastreio.
- Adicionar filtros por nota, item, data e rastreio.
