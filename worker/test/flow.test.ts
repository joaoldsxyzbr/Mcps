import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAuthorize, callbackUrl, errorPage } from '../src/auth/flow.ts';

const env = {
  GITHUB_CLIENT_ID: 'Iv1.abc',
  GITHUB_CLIENT_SECRET: 'shh',
  AUTH_ISSUER: 'https://mcps.example.dev',
};

/** OAuthHelpers fake: só o que o /authorize GET usa. */
function fakeOAuth(overrides: Record<string, any> = {}) {
  const calls: string[] = [];
  return {
    calls,
    helpers: {
      async parseAuthRequest() {
        calls.push('parseAuthRequest');
        return {
          clientId: 'client-1',
          resource: 'https://mcps.example.dev/github/mcp',
          scope: ['github', 'offline_access'],
        };
      },
      async beginConsent() {
        calls.push('beginConsent');
        return { handle: 'h-1', headers: new Headers() };
      },
      async lookupClient() {
        calls.push('lookupClient');
        return { clientId: 'client-1', clientName: 'Cliente Teste' };
      },
      ...overrides,
    } as any,
  };
}

test('callbackUrl deriva /callback da origem do issuer', () => {
  assert.equal(callbackUrl(env), 'https://mcps.example.dev/callback');
});

test('/authorize GET renderiza consentimento com o nome do cliente', async () => {
  const { helpers } = fakeOAuth();
  const response = await handleAuthorize(
    new Request('https://mcps.example.dev/authorize'),
    env,
    helpers,
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes('Cliente Teste'));
  assert.ok(html.includes('name="handle" value="h-1"'));
});

test('/authorize GET devolve HTML renderizável e preserva o cookie de binding', async () => {
  const { helpers } = fakeOAuth({
    async beginConsent() {
      const headers = new Headers();
      headers.append('Set-Cookie', '__Host-oauth-consent-abc=abc; Path=/; Secure; HttpOnly');
      return { handle: 'h-1', headers };
    },
  });
  const response = await handleAuthorize(
    new Request('https://mcps.example.dev/authorize'),
    env,
    helpers,
  );
  // Sem text/html o navegador exibe o código-fonte em vez da página.
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(response.headers.get('set-cookie') ?? '', /__Host-oauth-consent-abc/);
});

test('/authorize POST deny redireciona sem tocar no GitHub', async () => {
  const { helpers, calls } = fakeOAuth({
    async denyConsent() {
      calls.push('denyConsent');
      const headers = new Headers();
      headers.set('Location', 'https://client.example/cb?error=access_denied');
      return { headers };
    },
  });
  const body = new FormData();
  body.set('handle', 'h-1');
  body.set('action', 'deny');
  const response = await handleAuthorize(
    new Request('https://mcps.example.dev/authorize', { method: 'POST', body }),
    env,
    helpers,
  );
  assert.equal(response.status, 302);
  assert.ok(calls.includes('denyConsent'));
  assert.match(response.headers.get('Location') ?? '', /access_denied/);
});

test('errorPage devolve texto com o status pedido', async () => {
  const response = errorPage('falhou', 502);
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'falhou');
});
