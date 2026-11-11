/**
 * Tabela de decisão de rotas do Worker. Pura e sem dependência do runtime:
 * o `index.ts` usa para despachar e os testes usam a mesma função, então
 * não há duas cópias da regra para divergir.
 */

import type { McpDefinition } from './mcps.ts';

export type Route =
  | { kind: 'authorize' }
  | { kind: 'callback' }
  | { kind: 'mcp'; mcp: McpDefinition }
  | { kind: 'oauth' }
  | { kind: 'health' }
  | { kind: 'notFound' };

/** Resolve a rota a partir do caminho e do método HTTP. */
export function resolveRoute(
  pathname: string,
  method: string,
  mcps: McpDefinition[],
): Route {
  if (pathname === '/authorize') return { kind: 'authorize' };
  if (pathname === '/callback' && method === 'GET') return { kind: 'callback' };

  for (const mcp of mcps) {
    if (pathname === mcp.path || pathname.startsWith(`${mcp.path}/`)) {
      return { kind: 'mcp', mcp };
    }
  }

  // Metadata do protected resource: `/.well-known/oauth-protected-resource<path>`.
  // Precisa chegar no resource server dono do caminho, não no auth server.
  const protectedPrefix = '/.well-known/oauth-protected-resource';
  if (pathname.startsWith(protectedPrefix)) {
    const suffix = pathname.slice(protectedPrefix.length);
    const owner = mcps.find((m) => suffix === m.path || suffix.startsWith(`${m.path}/`));
    if (owner) return { kind: 'mcp', mcp: owner };
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
