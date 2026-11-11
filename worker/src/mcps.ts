/**
 * Registro dos MCPs hospedados neste Worker.
 *
 * Adicionar um MCP = uma entrada aqui. Cada entrada vira:
 *   - uma rota protegida (`path`);
 *   - um resource OAuth próprio (`resource`), com audience própria;
 *   - um handler MCP que monta o servidor via `createServer(props)`.
 *
 * O projeto do domínio (ex.: `Github/`) não conhece OAuth: só exporta
 * `createServer(props)`.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import { createGithubServer, type GithubProps } from '../../Github/src/mcp.ts';

/** Props que o resource server entrega ao handler (vêm do grant). */
export type McpProps = GithubProps;

export interface McpDefinition {
  /** Nome curto, usado no índice de health. */
  name: string;
  /** Rota protegida no Worker. */
  path: string;
  /** Resource OAuth canônico (audience do token). */
  resource: string;
  /** Monta o servidor MCP para uma requisição autenticada. */
  createServer: (props: McpProps) => McpServer;
}

/** Monta a lista de MCPs para uma origem (issuer) conhecida. */
export function defineMcps(issuer: string): McpDefinition[] {
  const base = issuer.replace(/\/+$/, '');
  return [
    {
      name: 'github',
      path: '/github/mcp',
      resource: `${base}/github/mcp`,
      createServer: createGithubServer,
    },
    // Próximos MCPs entram aqui. Exemplo:
    // {
    //   name: 'notion',
    //   path: '/notion/mcp',
    //   resource: `${base}/notion/mcp`,
    //   createServer: createNotionServer,
    // },
  ];
}
