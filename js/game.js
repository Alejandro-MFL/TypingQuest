// Motor del juego. Módulo PURO: sin DOM ni lectura directa del reloj.
//
// applyInput recibe el valor COMPLETO del textarea tras cada evento input y lo
// compara con lo escrito antes. Si el estado devuelto tiene un `typed` distinto
// del valor recibido, la entrada fue rechazada y la UI debe restaurar el textarea.
import { calcWpm, calcAccuracy } from './metrics.js';

export function createGame(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new TypeError('El texto objetivo debe ser un string no vacío');
  }
  return {
    status: 'idle',
    text: text.normalize('NFC'),
    typed: '',
    startedAt: null,
    finishedAt: null,
    keystrokes: { total: 0, correct: 0, incorrect: 0 },
    corrections: 0,
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

function isRejected(state, next, inserted) {
  return next === state.typed || next.length > state.text.length || inserted.length > 1;
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
  if (isRejected(state, next, inserted)) return state;

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
  };
}

export function restartGame(state) {
  return createGame(state.text);
}

export function getElapsedMs(state, now) {
  if (state.startedAt === null) return 0;
  const end = state.status === 'finished' ? state.finishedAt : now;
  if (!Number.isFinite(end) || end < state.startedAt) return 0;
  return end - state.startedAt;
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
