/**
 * Registro das 18 ferramentas da v1 no McpServer. Cada ferramenta valida
 * entrada com zod e delega a um handler puro já testado.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { GitHubClient } from '../github/client.ts';
import {
  get_me, get_file_contents, create_or_update_file, edit_file, push_files,
} from './handlers/files.ts';
import {
  search_repositories, get_repository_tree, create_branch, list_commits, get_commit,
  list_issues, search_issues, issue_write, add_issue_comment,
  list_pull_requests, search_pull_requests, create_pull_request, merge_pull_request,
} from './handlers/rest.ts';

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function wrapError(error: unknown) {
  const err = error as any;
  const parts = [err?.name, err?.message].filter(Boolean);
  if (err?.status) parts.push(`(HTTP ${err.status})`);
  if (err?.rateLimitRemaining !== undefined && err?.rateLimitRemaining !== null) {
    parts.push(`rate limit restante: ${err.rateLimitRemaining}`);
  }
  return textResult({ error: parts.join(': ') ?? String(error) }, true);
}

async function run(fn: () => Promise<unknown>) {
  try {
    return textResult(await fn());
  } catch (error) {
    return wrapError(error);
  }
}

const editSchema = z.object({
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
});

export function registerTools(server: McpServer, client: GitHubClient): void {
  server.registerTool('get_me', { description: 'Detalhes do usuário autenticado' },
    async () => run(() => get_me(client)));

  server.registerTool('search_repositories', {
    description: 'Busca repositórios por nome, descrição, tópicos ou filtros avançados',
    inputSchema: {
      query: z.string(),
      page: z.number().int().optional(),
      perPage: z.number().int().optional(),
      sort: z.enum(['stars', 'forks', 'updated']).optional(),
      order: z.enum(['asc', 'desc']).optional(),
    },
  }, ({ query, page, perPage, sort, order }) =>
    run(() => search_repositories(client, { query, page, perPage, sort, order })));

  server.registerTool('get_repository_tree', {
    description: 'Árvore de arquivos de um repositório em um ref',
    inputSchema: { owner: z.string(), repo: z.string(), ref: z.string() },
  }, ({ owner, repo, ref }) =>
    run(() => get_repository_tree(client, { owner, repo, ref })));

  server.registerTool('get_file_contents', {
    description: 'Conteúdo de arquivo (decodificado) ou listagem de diretório',
    inputSchema: {
      owner: z.string(), repo: z.string(), path: z.string().optional(),
      ref: z.string().optional(),
      fields: z.array(z.enum(['name', 'path', 'type', 'sha', 'size', 'html_url'])).optional(),
    },
  }, (args) => run(() => get_file_contents(client, args)));

  server.registerTool('create_or_update_file', {
    description: 'Cria ou atualiza um arquivo; exige sha quando o arquivo já existe',
    inputSchema: {
      owner: z.string(), repo: z.string(), branch: z.string(),
      path: z.string(), content: z.string(), message: z.string(), sha: z.string().optional(),
    },
  }, (args) => run(() => create_or_update_file(client, args)));

  server.registerTool('edit_file', {
    description: 'Edição inline: aplica substituições oldString/newString sem reescrever o arquivo',
    inputSchema: {
      owner: z.string(), repo: z.string(), branch: z.string(),
      path: z.string(), message: z.string(),
      edits: z.array(editSchema).min(1),
    },
  }, (args) => run(() => edit_file(client, args)));

  server.registerTool('push_files', {
    description: 'Envia múltiplos arquivos em um único commit',
    inputSchema: {
      owner: z.string(), repo: z.string(), branch: z.string(), message: z.string(),
      files: z.array(z.object({ path: z.string(), content: z.string() })).min(1),
    },
  }, (args) => run(() => push_files(client, args)));

  server.registerTool('create_branch', {
    description: 'Cria uma branch a partir da main ou de um sha',
    inputSchema: {
      owner: z.string(), repo: z.string(), branch: z.string(), fromSha: z.string().optional(),
    },
  }, (args) => run(() => create_branch(client, args)));

  server.registerTool('list_commits', {
    description: 'Lista commits de um repositório/ref',
    inputSchema: {
      owner: z.string(), repo: z.string(), ref: z.string().optional(),
      page: z.number().int().optional(), perPage: z.number().int().optional(),
    },
  }, (args) => run(() => list_commits(client, args)));

  server.registerTool('get_commit', {
    description: 'Detalhes de um commit, incluindo arquivos alterados',
    inputSchema: { owner: z.string(), repo: z.string(), sha: z.string() },
  }, (args) => run(() => get_commit(client, args)));

  server.registerTool('list_issues', {
    description: 'Lista issues de um repositório',
    inputSchema: {
      owner: z.string(), repo: z.string(),
      state: z.enum(['open', 'closed', 'all']).optional(),
      labels: z.string().optional(),
      page: z.number().int().optional(), perPage: z.number().int().optional(),
    },
  }, (args) => run(() => list_issues(client, args)));

  server.registerTool('search_issues', {
    description: 'Busca issues com filtros avançados',
    inputSchema: {
      query: z.string(), state: z.enum(['open', 'closed']).optional(),
      page: z.number().int().optional(), perPage: z.number().int().optional(),
      sort: z.string().optional(), order: z.enum(['asc', 'desc']).optional(),
    },
  }, (args) => run(() => search_issues(client, args)));

  server.registerTool('issue_write', {
    description: 'Cria ou atualiza uma issue; close exige stateReason (completed/not_planned)',
    inputSchema: {
      owner: z.string(), repo: z.string(),
      method: z.enum(['create', 'update']),
      title: z.string().optional(), body: z.string().optional(),
      labels: z.array(z.string()).optional(), assignees: z.array(z.string()).optional(),
      number: z.number().int().optional(),
      state: z.enum(['open', 'closed']).optional(),
      stateReason: z.enum(['completed', 'not_planned', 'reopened']).optional(),
    },
  }, (args) => run(() => issue_write(client, args)));

  server.registerTool('add_issue_comment', {
    description: 'Comenta em uma issue ou pull request',
    inputSchema: { owner: z.string(), repo: z.string(), number: z.number().int(), body: z.string() },
  }, (args) => run(() => add_issue_comment(client, args)));

  server.registerTool('list_pull_requests', {
    description: 'Lista pull requests de um repositório',
    inputSchema: {
      owner: z.string(), repo: z.string(),
      state: z.enum(['open', 'closed', 'all']).optional(),
      head: z.string().optional(), base: z.string().optional(),
      page: z.number().int().optional(), perPage: z.number().int().optional(),
    },
  }, (args) => run(() => list_pull_requests(client, args)));

  server.registerTool('search_pull_requests', {
    description: 'Busca pull requests com filtros avançados',
    inputSchema: {
      query: z.string(), state: z.enum(['open', 'closed', 'merged']).optional(),
      page: z.number().int().optional(), perPage: z.number().int().optional(),
      sort: z.string().optional(), order: z.enum(['asc', 'desc']).optional(),
    },
  }, (args) => run(() => search_pull_requests(client, args)));

  server.registerTool('create_pull_request', {
    description: 'Abre um pull request',
    inputSchema: {
      owner: z.string(), repo: z.string(), title: z.string(),
      head: z.string(), base: z.string(),
      body: z.string().optional(), draft: z.boolean().optional(),
    },
  }, (args) => run(() => create_pull_request(client, args)));

  server.registerTool('merge_pull_request', {
    description: 'Faz merge de um pull request',
    inputSchema: {
      owner: z.string(), repo: z.string(), number: z.number().int(),
      mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
      commitTitle: z.string().optional(), commitMessage: z.string().optional(),
    },
  }, (args) => run(() => merge_pull_request(client, args)));
}
