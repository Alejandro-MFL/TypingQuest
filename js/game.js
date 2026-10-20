// Motor del juego. Módulo PURO: sin DOM ni lectura directa del reloj.
//
// applyInput recibe el valor COMPLETO del textarea tras cada evento input y lo
// compara con lo escrito antes. Resultados posibles:
// - Entrada RECHAZADA: devuelve el MISMO objeto (`resultado === state`). La UI
//   debe restaurar el textarea a `state.typed`.
// - Entrada ACEPTADA: devuelve un estado nuevo. Su `typed` es el valor normalizado
//   a NFC, que puede diferir del valor recibido (p. ej. "á" → "á"); la UI
//   debe sincronizar el textarea con `typed` cuando difieran.
//
// Escritura secuencial: esta versión asume que el cursor está siempre al final
// del texto y que no hay selecciones. El diff solo compara el prefijo común, así
// que un borrado en mitad del texto se interpreta mal (ver test `todo` de T5b).
// La UI es responsable de mantener el cursor al final.
//
// Segmentos: `segmentEnds` son los finales exclusivos de cada fragmento sobre el
// texto normalizado (p. ej. splitIntoChunks(text).map(c => c.end)). Solo se puede
// editar dentro del segmento activo; al completarlo correctamente se activa el
// siguiente en la misma entrada. Las estadísticas y el cronómetro son globales.
// Precondición: los límites deben caer en fronteras de carácter. Con texto de
// prepareText + splitIntoChunks se cumple; createGame no lo comprueba para
// límites arbitrarios (p. ej. en mitad de un par sustituto UTF-16).
import { calcWpm, calcAccuracy } from './metrics.js';

function assertValidSegmentEnds(ends, textLength) {
  const valid =
    Array.isArray(ends) &&
    ends.length > 0 &&
    ends.every((end, i) => Number.isInteger(end) && end > (i === 0 ? 0 : ends[i - 1])) &&
    ends.at(-1) === textLength;
  if (!valid) {
    throw new TypeError(
      'segmentEnds debe ser una lista creciente de enteros positivos que termine en la longitud del texto'
    );
  }
}

export function createGame(text, { segmentEnds } = {}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new TypeError('El texto objetivo debe ser un string no vacío');
  }
  const normalized = text.normalize('NFC');
  const ends = segmentEnds === undefined ? [normalized.length] : segmentEnds;
  assertValidSegmentEnds(ends, normalized.length);
  return {
    status: 'idle',
    text: normalized,
    typed: '',
    startedAt: null,
    finishedAt: null,
    keystrokes: { total: 0, correct: 0, incorrect: 0 },
    corrections: 0,
    segmentEnds: Object.freeze([...ends]),
    segmentIndex: 0,
  };
}

// Rango [start, end] dentro del cual se permite editar.
function activeSegment(state) {
  const { segmentEnds, segmentIndex } = state;
  return {
    start: segmentIndex === 0 ? 0 : segmentEnds[segmentIndex - 1],
    end: segmentEnds[segmentIndex],
  };
}

// Longitud del prefijo común entre dos strings.
function commonPrefixLength(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Cuenta los caracteres de `chars` que coinciden con `text` a partir de `offset`.
function countMatches(chars, text, offset = 0) {
  let matches = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === text[offset + i]) matches++;
  }
  return matches;
}

// Descompone el cambio en lo borrado y lo insertado tras el prefijo común.
function diffInput(previous, next) {
  const position = commonPrefixLength(previous, next);
  return {
    position,
    removed: previous.slice(position),
    inserted: next.slice(position),
  };
}

function isRejected(state, next, position, inserted) {
  const { start, end } = activeSegment(state);
  return (
    next === state.typed ||
    position < start ||
    next.length > end ||
    inserted.length > 1
  );
}

// Índice del segmento activo tras aplicar `next`: avanza en cuanto el
// segmento actual queda completo y correcto, salvo en el último.
function nextSegmentIndex(state, next) {
  const { start, end } = activeSegment(state);
  const isLast = state.segmentIndex === state.segmentEnds.length - 1;
  const isComplete = next.length === end && next.slice(start) === state.text.slice(start, end);
  return isComplete && !isLast ? state.segmentIndex + 1 : state.segmentIndex;
}

function countKeystroke(keystrokes, isCorrect) {
  return {
    total: keystrokes.total + 1,
    correct: keystrokes.correct + (isCorrect ? 1 : 0),
    incorrect: keystrokes.incorrect + (isCorrect ? 0 : 1),
  };
}

export function applyInput(state, value, now) {
  if (state.status === 'finished' || typeof value !== 'string' || !Number.isFinite(now)) {
    return state;
  }
  const next = value.normalize('NFC');
  const { position, removed, inserted } = diffInput(state.typed, next);
  if (isRejected(state, next, position, inserted)) return state;

  const removedErrors = removed.length - countMatches(removed, state.text, position);
  const hasInsertion = inserted.length === 1;
  const isFinished = next === state.text;
  const startedAt = state.startedAt ?? (hasInsertion ? now : null);

  return {
    ...state,
    status: isFinished ? 'finished' : startedAt === null ? 'idle' : 'running',
    typed: next,
    startedAt,
    finishedAt: isFinished ? now : null,
    keystrokes: hasInsertion
      ? countKeystroke(state.keystrokes, inserted === state.text[position])
      : { ...state.keystrokes },
    corrections: state.corrections + removedErrors,
    segmentIndex: nextSegmentIndex(state, next),
  };
}

export function restartGame(state) {
  return createGame(state.text, { segmentEnds: state.segmentEnds });
}

export function getElapsedMs(state, now) {
  if (state.startedAt === null) return 0;
  const end = state.status === 'finished' ? state.finishedAt : now;
  if (!Number.isFinite(end) || end < state.startedAt) return 0;
  return end - state.startedAt;
}

export function getProgress(state) {
  const correctChars = countMatches(state.typed, state.text);
  return {
    segmentIndex: state.segmentIndex,
    segmentCount: state.segmentEnds.length,
    correctChars,
    ratio: correctChars / state.text.length,
  };
}

export function getStats(state, now) {
  const elapsedMs = getElapsedMs(state, now);
  return {
    wpm: calcWpm(countMatches(state.typed, state.text), elapsedMs),
    accuracy: calcAccuracy(state.keystrokes.correct, state.keystrokes.total),
    elapsedMs,
    errors: state.keystrokes.incorrect,
    corrections: state.corrections,
  };
}
