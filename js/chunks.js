// División del texto en fragmentos. Módulo PURO: sin DOM.

/**
 * Divide un texto ya preparado con prepareText en fragmentos de N palabras.
 *
 * Cada espacio cierra una palabra; al cerrar la N-ésima, el fragmento termina
 * justo después de ese espacio, de modo que el separador pertenece al fragmento
 * que se completa. El último fragmento llega hasta el final del texto.
 *
 * Precondición: palabras separadas por un único espacio y sin espacios en los
 * extremos (garantizado por prepareText). Aun sin ella, los rangos siguen
 * cubriendo el texto completo sin huecos ni solapes.
 *
 * @param {string} text texto preparado
 * @param {number} [wordsPerChunk=7] palabras por fragmento (entero positivo)
 * @returns {{ start: number, end: number }[]} rangos [start, end) en unidades
 *          UTF-16, ordenados y contiguos; [] si el texto está vacío
 */
export function splitIntoChunks(text, wordsPerChunk = 7) {
  if (typeof text !== 'string') {
    throw new TypeError('El texto debe ser un string');
  }
  if (!Number.isInteger(wordsPerChunk) || wordsPerChunk <= 0) {
    throw new TypeError('wordsPerChunk debe ser un entero positivo');
  }
  const chunks = [];
  let start = 0;
  let wordsInChunk = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ') continue;
    wordsInChunk++;
    if (wordsInChunk === wordsPerChunk) {
      chunks.push({ start, end: i + 1 });
      start = i + 1;
      wordsInChunk = 0;
    }
  }
  if (start < text.length) {
    chunks.push({ start, end: text.length });
  }
  return chunks;
}
