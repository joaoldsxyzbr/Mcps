/**
 * Handlers de ferramentas de repos, git, issues e pull requests.
 * Puros: mapeiam argumentos para chamadas do GitHubClient.
 */

import type { GitHubClient } from '../../github/client.ts';

/** Remove chaves undefined: o corpo enviado é exatamente o que foi pedido. */
function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

// --- Repos ---

export async function list_branches(client: GitHubClient, args: {
  owner: string; repo: string; page?: number; perPage?: number;
}) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/branches`, {
    page: args.page,
    per_page: args.perPage,
  });
  return (Array.isArray(data) ? data : []).map((b: any) => ({
    name: b.name,
    sha: b.commit?.sha,
    protected: b.protected ?? false,
  }));
}

export async function list_tags(client: GitHubClient, args: {
  owner: string; repo: string; page?: number; perPage?: number;
}) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/tags`, {
    page: args.page,
    per_page: args.perPage,
  });
  return (Array.isArray(data) ? data : []).map((t: any) => ({
    name: t.name,
    sha: t.commit?.sha,
  }));
}

export async function list_releases(client: GitHubClient, args: {
  owner: string; repo: string; page?: number; perPage?: number;
}) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/releases`, {
    page: args.page,
    per_page: args.perPage,
  });
  return (Array.isArray(data) ? data : []).map((r: any) => ({
    tag_name: r.tag_name,
    name: r.name,
    draft: r.draft ?? false,
    prerelease: r.prerelease ?? false,
    published_at: r.published_at,
    html_url: r.html_url,
  }));
}

export async function search_repositories(client: GitHubClient, args: {
  query: string; page?: number; perPage?: number; sort?: string; order?: string;
}) {
  const data = await client.get<any>('/search/repositories', {
    q: args.query,
    page: args.page,
    per_page: args.perPage,
    sort: args.sort,
    order: args.order,
  });
  return {
    total_count: data.total_count,
    items: (data.items ?? []).map((r: any) => ({
      full_name: r.full_name,
      description: r.description ?? null,
      html_url: r.html_url,
      default_branch: r.default_branch,
      private: r.private,
      stars: r.stargazers_count,
      updated_at: r.updated_at,
    })),
  };
}

export async function get_repository_tree(client: GitHubClient, args: {
  owner: string; repo: string; ref: string;
}) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/git/trees/${args.ref}`, { recursive: 'true' });
  return {
    sha: data.sha,
    truncated: data.truncated ?? false,
    entries: (data.tree ?? []).map((t: any) => ({ path: t.path, type: t.type, sha: t.sha })),
  };
}

// --- Git ---

export async function create_branch(client: GitHubClient, args: {
  owner: string; repo: string; branch: string; fromSha?: string;
}) {
  let sha = args.fromSha;
  if (!sha) {
    const ref = await client.get<any>(`/repos/${args.owner}/${args.repo}/git/ref/heads/main`);
    sha = ref.object.sha;
  }
  const created = await client.post<any>(`/repos/${args.owner}/${args.repo}/git/refs`, {
    ref: `refs/heads/${args.branch}`,
    sha,
  });
  return { ref: created.ref, sha: created.object?.sha };
}

export async function list_commits(client: GitHubClient, args: {
  owner: string; repo: string; ref?: string; page?: number; perPage?: number;
}) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/commits`, {
    sha: args.ref,
    page: args.page,
    per_page: args.perPage,
  });
  return (Array.isArray(data) ? data : []).map((c: any) => ({
    sha: c.sha,
    message: c.commit?.message,
    date: c.commit?.author?.date,
    author: c.commit?.author?.name,
    html_url: c.html_url,
  }));
}

export async function get_commit(client: GitHubClient, args: { owner: string; repo: string; sha: string }) {
  const c = await client.get<any>(`/repos/${args.owner}/${args.repo}/commits/${args.sha}`);
  return {
    sha: c.sha,
    message: c.commit?.message,
    author: c.commit?.author?.name,
    date: c.commit?.author?.date,
    files: (c.files ?? []).map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })),
    html_url: c.html_url,
  };
}

// --- Issues ---

export async function list_issues(client: GitHubClient, args: {
  owner: string; repo: string; state?: string; labels?: string; page?: number; perPage?: number;
}) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/issues`, {
    state: args.state ?? 'open',
    labels: args.labels,
    page: args.page,
    per_page: args.perPage,
  });
  return (Array.isArray(data) ? data : []).map(issueSummary);
}

function issueSummary(i: any) {
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    html_url: i.html_url,
    labels: (i.labels ?? []).map((l: any) => l.name),
    pull_request: !!i.pull_request,
  };
}

export async function search_issues(client: GitHubClient, args: {
  query: string; state?: string; page?: number; perPage?: number; sort?: string; order?: string;
}) {
  const q = [args.query, 'is:issue', args.state ? `state:${args.state}` : undefined]
    .filter(Boolean).join(' ');
  const data = await client.get<any>('/search/issues', {
    q, page: args.page, per_page: args.perPage, sort: args.sort, order: args.order,
  });
  return {
    total_count: data.total_count,
    items: (data.items ?? []).map(issueSummary),
  };
}

export async function issue_write(client: GitHubClient, args: {
  owner: string; repo: string;
  method: 'create' | 'update';
  title?: string; body?: string; labels?: string[];
  assignees?: string[];
  number?: number; state?: 'open' | 'closed'; stateReason?: 'completed' | 'not_planned' | 'reopened';
}) {
  if (args.method === 'create') {
    const created = await client.post<any>(`/repos/${args.owner}/${args.repo}/issues`, clean({
      title: args.title,
      body: args.body,
      labels: args.labels,
      assignees: args.assignees,
    }));
    return { number: created.number, html_url: created.html_url, state: created.state };
  }
  if (!args.number) throw new Error('issue_write com method=update exige number.');
  const updated = await client.patch<any>(`/repos/${args.owner}/${args.repo}/issues/${args.number}`, clean({
    title: args.title,
    body: args.body,
    state: args.state,
    state_reason: args.stateReason,
    labels: args.labels,
    assignees: args.assignees,
  }));
  return { number: updated.number, html_url: updated.html_url, state: updated.state };
}

export async function add_issue_comment(client: GitHubClient, args: {
  owner: string; repo: string; number: number; body: string;
}) {
  const created = await client.post<any>(`/repos/${args.owner}/${args.repo}/issues/${args.number}/comments`, { body: args.body });
  return { id: created.id, html_url: created.html_url };
}

// --- Pull requests ---

export async function list_pull_requests(client: GitHubClient, args: {
  owner: string; repo: string; state?: string; head?: string; base?: string; page?: number; perPage?: number;
}) {
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/pulls`, {
    state: args.state ?? 'open',
    head: args.head,
    base: args.base,
    page: args.page,
    per_page: args.perPage,
  });
  return (Array.isArray(data) ? data : []).map((p: any) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft ?? false,
    head: p.head?.ref,
    base: p.base?.ref,
    html_url: p.html_url,
  }));
}

export async function search_pull_requests(client: GitHubClient, args: {
  query: string; state?: string; page?: number; perPage?: number; sort?: string; order?: string;
}) {
  const q = [args.query, 'is:pr', args.state ? `state:${args.state}` : undefined]
    .filter(Boolean).join(' ');
  const data = await client.get<any>('/search/issues', {
    q, page: args.page, per_page: args.perPage, sort: args.sort, order: args.order,
  });
  return {
    total_count: data.total_count,
    items: (data.items ?? []).map(issueSummary),
  };
}

export async function create_pull_request(client: GitHubClient, args: {
  owner: string; repo: string; title: string; head: string; base: string; body?: string; draft?: boolean;
}) {
  const created = await client.post<any>(`/repos/${args.owner}/${args.repo}/pulls`, clean({
    title: args.title,
    head: args.head,
    base: args.base,
    body: args.body,
    draft: args.draft,
  }));
  return { number: created.number, html_url: created.html_url, state: created.state };
}

export async function merge_pull_request(client: GitHubClient, args: {
  owner: string; repo: string; number: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  commitTitle?: string; commitMessage?: string;
}) {
  const result = await client.put<any>(`/repos/${args.owner}/${args.repo}/pulls/${args.number}/merge`, clean({
    merge_method: args.mergeMethod,
    commit_title: args.commitTitle,
    commit_message: args.commitMessage,
  }));
  return { merged: result.merged, sha: result.sha, message: result.message };
}
