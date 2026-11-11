/**
 * Teste de integração real: sobe `wrangler dev` e verifica o que só o runtime
 * do Workers pode responder (401 + challenge, discovery, metadata do resource,
 * rejeição de token inválido).
 *
 * Rodar com: npm run test:integration
 * Não entra no `npm test` porque precisa do workerd e de uma porta livre.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
let server: ChildProcess | undefined;

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev não respondeu a tempo');
}

before(async () => {
  server = spawn(
    'npx',
    [
      'wrangler', 'dev',
      '--port', String(PORT),
      '--local',
      '--var', `AUTH_ISSUER:${BASE}`,
      '--var', 'GITHUB_CLIENT_ID:test-client',
      '--var', 'GITHUB_CLIENT_SECRET:test-secret',
    ],
    {
      shell: true,
      stdio: 'ignore',
    },
  );
  await waitForServer();
});

after(() => {
  if (!server?.pid) return;
  // No Windows `server.kill()` mata só o shell do `npx`; o workerd fica
  // órfão segurando a porta e a próxima execução falha. taskkill /T mata a árvore.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill();
  }
});

test('/ responde health listando os MCPs', async () => {
  const response = await fetch(`${BASE}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /github: \/github\/mcp/);
});

test('rota desconhecida responde 404', async () => {
  const response = await fetch(`${BASE}/nada`);
  assert.equal(response.status, 404);
});

test('/github/mcp sem token responde 401 com challenge Bearer', async () => {
  const response = await fetch(`${BASE}/github/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  assert.match(challenge, /Bearer/);
  assert.match(challenge, /resource_metadata=/);
});

test('discovery do authorization server anuncia o issuer', async () => {
  const response = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
  assert.equal(response.status, 200);
  const body: any = await response.json();
  assert.equal(body.issuer, BASE);
  assert.ok(Array.isArray(body.scopes_supported));
});

test('discovery anuncia DCR e clientes públicos (Vibe Work)', async () => {
  const response = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
  const body: any = await response.json();
  assert.equal(body.registration_endpoint, `${BASE}/oauth/register`);
  assert.ok(body.token_endpoint_auth_methods_supported.includes('none'));
  assert.ok(body.grant_types_supported.includes('refresh_token'));
});

test('DCR registra um cliente como o Mistral Vibe Work faria', async () => {
  const response = await fetch(`${BASE}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Mistral Vibe Work',
      redirect_uris: ['https://vibe.mistral.ai/oauth/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  assert.equal(response.status, 201);
  const body: any = await response.json();
  assert.ok(body.client_id);
  assert.equal(body.client_name, 'Mistral Vibe Work');
  assert.equal(body.token_endpoint_auth_method, 'none');
});

test('cliente registrado chega ao consentimento com PKCE', async () => {
  const registration = await fetch(`${BASE}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Vibe PKCE',
      redirect_uris: ['https://vibe.mistral.ai/oauth/callback'],
      token_endpoint_auth_method: 'none',
    }),
  });
  const { client_id } = (await registration.json()) as any;

  // Verifier de 64 chars; challenge = base64url(SHA-256(verifier)).
  const verifier = 'a'.repeat(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString('base64url');

  const authorize = new URL(`${BASE}/authorize`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', client_id);
  authorize.searchParams.set('redirect_uri', 'https://vibe.mistral.ai/oauth/callback');
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('resource', `${BASE}/github/mcp`);
  authorize.searchParams.set('scope', 'github offline_access');

  const response = await fetch(authorize);
  assert.equal(response.status, 200);
  // Sem text/html o navegador mostra o HTML como texto e não há como clicar.
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  // O cookie que amarra o handle a este navegador precisa chegar ao cliente.
  assert.match(response.headers.get('set-cookie') ?? '', /__Host-oauth-consent-/);
  const html = await response.text();
  assert.match(html, /Vibe PKCE/);
  assert.match(html, /name="handle"/);
  assert.match(html, /Permitir/);
});

test('metadata do resource do github aponta para o issuer', async () => {
  const response = await fetch(`${BASE}/.well-known/oauth-protected-resource/github/mcp`);
  assert.equal(response.status, 200);
  const body: any = await response.json();
  assert.equal(body.resource, `${BASE}/github/mcp`);
  assert.deepEqual(body.authorization_servers, [BASE]);
});

test('token inválido é rejeitado no resource do github', async () => {
  const response = await fetch(`${BASE}/github/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer token-que-nao-existe',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(response.status, 401);
});
