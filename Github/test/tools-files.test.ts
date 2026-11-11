import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  get_me,
  get_file_contents,
  create_or_update_file,
  edit_file,
  push_files,
  delete_file,
} from '../src/tools/handlers/files.ts';
import { EditError } from '../src/github/edit.ts';

/** Cliente fake que registra chamadas e responde por rota. */
function fakeClient(responses: Array<{ match: (method: string, path: string) => boolean; data: any }>) {
  const calls: Array<{ method: string; path: string; body?: any; query?: any }> = [];
  const client: any = {
    async get(path: string, query?: any) {
      calls.push({ method: 'GET', path, query });
      return respond('GET', path);
    },
    async put(path: string, body?: any) {
      calls.push({ method: 'PUT', path, body });
      return respond('PUT', path);
    },
    async post(path: string, body?: any) {
      calls.push({ method: 'POST', path, body });
      return respond('POST', path);
    },
    async patch(path: string, body?: any) {
      calls.push({ method: 'PATCH', path, body });
      return respond('PATCH', path);
    },
    async delete(path: string, body?: any) {
      calls.push({ method: 'DELETE', path, body });
      return respond('DELETE', path);
    },
  };
  function respond(method: string, path: string) {
    const r = responses.find((x) => x.match(method, path));
    if (!r) throw new Error(`sem resposta registrada: ${method} ${path}`);
    return typeof r.data === 'function' ? r.data() : r.data;
  }
  return { client, calls };
}

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

test('get_me chama GET /user e devolve login', async () => {
  const { client, calls } = fakeClient([{ match: (m, p) => m === 'GET' && p === '/user', data: { login: 'joaoldsxyzbr', name: 'João' } }]);
  const out = await get_me(client);
  assert.equal(out.login, 'joaoldsxyzbr');
  assert.equal(calls.length, 1);
});

test('get_file_contents decodifica arquivo em UTF-8', async () => {
  const { client } = fakeClient([{
    match: (m, p) => m === 'GET' && p === '/repos/o/r/contents/README.md',
    data: { name: 'README.md', path: 'README.md', content: b64('# Olá João\n'), encoding: 'base64', sha: 'abc', type: 'file' },
  }]);
  const out = await get_file_contents(client, { owner: 'o', repo: 'r', path: 'README.md' });
  assert.equal(out.type, 'file');
  assert.equal(out.content, '# Olá João\n');
});

test('get_file_contents lista pasta com fields filtrados', async () => {
  const { client, calls } = fakeClient([{
    match: (m, p) => m === 'GET' && p === '/repos/o/r/contents/src',
    data: [{ name: 'a.ts', path: 'src/a.ts', sha: 's1', type: 'file', size: 10, html_url: 'u' }],
  }]);
  const out = await get_file_contents(client, { owner: 'o', repo: 'r', path: 'src', ref: 'dev', fields: ['name', 'type'] });
  assert.deepEqual(out.entries, [{ name: 'a.ts', type: 'file' }]);
  assert.equal(calls[0].query.ref, 'dev');
});

test('create_or_update_file faz PUT com base64 e sha', async () => {
  const { client, calls } = fakeClient([{
    match: (m, p) => m === 'PUT' && p === '/repos/o/r/contents/docs/x.md',
    data: { content: { sha: 'new' }, commit: { sha: 'c1' } },
  }]);
  const out = await create_or_update_file(client, {
    owner: 'o', repo: 'r', branch: 'main', path: 'docs/x.md', content: 'novo', message: 'add x', sha: 'velho',
  });
  assert.equal(out.commit.sha, 'c1');
  assert.equal(calls[0].body.content, b64('novo'));
  assert.equal(calls[0].body.sha, 'velho');
  assert.equal(calls[0].body.branch, 'main');
});

test('edit_file busca, aplica edição e commita com sha', async () => {
  const { client, calls } = fakeClient([{
    match: (m, p) => m === 'GET' && p === '/repos/o/r/contents/f.txt',
    data: { content: b64('um dois tres'), encoding: 'base64', sha: 's0', type: 'file' },
  }, {
    match: (m, p) => m === 'PUT' && p === '/repos/o/r/contents/f.txt',
    data: { content: { sha: 's1' }, commit: { sha: 'c9', html_url: 'https://gh/c9' } },
  }]);
  const out = await edit_file(client, {
    owner: 'o', repo: 'r', branch: 'main', path: 'f.txt', message: 'edita',
    edits: [{ oldString: 'dois', newString: '2' }],
  });
  assert.equal(out.commit.sha, 'c9');
  assert.equal(calls.length, 2);
  const put = calls[1].body;
  assert.equal(Buffer.from(put.content, 'base64').toString('utf8'), 'um 2 tres');
  assert.equal(put.sha, 's0');
});

test('edit_file com old_string inexistente falha sem PUT', async () => {
  const { client, calls } = fakeClient([{
    match: (m, p) => m === 'GET' && p === '/repos/o/r/contents/f.txt',
    data: { content: b64('abc'), encoding: 'base64', sha: 's0', type: 'file' },
  }]);
  await assert.rejects(
    () => edit_file(client, {
      owner: 'o', repo: 'r', branch: 'main', path: 'f.txt', message: 'edita',
      edits: [{ oldString: 'zzz', newString: 'x' }],
    }),
    (e: any) => e instanceof EditError && e.code === 'EDIT_NOT_FOUND',
  );
  assert.equal(calls.length, 1); // só o GET
});

test('push_files faz 4 chamadas: ref, tree, commit, update ref', async () => {
  const { client, calls } = fakeClient([{
    match: (m, p) => m === 'GET' && p === '/repos/o/r/git/ref/heads/main',
    data: { object: { sha: 'refsha', url: '', type: 'commit' } },
  }, {
    match: (m, p) => m === 'POST' && p === '/repos/o/r/git/trees',
    data: () => ({ sha: 'treesha' }),
  }, {
    match: (m, p) => m === 'POST' && p === '/repos/o/r/git/commits',
    data: () => ({ sha: 'commitsha' }),
  }, {
    match: (m, p) => m === 'PATCH' && p === '/repos/o/r/git/refs/heads/main',
    data: { object: { sha: 'commitsha' } },
  }]);
  const out = await push_files(client, {
    owner: 'o', repo: 'r', branch: 'main', message: 'vários',
    files: [{ path: 'a.txt', content: 'A' }, { path: 'b.txt', content: 'B' }],
  });
  assert.equal(out.sha, 'commitsha');
  assert.equal(out.attempts, 1);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'POST', 'PATCH']);
  const tree = calls[1].body;
  assert.equal(tree.base_tree, 'refsha');
  assert.deepEqual(tree.tree.map((t: any) => t.path), ['a.txt', 'b.txt']);
  assert.deepEqual(tree.tree[0].content, 'A');
  const commit = calls[2].body;
  assert.equal(commit.tree, 'treesha');
  assert.deepEqual(commit.parents, ['refsha']);
  assert.equal(calls[3].body.sha, 'commitsha');
  // Nunca força: é o que impede sobrescrever trabalho de outro.
  assert.equal(calls[3].body.force, false);
});

test('push_files com expectedHeadSha divergente falha sem escrever', async () => {
  const { client, calls } = fakeClient([{
    match: (m, p) => m === 'GET' && p === '/repos/o/r/git/ref/heads/main',
    data: { object: { sha: 'atual' } },
  }]);
  await assert.rejects(
    () => push_files(client, {
      owner: 'o', repo: 'r', branch: 'main', message: 'm',
      files: [{ path: 'a.txt', content: 'A' }],
      expectedHeadSha: 'esperado',
    }),
    (e: any) => e.code === 'PUSH_CONFLICT' && e.expected === 'esperado' && e.actual === 'atual',
  );
  assert.equal(calls.length, 1); // só o GET, nada foi escrito
});

test('push_files retenta quando a branch andou entre leitura e escrita', async () => {
  let patchAttempts = 0;
  const calls: Array<{ method: string }> = [];
  const client: any = {
    async get() {
      calls.push({ method: 'GET' });
      return { object: { sha: calls.filter((c) => c.method === 'GET').length === 1 ? 'sha1' : 'sha2' } };
    },
    async post(path: string) {
      calls.push({ method: 'POST' });
      return { sha: path.endsWith('/trees') ? 'tree' : 'commit' };
    },
    async patch() {
      calls.push({ method: 'PATCH' });
      patchAttempts++;
      if (patchAttempts === 1) {
        const err: any = new Error('not a fast forward');
        err.status = 422;
        throw err;
      }
      return {};
    },
  };
  const out = await push_files(client, {
    owner: 'o', repo: 'r', branch: 'main', message: 'm',
    files: [{ path: 'a.txt', content: 'A' }],
  });
  assert.equal(out.attempts, 2);
  assert.equal(patchAttempts, 2);
});

test('push_files desiste após maxRetries', async () => {
  const client: any = {
    async get() { return { object: { sha: 'sha' } }; },
    async post(path: string) { return { sha: path.endsWith('/trees') ? 'tree' : 'commit' }; },
    async patch() {
      const err: any = new Error('conflict');
      err.status = 409;
      throw err;
    },
  };
  await assert.rejects(
    () => push_files(client, {
      owner: 'o', repo: 'r', branch: 'main', message: 'm',
      files: [{ path: 'a.txt', content: 'A' }],
      maxRetries: 2,
    }),
    (e: any) => e.code === 'PUSH_CONFLICT',
  );
});

test('delete_file lê o sha quando não informado e apaga', async () => {
  const { client, calls } = fakeClient([{
    match: (m, p) => m === 'GET' && p === '/repos/o/r/contents/x.txt',
    data: { type: 'file', sha: 'sha-atual' },
  }, {
    match: (m, p) => m === 'DELETE' && p === '/repos/o/r/contents/x.txt',
    data: { commit: { sha: 'c1', html_url: 'u' } },
  }]);
  const out = await delete_file(client, {
    owner: 'o', repo: 'r', branch: 'main', path: 'x.txt', message: 'remove',
  });
  assert.equal(out.deleted, 'x.txt');
  assert.equal(out.commit.sha, 'c1');
  assert.equal(calls[1].body.sha, 'sha-atual');
  assert.equal(calls[1].body.branch, 'main');
});
