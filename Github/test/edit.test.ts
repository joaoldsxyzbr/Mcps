import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits } from '../src/github/edit.ts';

test('substitui ocorrência única', () => {
  const out = applyEdits('const a = 1;', [{ oldString: 'a = 1', newString: 'a = 2' }]);
  assert.equal(out, 'const a = 2;');
});

test('ocorrência não encontrada vira EDIT_NOT_FOUND', () => {
  assert.throws(
    () => applyEdits('abc', [{ oldString: 'xyz', newString: 'q' }]),
    (e: any) => e.code === 'EDIT_NOT_FOUND' && /xyz/.test(e.message),
  );
});

test('múltiplas ocorrências sem replaceAll viram EDIT_AMBIGUOUS com a contagem', () => {
  assert.throws(
    () => applyEdits('foo foo', [{ oldString: 'foo', newString: 'bar' }]),
    (e: any) => e.code === 'EDIT_AMBIGUOUS' && e.occurrences === 2,
  );
});

test('replaceAll substitui todas as ocorrências', () => {
  const out = applyEdits('foo foo foo', [{ oldString: 'foo', newString: 'bar', replaceAll: true }]);
  assert.equal(out, 'bar bar bar');
});

test('lote aplica edits sequencialmente sobre o resultado anterior', () => {
  const out = applyEdits('um dois tres', [
    { oldString: 'um', newString: '1' },
    { oldString: '1 dois', newString: '1 2' },
  ]);
  assert.equal(out, '1 2 tres');
});

test('oldString vazio vira EDIT_EMPTY', () => {
  assert.throws(
    () => applyEdits('abc', [{ oldString: '', newString: 'x' }]),
    (e: any) => e.code === 'EDIT_EMPTY',
  );
});

test('lote vazio devolve o conteúdo intacto', () => {
  assert.equal(applyEdits('mesmo', []), 'mesmo');
});
