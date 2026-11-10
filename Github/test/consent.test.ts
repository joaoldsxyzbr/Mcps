import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderConsentPage } from '../src/auth/consent.ts';

test('escapeHtml neutraliza injeção de script', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a"b&c'), 'a&quot;b&amp;c');
});

test('página de consentimento escapa nome do cliente e lista escopos', () => {
  const html = renderConsentPage({
    clientName: '<img src=x onerror=alert(1)>',
    handle: 'h123',
    scopes: ['github', 'offline_access'],
  });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(html.includes('name="handle" value="h123"'));
  assert.ok(html.includes('github'));
  assert.ok(html.includes('form action="/authorize" method="POST"'));
});
