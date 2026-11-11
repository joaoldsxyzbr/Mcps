/**
 * Leitura e review de pull requests. O toolset v1 só sabia listar/criar/mergear;
 * para trabalhar com PRs é preciso ver o diff, os arquivos e deixar review.
 */

import type { GitHubClient } from '../../github/client.ts';

export interface PullRequestReadArgs {
  owner: string;
  repo: string;
  number: number;
  method:
    | 'get'
    | 'get_diff'
    | 'get_files'
    | 'get_commits'
    | 'get_reviews'
    | 'get_comments'
    | 'get_review_comments';
  page?: number;
  perPage?: number;
}

export async function pull_request_read(client: GitHubClient, args: PullRequestReadArgs) {
  const base = `/repos/${args.owner}/${args.repo}/pulls/${args.number}`;

  if (args.method === 'get_diff') {
    const diff = await client.getRaw(base, undefined, 'application/vnd.github.diff');
    return { diff: await diff.text() };
  }

  const path = {
    get: base,
    get_files: `${base}/files`,
    get_commits: `${base}/commits`,
    get_reviews: `${base}/reviews`,
    get_comments: `${base}/comments`,
    get_review_comments: `${base}/comments`,
  }[args.method];

  const data = await client.get<any>(path, { page: args.page, per_page: args.perPage });

  if (args.method === 'get') {
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      draft: data.draft ?? false,
      merged: data.merged ?? false,
      mergeable: data.mergeable ?? null,
      head: data.head?.ref,
      base: data.base?.ref,
      additions: data.additions,
      deletions: data.deletions,
      changed_files: data.changed_files,
      body: data.body,
      html_url: data.html_url,
    };
  }

  if (args.method === 'get_files') {
    return (Array.isArray(data) ? data : []).map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  }

  if (args.method === 'get_commits') {
    return (Array.isArray(data) ? data : []).map((c: any) => ({
      sha: c.sha,
      message: c.commit?.message,
      author: c.commit?.author?.name,
      date: c.commit?.author?.date,
    }));
  }

  if (args.method === 'get_reviews') {
    return (Array.isArray(data) ? data : []).map((r: any) => ({
      id: r.id,
      user: r.user?.login,
      state: r.state,
      body: r.body,
      submitted_at: r.submitted_at,
    }));
  }

  // get_comments / get_review_comments
  return (Array.isArray(data) ? data : []).map((c: any) => ({
    id: c.id,
    user: c.user?.login,
    body: c.body,
    path: c.path,
    line: c.line ?? null,
    created_at: c.created_at,
  }));
}

export interface PullRequestUpdateArgs {
  owner: string;
  repo: string;
  number: number;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  base?: string;
  maintainerCanModify?: boolean;
}

/** Edita título, corpo, estado ou base de um PR. */
export async function update_pull_request(client: GitHubClient, args: PullRequestUpdateArgs) {
  const body: Record<string, unknown> = {};
  if (args.title !== undefined) body.title = args.title;
  if (args.body !== undefined) body.body = args.body;
  if (args.state !== undefined) body.state = args.state;
  if (args.base !== undefined) body.base = args.base;
  if (args.maintainerCanModify !== undefined) body.maintainer_can_modify = args.maintainerCanModify;

  if (Object.keys(body).length === 0) {
    throw new Error('update_pull_request exige ao menos um campo para alterar.');
  }

  const updated = await client.patch<any>(`/repos/${args.owner}/${args.repo}/pulls/${args.number}`, body);
  return {
    number: updated.number,
    title: updated.title,
    state: updated.state,
    base: updated.base?.ref,
    html_url: updated.html_url,
  };
}

export interface PullRequestUpdateBranchArgs {
  owner: string;
  repo: string;
  number: number;
  /** SHA esperado do head. Se o PR andou, o update falha em vez de aplicar sobre outro estado. */
  expectedHeadSha?: string;
}

/**
 * Atualiza a branch do PR com a base (merge da base no head).
 * O GitHub pode responder 202 enquanto calcula; devolvemos `updated: null`.
 */
export async function update_pull_request_branch(client: GitHubClient, args: PullRequestUpdateBranchArgs) {
  const body: Record<string, unknown> = {};
  if (args.expectedHeadSha) body.expected_head_sha = args.expectedHeadSha;

  const result = await client.put<any>(
    `/repos/${args.owner}/${args.repo}/pulls/${args.number}/update-branch`,
    body,
  );
  return {
    updated: result?.message ?? null,
    sha: result?.sha ?? null,
  };
}

export interface PullRequestReviewArgs {
  owner: string;
  repo: string;
  number: number;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body?: string;
}

/** Submete uma review (aprovar, pedir mudanças ou comentar). */
export async function pull_request_review(client: GitHubClient, args: PullRequestReviewArgs) {
  const created = await client.post<any>(`/repos/${args.owner}/${args.repo}/pulls/${args.number}/reviews`, {
    event: args.event,
    ...(args.body ? { body: args.body } : {}),
  });
  return { id: created.id, state: created.state, html_url: created.html_url };
}

export interface PullRequestCommentArgs {
  owner: string;
  repo: string;
  number: number;
  body: string;
  commitId: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
}

/** Comentário em linha específica do diff. */
export async function pull_request_comment(client: GitHubClient, args: PullRequestCommentArgs) {
  const created = await client.post<any>(`/repos/${args.owner}/${args.repo}/pulls/${args.number}/comments`, {
    body: args.body,
    commit_id: args.commitId,
    path: args.path,
    line: args.line,
    side: args.side ?? 'RIGHT',
  });
  return { id: created.id, html_url: created.html_url };
}
