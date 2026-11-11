/**
 * Cliente REST da API v3 do GitHub. Módulo quase puro: a única I/O é o
 * `fetch`, injetável nos testes. Autentica com token de usuário do GitHub
 * App (Bearer). Nada de estado — cada chamada é independente.
 */

export class GitHubError extends Error {
  status: number;
  rateLimitRemaining?: number;
  documentationUrl?: string;

  constructor(status: number, message: string, rateLimitRemaining?: number, documentationUrl?: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.rateLimitRemaining = rateLimitRemaining;
    this.documentationUrl = documentationUrl;
  }
}

export type Query = Record<string, string | number | undefined>;

export class GitHubClient {
  private token: string;
  private fetchFn: typeof fetch;
  private baseUrl: string;

  constructor(token: string, fetchFn?: typeof fetch, baseUrl = 'https://api.github.com') {
    this.token = token;
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string, query?: Query): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T = any>(method: string, path: string, body?: unknown, query?: Query, accept?: string): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: accept ?? 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'mcps-github',
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await this.fetchFn(this.buildUrl(path, query), init);
    return this.parse<T>(response);
  }

  private async parse<T>(response: Response): Promise<T> {
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    const text = await response.text();
    let data: any = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }
    if (!response.ok) {
      const message = data?.message ?? `HTTP ${response.status}`;
      const remaining = rateLimitRemaining !== null ? Number(rateLimitRemaining) : undefined;
      throw new GitHubError(response.status, message, remaining, data?.documentation_url);
    }
    return data as T;
  }

  get<T = any>(path: string, query?: Query, accept?: string): Promise<T> {
    return this.request<T>('GET', path, undefined, query, accept);
  }

  /**
   * GET que devolve o `Response` cru, sem parse de JSON. Necessário para
   * endpoints que respondem texto ou binário (ex.: logs de Actions).
   */
  async getRaw(path: string, query?: Query, accept?: string): Promise<Response> {
    const response = await this.fetchFn(this.buildUrl(path, query), {
      method: 'GET',
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: accept ?? 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'mcps-github',
      },
    });
    if (!response.ok) {
      const text = await response.text();
      const remaining = response.headers.get('x-ratelimit-remaining');
      throw new GitHubError(
        response.status,
        text || `HTTP ${response.status}`,
        remaining !== null ? Number(remaining) : undefined,
      );
    }
    return response;
  }

  post<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  put<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  patch<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body);
  }
}
