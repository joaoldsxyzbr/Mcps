# Spec de design: MCP do GitHub (Worker próprio)

Data: 2026-11-10
Status: aprovado
Classificação: mudança arquitetural

## Problema

Não temos um MCP server do GitHub nosso: o que existe é o conector do chat (sem
edição inline de arquivos, sem controle nosso) ou o MCP remoto oficial do
GitHub (hospedado por eles, em Go, sem as nossas ferramentas). Sintoma: toda
integração GitHub depende de terceiros; custo: sem controle de toolset, sem
OAuth próprio, nada roda na nossa infraestrutura.

## Decisões

| # | Decisão | Alternativa rejeitada | Motivo |
| --- | --- | --- | --- |
| 1 | MCP server próprio em TypeScript com `createMcpHandler` do Agents SDK (spec MCP 2026-07-28, stateless, Streamable HTTP) | Proxy do remote MCP oficial (`api.githubcopilot.com/mcp/`) | Proxy não expõe "nossas ferramentas" e não precisa de worker |
| 2 | Idem | Fork do `github-mcp-server` oficial (Go) | Go não roda em Cloudflare Worker; contraria o requisito de hospedagem |
| 3 | OAuth oficial do GitHub via **GitHub App** (token user-to-server, expira em 8h + refresh) | OAuth App (token não expira) | Token curto morre sozinho se vazar; permissões granulares; mesmo modelo do MCP oficial do GitHub |
| 4 | `@cloudflare/workers-oauth-provider` como authorization server + `OAuthResourceServer` protegendo o endpoint MCP | Auth caseira (JWT/sessão manual) | Cumpre a spec de autorização OAuth 2.1 do MCP; refresh e PKCE prontos; mantida pela Cloudflare |
| 5 | V1 com 18 ferramentas essenciais, incluindo `edit_file` (edição inline `old_string`/`new_string`) | Espelhar as 46 do conector github_app | YAGNI: expandir com uso real; edição inline resolve o caso "não quero reescrever o arquivo todo" |
| 6 | `push_files` com múltiplos arquivos num único commit (Git data API) | Um commit por arquivo | Ergonomia: alteração atômica multi-arquivo |
| 7 | Monorepo: cada pasta do repo `Mcps` = um MCP autônomo com src/test/docs próprios | Um repo por MCP | O repo `Mcps` existe para agrupar os MCPs |
| 8 | Deploy por CI no GitHub (workflow com `wrangler deploy` + secrets) | Deploy manual | Mesmo padrão dos demais projetos do João |
| 9 | Testes com vitest, fetch mockado por injeção; API real validada em smoke manual pós-deploy | Testes só contra API real | TDD exige ciclo rápido e determinístico; API real é flaky e custa rate limit |

## Comportamento esperado

- Cliente MCP conecta na URL do Worker via Streamable HTTP (stateless, spec
  2026-07-28: sem handshake de sessão, sem `Mcp-Session-Id`).
- Sem token MCP válido → `401` com discovery do authorization server →
  cliente abre `/authorize` → João autoriza o GitHub App → token MCP emitido
  → ferramentas executam REST do GitHub com o token user-to-server do usuário.
- `edit_file`: busca o arquivo, aplica substituições `old_string`/`new_string`
  (lote sequencial), exige ocorrência única por edit (a menos que
  `replace_all: true`), commita com o sha atual — nunca reescreve o arquivo
  inteiro na mão do chamador.
- `push_files`: recebe lista de caminhos+conteúdos e cria UM commit com todos
  via Git data API (ref → tree → blobs → commit → update ref).
- Erros da API do GitHub chegam ao cliente como texto claro com status e
  mensagem (rate limit incluído).
- Escopo MCP: `github` (v1, escopo único; granularidade vem depois com uso real).

## Impacto

- Novo: pasta `Github/` inteira (src, test, wrangler.jsonc, docs, glossário).
- Novo na raiz do repo: `.github/workflows/deploy-github-mcp.yml` (CI).
- Não muda: nada existente (repo novo, só `Github/.gitkeep`).

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Conector GitHub bloqueia escrita em `.github/workflows/` (403, já ocorreu no projeto NFe) | Workflow criado manualmente pelo João; código da ferramenta não é bloqueado |
| Token GitHub (user-to-server) vazar do KV | Expira em 8h + refresh; KV privado do Worker; nunca logado; permissões mínimas no GitHub App |
| Rate limit da API do GitHub em uso intenso | Erros de ferramenta propagam `x-ratelimit-*` restantes |
| API GitHub muda (deprecações) | Só REST v3 estável; ferramentas mínimas; teste de contrato por ferramenta |
| Depender da doc de authorization da Cloudflare na tarefa de OAuth | Abrir a doc oficial na hora da tarefa; glue nosso é testado com fetch mockado |
