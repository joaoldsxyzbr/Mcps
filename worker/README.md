# worker

Authorization server OAuth + host do MCP do GitHub.

## Estrutura

- `src/index.ts` — monta `OAuthAuthorizationServer` + `OAuthResourceServer` e
  despacha por rota
- `src/config.ts` — **fonte única** do endpoint: `MCP_PATH`, `MCP_NAME` e os
  escopos. Roteador, resource OAuth e handler MCP leem daqui
- `src/routes.ts` — tabela de decisão de rotas (pura, testada)
- `src/auth/` — fluxo OAuth do GitHub App e página de consentimento

## Dependências

O repositório usa **npm workspaces** (`worker` e `Github`). Um `npm install` na
raiz instala tudo, com um único `package-lock.json` e uma única cópia das
dependências — inclusive quando o comando roda de dentro de `worker/`.

O Worker importa `../../Github/src/mcp.ts`; os imports desse arquivo sobem até o
`node_modules` da raiz.

## Scripts

Na raiz do repositório:

```sh
npm run check              # typecheck + testes unitários dos dois projetos
npm run test:integration   # sobe wrangler dev e valida 401/discovery/audience
npm run dev                # wrangler dev
npm run deploy             # wrangler deploy
```

## Antes do primeiro deploy

Configurar os secrets `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` no Worker:

```sh
cd worker
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

O KV (`OAUTH_KV`) já está configurado em `wrangler.jsonc`. Use o **mesmo**
namespace do Worker anterior para preservar os grants ativos.
