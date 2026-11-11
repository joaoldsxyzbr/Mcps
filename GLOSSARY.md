# Glossário

- **token MCP**: token emitido pelo nosso authorization server (Worker) para o
  cliente MCP. Descartável, curto, só vale para o nosso endpoint.
- **token GitHub**: token user-to-server do GitHub App, obtido no fluxo OAuth e
  guardado no KV; expira em 8h e é renovado via refresh. Nunca confundir com
  token MCP.
- **cliente MCP**: o app que conecta no Worker e chama ferramentas (Claude,
  Vibe, etc.).
- **usuário**: a pessoa que autoriza o GitHub App (João). O token GitHub é
  dela; o cliente MCP age em nome dela.
- **authorization server**: a parte do Worker que faz o fluxo OAuth com o
  GitHub e emite token MCP (`OAuthAuthorizationServer`).
- **resource server**: o endpoint MCP protegido que valida token MCP antes de
  executar ferramenta (`OAuthResourceServer`).
- **issuer**: a origem do authorization server
  (`https://mcps.contato-24f.workers.dev`). Aparece no discovery OAuth.
- **resource**: identificador canônico do MCP (`.../github/mcp`). É o
  **audience** do token: um token só vale no resource para o qual foi emitido.
- **audience**: o resource que o token pode acessar (`.../github/mcp`).
- **grant**: autorização concedida pelo usuário a um cliente para um resource,
  guardada no KV com props criptografadas.
- **props**: dados guardados no grant (ex.: token GitHub) e entregues ao
  handler como `ctx.props`.
- **domínio**: pasta do monorepo com as ferramentas de um serviço (`Github/`).
  Não conhece OAuth; exporta `createServer(props)`.
- **edit inline**: edição de trecho de arquivo via `old_string`/`new_string`
  sem reescrever o arquivo inteiro.
- **toolset v4**: as 33 ferramentas atuais (v1 + busca, CI, review de PR e repo).
- **search_code**: busca dentro do conteúdo dos arquivos; devolve caminho e
  trechos com o termo.
- **check run**: job de CI de um commit (GitHub Actions ou outro app). O
  `list_check_runs` resume em aprovado/falhou/pendente.
- **review**: aprovação, pedido de mudanças ou comentário num PR.
