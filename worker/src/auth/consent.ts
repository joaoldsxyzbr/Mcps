/**
 * Página de consentimento do /authorize. O frame/CSRF é garantido pela
 * lib (beginConsent: cookie __Host-, CSP frame-ancestors 'none'); aqui só
 * falta escapar tudo que entra no HTML.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ConsentPageArgs {
  clientName: string;
  handle: string;
  scopes: string[];
}

export function renderConsentPage(args: ConsentPageArgs): string {
  const clientName = escapeHtml(args.clientName);
  const handle = escapeHtml(args.handle);
  const scopes = args.scopes.map(escapeHtml).join(', ');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize - mcps-github</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f4f4f5; color: #18181b; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; max-width: 26rem; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
    h1 { font-size: 1.1rem; margin: 0 0 .5rem; }
    p { margin: .25rem 0 1rem; color: #52525b; line-height: 1.4; }
    .scopes { font-family: ui-monospace, monospace; background: #f4f4f5; border-radius: 6px; padding: .5rem .75rem; margin: 0 0 1.25rem; font-size: .85rem; }
    .actions { display: flex; gap: .75rem; }
    button { flex: 1; padding: .6rem; border-radius: 8px; border: 1px solid #d4d4d8; font-size: .95rem; cursor: pointer; }
    button[name="action"][value="allow"] { background: #18181b; color: #fff; border-color: #18181b; }
  </style>
</head>
<body>
  <main class="card">
    <h1>mcps-github</h1>
    <p>O cliente <strong>${clientName}</strong> quer acesso à sua conta do GitHub.</p>
    <div class="scopes">${scopes}</div>
    <form action="/authorize" method="POST">
      <input type="hidden" name="handle" value="${handle}">
      <div class="actions">
        <button type="submit" name="action" value="allow">Permitir</button>
        <button type="submit" name="action" value="deny">Negar</button>
      </div>
    </form>
  </main>
</body>
</html>`;
}
