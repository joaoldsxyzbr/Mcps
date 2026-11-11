/**
 * Worker único do monorepo `Mcps`: authorization server + N MCPs.
 *
 * Arquitetura role-based do workers-oauth-provider:
 *   - `OAuthAuthorizationServer` emite tokens e declara um resource por MCP;
 *   - cada MCP é um `OAuthResourceServer` próprio, com audience própria.
 * Um token do GitHub não vale no Notion, porque o audience é checado.
 *
 * Fluxo: cliente MCP sem token → 401 + discovery → /authorize (consent)
 * → GitHub → /callback → completeAuthorization (props criptografadas)
 * → cliente recebe token MCP → ferramentas executam com o token GitHub.
 * O refresh do token GitHub acontece em tokenExchangeCallback.
 */

import {
  OAuthAuthorizationServer,
  OAuthResourceServer,
  OAuthError,
} from '@cloudflare/workers-oauth-provider';
import { createMcpHandler } from 'agents/mcp/server';
import { refreshGithubToken } from './auth/github-app.ts';
import {
  handleAuthorize,
  handleCallback,
  errorPage,
  type AuthEnv,
  type AuthProps,
} from './auth/flow.ts';
import { defineMcps, type McpDefinition } from './mcps.ts';
import { resolveRoute } from './routes.ts';

interface Env extends AuthEnv {
  OAUTH_KV: KVNamespace;
}

/** Escopos que o consentimento pode conceder. */
const SCOPES_SUPPORTED = ['github', 'offline_access'];

/** Auth server + resource servers, montados uma vez por isolate. */
interface Router {
  mcps: McpDefinition[];
  authorizationServer: OAuthAuthorizationServer<Env>;
  resources: Array<{ mcp: McpDefinition; server: OAuthResourceServer<Env, AuthProps> }>;
}

let cachedRouter: Router | undefined;

function createRouter(env: Env): Router {
  const mcps = defineMcps(env.AUTH_ISSUER);

  const authorizationServer = new OAuthAuthorizationServer<Env>({
    issuer: env.AUTH_ISSUER,
    resources: mcps.map((m) => m.resource),
    // Clientes antigos que omitem `resource` caem no primeiro MCP.
    defaultResource: mcps[0]?.resource,
    // Grants criados antes do resource binding vão para o primeiro MCP.
    legacyGrantResource: mcps[0]?.resource,
    scopesSupported: SCOPES_SUPPORTED,
    // CIMD: clientes modernos usam uma URL HTTPS como client_id.
    clientIdMetadataDocumentEnabled: true,
    // DCR (RFC 7591): o Mistral Vibe Work registra o cliente dinamicamente.
    clientRegistrationEndpoint: '/oauth/register',
    tokenExchangeCallback: async ({ grantType, props }: { grantType: string; props: AuthProps }) => {
      if (grantType !== 'refresh_token') return;
      if (!props.githubRefreshToken) {
        throw new OAuthError('invalid_grant', { description: 'Sem refresh token do GitHub.' });
      }
      const result = await refreshGithubToken({
        refreshToken: props.githubRefreshToken,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      });
      if (!result.ok && result.error === 'bad_refresh_token') {
        throw new OAuthError('invalid_grant', { description: 'Acesso GitHub revogado.' });
      }
      if (!result.ok) {
        throw new OAuthError('temporarily_unavailable', {
          description: 'GitHub indisponível.',
          statusCode: 503,
        });
      }
      return {
        newProps: {
          ...props,
          githubToken: result.accessToken,
          githubRefreshToken: result.refreshToken,
        },
      };
    },
  });

  const resources = mcps.map((mcp) => ({
    mcp,
    server: new OAuthResourceServer<Env, AuthProps>({
      resourceMetadata: {
        resource: mcp.resource,
        authorization_servers: [env.AUTH_ISSUER],
        resource_name: `mcps-${mcp.name}`,
      },
      requiredScopes: ['github'],
      validateToken: () => (resource, token) =>
        authorizationServer.validateToken<AuthProps>(resource, token, env),
      handler: {
        fetch(request, _env, ctx) {
          const handler = createMcpHandler(() => mcp.createServer(ctx.props));
          return handler(request, _env, ctx);
        },
      },
    }),
  }));

  return { mcps, authorizationServer, resources };
}

function getRouter(env: Env): Router {
  if (!cachedRouter) cachedRouter = createRouter(env);
  return cachedRouter;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      // Erro de OAuth é culpa do fluxo, não do servidor: devolve 400 com a
      // explicação. Sem isto o runtime responde 1101 "Worker threw exception",
      // que não diz nada a quem está tentando conectar.
      if (error instanceof OAuthError) {
        console.error('oauth error', error.code, error.description);
        return errorPage(`${error.code}: ${error.description ?? 'pedido inválido'}`, 400);
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('unhandled error', error);
      return errorPage(`Falha inesperada: ${message}`, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const router = getRouter(env);
  const route = resolveRoute(url.pathname, request.method, router.mcps);

  switch (route.kind) {
    case 'authorize':
      return handleAuthorize(request, env, router.authorizationServer.getOAuthApi(env));

    case 'callback':
      return handleCallback(request, env, router.authorizationServer.getOAuthApi(env));

    case 'mcp': {
      const entry = router.resources.find((r) => r.mcp === route.mcp);
      if (!entry) return errorPage('MCP não registrado.', 500);
      return entry.server.fetch(request, env, ctx);
    }

    case 'oauth':
      return router.authorizationServer.fetch(request, env, ctx);

    case 'health': {
      const lines = router.mcps.map((m) => `  ${m.name}: ${m.path}`);
      return new Response(
        `mcps no ar. Conecte um cliente MCP nos endpoints abaixo.\n${lines.join('\n')}\n`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }

    default:
      return errorPage('Não encontrado.', 404);
  }
}
