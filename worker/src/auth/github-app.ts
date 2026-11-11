/**
 * Fluxo OAuth do GitHub App (user-to-server). Módulo puro: todas as
 * chamadas HTTP passam por fetch injetável. Sem estado — o ciclo de vida
 * do token (refresh) é gerenciado pelo workers-oauth-provider via
 * tokenExchangeCallback.
 */

export interface AuthorizeUrlArgs {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export function githubAuthorizeUrl(args: AuthorizeUrlArgs): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', args.clientId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('state', args.state);
  url.searchParams.set('code_challenge', args.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** Challenge S256 (base64url sem padding) para o verifier informado. */
export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface ExchangeCodeArgs {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GithubTokenResult {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

async function tokenRequest(body: URLSearchParams, fetchFn: typeof fetch): Promise<any> {
  const response = await fetchFn('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'unavailable' };
  }
}

export async function exchangeCode(args: ExchangeCodeArgs, fetchFn?: typeof fetch): Promise<GithubTokenResult> {
  const fetchToUse = fetchFn ?? globalThis.fetch.bind(globalThis);
  const body = new URLSearchParams({
    code: args.code,
    code_verifier: args.codeVerifier,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
  });
  const data = await tokenRequest(body, fetchToUse);
  if (data.error || !data.access_token) {
    return { error: data.error ?? 'no_access_token' };
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export interface RefreshResult {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export async function refreshGithubToken(
  args: { refreshToken: string; clientId: string; clientSecret: string },
  fetchFn?: typeof fetch,
): Promise<RefreshResult> {
  const fetchToUse = fetchFn ?? globalThis.fetch.bind(globalThis);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });
  let data: any;
  try {
    data = await tokenRequest(body, fetchToUse);
  } catch {
    return { ok: false, error: 'unavailable' };
  }
  if (data.error === 'bad_refresh_token') {
    return { ok: false, error: 'bad_refresh_token' };
  }
  if (!data.access_token) {
    return { ok: false, error: 'unavailable' };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function getGithubUser(token: string, fetchFn?: typeof fetch) {
  const fetchToUse = fetchFn ?? globalThis.fetch.bind(globalThis);
  const response = await fetchToUse('https://api.github.com/user', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`GitHub /user falhou: HTTP ${response.status}`);
  }
  const data: any = await response.json();
  return { id: String(data.id), login: data.login };
}
