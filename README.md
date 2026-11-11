# Mcps

MCP do GitHub hospedado num **Cloudflare Worker**, com OAuth próprio.

Duas pastas, um deploy:

```
Mcps/
├── worker/      # Worker: OAuth + endpoint MCP
├── Github/      # Domínio do GitHub (ferramentas + testes)
└── .github/     # CI: typecheck + testes
```

Um único `npm install` na raiz instala os dois (npm workspaces).

## Como funciona

O Worker usa a arquitetura **role-based** do `@cloudflare/workers-oauth-provider`:

- `OAuthAuthorizationServer` emite tokens e declara o resource.
- `OAuthResourceServer` protege `/github/mcp` e valida a **audience**.

```
https://mcps.contato-24f.workers.dev
├── /authorize      consentimento + login GitHub App
├── /callback       troca de código do GitHub
├── /oauth/token    emissão e refresh de token MCP
├── /oauth/register registro dinâmico de cliente (DCR)
├── /github/mcp     MCP do GitHub
└── /               health
```

Fluxo: cliente MCP sem token → `401` com discovery → `/authorize` → GitHub →
`/callback` → token MCP → ferramentas executam com o token GitHub do usuário.
Quando o cliente renova o token MCP, o `tokenExchangeCallback` renova o token
GitHub junto.

Clientes são registrados por **DCR** (`/oauth/register`, RFC 7591) — é o que o
Mistral Vibe Work usa.

## Conectar um cliente

O cliente é o **Mistral Vibe Work**. Ele suporta OAuth 2.1 com dynamic client
registration, então o fluxo de consentimento acontece sozinho.

### Cloudflare — MCP oficial (não usa este Worker)

A Cloudflare mantém o MCP oficial, com OAuth gerenciado por eles:

```
https://mcp.cloudflare.com/mcp
```

No Vibe Work: **Connectors → + Add Connector → Custom MCP Connector** → cole a
URL → **Connect** → autorize na Cloudflare. Nenhum secret no nosso Worker: cobre
a API inteira (2.500+ endpoints) via `search()`/`execute()` + `docs()`.

### GitHub — este Worker

```
https://mcps.contato-24f.workers.dev/github/mcp
```

Mesmo caminho no Vibe Work. O cliente registra-se via DCR, abre o
consentimento, você autoriza com o GitHub e as ferramentas passam a agir em
nome da sua conta.

> **Atenção:** adicionar um Custom MCP Connector no Vibe Work exige um
> administrador da organização.

## Estrutura do domínio

**Regra:** `Github/src/github/` e `Github/src/tools/` nunca importam OAuth. Só
`Github/src/mcp.ts` é o adaptador (`createGithubServer(props)`).

Para trocar o endpoint ou o nome do MCP, edite `worker/src/config.ts` — é a
fonte única usada pelo roteador, pelo resource OAuth e pelo handler MCP.

## Setup do GitHub App

Em github.com → Settings → Developer settings → GitHub Apps → New GitHub App:

- **Callback URL**: `https://mcps.contato-24f.workers.dev/callback`
- **Expire user authorization tokens**: habilitado (token 8h + refresh)
- **Repository permissions**: Contents (R/W), Issues (R/W), Pull requests (R/W),
  Metadata (Read-only)
- **CI**: para `list_check_runs` e `list_workflow_runs` funcionarem, adicione
  **Checks (Read-only)** e **Actions (Read-only)**

Anote o **App ID** e gere um **client secret**.

## KV e secrets

```sh
cd worker
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

O KV (`OAUTH_KV`) e o `AUTH_ISSUER` já estão em `worker/wrangler.jsonc`.

> Use o **mesmo** namespace de KV do Worker anterior: isso preserva os grants
> ativos.

## Desenvolvimento

Na raiz do repositório:

```sh
npm install                # instala worker + Github
npm run check              # typecheck + testes unitários dos dois
npm run test:integration   # sobe wrangler dev e valida 401/discovery/audience
npm run dev                # wrangler dev
```

## Deploy

O deploy é feito pelo **Workers Builds** (dashboard Cloudflare), que escuta
pushes na `main`:

- **Root directory**: `worker`
- **Build command**: `npm install`
- **Deploy command**: `npx wrangler deploy`

O CI em `.github/workflows/deploy-mcps.yml` roda só typecheck e testes — não
deploya, então não precisa de token da Cloudflare no repositório.

## Documentação

- `Github/README.md` — ferramentas do MCP do GitHub
- `GLOSSARY.md` — vocabulário do projeto
