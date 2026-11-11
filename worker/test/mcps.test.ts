import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineMcps } from '../src/mcps.ts';

const ISSUER = 'https://mcps.example.dev';

test('defineMcps declara um resource por MCP, sob a origem do issuer', () => {
  const mcps = defineMcps(ISSUER);
  assert.ok(mcps.length >= 1);
  for (const mcp of mcps) {
    assert.equal(mcp.resource, `${ISSUER}${mcp.path}`);
    assert.ok(mcp.path.startsWith('/'));
    assert.equal(typeof mcp.createServer, 'function');
  }
});

test('defineMcps normaliza issuer com barra final', () => {
  const withSlash = defineMcps(`${ISSUER}/`);
  const without = defineMcps(ISSUER);
  assert.deepEqual(
    withSlash.map((m) => m.resource),
    without.map((m) => m.resource),
  );
});

test('recursos são únicos (audiences distintas)', () => {
  const resources = defineMcps(ISSUER).map((m) => m.resource);
  assert.equal(new Set(resources).size, resources.length);
});

test('caminhos são únicos', () => {
  const paths = defineMcps(ISSUER).map((m) => m.path);
  assert.equal(new Set(paths).size, paths.length);
});

test('github está registrado em /github/mcp', () => {
  const github = defineMcps(ISSUER).find((m) => m.name === 'github');
  assert.ok(github);
  assert.equal(github.path, '/github/mcp');
  assert.equal(github.resource, `${ISSUER}/github/mcp`);
});
