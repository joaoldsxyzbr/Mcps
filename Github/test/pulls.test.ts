import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pull_request_read,
  pull_request_review,
  pull_request_comment,
  update_pull_request,
  update_pull_request_branch,
} from '../src/tools/handlers/pulls.ts';

function fakeClient(opts: { json?: (path: string) => any; raw?: (path: string) => string }) {
  const calls: Array<{ method: string; path: string; query?: any; body?: any; accept?: string }> = [];
  const client: any = {
    async get(path: string, query?: any) {
      calls.push({ method: 'GET', path, query });
      return opts.json ? opts.json(path) : {};
    },
    async getRaw(path: string, query?: any, accept?: string) {
      calls.push({ method: 'GET_RAW', path, query, accept });
      return new Response(opts.raw ? opts.raw(path) : '');
    },
    async post(path: string, body?: any) {
      calls.push({ method: 'POST', path, body });
      return { id: 1, state: 'APPROVED', html_url: 'u' };
    },
    async patch(path: string, body?: any) {
      calls.push({ method: 'PATCH', path, body });
      return { number: 7, title: body?.title ?? 'antigo', state: 'open', base: { ref: 'main' }, html_url: 'u' };
    },
    async put(path: string, body?: any) {
      calls.push({ method: 'PUT', path, body });
      return { message: 'Updating pull request branch.', sha: 'novo' };
    },
  };
  return { client, calls };
}

test('pull_request_read get devolve resumo do PR', async () => {
  const { client, calls } = fakeClient({
    json: () => ({
      number: 7, title: 'feat', state: 'open', draft: false, merged: false,
      head: { ref: 'feat' }, base: { ref: 'main' },
      additions: 10, deletions: 2, changed_files: 3, body: 'b', html_url: 'u',
    }),
  });
  const out = await pull_request_read(client, { owner: 'o', repo: 'r', number: 7, method: 'get' });
  assert.equal(calls[0].path, '/repos/o/r/pulls/7');
  assert.equal((out as any).changed_files, 3);
  assert.equal((out as any).head, 'feat');
});

test('pull_request_read get_diff pede media type diff', async () => {
  const { client, calls } = fakeClient({ raw: () => 'diff --git a/x b/x' });
  const out = await pull_request_read(client, { owner: 'o', repo: 'r', number: 7, method: 'get_diff' });
  assert.equal(calls[0].accept, 'application/vnd.github.diff');
  assert.match((out as any).diff, /diff --git/);
});

test('pull_request_read get_files lista patches', async () => {
  const { client, calls } = fakeClient({
    json: () => ([{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@' }]),
  });
  const out = await pull_request_read(client, { owner: 'o', repo: 'r', number: 7, method: 'get_files' });
  assert.equal(calls[0].path, '/repos/o/r/pulls/7/files');
  assert.equal((out as any)[0].filename, 'a.ts');
});

test('pull_request_read get_reviews devolve estado da review', async () => {
  const { client, calls } = fakeClient({
    json: () => ([{ id: 1, user: { login: 'joao' }, state: 'APPROVED', body: 'lgtm', submitted_at: 'd' }]),
  });
  const out = await pull_request_read(client, { owner: 'o', repo: 'r', number: 7, method: 'get_reviews' });
  assert.equal(calls[0].path, '/repos/o/r/pulls/7/reviews');
  assert.equal((out as any)[0].state, 'APPROVED');
});

test('pull_request_review envia event e body', async () => {
  const { client, calls } = fakeClient({});
  const out = await pull_request_review(client, {
    owner: 'o', repo: 'r', number: 7, event: 'REQUEST_CHANGES', body: 'faltou teste',
  });
  assert.equal(calls[0].path, '/repos/o/r/pulls/7/reviews');
  assert.equal(calls[0].body.event, 'REQUEST_CHANGES');
  assert.equal(calls[0].body.body, 'faltou teste');
  assert.equal(out.state, 'APPROVED');
});

test('pull_request_review sem body não envia a chave', async () => {
  const { client, calls } = fakeClient({});
  await pull_request_review(client, { owner: 'o', repo: 'r', number: 7, event: 'APPROVE' });
  assert.equal('body' in calls[0].body, false);
});

test('pull_request_comment comenta em linha do diff', async () => {
  const { client, calls } = fakeClient({});
  await pull_request_comment(client, {
    owner: 'o', repo: 'r', number: 7, body: 'aqui', commitId: 'abc', path: 'a.ts', line: 12,
  });
  assert.equal(calls[0].path, '/repos/o/r/pulls/7/comments');
  assert.equal(calls[0].body.commit_id, 'abc');
  assert.equal(calls[0].body.line, 12);
  assert.equal(calls[0].body.side, 'RIGHT');
});

test('update_pull_request envia só os campos informados', async () => {
  const { client, calls } = fakeClient({});
  const out = await update_pull_request(client, {
    owner: 'o', repo: 'r', number: 7, title: 'novo título', state: 'closed',
  });
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].path, '/repos/o/r/pulls/7');
  assert.deepEqual(calls[0].body, { title: 'novo título', state: 'closed' });
  assert.equal(out.title, 'novo título');
});

test('update_pull_request mapeia maintainerCanModify para snake_case', async () => {
  const { client, calls } = fakeClient({});
  await update_pull_request(client, {
    owner: 'o', repo: 'r', number: 7, maintainerCanModify: false,
  });
  assert.equal(calls[0].body.maintainer_can_modify, false);
});

test('update_pull_request sem nenhum campo falha sem chamar a API', async () => {
  const { client, calls } = fakeClient({});
  await assert.rejects(
    () => update_pull_request(client, { owner: 'o', repo: 'r', number: 7 }),
    /ao menos um campo/,
  );
  assert.equal(calls.length, 0);
});

test('update_pull_request_branch envia expectedHeadSha', async () => {
  const { client, calls } = fakeClient({});
  const out = await update_pull_request_branch(client, {
    owner: 'o', repo: 'r', number: 7, expectedHeadSha: 'abc',
  });
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].path, '/repos/o/r/pulls/7/update-branch');
  assert.equal(calls[0].body.expected_head_sha, 'abc');
  assert.equal(out.sha, 'novo');
});

test('update_pull_request_branch sem sha envia corpo vazio', async () => {
  const { client, calls } = fakeClient({});
  await update_pull_request_branch(client, { owner: 'o', repo: 'r', number: 7 });
  assert.deepEqual(calls[0].body, {});
});
