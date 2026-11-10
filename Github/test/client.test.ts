import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, GitHubError } from '../src/github/client.ts';

/** fetch fake que responde de acordo com o pedido registrado. */
function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: any[] = [];
  const fn = async (input: any, init?: any) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  };
  return { fn, calls };
}

test('GET usa URL, headers e parseia JSON', async () => {
  const { fn, calls } = fakeFetch(200, { login: 'joaoldsxyzbr' });
  const client = new GitHubClient('token123', fn as any);
  const out = await client.get('/user');
  assert.equal(out.login, 'joaoldsxyzbr');
  const call = calls[0];
  assert.equal(call.input, 'https://api.github.com/user');
  assert.equal(call.init.headers.authorization, 'Bearer token123');
  assert.equal(call.init.headers.accept, 'application/vnd.github+json');
  assert.equal(call.init.headers['x-github-api-version'], '2022-11-28');
});

test('POST serializa corpo e usa método certo', async () => {
  const { fn, calls } = fakeFetch(201, { number: 42 });
  const client = new GitHubClient('t', fn as any);
  const out = await client.post('/repos/o/r/issues', { title: 'bug' });
  assert.equal(out.number, 42);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, JSON.stringify({ title: 'bug' }));
});

test('query string é montada sem valores vazios', async () => {
  const { fn, calls } = fakeFetch(200, []);
  const client = new GitHubClient('t', fn as any);
  await client.get('/search/repositories', { q: 'mcp', sort: undefined, page: 2 });
  assert.equal(calls[0].input, 'https://api.github.com/search/repositories?q=mcp&page=2');
});

test('404 vira GitHubError com status e mensagem da API', async () => {
  const { fn } = fakeFetch(404, { message: 'Not Found', documentation_url: 'https://docs' });
  const client = new GitHubClient('t', fn as any);
  await assert.rejects(
    () => client.get('/repos/x/y'),
    (e: any) => e instanceof GitHubError && e.status === 404 && e.message === 'Not Found' && !!e.documentationUrl,
  );
});

test('422 propaga mensagem de validação', async () => {
  const { fn } = fakeFetch(422, { message: 'Validation Failed' });
  const client = new GitHubClient('t', fn as any);
  await assert.rejects(
    () => client.post('/repos/o/r/issues', {}),
    (e: any) => e.status === 422 && e.message === 'Validation Failed',
  );
});

test('rate limit restante vem no GitHubError', async () => {
  const { fn } = fakeFetch(403, { message: 'rate limit' }, { 'x-ratelimit-remaining': '12' });
  const client = new GitHubClient('t', fn as any);
  await assert.rejects(
    () => client.get('/user'),
    (e: any) => e.status === 403 && e.rateLimitRemaining === 12,
  );
});

test('erro com corpo não-JSON ainda vira GitHubError', async () => {
  const fn = async () => new Response('oops', { status: 500 });
  const client = new GitHubClient('t', fn as any);
  await assert.rejects(
    () => client.get('/user'),
    (e: any) => e instanceof GitHubError && e.status === 500 && /oops/.test(e.message),
  );
});
