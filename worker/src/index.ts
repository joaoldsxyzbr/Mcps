/**
 * Worker do MCP do GitHub: authorization server + um resource server.
 *
 * Arquitetura role-based do workers-oauth-provider:
 *   - `OAuthAuthorizationServer` emite tokens e declara o resource;
 *   - `OAuthResourceServer` protege `/github/mcp` e valida a audience.
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
import { createGithubServer } from '../../Github/src/mcp.ts';
import { refreshGithubToken } from './auth/github-app.ts';
import {
  handleAuthorize,
  handleCallback,
  errorPage,
  type AuthEnv,
  type AuthProps,
} from './auth/flow.ts';
import { MCP_NAME, MCP_PATH, SCOPES_SUPPORTED } from './config.ts';
import { resolveRoute } from './routes.ts';

interface Env extends AuthEnv {
  OAUTH_KV: KVNamespace;
}

/** Auth server + resource server, montados uma vez por isolate. */
interface Router {
  resource: string;
  authorizationServer: OAuthAuthorizationServer<Env>;
  resourceServer: OAuthResourceServer<Env, AuthProps>;
}

let cachedRouter: Router | undefined;

function createRouter(env: Env): Router {
  const resource = `${env.AUTH_ISSUER.replace(/\/+$/, '')}${MCP_PATH}`;

  const authorizationServer = new OAuthAuthorizationServer<Env>({
    issuer: env.AUTH_ISSUER,
    resources: [resource],
    // Clientes que omitem `resource` e grants antigos caem no único MCP.
    defaultResource: resource,
    legacyGrantResource: resource,
    scopesSupported: SCOPES_SUPPORTED,
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

  const resourceServer = new OAuthResourceServer<Env, AuthProps>({
    resourceMetadata: {
      resource,
      authorization_servers: [env.AUTH_ISSUER],
      resource_name: `mcps-${MCP_NAME}`,
    },
    requiredScopes: ['github'],
    validateToken: () => (r, token) =>
      authorizationServer.validateToken<AuthProps>(r, token, env),
    handler: {
      fetch(request, _env, ctx) {
        // `createMcpHandler` só responde no pathname exato de `route`; o
        // default é `/mcp`, então o route tem de ser o path real do MCP.
        const handler = createMcpHandler(() => createGithubServer(ctx.props), {
          route: MCP_PATH,
        });
        return handler(request, _env, ctx);
      },
    },
  });

  return { resource, authorizationServer, resourceServer };
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
      // O provider lança duas classes diferentes: `OAuthError` (nossa) e
      // `AuthorizationError` (dele, não exportada). Ambas têm code/description.
      const oauth = oauthFailure(error);
      if (oauth) {
        console.error('oauth error', oauth.code, oauth.description);
        return errorPage(`${oauth.code}: ${oauth.description || 'pedido inválido'}`, 400);
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('unhandled error', error);
      return errorPage(`Falha inesperada: ${message}`, 500);
    }
  },
} satisfies ExportedHandler<Env>;

/** Reconhece os dois erros de OAuth do provider (classes distintas). */
function oauthFailure(error: unknown): { code: string; description: string } | undefined {
  if (error instanceof OAuthError) {
    return { code: error.code, description: error.description };
  }
  const candidate = error as { name?: string; code?: unknown; description?: unknown };
  if (candidate?.name === 'AuthorizationError' && typeof candidate.code === 'string') {
    return {
      code: candidate.code,
      description: typeof candidate.description === 'string' ? candidate.description : '',
    };
  }
  return undefined;
}

async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const router = getRouter(env);
  const route = resolveRoute(url.pathname, request.method);

  switch (route.kind) {
    case 'authorize':
      return handleAuthorize(request, env, router.authorizationServer.getOAuthApi(env));

    case 'callback':
      return handleCallback(request, env, router.authorizationServer.getOAuthApi(env));

    case 'mcp':
      return router.resourceServer.fetch(request, env, ctx);

    case 'oauth':
      return router.authorizationServer.fetch(request, env, ctx);

    case 'health':
      return new Response(
        `mcps no ar. Conecte um cliente MCP nos endpoints abaixo.\n  ${MCP_NAME}: ${MCP_PATH}\n`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );

    default:
      return errorPage('Não encontrado.', 404);
  }
}
