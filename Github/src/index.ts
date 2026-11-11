/**
 * Shim de compatibilidade. O entrypoint de deploy passou a ser o Worker
 * único em `worker/`, que hospeda todos os MCPs do monorepo.
 *
 * Este arquivo existe apenas para que imports antigos de `src/index.ts`
 * continuem resolvendo. Toda a lógica de MCP vive em `src/mcp.ts`.
 */

export { createGithubServer, type GithubProps } from './mcp.ts';
