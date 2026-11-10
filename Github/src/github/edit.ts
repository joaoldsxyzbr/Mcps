/**
 * Motor de edição inline: aplica substituições oldString/newString num
 * conteúdo sem que o chamador precise reescrever o arquivo inteiro.
 * Módulo puro: sem I/O, sem dependências — testável direto no Node.
 */

export interface Edit {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export type EditErrorCode = 'EDIT_EMPTY' | 'EDIT_NOT_FOUND' | 'EDIT_AMBIGUOUS';

export class EditError extends Error {
  code: EditErrorCode;
  occurrences?: number;

  constructor(code: EditErrorCode, message: string, occurrences?: number) {
    super(message);
    this.name = 'EditError';
    this.code = code;
    this.occurrences = occurrences;
  }
}

function countOccurrences(content: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let i = content.indexOf(needle);
  while (i !== -1) {
    count++;
    i = content.indexOf(needle, i + needle.length);
  }
  return count;
}

/** Aplica os edits em sequência e devolve o conteúdo resultante. */
export function applyEdits(content: string, edits: Edit[]): string {
  let result = content;
  for (const edit of edits) {
    if (edit.oldString === '') {
      throw new EditError('EDIT_EMPTY', 'oldString não pode ser vazio.');
    }
    if (!result.includes(edit.oldString)) {
      throw new EditError(
        'EDIT_NOT_FOUND',
        `oldString não encontrado no arquivo: ${JSON.stringify(edit.oldString)}`,
      );
    }
    const occurrences = countOccurrences(result, edit.oldString);
    if (occurrences > 1 && !edit.replaceAll) {
      throw new EditError(
        'EDIT_AMBIGUOUS',
        `oldString aparece ${occurrences} vezes; use replaceAll ou um trecho mais específico.`,
        occurrences,
      );
    }
    if (edit.replaceAll) {
      result = result.split(edit.oldString).join(edit.newString);
    } else {
      result = result.replace(edit.oldString, edit.newString);
    }
  }
  return result;
}
