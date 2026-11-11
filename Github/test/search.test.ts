import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search_code, search_commits } from '../src/tools/handlers/search.ts';

function fakeClient(responses: Array<{ match: (path: string) => boolean; data: any }>) {
  const calls: Array<{ path: string; query?: any; accept?: string }> = [];
  const client: any = {
    async get(path: string, query?: any, accept?: string) {
      calls.push({ path, query, accept });
      const r = responses.find((x) => x.match(path));
      if (!r) throw new Error(`sem resposta: ${path}`);
      return r.data;
    },
  };
  return { client, calls };
}

test('search_code monta q com repo e pede text-match', async () => {
  const { client, calls } = fakeClient([{
    match: (p) => p === '/search/code',
    data: {
      total_count: 1,
      incomplete_results: false,
      items: [{
        path: 'src/a.ts',
        sha: 's1',
        html_url: 'u',
        repository: { full_name: 'o/r' },
        text_matches: [{ fragment: 'const x = applyEdits(...)' }],
      }],
    },
  }]);
  const out = await search_code(client, { query: 'applyEdits', repo: 'o/r' });
  assert.equal(calls[0].query.q, 'applyEdits repo:o/r');
  assert.equal(calls[0].accept, 'application/vnd.github.text-match+json');
  assert.equal(out.total_count, 1);
  assert.equal(out.items[0].path, 'src/a.ts');
  assert.equal(out.items[0].fragments[0], 'const x = applyEdits(...)');
});

test('search_code sem repo não adiciona qualificador', async () => {
  const { client, calls } = fakeClient([{ match: () => true, data: { total_count: 0, items: [] } }]);
  await search_code(client, { query: 'foo' });
  assert.equal(calls[0].query.q, 'foo');
});

test('search_commits devolve sha, mensagem e repositório', async () => {
  const { client, calls } = fakeClient([{
    match: (p) => p === '/search/commits',
    data: {
      total_count: 1,
      items: [{
        sha: 'abc',
        html_url: 'u',
        commit: { message: 'fix: bug', author: { name: 'João', date: '2026-01-01' } },
        repository: { full_name: 'o/r' },
      }],
    },
  }]);
  const out = await search_commits(client, { query: 'fix', repo: 'o/r', sort: 'author-date' });
  assert.equal(calls[0].query.q, 'fix repo:o/r');
  assert.equal(calls[0].query.sort, 'author-date');
  assert.equal(out.items[0].sha, 'abc');
  assert.equal(out.items[0].message, 'fix: bug');
  assert.equal(out.items[0].repository, 'o/r');
});
