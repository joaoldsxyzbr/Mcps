import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MCP_PATH } from '../src/config.ts';
import { resolveRoute } from '../src/routes.ts';

test('/authorize vai para o consentimento em GET e POST', () => {
  assert.equal(resolveRoute('/authorize', 'GET').kind, 'authorize');
  assert.equal(resolveRoute('/authorize', 'POST').kind, 'authorize');
});

test('/callback só em GET', () => {
  assert.equal(resolveRoute('/callback', 'GET').kind, 'callback');
  assert.equal(resolveRoute('/callback', 'POST').kind, 'notFound');
});

test('o caminho do MCP vai para o resource server', () => {
  assert.equal(MCP_PATH, '/github/mcp');
  assert.equal(resolveRoute(MCP_PATH, 'POST').kind, 'mcp');
});

test('subcaminho do MCP continua no resource server', () => {
  assert.equal(resolveRoute(`${MCP_PATH}/tools`, 'POST').kind, 'mcp');
});

test('prefixo parecido não é o MCP', () => {
  assert.equal(resolveRoute('/github/mcp-other', 'POST').kind, 'notFound');
});

test('discovery e token vão para o authorization server', () => {
  assert.equal(resolveRoute('/.well-known/oauth-authorization-server', 'GET').kind, 'oauth');
  assert.equal(resolveRoute('/oauth/token', 'POST').kind, 'oauth');
  assert.equal(resolveRoute('/oauth/revoke', 'POST').kind, 'oauth');
  assert.equal(resolveRoute('/oauth/register', 'POST').kind, 'oauth');
});

test('metadata do protected resource vai para o resource server', () => {
  assert.equal(
    resolveRoute(`/.well-known/oauth-protected-resource${MCP_PATH}`, 'GET').kind,
    'mcp',
  );
});

test('metadata de resource desconhecido cai no auth server (404 dele)', () => {
  assert.equal(
    resolveRoute('/.well-known/oauth-protected-resource/outro/mcp', 'GET').kind,
    'oauth',
  );
});

test('/ responde health em GET; o resto é 404', () => {
  assert.equal(resolveRoute('/', 'GET').kind, 'health');
  assert.equal(resolveRoute('/', 'POST').kind, 'notFound');
  assert.equal(resolveRoute('/nada', 'GET').kind, 'notFound');
});
