/**
 * Fatiamento de conteúdo por linha. Puro e testável: permite ler um trecho
 * de arquivo sem devolver o arquivo inteiro ao modelo (a API do GitHub não
 * tem leitura parcial; o corte acontece aqui).
 */

export interface LineRange {
  startLine?: number;
  endLine?: number;
}

export interface SlicedContent {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}

/**
 * Extrai as linhas `startLine..endLine` (1-based, inclusivo).
 * Sem range, devolve tudo. Clampa os limites ao arquivo.
 */
export function sliceLines(content: string, range: LineRange = {}): SlicedContent {
  const lines = content.split('\n');
  const totalLines = lines.length;

  const rawStart = range.startLine ?? 1;
  const rawEnd = range.endLine ?? totalLines;

  const startLine = Math.min(Math.max(1, Math.trunc(rawStart)), totalLines);
  const endLine = Math.min(Math.max(startLine, Math.trunc(rawEnd)), totalLines);

  const slice = lines.slice(startLine - 1, endLine);
  return {
    content: slice.join('\n'),
    startLine,
    endLine,
    totalLines,
    truncated: startLine !== 1 || endLine !== totalLines,
  };
}
