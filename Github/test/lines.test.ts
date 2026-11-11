import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliceLines } from '../src/github/lines.ts';

test('sem range devolve o conteúdo inteiro', () => {
  const out = sliceLines('a\nb\nc');
  assert.equal(out.content, 'a\nb\nc');
  assert.equal(out.startLine, 1);
  assert.equal(out.endLine, 3);
  assert.equal(out.totalLines, 3);
  assert.equal(out.truncated, false);
});

test('range recorta as linhas pedidas (1-based, inclusivo)', () => {
  const out = sliceLines('l1\nl2\nl3\nl4\nl5', { startLine: 2, endLine: 4 });
  assert.equal(out.content, 'l2\nl3\nl4');
  assert.equal(out.startLine, 2);
  assert.equal(out.endLine, 4);
  assert.equal(out.totalLines, 5);
  assert.equal(out.truncated, true);
});

test('só startLine lê até o fim', () => {
  const out = sliceLines('a\nb\nc\nd', { startLine: 3 });
  assert.equal(out.content, 'c\nd');
  assert.equal(out.endLine, 4);
});

test('só endLine lê do começo', () => {
  const out = sliceLines('a\nb\nc\nd', { endLine: 2 });
  assert.equal(out.content, 'a\nb');
  assert.equal(out.startLine, 1);
});

test('limites fora do arquivo são clampados', () => {
  const out = sliceLines('a\nb', { startLine: 0, endLine: 99 });
  assert.equal(out.content, 'a\nb');
  assert.equal(out.startLine, 1);
  assert.equal(out.endLine, 2);
});

test('endLine menor que startLine não quebra', () => {
  const out = sliceLines('a\nb\nc', { startLine: 3, endLine: 1 });
  assert.equal(out.content, 'c');
  assert.equal(out.startLine, 3);
  assert.equal(out.endLine, 3);
});
