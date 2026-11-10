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
  GitHub e emite token MCP (workers-oauth-provider).
- **resource server**: o endpoint MCP protegido que valida token MCP antes de
  executar ferramenta (OAuthResourceServer).
- **edit inline**: edição de trecho de arquivo via `old_string`/`new_string`
  sem reescrever o arquivo inteiro.
- **toolset v1**: as 18 ferramentas aprovadas (spec 2026-11-10).
