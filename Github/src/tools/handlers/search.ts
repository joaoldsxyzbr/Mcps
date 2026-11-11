/**
 * Ferramentas de busca. `search_code` é o que faltava para navegar um repo
 * sem baixar tudo: acha o arquivo e a linha onde o termo aparece.
 */

import type { GitHubClient } from '../../github/client.ts';

const TEXT_MATCH = 'application/vnd.github.text-match+json';

export interface SearchCodeArgs {
  query: string;
  page?: number;
  perPage?: number;
  /** Limita a busca a um repositório (`owner/repo`). */
  repo?: string;
}

export async function search_code(client: GitHubClient, args: SearchCodeArgs) {
  // A API exige ao menos um termo; `repo:` sozinho não é válido.
  const q = args.repo ? `${args.query} repo:${args.repo}` : args.query;
  const data = await client.get<any>(
    '/search/code',
    { q, page: args.page, per_page: args.perPage },
    TEXT_MATCH,
  );
  return {
    total_count: data.total_count,
    incomplete_results: data.incomplete_results ?? false,
    items: (data.items ?? []).map((item: any) => ({
      path: item.path,
      repository: item.repository?.full_name,
      sha: item.sha,
      html_url: item.html_url,
      // Trechos com o termo em contexto: evita abrir o arquivo só para achar a linha.
      fragments: (item.text_matches ?? []).map((m: any) => m.fragment),
    })),
  };
}

export interface SearchCommitsArgs {
  query: string;
  repo?: string;
  page?: number;
  perPage?: number;
  sort?: 'author-date' | 'committer-date';
  order?: 'asc' | 'desc';
}

export async function search_commits(client: GitHubClient, args: SearchCommitsArgs) {
  const q = args.repo ? `${args.query} repo:${args.repo}` : args.query;
  const data = await client.get<any>(
    '/search/commits',
    { q, page: args.page, per_page: args.perPage, sort: args.sort, order: args.order },
    TEXT_MATCH,
  );
  return {
    total_count: data.total_count,
    items: (data.items ?? []).map((c: any) => ({
      sha: c.sha,
      message: c.commit?.message,
      author: c.commit?.author?.name,
      date: c.commit?.author?.date,
      repository: c.repository?.full_name,
      html_url: c.html_url,
    })),
  };
}
