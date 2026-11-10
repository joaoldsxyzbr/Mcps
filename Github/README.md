# mcps-github

MCP server do GitHub rodando em Cloudflare Worker: OAuth oficial via GitHub App
(token de usuário com expiração e refresh), protocolo MCP 2026-07-28
(stateless, Streamable HTTP) e ferramentas focadas no uso real, incluindo
edição inline de arquivos.

## Arquitetura

Um único Worker é o authorization server e o resource server
(`@cloudflare/workers-oauth-provider`):

1. Cliente MCP chega sem token em `/mcp` → `401` com discovery.
2. Cliente abre `/authorize` → página de consentimento.
3. Login com o GitHub App → `/callback` troca o código por token de usuário
   (8h + refresh) → `completeAuthorization` guarda o token em props
   criptografadas.
4. Cliente recebe token MCP e chama as ferramentas; cada chamada usa o token
   GitHub do usuário contra a REST API v3.
5. Quando o cliente renova o token MCP (`refresh_token`), o
   `tokenExchangeCallback` renova o token GitHub junto.

## Ferramentas (v1)

`get_me` · `search_repositories` · `get_repository_tree` · `get_file_contents`
· `create_or_update_file` · `edit_file` · `push_files` · `create_branch`
· `list_commits` · `get_commit` · `list_issues` · `search_issues` · `issue_write`
· `add_issue_comment` · `list_pull_requests` · `search_pull_requests`
· `create_pull_request` · `merge_pull_request`

`edit_file` aplica substituições `oldString`/`newString` (lote sequencial,
ocorrência única ou `replaceAll`) sem reescrever o arquivo. `push_files` envia
vários arquivos em um único commit.

## Setup

### 1. GitHub App

Em github.com → Settings → Developer settings → GitHub Apps → New GitHub App:

- **Homepage URL**: URL do worker.
- **Callback URL**: `https://mcps-github.<subdominio>.workers.dev/callback`
- **Expire user authorization tokens**: habilitado (token 8h + refresh).
- **Repository permissions**:
  - Contents: Read & write
  - Issues: Read & write
  - Pull requests: Read & write
  - Metadata: Read-only

Anote o **App ID** e gere um **client secret**.

### 2. KV e secrets

```sh
npx wrangler kv namespace create OAUTH_KV   # coloque o id no wrangler.jsonc
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Ajuste `MCP_SERVER_URL` no `wrangler.jsonc` com o subdomínio real (após o
primeiro deploy) — deve terminar em `/mcp`.

### 3. Deploy

CI no repositório (`.github/workflows/deploy-github-mcp.yml`) instala,
typecheca, testa e publica com `wrangler deploy` a cada push na `main`.
Segredos necessários no repositório: `CLOUDFLARE_API_TOKEN` (permissão
Workers Scripts:Edit) e `CLOUDFLARE_ACCOUNT_ID`.

## Uso

Num cliente MCP que aceita servidores remotos, conecte em:

```
https://mcps-github.<subdominio>.workers.dev/mcp
```

O cliente segue o fluxo OAuth sozinho: abre o consentimento, você autoriza com
o GitHub e as ferramentas passam a agir em nome da sua conta.

## Desenvolvimento

```sh
npm install
npm run check     # typecheck + testes (node:test)
npm run dev       # wrangler dev
```

Estrutura: `src/github/` (client REST e motor de edição, puros e testados),
`src/tools/handlers/` (ferramentas puras), `src/tools/registry.ts` (schemas
zod + registro), `src/auth/` (fluxo GitHub App e consentimento),
`src/index.ts` (OAuthProvider + endpoint MCP).

Documentação de decisões em `docs/specs/` e plano em `docs/plans/`.
Vocabulário do projeto no `GLOSSARY.md`.
