/**
 * Adaptador MCP do domínio GitHub. Este é o único arquivo do projeto que
 * liga as ferramentas ao servidor MCP: `src/github/` e `src/tools/` seguem
 * puros e ignoram OAuth. O Worker único importa `createGithubServer` e
 * injeta as props que vieram do fluxo de autorização.
 */

import { McpServer } from '@modelcontextprotocol/server';
import { GitHubClient } from './github/client.ts';
import { registerTools } from './tools/registry.ts';

/** Props entregues pelo resource server: o token GitHub do usuário. */
export interface GithubProps {
  githubToken: string;
}

export function createGithubServer(props: GithubProps): McpServer {
  const server = new McpServer({ name: 'mcps-github', version: '0.1.0' });
  registerTools(server, new GitHubClient(props.githubToken));
  return server;
}
