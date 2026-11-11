# mcps-github

MCP server do GitHub: OAuth oficial via GitHub App (token de usuário com
expiração e refresh), protocolo MCP 2026-07-28 (stateless, Streamable HTTP) e
ferramentas focadas no uso real, incluindo edição inline de arquivos.

Este projeto é o **domínio** GitHub do monorepo. O Worker que hospeda e
autentica fica em `../worker/`; aqui vivem só as ferramentas e o cliente REST.

## Estrutura

- `src/github/` — cliente REST e motor de edição (puros, testados)
- `src/tools/handlers/` — ferramentas puras
- `src/tools/registry.ts` — schemas zod + registro
- `src/mcp.ts` — adaptador: `createGithubServer(props)` → `McpServer`
- `src/index.ts` — shim de compatibilidade (reexporta `src/mcp.ts`)

Nada aqui importa OAuth: o Worker injeta `props.githubToken` no adaptador.

## Ferramentas (v4)

**Arquivos e identidade**
`get_me` · `get_file_contents` · `create_or_update_file` · `edit_file` · `push_files`
· `delete_file`

**Repos e git**
`search_repositories` · `get_repository_tree` · `create_branch` · `list_branches`
· `list_commits` · `get_commit` · `list_tags` · `list_releases`

**Busca**
`search_code` · `search_commits`

**CI**
`list_check_runs` · `get_commit_status` · `list_workflow_runs` · `get_workflow_run_logs`

**Issues**
`list_issues` · `search_issues` · `issue_write` · `add_issue_comment`

**Pull requests**
`list_pull_requests` · `search_pull_requests` · `create_pull_request` · `merge_pull_request`
· `pull_request_read` · `pull_request_review` · `pull_request_comment`
· `update_pull_request` · `update_pull_request_branch`

### Destaques

- **`edit_file`** aplica `oldString`/`newString` (lote sequencial, ocorrência
  única ou `replaceAll`) sem o modelo reescrever o arquivo. A API do GitHub não
  tem edição parcial, então o arquivo trafega inteiro na rede — mas o modelo só
  vê os trechos que enviou.
- **`get_file_contents` com `startLine`/`endLine`** lê só um trecho e devolve
  `totalLines`/`truncated`, evitando puxar 5.000 linhas para ver 20.
- **`search_code`** acha arquivo e trechos com o termo, sem baixar o repo.
- **`list_check_runs`** devolve um `summary` (`success`/`failure`/`pending`/
  `all_passed`), então o modelo sabe se o CI passou antes de mergear.
- **`pull_request_read`** cobre detalhes, diff, arquivos, commits, reviews e
  comentários; `pull_request_review` aprova/pede mudanças; `pull_request_comment`
  comenta em linha do diff; `update_pull_request` edita título/corpo/estado/base;
  `update_pull_request_branch` sincroniza o PR com a base.
- **`push_files`** envia vários arquivos em um único commit e **nunca sobrescreve
  trabalho alheio**: o update da ref usa `force: false`, então o GitHub rejeita
  se não for fast-forward; nesse caso a operação relê a branch e refaz o commit
  (até `maxRetries`, padrão 3). Com `expectedHeadSha`, falha em vez de retentar.

## Uso

Conecte um cliente MCP em:

```
https://mcps.contato-24f.workers.dev/github/mcp
```

Setup do GitHub App, KV e secrets: veja o `README.md` da raiz.

## Desenvolvimento

```sh
npm install
npm run check     # typecheck + testes (node:test)
```
