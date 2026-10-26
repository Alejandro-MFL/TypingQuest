// Diagnóstico de escritura por carácter (T11). Módulo PURO: sin DOM ni reloj.
//
// Observa SOLO transiciones aceptadas por el motor (applyInput devolvió un estado
// nuevo): los rechazos (pegado, exceso, fragmento cerrado o bloqueado), los
// renders y los eventos repetidos no llegan aquí, así que no se cuentan. Una
// transición con un carácter insertado es un INTENTO en esa posición; los
// borrados no son intentos (el retroceso nunca es un error).
//
// Definiciones (por carácter ESPERADO, el que pedía el texto en esa posición):
// - oportunidades: posiciones de ese carácter que recibieron al menos un intento.
// - fallos al primer intento: oportunidades cuyo PRIMER intento fue incorrecto.
//   Tasa de fallos = fallos al primer intento / oportunidades (métrica principal:
//   no se infla con los reintentos de una misma posición).
// - intentos y errores: todas las pulsaciones aceptadas en esas posiciones y las
//   incorrectas. Σ intentos = keystrokes.total y Σ errores = keystrokes.incorrect:
//   la precisión global no cambia de significado.
// - corregidos: fallos al primer intento que al terminar quedaron bien escritos.
// - confusiones: (esperado, escrito) en cada intento incorrecto.
// El dedo y la tecla son los RECOMENDADOS por el modelo de T9 (keyboard.js): el
// navegador no puede saber qué dedo se usó.
//
// Privacidad: el resumen solo guarda recuentos por carácter y pares de
// confusión, en orden de dificultad; nunca el texto ni secuencias de escritura.

export const ANALYSIS_VERSION = 1;
// Muestra mínima para valorar un carácter: con menos, «datos insuficientes».
export const MIN_OPPORTUNITIES = 5;
// Una confusión se destaca cuando se repite al menos estas veces.
export const MIN_CONFUSION_COUNT = 2;
export const MAX_DIFFICULTIES = 5;
// Límites del formato guardado (tamaño acotado en localStorage).
export const MAX_STORED_CHARS = 64;
export const MAX_STORED_CONFUSIONS = 8;
const MAX_COUNT = 100000;
const FIRST_CORRECT = 1;
const FIRST_WRONG = 2;

/** Análisis vacío de una partida sobre `text` (ya normalizado por el motor). */
export function createTypingAnalysis(text) {
  return { text, first: [], counts: {}, confusions: {} };
}

function commonPrefixLength(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Carácter insertado por una transición aceptada y su posición, o null.
function insertionOf(analysis, previous, next) {
  if (!previous || !next || next === previous) return null;
  if (previous.text !== analysis.text || next.text !== analysis.text) return null;
  const position = commonPrefixLength(previous.typed, next.typed);
  const inserted = next.typed.slice(position);
  if (inserted.length !== 1 || position >= analysis.text.length) return null;
  return { position, inserted };
}

/**
 * Registra la transición previous → next (estados del motor). Devuelve un
 * análisis nuevo, o el MISMO si la transición no aporta un intento.
 */
export function recordTransition(analysis, previous, next) {
  const insertion = insertionOf(analysis, previous, next);
  if (insertion === null) return analysis;
  const { position, inserted } = insertion;
  const expected = analysis.text[position];
  const correct = inserted === expected;
  const first = analysis.first[position] === undefined ? analysis.first.slice() : analysis.first;
  if (first !== analysis.first) first[position] = correct ? FIRST_CORRECT : FIRST_WRONG;
  const count = analysis.counts[expected] ?? { attempts: 0, errors: 0 };
  const counts = {
    ...analysis.counts,
    [expected]: { attempts: count.attempts + 1, errors: count.errors + (correct ? 0 : 1) },
  };
  const key = expected + inserted;
  const confusions = correct ? analysis.confusions : { ...analysis.confusions, [key]: (analysis.confusions[key] ?? 0) + 1 };
  return { ...analysis, first, counts, confusions };
}

function byDifficulty(a, b) {
  return b.firstTryErrors - a.firstTryErrors || b.errors - a.errors
    || b.opportunities - a.opportunities || (a.char < b.char ? -1 : a.char > b.char ? 1 : 0);
}

function byCount(a, b) {
  return b.count - a.count || (a.expected + a.typed < b.expected + b.typed ? -1 : 1);
}

// Oportunidades, fallos al primer intento y corregidos por carácter esperado.
function positionTotals(analysis, finalTyped) {
  const totals = {};
  analysis.first.forEach((result, i) => {
    if (result === undefined) return;
    const char = analysis.text[i];
    const t = (totals[char] ??= { opportunities: 0, firstTryErrors: 0, corrected: 0 });
    t.opportunities++;
    if (result === FIRST_WRONG) {
      t.firstTryErrors++;
      if (finalTyped[i] === char) t.corrected++;
    }
  });
  return totals;
}

/**
 * Resumen agregado de la partida: lo que se guarda y se muestra. `finalTyped` es
 * lo escrito al terminar (decide qué fallos quedaron corregidos).
 */
export function summarizeAnalysis(analysis, finalTyped) {
  const totals = positionTotals(analysis, finalTyped);
  const chars = Object.entries(totals).map(([char, t]) => ({
    char,
    opportunities: t.opportunities,
    firstTryErrors: t.firstTryErrors,
    attempts: analysis.counts[char].attempts,
    errors: analysis.counts[char].errors,
    corrected: t.corrected,
  }));
  const confusions = Object.entries(analysis.confusions)
    .map(([key, count]) => ({ expected: key[0], typed: key[1], count }));
  return {
    version: ANALYSIS_VERSION,
    chars: chars.sort(byDifficulty).slice(0, MAX_STORED_CHARS),
    confusions: confusions.sort(byCount).slice(0, MAX_STORED_CONFUSIONS),
  };
}

// --- Formato guardado ---------------------------------------------------------------
// { version, chars: [[carácter, oportunidades, fallos 1.er intento, intentos,
//   errores, corregidos]], confusions: [[esperado, escrito, veces]] }

export function packAnalysis(summary) {
  return {
    version: summary.version,
    chars: summary.chars.map((c) => [c.char, c.opportunities, c.firstTryErrors, c.attempts, c.errors, c.corrected]),
    confusions: summary.confusions.map((c) => [c.expected, c.typed, c.count]),
  };
}

function isSingleChar(value) {
  return typeof value === 'string' && value.length === 1 && !/[\uD800-\uDFFF]/.test(value);
}

function isCount(value, min = 0) {
  return Number.isInteger(value) && value >= min && value <= MAX_COUNT;
}

function unpackChar(item) {
  if (!Array.isArray(item) || item.length !== 6 || !isSingleChar(item[0])) return null;
  const [char, opportunities, firstTryErrors, attempts, errors, corrected] = item;
  const valid = isCount(opportunities, 1) && isCount(firstTryErrors) && isCount(attempts) && isCount(errors)
    && isCount(corrected) && firstTryErrors <= opportunities && opportunities <= attempts
    && firstTryErrors <= errors && errors <= attempts && corrected <= firstTryErrors;
  return valid ? { char, opportunities, firstTryErrors, attempts, errors, corrected } : null;
}

function unpackConfusion(item) {
  if (!Array.isArray(item) || item.length !== 3) return null;
  const [expected, typed, count] = item;
  const valid = isSingleChar(expected) && isSingleChar(typed) && expected !== typed && isCount(count, 1);
  return valid ? { expected, typed, count } : null;
}

// Coherencia: sin repetidos y sin más confusiones que errores del carácter.
function isConsistent(chars, confusions) {
  if (new Set(chars.map((c) => c.char)).size !== chars.length) return false;
  if (new Set(confusions.map((c) => c.expected + c.typed)).size !== confusions.length) return false;
  return chars.every((c) => confusions
    .filter((x) => x.expected === c.char).reduce((n, x) => n + x.count, 0) <= c.errors);
}

function hasPackedShape(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort().join();
  return keys === 'chars,confusions,version' && value.version === ANALYSIS_VERSION
    && Array.isArray(value.chars) && value.chars.length <= MAX_STORED_CHARS
    && Array.isArray(value.confusions) && value.confusions.length <= MAX_STORED_CONFUSIONS;
}

/** Valida el formato guardado. Devuelve el resumen, o null si no es válido. */
export function unpackAnalysis(value) {
  if (!hasPackedShape(value)) return null;
  const chars = value.chars.map(unpackChar);
  const confusions = value.confusions.map(unpackConfusion);
  if (chars.includes(null) || confusions.includes(null) || !isConsistent(chars, confusions)) return null;
  return { version: ANALYSIS_VERSION, chars, confusions };
}

// --- Diagnóstico ----------------------------------------------------------------------

function relevantConfusions(summary, char) {
  return summary.confusions
    .filter((c) => c.expected === char && c.count >= MIN_CONFUSION_COUNT)
    .slice(0, 2)
    .map(({ typed, count }) => ({ typed, count }));
}

function byRate(a, b) {
  return b.rate - a.rate || b.firstTryErrors - a.firstTryErrors
    || b.opportunities - a.opportunities || (a.char < b.char ? -1 : 1);
}

/**
 * Dificultades de una sesión. status: 'unavailable' (sin análisis: sesiones
 * antiguas), 'insufficient' (ningún carácter llega a la muestra mínima),
 * 'clean' (sin fallos en los caracteres con muestra) o 'difficulties'.
 */
export function diagnose(summary, { minOpportunities = MIN_OPPORTUNITIES, limit = MAX_DIFFICULTIES } = {}) {
  if (summary === null || summary === undefined) {
    return { status: 'unavailable', difficulties: [], insufficient: [], totals: null };
  }
  const sufficient = summary.chars.filter((c) => c.opportunities >= minOpportunities);
  const difficulties = sufficient
    .filter((c) => c.firstTryErrors > 0)
    .map((c) => ({ ...c, rate: c.firstTryErrors / c.opportunities, confusions: relevantConfusions(summary, c.char) }))
    .sort(byRate)
    .slice(0, limit);
  const insufficient = summary.chars.filter((c) => c.opportunities < minOpportunities && c.errors > 0);
  const totals = summary.chars.reduce((t, c) => ({
    opportunities: t.opportunities + c.opportunities, firstTryErrors: t.firstTryErrors + c.firstTryErrors,
  }), { opportunities: 0, firstTryErrors: 0 });
  const status = sufficient.length === 0 ? 'insufficient' : difficulties.length > 0 ? 'difficulties' : 'clean';
  return { status, difficulties, insufficient, totals };
}
