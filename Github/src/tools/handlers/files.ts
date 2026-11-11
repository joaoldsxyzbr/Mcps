/**
 * Handlers de ferramentas de arquivo e identidade. Puros: recebem um
 * GitHubClient e devolvem dados/erros; nada de I/O direta além do client.
 */

import { applyEdits, type Edit } from '../../github/edit.ts';
import { sliceLines } from '../../github/lines.ts';
import type { GitHubClient } from '../../github/client.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function utf8ToBase64(text: string): string {
  const bytes = encoder.encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64text: string): string {
  const normalized = b64text.replace(/\n/g, '');
  const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
  return decoder.decode(bytes);
}

export async function get_me(client: GitHubClient) {
  const user = await client.get<any>('/user');
  return {
    login: user.login,
    name: user.name ?? null,
    profile_url: user.html_url,
  };
}

export interface FileEntryFieldSelection {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
  fields?: string[];
  /** Primeira linha (1-based). Sem `endLine`, lê até o fim. */
  startLine?: number;
  /** Última linha (1-based, inclusivo). */
  endLine?: number;
}

export async function get_file_contents(client: GitHubClient, args: FileEntryFieldSelection) {
  const path = args.path ?? '/';
  const data = await client.get<any>(`/repos/${args.owner}/${args.repo}/contents/${path}`, { ref: args.ref });
  if (Array.isArray(data)) {
    const entries = data.map((entry: any) => {
      if (args.fields && args.fields.length > 0) {
        const picked: Record<string, any> = {};
        for (const field of args.fields) picked[field] = entry[field];
        return picked;
      }
      return {
        name: entry.name,
        path: entry.path,
        type: entry.type,
        sha: entry.sha,
        size: entry.size,
        html_url: entry.html_url,
      };
    });
    return { type: 'dir', entries };
  }
  if (data.type === 'file' && data.encoding === 'base64') {
    const full = base64ToUtf8(data.content);
    const sliced = sliceLines(full, { startLine: args.startLine, endLine: args.endLine });
    return {
      type: 'file',
      name: data.name,
      path: data.path,
      sha: data.sha,
      size: data.size,
      content: sliced.content,
      // Metadados do corte: o chamador sabe se viu o arquivo inteiro.
      startLine: sliced.startLine,
      endLine: sliced.endLine,
      totalLines: sliced.totalLines,
      truncated: sliced.truncated,
    };
  }
  return { type: data.type ?? 'unknown', raw: data };
}

export interface CreateOrUpdateFileArgs {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  content: string;
  message: string;
  sha?: string;
}

export async function create_or_update_file(client: GitHubClient, args: CreateOrUpdateFileArgs) {
  const result = await client.put<any>(`/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
    message: args.message,
    content: utf8ToBase64(args.content),
    branch: args.branch,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return {
    file: { path: args.path, sha: result.content?.sha },
    commit: { sha: result.commit?.sha, html_url: result.commit?.html_url },
  };
}

export interface EditFileArgs {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  message: string;
  edits: Edit[];
}

export async function edit_file(client: GitHubClient, args: EditFileArgs) {
  const file = await client.get<any>(`/repos/${args.owner}/${args.repo}/contents/${args.path}`, { ref: args.branch });
  if (file.type !== 'file' || file.encoding !== 'base64') {
    throw new Error(`edit_file só funciona com arquivo; ${args.path} é ${file.type ?? 'desconhecido'}.`);
  }
  const current = base64ToUtf8(file.content);
  const next = applyEdits(current, args.edits);
  const result = await client.put<any>(`/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
    message: args.message,
    content: utf8ToBase64(next),
    branch: args.branch,
    sha: file.sha,
  });
  return {
    file: { path: args.path, sha: result.content?.sha },
    commit: { sha: result.commit?.sha, html_url: result.commit?.html_url },
  };
}

export interface DeleteFileArgs {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  message: string;
  /** SHA do arquivo. Omitido, é lido antes de apagar (evita apagar versão errada). */
  sha?: string;
}

export async function delete_file(client: GitHubClient, args: DeleteFileArgs) {
  let sha = args.sha;
  if (!sha) {
    const file = await client.get<any>(`/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
      ref: args.branch,
    });
    if (file.type !== 'file') {
      throw new Error(`delete_file só funciona com arquivo; ${args.path} é ${file.type ?? 'desconhecido'}.`);
    }
    sha = file.sha;
  }
  const result = await client.delete<any>(`/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
    message: args.message,
    sha,
    branch: args.branch,
  });
  return {
    deleted: args.path,
    commit: { sha: result.commit?.sha, html_url: result.commit?.html_url },
  };
}

export interface PushFilesArgs {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: Array<{ path: string; content: string }>;
  /** SHA esperado da branch. Se a branch andou, a operação falha em vez de sobrescrever. */
  expectedHeadSha?: string;
  /** Quantas vezes retentar quando a branch mudou entre a leitura e a escrita. */
  maxRetries?: number;
}

export class PushConflictError extends Error {
  code = 'PUSH_CONFLICT';
  expected: string;
  actual: string;

  constructor(expected: string, actual: string) {
    super(
      `A branch andou: esperado ${expected}, encontrado ${actual}. ` +
        'Leia o estado atual e refaça a alteração.',
    );
    this.name = 'PushConflictError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Envia arquivos num único commit.
 *
 * Concorrência: o `PATCH` da ref usa `force: false`, então o GitHub rejeita o
 * update se ele não for fast-forward — ou seja, se alguém commitou entre a
 * nossa leitura e a escrita, nada é sobrescrito. Nesse caso relemos a branch e
 * refazemos o commit sobre o novo topo (até `maxRetries` vezes). Com
 * `expectedHeadSha`, a operação falha em vez de retentar sobre outro estado.
 */
export async function push_files(client: GitHubClient, args: PushFilesArgs) {
  if (args.files.length === 0) {
    throw new Error('push_files exige ao menos um arquivo.');
  }

  const maxRetries = args.maxRetries ?? 3;
  let conflict: PushConflictError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ref = await client.get<any>(`/repos/${args.owner}/${args.repo}/git/ref/heads/${args.branch}`);
    const baseSha: string = ref.object.sha;

    // Com expectedHeadSha, o chamador exige um estado específico.
    if (args.expectedHeadSha && baseSha !== args.expectedHeadSha) {
      throw new PushConflictError(args.expectedHeadSha, baseSha);
    }

    const tree = await client.post<any>(`/repos/${args.owner}/${args.repo}/git/trees`, {
      base_tree: baseSha,
      tree: args.files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
    });
    const commit = await client.post<any>(`/repos/${args.owner}/${args.repo}/git/commits`, {
      message: args.message,
      tree: tree.sha,
      parents: [baseSha],
    });

    try {
      await client.patch<any>(`/repos/${args.owner}/${args.repo}/git/refs/heads/${args.branch}`, {
        sha: commit.sha,
        // Nunca força: garante que não sobrescrevemos trabalho alheio.
        force: false,
      });
      return {
        sha: commit.sha,
        files: args.files.map((f) => f.path),
        attempts: attempt + 1,
      };
    } catch (error) {
      const err = error as any;
      // 409/422 = update não fast-forward; a branch andou.
      if (err?.status !== 409 && err?.status !== 422) throw error;
      conflict = new PushConflictError(baseSha, 'mudou durante a escrita');
      if (args.expectedHeadSha) throw conflict;
    }
  }

  throw conflict ?? new Error('push_files falhou após as tentativas.');
}
