/**
 * Entrada do Worker: OAuthProvider (authorization server + resource server
 * em um worker só) com login via GitHub App e o endpoint MCP em /mcp.
 *
 * Fluxo: cliente MCP sem token → 401 + discovery → /authorize (consent)
 * → GitHub → /callback → completeAuthorization (props criptografadas)
 * → cliente recebe token MCP → ferramentas executam com o token GitHub.
 * O refresh do token GitHub acontece em tokenExchangeCallback, quando o
 * cliente renova seu token MCP.
 */

import {
  OAuthProvider,
  OAuthError,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { env } from 'cloudflare:workers';
import { GitHubClient } from './github/client.ts';
import { registerTools } from './tools/registry.ts';
import {
  githubAuthorizeUrl,
  exchangeCode,
  refreshGithubToken,
  getGithubUser,
  s256,
} from './auth/github-app.ts';
import { renderConsentPage } from './auth/consent.ts';

interface Env {
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  CONSENT_SECRET: string;
  MCP_SERVER_URL: string;
}

interface AuthProps {
  githubToken: string;
  githubRefreshToken?: string;
  login?: string;
}

// env de cloudflare:workers é tipado como o Env global do wrangler; o cast
// alinha com a interface de cima no typecheck.
const workerEnv = env as unknown as Env;

function callbackUrl(): string {
  return new URL('/callback', workerEnv.MCP_SERVER_URL).toString();
}

// --- Endpoint MCP ---

function createServer(props: AuthProps) {
  const server = new McpServer({ name: 'mcps-github', version: '0.1.0' });
  registerTools(server, new GitHubClient(props.githubToken));
  return server;
}

// O OAuthProvider entrega ctx.props (do completeAuthorization) ao apiHandler.
// `satisfies` (em vez de anotação) mantém `fetch` obrigatório no tipo inferido,
// como exige ExportedHandlerWithFetch do OAuthProvider.
const apiHandler = {
  fetch(request: Request, env: Env, ctx: any) {
    const mcpHandler = createMcpHandler(() => createServer(ctx.props as AuthProps));
    return mcpHandler(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// --- /authorize, /callback, health ---

function errorPage(message: string, status: number): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function handleDefault(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const url = new URL(request.url);

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('mcps-github no ar. Conecte um cliente MCP em /mcp.\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/authorize') {
      if (request.method === 'GET') {
        const authRequest = await oauth.parseAuthRequest(request);
        if (
          await oauth.isConsentRemembered(request, authRequest, { secret: env.CONSENT_SECRET })
        ) {
          return startGithubLogin(oauth, authRequest);
        }
        const consent = await oauth.beginConsent(authRequest);
        const client = await oauth.lookupClient(authRequest.clientId);
        return new Response(
          renderConsentPage({
            clientName: client?.clientName ?? authRequest.clientId,
            handle: consent.handle,
            scopes: authRequest.scope,
          }),
          { headers: consent.headers },
        );
      }
      if (request.method === 'POST') {
        const form = await request.formData();
        const handle = String(form.get('handle'));
        if (String(form.get('action')) === 'deny') {
          const denied = await oauth.denyConsent(request, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await oauth.approveConsent(request, handle, {
          remember: { secret: env.CONSENT_SECRET },
        });
        return startGithubLogin(oauth, approved.request, approved.headers);
      }
    }

    if (url.pathname === '/callback' && request.method === 'GET') {
      const finished = await oauth.finishUpstream(request);
      const data = finished.data as { verifier: string };
      const code = url.searchParams.get('code');
      if (!code) {
        return errorPage('GitHub não devolveu código de autorização.', 400);
      }
      const exchanged = await exchangeCode({
        code,
        codeVerifier: data.verifier,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: callbackUrl(),
      });
      if (!exchanged.accessToken) {
        return errorPage('Troca de código com o GitHub falhou. Tente autorizar de novo.', 502);
      }
      const user = await getGithubUser(exchanged.accessToken);
      const { redirectTo } = await oauth.completeAuthorization({
        request: finished.request,
        userId: user.id,
        metadata: {},
        scope: finished.request.scope,
        props: {
          githubToken: exchanged.accessToken,
          githubRefreshToken: exchanged.refreshToken,
          login: user.login,
        },
      });
      const headers = finished.headers;
      headers.set('Location', redirectTo);
      return new Response(null, { status: 302, headers });
    }

    return errorPage('Não encontrado.', 404);
}

const defaultHandler = { fetch: handleDefault };

async function startGithubLogin(
  oauth: OAuthHelpers,
  approvedRequest: any,
  approvedHeaders?: Headers,
): Promise<Response> {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const upstream = await oauth.beginUpstream(approvedRequest, {
    data: { verifier },
    headers: approvedHeaders,
  });
  const headers = upstream.headers;
  headers.set(
    'Location',
    githubAuthorizeUrl({
      clientId: workerEnv.GITHUB_CLIENT_ID,
      redirectUri: callbackUrl(),
      state: upstream.state,
      codeChallenge: await s256(verifier),
    }),
  );
  return new Response(null, { status: 302, headers });
}

// --- Provider ---

export default new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler,
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  scopesSupported: ['github', 'offline_access'],
  requiredScopes: ['github'],
  resourceMetadata: {
    resource: workerEnv.MCP_SERVER_URL,
    authorization_servers: [workerEnv.MCP_SERVER_URL],
  },
  clientIdMetadataDocumentEnabled: true,
  tokenExchangeCallback: async ({ grantType, props }: { grantType: string; props: AuthProps }) => {
    if (grantType !== 'refresh_token') return;
    if (!props.githubRefreshToken) {
      throw new OAuthError('invalid_grant', { description: 'Sem refresh token do GitHub.' });
    }
    const result = await refreshGithubToken({
      refreshToken: props.githubRefreshToken,
      clientId: workerEnv.GITHUB_CLIENT_ID,
      clientSecret: workerEnv.GITHUB_CLIENT_SECRET,
    });
    if (!result.ok && result.error === 'bad_refresh_token') {
      throw new OAuthError('invalid_grant', { description: 'Acesso GitHub revogado.' });
    }
    if (!result.ok) {
      throw new OAuthError('temporarily_unavailable', { description: 'GitHub indisponível.', statusCode: 503 });
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
