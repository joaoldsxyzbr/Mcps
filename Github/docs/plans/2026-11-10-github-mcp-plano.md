# Plano: MCP do GitHub v1

Spec: Github/docs/specs/2026-11-10-github-mcp-design.md
Branch: feat/github-mcp-v1

## Tarefas

### Tarefa 1: Bootstrap do projeto

- Arquivos: `Github/package.json`, `Github/tsconfig.json`, `Github/wrangler.jsonc`, `Github/vitest.config.ts`, `Github/.gitignore`, `Github/README.md`
- Mudança: projeto npm com typecheck (`tsc --noEmit`), vitest, wrangler (dev/deploy), Workers TS config. `main` do `package.json` aponta `src/index.ts`.
- Verificação: `cd Github && npm install && npx tsc --noEmit` (exit 0)
- Critério de pronto: typecheck verde; `npm test` roda vitest (0 testes, exit 0)

### Tarefa 2: Motor de edição inline (TDD)

- Arquivos: `Github/src/github/edit.ts`, `Github/test/edit.test.ts`
- Mudança: `applyEdits(content, edits)` puro: lote sequencial; ocorrência única por edit (senão erro `EDIT_NOT_FOUND`/`EDIT_AMBIGUOUS`); `replaceAll` opcional; `oldString` vazio é erro.
- Verificação: `npm test` (vermelho antes da implementação, verde depois)
- Critério de pronto: casos — único, não-achado, ambíguo, lote, replaceAll, oldString vazio, edit em linha já editada

### Tarefa 3: Cliente REST do GitHub (TDD)

- Arquivos: `Github/src/github/client.ts`, `Github/test/client.test.ts`
- Mudança: `GitHubClient` com `fetch` injetável; headers `Authorization`/`Accept`/`User-Agent`; erro estruturado com status, mensagem e rate limit restante; métodos base `get/post/put/patch` + `json`.
- Verificação: `npm test`
- Critério de pronto: 401/403/404/422 viram erro com mensagem da API; rate limit propagado; happy path parseia JSON

### Tarefa 4: Ferramentas de arquivo (TDD)

- Arquivos: `Github/src/tools/files.ts`, `Github/src/tools/identity.ts`, `Github/test/tools-files.test.ts`
- Mudança: `get_file_contents` (arquivo ou pasta com `fields`), `create_or_update_file` (sha obrigatório se arquivo existe), `edit_file` (usa `applyEdits` + sha), `push_files` (Git data API: um commit, múltiplos arquivos), `get_me`.
- Verificação: `npm test`
- Critério de pronto: mapeamento params→request correto por ferramenta (fetch mockado); `edit_file` falha limpa se `old_string` não acha; `push_files` faz exatamente 4 chamadas de API (ref, tree, commit, update ref)

### Tarefa 5: Ferramentas repos/git/issues/PRs (TDD)

- Arquivos: `Github/src/tools/repos.ts`, `Github/src/tools/git.ts`, `Github/src/tools/issues.ts`, `Github/src/tools/pulls.ts`, `Github/src/tools/registry.ts`, `Github/test/tools-rest.test.ts`
- Mudança: `search_repositories`, `get_repository_tree`, `create_branch`, `list_commits`, `get_commit`, `list_issues`, `search_issues`, `issue_write` (create/update/close com `state_reason`), `add_issue_comment`, `list_pull_requests`, `search_pull_requests`, `create_pull_request`, `merge_pull_request`; `registry.ts` registra as 18 com schema zod.
- Verificação: `npm test`
- Critério de pronto: 18 ferramentas registradas; cada uma tem teste de contrato params→request

### Tarefa 6: OAuth GitHub App (TDD)

- Arquivos: `Github/src/auth/github-app.ts`, `Github/test/auth.test.ts`
- Mudança: handlers authorize/callback com GitHub App user-to-server; troca de `code` por token (aceita `expires_in`/`refresh_token`); renovação por refresh; abre a doc oficial de authorization da Cloudflare ANTES de codar o glue com `OAuthProvider`.
- Verificação: `npm test`
- Critério de pronto: callback troca code e salva token+props; refresh troca refresh_token por par novo; token expirado nunca é reusado

### Tarefa 7: Entrada do Worker (TDD)

- Arquivos: `Github/src/index.ts`, `Github/test/index.test.ts`
- Mudança: `OAuthProvider` (rotas OAuth) + `OAuthResourceServer` + `createMcpHandler`; `401` com discovery sem token; escopo `github` exigido; rota `/` fora do MCP responde health.
- Verificação: `npm test`
- Critério de pronto: sem token → 401 + WWW-Authenticate com resource metadata; com token válido → handler MCP; health 200

### Tarefa 8: CI, README e deploy

- Arquivos: `.github/workflows/deploy-github-mcp.yml`, `Github/README.md`, `Github/wrangler.jsonc` (vars/secrets finais)
- Mudança: workflow push na main → `npm ci`, typecheck, test, `wrangler deploy` (secrets CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID); README com setup do GitHub App (callback URL, permissões) e uso do MCP.
- Verificação: `npx wrangler deploy --dry-run` exit 0; push → CI verde
- Critério de pronto: CI verde na run do commit final; se o conector bloquear `.github/workflows/`, workflow é criado manualmente pelo João e o bloqueio é reportado

## Ordem e dependências

Sequencial: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Nenhuma paralelização
(dependência de módulo em cascata: edit→client→tools→auth→entry).

## Validação final

1. `cd Github && npm ci`
2. `npx tsc --noEmit`
3. `npm test -- --run`
4. `npx wrangler deploy --dry-run`
5. Push da branch → CI verde → merge
