# mcps-github

MCP server do GitHub rodando em Cloudflare Worker: OAuth oficial via GitHub App
(token de usuário, 8h + refresh), protocolo MCP 2026-07-28 (stateless, Streamable
HTTP) e ferramentas focadas no uso real, incluindo edição inline de arquivos.

## Ferramentas (v1)

`get_me` · `search_repositories` · `get_repository_tree` · `get_file_contents`
· `create_or_update_file` · `edit_file` · `push_files` · `create_branch`
· `list_commits` · `get_commit` · `list_issues` · `search_issues` · `issue_write`
· `add_issue_comment` · `list_pull_requests` · `search_pull_requests`
· `create_pull_request` · `merge_pull_request`

## Desenvolvimento

```sh
npm install
npm run check     # typecheck + testes (node:test)
npm run dev       # wrangler dev
```

## Segredos e vars

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

- `OAUTH_KV`: KV do fluxo OAuth (ver `wrangler.jsonc`).
- `MCP_SERVER_URL`: URL pública do worker.

## Deploy

CI no repositório (`.github/workflows/deploy-github-mcp.yml`) instala,
typecheca, testa e publica com `wrangler deploy` a cada push na `main`.
