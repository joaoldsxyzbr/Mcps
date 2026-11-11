# worker

Worker único do monorepo: authorization server OAuth + host de todos os MCPs.

## Estrutura

- `src/index.ts` — monta `OAuthAuthorizationServer` + um `OAuthResourceServer`
  por MCP e despacha por rota
- `src/routes.ts` — tabela de decisão de rotas (pura, testada)
- `src/mcps.ts` — **registro dos MCPs**: adicionar um MCP é adicionar uma entrada
- `src/auth/` — fluxo OAuth do GitHub App e página de consentimento

## Como adicionar um MCP

1. No projeto do domínio (ex.: `Github/`), exporte `createXServer(props)`.
2. Importe em `src/mcps.ts` e adicione uma entrada em `defineMcps`.

O `index.ts` não muda.

## Dependências cruzadas

O Worker importa os adaptadores dos domínios (`../../Github/src/mcp.ts`), que
resolvem `@modelcontextprotocol/server` e `zod` a partir do `node_modules`
**de cada domínio**. Por isso:

- `tsconfig.json` mapeia essas duas dependências para o `node_modules` do worker;
- o bundler do wrangler resolve pelo `node_modules` do domínio.

Rode `npm install` **também** em cada projeto de domínio antes de buildar/deployar.

## Scripts

```sh
npm run check              # typecheck + testes unitários (node:test)
npm run test:integration   # sobe wrangler dev e valida 401/discovery/audience
npm run dev                # wrangler dev
npm run deploy             # wrangler deploy
```

## Antes do primeiro deploy

Substituir `SUBSTITUA_PELO_ID_DO_KV` em `wrangler.jsonc` pelo id real do KV
(`npx wrangler kv namespace create OAUTH_KV`) e configurar os secrets
`GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. Use o **mesmo** namespace do
Worker antigo para preservar os grants ativos.
