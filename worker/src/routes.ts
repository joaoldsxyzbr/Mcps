/**
 * Tabela de decisão de rotas do Worker. Pura e sem dependência do runtime:
 * o `index.ts` usa para despachar e os testes usam a mesma função, então
 * não há duas cópias da regra para divergir.
 */

import { MCP_PATH } from './config.ts';

export type Route =
  | { kind: 'authorize' }
  | { kind: 'callback' }
  | { kind: 'mcp' }
  | { kind: 'oauth' }
  | { kind: 'health' }
  | { kind: 'notFound' };

/** `true` para o caminho do MCP e seus subcaminhos. */
function isMcpPath(pathname: string): boolean {
  return pathname === MCP_PATH || pathname.startsWith(`${MCP_PATH}/`);
}

/** Resolve a rota a partir do caminho e do método HTTP. */
export function resolveRoute(pathname: string, method: string): Route {
  if (pathname === '/authorize') return { kind: 'authorize' };
  if (pathname === '/callback' && method === 'GET') return { kind: 'callback' };

  if (isMcpPath(pathname)) return { kind: 'mcp' };

  // Metadata do protected resource: `/.well-known/oauth-protected-resource<path>`.
  // Precisa chegar no resource server, não no auth server.
  const protectedPrefix = '/.well-known/oauth-protected-resource';
  if (pathname.startsWith(protectedPrefix)) {
    const suffix = pathname.slice(protectedPrefix.length);
    if (isMcpPath(suffix)) return { kind: 'mcp' };
  }

  if (
    pathname.startsWith('/.well-known/') ||
    pathname === '/oauth/token' ||
    pathname === '/oauth/revoke' ||
    pathname === '/oauth/register'
  ) {
    return { kind: 'oauth' };
  }

  if (pathname === '/' && method === 'GET') return { kind: 'health' };
  return { kind: 'notFound' };
}
