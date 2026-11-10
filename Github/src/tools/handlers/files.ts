/**
 * Handlers de ferramentas de arquivo e identidade. Puros: recebem um
 * GitHubClient e devolvem dados/erros; nada de I/O direta além do client.
 */

import { applyEdits, type Edit } from '../../github/edit.ts';
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
    return {
      type: 'file',
      name: data.name,
      path: data.path,
      sha: data.sha,
      size: data.size,
      content: base64ToUtf8(data.content),
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

export interface PushFilesArgs {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: Array<{ path: string; content: string }>;
}

export async function push_files(client: GitHubClient, args: PushFilesArgs) {
  if (args.files.length === 0) {
    throw new Error('push_files exige ao menos um arquivo.');
  }
  const ref = await client.get<any>(`/repos/${args.owner}/${args.repo}/git/ref/heads/${args.branch}`);
  const baseSha = ref.object.sha;
  const tree = await client.post<any>(`/repos/${args.owner}/${args.repo}/git/trees`, {
    base_tree: baseSha,
    tree: args.files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
  });
  const commit = await client.post<any>(`/repos/${args.owner}/${args.repo}/git/commits`, {
    message: args.message,
    tree: tree.sha,
    parents: [baseSha],
  });
  await client.patch<any>(`/repos/${args.owner}/${args.repo}/git/refs/heads/${args.branch}`, { sha: commit.sha });
  return {
    sha: commit.sha,
    files: args.files.map((f) => f.path),
  };
}
