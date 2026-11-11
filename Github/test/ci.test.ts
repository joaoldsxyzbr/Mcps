import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  list_check_runs,
  get_commit_status,
  list_workflow_runs,
  get_workflow_run_logs,
} from '../src/tools/handlers/ci.ts';

function fakeClient(opts: {
  json?: (path: string) => any;
  raw?: (path: string) => string;
}) {
  const calls: Array<{ path: string; query?: any }> = [];
  const client: any = {
    async get(path: string, query?: any) {
      calls.push({ path, query });
      return opts.json ? opts.json(path) : {};
    },
    async getRaw(path: string, query?: any) {
      calls.push({ path, query });
      return new Response(opts.raw ? opts.raw(path) : '');
    },
  };
  return { client, calls };
}

test('list_check_runs resume aprovado/falhou/pendente', async () => {
  const { client, calls } = fakeClient({
    json: () => ({
      total_count: 3,
      check_runs: [
        { id: 1, name: 'test', status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } },
        { id: 2, name: 'lint', status: 'completed', conclusion: 'failure', app: { slug: 'github-actions' } },
        { id: 3, name: 'build', status: 'in_progress', conclusion: null, app: { slug: 'github-actions' } },
      ],
    }),
  });
  const out = await list_check_runs(client, { owner: 'o', repo: 'r', ref: 'main' });
  assert.equal(calls[0].path, '/repos/o/r/commits/main/check-runs');
  assert.equal(calls[0].query.filter, 'latest');
  assert.equal(out.summary.success, 1);
  assert.equal(out.summary.failure, 1);
  assert.equal(out.summary.pending, 1);
  assert.equal(out.summary.all_passed, false);
});

test('list_check_runs marca all_passed quando tudo passou', async () => {
  const { client } = fakeClient({
    json: () => ({
      check_runs: [{ id: 1, name: 'test', status: 'completed', conclusion: 'success' }],
    }),
  });
  const out = await list_check_runs(client, { owner: 'o', repo: 'r', ref: 'abc' });
  assert.equal(out.summary.all_passed, true);
});

test('get_commit_status devolve estado combinado', async () => {
  const { client, calls } = fakeClient({
    json: () => ({
      state: 'failure',
      total_count: 1,
      statuses: [{ context: 'ci/test', state: 'failure', description: '3 testes falharam', target_url: 'u' }],
    }),
  });
  const out = await get_commit_status(client, { owner: 'o', repo: 'r', ref: 'abc' });
  assert.equal(calls[0].path, '/repos/o/r/commits/abc/status');
  assert.equal(out.state, 'failure');
  assert.equal(out.statuses[0].context, 'ci/test');
});

test('list_workflow_runs filtra por branch e status', async () => {
  const { client, calls } = fakeClient({
    json: () => ({
      total_count: 1,
      workflow_runs: [{
        id: 9, name: 'CI', head_branch: 'main', head_sha: 'abc', event: 'push',
        status: 'completed', conclusion: 'failure', run_number: 42, html_url: 'u',
      }],
    }),
  });
  const out = await list_workflow_runs(client, { owner: 'o', repo: 'r', branch: 'main', status: 'failure' });
  assert.equal(calls[0].path, '/repos/o/r/actions/runs');
  assert.equal(calls[0].query.branch, 'main');
  assert.equal(calls[0].query.status, 'failure');
  assert.equal(out.workflow_runs[0].conclusion, 'failure');
});

test('get_workflow_run_logs corta as últimas linhas', async () => {
  const log = Array.from({ length: 500 }, (_, i) => `linha ${i + 1}`).join('\n');
  const { client, calls } = fakeClient({ raw: () => log });
  const out = await get_workflow_run_logs(client, { owner: 'o', repo: 'r', runId: 9, tailLines: 10 });
  assert.equal(calls[0].path, '/repos/o/r/actions/runs/9/logs');
  assert.equal(out.total_lines, 500);
  assert.equal(out.truncated, true);
  assert.ok(out.log.startsWith('linha 491'));
  assert.ok(out.log.endsWith('linha 500'));
});
