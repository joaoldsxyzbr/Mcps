import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineMcps } from '../src/mcps.ts';
import { resolveRoute } from '../src/routes.ts';

const ISSUER = 'https://mcps.example.dev';
const mcps = defineMcps(ISSUER);

test('/authorize vai para o consentimento em GET e POST', () => {
  assert.equal(resolveRoute('/authorize', 'GET', mcps).kind, 'authorize');
  assert.equal(resolveRoute('/authorize', 'POST', mcps).kind, 'authorize');
});

test('/callback só em GET', () => {
  assert.equal(resolveRoute('/callback', 'GET', mcps).kind, 'callback');
  assert.equal(resolveRoute('/callback', 'POST', mcps).kind, 'notFound');
});

test('cada MCP é roteado para o seu resource server', () => {
  for (const mcp of mcps) {
    const route = resolveRoute(mcp.path, 'POST', mcps);
    assert.equal(route.kind, 'mcp');
    if (route.kind === 'mcp') assert.equal(route.mcp.name, mcp.name);
  }
});

test('subcaminho do MCP continua no mesmo resource server', () => {
  const route = resolveRoute('/github/mcp/tools', 'POST', mcps);
  assert.equal(route.kind, 'mcp');
  if (route.kind === 'mcp') assert.equal(route.mcp.name, 'github');
});

test('prefixo parecido não vaza para outro MCP', () => {
  assert.equal(resolveRoute('/github/mcp-other', 'POST', mcps).kind, 'notFound');
});

test('discovery e token vão para o authorization server', () => {
  assert.equal(resolveRoute('/.well-known/oauth-authorization-server', 'GET', mcps).kind, 'oauth');
  assert.equal(resolveRoute('/oauth/token', 'POST', mcps).kind, 'oauth');
  assert.equal(resolveRoute('/oauth/revoke', 'POST', mcps).kind, 'oauth');
});

test('metadata do protected resource vai para o resource server dono', () => {
  const route = resolveRoute('/.well-known/oauth-protected-resource/github/mcp', 'GET', mcps);
  assert.equal(route.kind, 'mcp');
  if (route.kind === 'mcp') assert.equal(route.mcp.name, 'github');
});

test('metadata de resource desconhecido cai no auth server (404 dele)', () => {
  assert.equal(
    resolveRoute('/.well-known/oauth-protected-resource/outro/mcp', 'GET', mcps).kind,
    'oauth',
  );
});

test('/ responde health em GET; o resto é 404', () => {
  assert.equal(resolveRoute('/', 'GET', mcps).kind, 'health');
  assert.equal(resolveRoute('/', 'POST', mcps).kind, 'notFound');
  assert.equal(resolveRoute('/nada', 'GET', mcps).kind, 'notFound');
});
