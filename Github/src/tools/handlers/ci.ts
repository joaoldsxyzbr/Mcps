/**
 * Ferramentas de CI: o modelo precisa saber se os checks passaram e por que
 * falharam. Sem isso ele abre um PR e não tem como verificar o resultado.
 */

import type { GitHubClient } from '../../github/client.ts';

export interface CheckRunsArgs {
  owner: string;
  repo: string;
  /** SHA, branch ou tag. */
  ref: string;
  filter?: 'latest' | 'all';
  perPage?: number;
}

/** Check runs de um commit/ref (GitHub Actions e outros apps). */
export async function list_check_runs(client: GitHubClient, args: CheckRunsArgs) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/commits/${args.ref}/check-runs`, {
    filter: args.filter ?? 'latest',
    per_page: args.perPage,
  });
  const runs = (data.check_runs ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion ?? null,
    started_at: r.started_at,
    completed_at: r.completed_at,
    html_url: r.html_url,
    app: r.app?.slug ?? null,
  }));
  return {
    total_count: data.total_count ?? runs.length,
    // Resumo direto: o modelo decide se precisa cavar mais fundo.
    summary: summarize(runs),
    check_runs: runs,
  };
}

export interface CommitStatusArgs {
  owner: string;
  repo: string;
  ref: string;
}

/** Status combinado (legado, mas é o que muitos bots publicam). */
export async function get_commit_status(client: GitHubClient, args: CommitStatusArgs) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/commits/${args.ref}/status`);
  return {
    state: data.state,
    total_count: data.total_count,
    statuses: (data.statuses ?? []).map((s: any) => ({
      context: s.context,
      state: s.state,
      description: s.description,
      target_url: s.target_url,
    })),
  };
}

export interface WorkflowRunsArgs {
  owner: string;
  repo: string;
  branch?: string;
  status?: 'completed' | 'action_required' | 'cancelled' | 'failure' | 'neutral' | 'skipped' | 'stale' | 'success' | 'timed_out' | 'in_progress' | 'queued' | 'requested' | 'waiting';
  perPage?: number;
}

/** Execuções de GitHub Actions, mais recentes primeiro. */
export async function list_workflow_runs(client: GitHubClient, args: WorkflowRunsArgs) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/actions/runs`, {
    branch: args.branch,
    status: args.status,
    per_page: args.perPage,
  });
  return {
    total_count: data.total_count,
    workflow_runs: (data.workflow_runs ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      head_branch: r.head_branch,
      head_sha: r.head_sha,
      event: r.event,
      status: r.status,
      conclusion: r.conclusion ?? null,
      run_number: r.run_number,
      created_at: r.created_at,
      html_url: r.html_url,
    })),
  };
}

export interface WorkflowLogsArgs {
  owner: string;
  repo: string;
  runId: number;
  /** Só as últimas N linhas do log (o log completo pode ter MBs). */
  tailLines?: number;
}

/**
 * Log de uma execução. A API devolve um ZIP; aqui extraímos o texto de forma
 * tolerante e cortamos o final, que é onde o erro costuma estar.
 */
export async function get_workflow_run_logs(client: GitHubClient, args: WorkflowLogsArgs) {
  const response = await client.getRaw(`/repos/${args.owner}/${args.repo}/actions/runs/${args.runId}/logs`);
  const text = await response.text();
  const tail = args.tailLines ?? 200;
  const lines = text.split('\n');
  const kept = lines.slice(Math.max(0, lines.length - tail));
  return {
    run_id: args.runId,
    total_lines: lines.length,
    truncated: kept.length < lines.length,
    log: kept.join('\n'),
  };
}

function summarize(runs: Array<{ status: string; conclusion: string | null }>) {
  const counts = { success: 0, failure: 0, pending: 0, other: 0 };
  for (const run of runs) {
    if (run.status !== 'completed') counts.pending++;
    else if (run.conclusion === 'success') counts.success++;
    else if (run.conclusion === 'failure' || run.conclusion === 'timed_out') counts.failure++;
    else counts.other++;
  }
  return {
    ...counts,
    all_passed: runs.length > 0 && counts.failure === 0 && counts.pending === 0 && counts.other === 0,
  };
}
