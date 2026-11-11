# Mcps

Monorepo de MCP servers hospedados em **um único Cloudflare Worker**.

Cada pasta é um domínio autônomo (ferramentas + testes próprios). O Worker em
`worker/` é o authorization server **e** o host de todos os MCPs — um login,
um KV, um deploy.

```
Mcps/
├── worker/      # Worker único: OAuth + roteamento de todos os MCPs
├── Github/      # MCP do GitHub (18 ferramentas)
└── .github/     # CI: check de cada projeto + deploy do worker
```

## Como funciona

O Worker usa a arquitetura **role-based** do `@cloudflare/workers-oauth-provider`:

- `OAuthAuthorizationServer` emite tokens e declara **um resource por MCP**.
- Cada MCP é um `OAuthResourceServer` próprio, com **audience própria**.

Isso significa que um token emitido para `/github/mcp` **não vale** em
`/notion/mcp`: o resource server rejeita pelo `audience`.

```
https://mcps.contato-24f.workers.dev
├── /authorize      consentimento + login GitHub App
├── /callback       troca de código do GitHub
├── /oauth/token    emissão e refresh de token MCP
├── /github/mcp     MCP do GitHub
└── /               health + índice de MCPs
```

Fluxo: cliente MCP sem token → `401` com discovery → `/authorize` → GitHub →
`/callback` → token MCP → ferramentas executam com o token GitHub do usuário.
Quando o cliente renova o token MCP, o `tokenExchangeCallback` renova o token
GitHub junto.

Clientes são registrados por **CIMD** (URL como `client_id`) ou **DCR**
(`/oauth/register`, RFC 7591) — o Mistral Vibe Work usa DCR.

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

## Adicionar um MCP

1. Crie a pasta do domínio (ex.: `Notion/`) com `src/notion/`, `src/tools/` e
   um `src/mcp.ts` que exporte `createNotionServer(props)`.
2. Registre em `worker/src/mcps.ts`:

```ts
{
  name: 'notion',
  path: '/notion/mcp',
  resource: `${base}/notion/mcp`,
  createServer: createNotionServer,
}
```

Pronto. O `index.ts` não muda: ele monta rotas, resources e handlers a partir
dessa lista.

**Regra:** `src/<dominio>/` e `src/tools/` nunca importam OAuth. Só
`src/mcp.ts` é o adaptador.

## Setup do GitHub App

Em github.com → Settings → Developer settings → GitHub Apps → New GitHub App:

- **Callback URL**: `https://mcps.contato-24f.workers.dev/callback`
- **Expire user authorization tokens**: habilitado (token 8h + refresh)
- **Repository permissions**: Contents (R/W), Issues (R/W), Pull requests (R/W),
  Metadata (Read-only)

Anote o **App ID** e gere um **client secret**.

## KV e secrets

```sh
cd worker
npx wrangler kv namespace create OAUTH_KV   # coloque o id no wrangler.jsonc
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

`AUTH_ISSUER` está fixado no `worker/wrangler.jsonc`.

> Use o **mesmo** namespace de KV do Worker antigo: isso preserva os grants
> ativos na migração.

## Desenvolvimento

```sh
cd worker
npm install
npm run check              # typecheck + testes unitários
npm run test:integration   # sobe wrangler dev e valida 401/discovery/audience
npm run dev                # wrangler dev
```

```sh
cd Github
npm install
npm run check
```

## Deploy

CI em `.github/workflows/deploy-mcps.yml`: cada projeto roda `check`; o worker
roda também o teste de integração e, em push na `main`, `wrangler deploy`.
Segredos do repositório: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit) e
`CLOUDFLARE_ACCOUNT_ID`.

## Documentação

- `Github/README.md` — ferramentas do MCP do GitHub
- `GLOSSARY.md` — vocabulário do projeto
- `docs/specs/` e `docs/plans/` — decisões e planos
