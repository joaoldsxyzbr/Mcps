import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  s256,
  githubAuthorizeUrl,
  exchangeCode,
  refreshGithubToken,
  getGithubUser,
} from '../src/auth/github-app.ts';

test('s256 gera challenge base64url do verifier', async () => {
  // SHA-256 de "mcps-github-test-verifier" em base64url (valor fixo, calculado uma vez)
  const challenge = await s256('mcps-github-test-verifier');
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  assert.equal(challenge.length, 43);
});

test('githubAuthorizeUrl monta URL com client_id, redirect, state e challenge', () => {
  const url = new URL(githubAuthorizeUrl({
    clientId: 'Iv1.abc',
    redirectUri: 'https://w.example/callback',
    state: 'st',
    codeChallenge: 'ch',
  }));
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.pathname, '/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'Iv1.abc');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://w.example/callback');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('code_challenge'), 'ch');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

function jsonFetch(status: number, body: unknown) {
  const calls: any[] = [];
  const fn = async (input: any, init?: any) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fn, calls };
}

test('exchangeCode faz POST com code, verifier e client secret', async () => {
  const { fn, calls } = jsonFetch(200, {
    access_token: 'ghu_1', refresh_token: 'ghr_1', expires_in: 28800, token_type: 'bearer', refresh_token_expires_in: 15897600,
  });
  const out = await exchangeCode({
    code: 'c1', codeVerifier: 'v1', clientId: 'Iv1', clientSecret: 'shh',
    redirectUri: 'https://w.example/callback',
  }, fn as any);
  assert.equal(out.accessToken, 'ghu_1');
  assert.equal(out.refreshToken, 'ghr_1');
  assert.equal(out.expiresIn, 28800);
  const call = calls[0];
  assert.equal(call.input, 'https://github.com/login/oauth/access_token');
  assert.equal(call.init.headers.accept, 'application/json');
  const body = new URLSearchParams(call.init.body);
  assert.equal(body.get('code'), 'c1');
  assert.equal(body.get('code_verifier'), 'v1');
  assert.equal(body.get('client_id'), 'Iv1');
  assert.equal(body.get('client_secret'), 'shh');
});

test('exchangeCode com erro do GitHub devolve erro estruturado', async () => {
  const { fn } = jsonFetch(200, { error: 'bad_verification_code', error_description: 'code expirado' });
  const out = await exchangeCode({
    code: 'x', codeVerifier: 'v', clientId: 'I', clientSecret: 's',
    redirectUri: 'https://w.example/callback',
  }, fn as any);
  assert.equal(out.accessToken, undefined);
  assert.equal(out.error, 'bad_verification_code');
});

test('refreshGithubToken usa grant_type refresh_token e devolve par novo', async () => {
  const { fn, calls } = jsonFetch(200, {
    access_token: 'ghu_2', refresh_token: 'ghr_2', expires_in: 28800, token_type: 'bearer',
  });
  const out = await refreshGithubToken({ refreshToken: 'ghr_1', clientId: 'Iv1', clientSecret: 'shh' }, fn as any);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.accessToken, 'ghu_2');
    assert.equal(out.refreshToken, 'ghr_2');
  }
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'ghr_1');
});

test('refreshGithubToken com bad_refresh_token marca erro', async () => {
  const { fn } = jsonFetch(200, { error: 'bad_refresh_token' });
  const out = await refreshGithubToken({ refreshToken: 'ghr_1', clientId: 'I', clientSecret: 's' }, fn as any);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.error, 'bad_refresh_token');
});

test('refreshGithubToken com falha HTTP devolve indisponível', async () => {
  const fn = async () => new Response('boom', { status: 503 });
  const out = await refreshGithubToken({ refreshToken: 'ghr_1', clientId: 'I', clientSecret: 's' }, fn as any);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.error, 'unavailable');
});

test('getGithubUser chama /user com token do usuário', async () => {
  const { fn, calls } = jsonFetch(200, { id: 42, login: 'joaoldsxyzbr' });
  const out = await getGithubUser('ghu_1', fn as any);
  assert.equal(out.login, 'joaoldsxyzbr');
  assert.equal(calls[0].input, 'https://api.github.com/user');
  assert.equal(calls[0].init.headers.authorization, 'Bearer ghu_1');
  // Sem User-Agent a API do GitHub responde 403.
  assert.equal(calls[0].init.headers['user-agent'], 'mcps-github');
  assert.equal(calls[0].init.headers['x-github-api-version'], '2022-11-28');
});

test('getGithubUser inclui status e corpo do GitHub no erro', async () => {
  const fn = async () => new Response('{"message":"Resource not accessible by integration"}', {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(
    () => getGithubUser('ghu_1', fn as any),
    (e: any) => e.message.includes('403') && e.message.includes('Resource not accessible'),
  );
});
