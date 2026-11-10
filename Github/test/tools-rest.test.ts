import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  search_repositories,
  get_repository_tree,
  create_branch,
  list_commits,
  get_commit,
  list_issues,
  search_issues,
  issue_write,
  add_issue_comment,
  list_pull_requests,
  search_pull_requests,
  create_pull_request,
  merge_pull_request,
} from '../src/tools/handlers/rest.ts';

function fakeClient() {
  const calls: Array<{ method: string; path: string; body?: any; query?: any }> = [];
  let responder: ((method: string, path: string) => any) | null = null;
  const client: any = {
    get(path: string, query?: any) {
      calls.push({ method: 'GET', path, query });
      return Promise.resolve(responder ? responder('GET', path) : {});
    },
    post(path: string, body?: any) {
      calls.push({ method: 'POST', path, body });
      return Promise.resolve(responder ? responder('POST', path) : {});
    },
    put(path: string, body?: any) {
      calls.push({ method: 'PUT', path, body });
      return Promise.resolve(responder ? responder('PUT', path) : {});
    },
    patch(path: string, body?: any) {
      calls.push({ method: 'PATCH', path, body });
      return Promise.resolve(responder ? responder('PATCH', path) : {});
    },
  };
  return {
    client, calls,
    respond(fn: (method: string, path: string) => any) { responder = fn; },
  };
}

test('search_repositories monta query de busca', async () => {
  const { client, calls } = fakeClient();
  await search_repositories(client, { query: 'mcp user:joaoldsxyzbr', page: 2, perPage: 10 });
  assert.equal(calls[0].path, '/search/repositories');
  assert.equal(calls[0].query.q, 'mcp user:joaoldsxyzbr');
  assert.equal(calls[0].query.page, 2);
  assert.equal(calls[0].query.per_page, 10);
});

test('get_repository_tree busca tree recursiva', async () => {
  const { client, calls } = fakeClient();
  await get_repository_tree(client, { owner: 'o', repo: 'r', ref: 'main' });
  assert.equal(calls[0].path, '/repos/o/r/git/trees/main');
  assert.equal(calls[0].query.recursive, 'true');
});

test('create_branch cria ref a partir do sha', async () => {
  const { client, calls } = fakeClient();
  await create_branch(client, { owner: 'o', repo: 'r', branch: 'dev', fromSha: 'abc' });
  assert.equal(calls[0].path, '/repos/o/r/git/refs');
  assert.deepEqual(calls[0].body, { ref: 'refs/heads/dev', sha: 'abc' });
});

test('create_branch sem fromSha resolve o sha da main', async () => {
  const f = fakeClient();
  f.respond(() => ({ object: { sha: 'mainsha' } }));
  await create_branch(f.client, { owner: 'o', repo: 'r', branch: 'dev' });
  const { client, calls } = f;
  assert.equal(calls[0].path, '/repos/o/r/git/ref/heads/main');
  assert.equal(calls[1].path, '/repos/o/r/git/refs');
  assert.equal(calls[1].body.sha, 'mainsha');
});

test('list_commits lista commits com ref e paginação', async () => {
  const { client, calls } = fakeClient();
  await list_commits(client, { owner: 'o', repo: 'r', ref: 'dev', perPage: 20 });
  assert.equal(calls[0].path, '/repos/o/r/commits');
  assert.equal(calls[0].query.sha, 'dev');
  assert.equal(calls[0].query.per_page, 20);
});

test('get_commit busca commit por sha', async () => {
  const { client, calls } = fakeClient();
  await get_commit(client, { owner: 'o', repo: 'r', sha: 'c1' });
  assert.equal(calls[0].path, '/repos/o/r/commits/c1');
});

test('list_issues lista com estado', async () => {
  const { client, calls } = fakeClient();
  await list_issues(client, { owner: 'o', repo: 'r', state: 'open' });
  assert.equal(calls[0].path, '/repos/o/r/issues');
  assert.equal(calls[0].query.state, 'open');
});

test('search_issues busca com is:issue', async () => {
  const { client, calls } = fakeClient();
  await search_issues(client, { query: 'bug', state: 'open' });
  assert.equal(calls[0].path, '/search/issues');
  assert.equal(calls[0].query.q, 'bug is:issue state:open');
});

test('issue_write cria issue', async () => {
  const { client, calls } = fakeClient();
  await issue_write(client, { owner: 'o', repo: 'r', method: 'create', title: 'x', body: 'y', labels: ['bug'] });
  assert.equal(calls[0].path, '/repos/o/r/issues');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { title: 'x', body: 'y', labels: ['bug'] });
});

test('issue_write atualiza issue com state_reason', async () => {
  const { client, calls } = fakeClient();
  await issue_write(client, { owner: 'o', repo: 'r', method: 'update', number: 7, state: 'closed', stateReason: 'completed' });
  assert.equal(calls[0].path, '/repos/o/r/issues/7');
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].body.state, 'closed');
  assert.equal(calls[0].body.state_reason, 'completed');
});

test('add_issue_comment comenta na issue', async () => {
  const { client, calls } = fakeClient();
  await add_issue_comment(client, { owner: 'o', repo: 'r', number: 7, body: 'oi' });
  assert.equal(calls[0].path, '/repos/o/r/issues/7/comments');
  assert.deepEqual(calls[0].body, { body: 'oi' });
});

test('list_pull_requests lista com estado e head', async () => {
  const { client, calls } = fakeClient();
  await list_pull_requests(client, { owner: 'o', repo: 'r', state: 'open', head: 'joaolds:feat' });
  assert.equal(calls[0].path, '/repos/o/r/pulls');
  assert.equal(calls[0].query.state, 'open');
  assert.equal(calls[0].query.head, 'joaolds:feat');
});

test('search_pull_requests busca com is:pr', async () => {
  const { client, calls } = fakeClient();
  await search_pull_requests(client, { query: 'review', state: 'merged' });
  assert.equal(calls[0].query.q, 'review is:pr state:merged');
});

test('create_pull_request abre PR', async () => {
  const { client, calls } = fakeClient();
  await create_pull_request(client, {
    owner: 'o', repo: 'r', title: 't', head: 'feat', base: 'main', body: 'b', draft: false,
  });
  assert.equal(calls[0].path, '/repos/o/r/pulls');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { title: 't', head: 'feat', base: 'main', body: 'b', draft: false });
});

test('merge_pull_request faz merge com método', async () => {
  const { client, calls } = fakeClient();
  await merge_pull_request(client, { owner: 'o', repo: 'r', number: 9, mergeMethod: 'squash', commitTitle: 'vai' });
  assert.equal(calls[0].path, '/repos/o/r/pulls/9/merge');
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(calls[0].body, { merge_method: 'squash', commit_title: 'vai' });
});
