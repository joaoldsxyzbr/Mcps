/**
 * Rotas interativas do authorization server: `/authorize` (consentimento) e
 * `/callback` (retorno do GitHub App). Extraído do antigo `Github/src/index.ts`,
 * trocando `env.OAUTH_PROVIDER` por `getOAuthApi(env)` do modo role-based.
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import {
  githubAuthorizeUrl,
  exchangeCode,
  getGithubUser,
  s256,
} from './github-app.ts';
import { renderConsentPage } from './consent.ts';

/** Props guardadas no grant: o token GitHub do usuário. */
export interface AuthProps {
  githubToken: string;
  githubRefreshToken?: string;
  login?: string;
}

export interface AuthEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  AUTH_ISSUER: string;
}

export function errorPage(message: string, status: number): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export function callbackUrl(env: AuthEnv): string {
  return new URL('/callback', env.AUTH_ISSUER).toString();
}

/** GET/POST /authorize: mostra o consentimento e inicia o login no GitHub. */
export async function handleAuthorize(
  request: Request,
  env: AuthEnv,
  oauth: OAuthHelpers,
): Promise<Response> {
  if (request.method === 'GET') {
    const authRequest = await oauth.parseAuthRequest(request);
    const consent = await oauth.beginConsent(authRequest);
    const client = await oauth.lookupClient(authRequest.clientId);
    const response = new Response(
      renderConsentPage({
        clientName: client?.clientName ?? authRequest.clientId,
        handle: consent.handle,
        scopes: authRequest.scope,
      }),
      { headers: consent.headers },
    );
    // `consent.headers` só traz cookie e cabeçalhos de segurança. Sem o
    // content-type explícito o runtime assume text/plain e o navegador
    // mostra o HTML como texto — a página aparece sem botões.
    response.headers.set('content-type', 'text/html; charset=utf-8');
    return response;
  }

  const form = await request.formData();
  const handle = String(form.get('handle'));
  if (String(form.get('action')) === 'deny') {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }
  const approved = await oauth.approveConsent(request, handle);
  return startGithubLogin(env, oauth, approved.request, approved.headers);
}

async function startGithubLogin(
  env: AuthEnv,
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
      clientId: env.GITHUB_CLIENT_ID,
      redirectUri: callbackUrl(env),
      state: upstream.state,
      codeChallenge: await s256(verifier),
    }),
  );
  return new Response(null, { status: 302, headers });
}

/** GET /callback: troca o code do GitHub por token e completa a autorização. */
export async function handleCallback(
  request: Request,
  env: AuthEnv,
  oauth: OAuthHelpers,
): Promise<Response> {
  const url = new URL(request.url);
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
    redirectUri: callbackUrl(env),
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
    } satisfies AuthProps,
  });
  const headers = finished.headers;
  headers.set('Location', redirectTo);
  return new Response(null, { status: 302, headers });
}
