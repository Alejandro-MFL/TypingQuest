// Persistencia del historial de partidas. Único módulo que accede al
// almacenamiento; lo recibe inyectado (localStorage o un doble en los tests),
// así que no toca el DOM ni lee el reloj.
//
// Formato (clave versionada): { version: 1, sessions: [registro, …] } en orden
// de finalización. Un registro solo contiene los campos de RECORD_FIELDS (métricas,
// modo y ejercicio), nunca el texto practicado: cualquier otra propiedad se
// descarta al guardar y al recuperar. Añadir un campo (p. ej. el análisis de
// teclas) exige ampliar RECORD_FIELDS y su validación, con sus tests.
//
// Ninguna función lanza por fallos del almacenamiento: devuelven un estado.
import { MODES } from './game.js';

export const HISTORY_KEY = 'typingquest:history:v1';
// Campos permitidos de una sesión guardada, en el orden en que se escriben.
export const RECORD_FIELDS = Object.freeze([
  'id', 'finishedAt', 'wpm', 'accuracy', 'elapsedMs', 'errors', 'mode', 'exercise',
]);
const HISTORY_VERSION = 1;
const DEFAULT_MAX_SESSIONS = 500;
// Tipo de ejercicio de los textos escritos o pegados por el jugador.
export const EXERCISE_CUSTOM_TEXT = 'custom-text';
const QUOTA_ERRORS = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Marca de tiempo en ms que Date puede representar (toISOString no lanzará).
function isValidTimestamp(value) {
  return typeof value === 'number' && !Number.isNaN(new Date(value).getTime());
}

/**
 * Registro de una partida terminada. `finishedAt` es una marca de tiempo en ms
 * (Date.now()); `stats` es el resultado de getStats. El texto no se guarda.
 * Devuelve null si la fecha no es válida o faltan las estadísticas: add(null)
 * responde { ok: false, error: 'invalid' } en lugar de lanzar.
 */
export function createSessionRecord({ id, finishedAt, stats, mode, exercise = EXERCISE_CUSTOM_TEXT }) {
  if (!isValidTimestamp(finishedAt) || stats === null || typeof stats !== 'object') return null;
  return {
    id,
    finishedAt: new Date(finishedAt).toISOString(),
    wpm: round2(stats.wpm),
    accuracy: round2(stats.accuracy),
    elapsedMs: Math.round(stats.elapsedMs),
    errors: stats.errors,
    mode,
    exercise,
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

// Fecha UTC en el formato de toISOString (milisegundos opcionales) que además
// existe: la ida y vuelta por Date descarta p. ej. el 30 de febrero o la hora 25.
const ISO_UTC_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function isIsoDateTime(value) {
  if (typeof value !== 'string' || !ISO_UTC_DATE_TIME.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

// Copia del registro con solo los campos permitidos.
function pickRecordFields(record) {
  return Object.fromEntries(RECORD_FIELDS.map((field) => [field, record[field]]));
}

// Valida los campos permitidos; las propiedades desconocidas no invalidan el
// registro, pero nunca se conservan (ver pickRecordFields).
export function isValidRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return false;
  return (
    isNonEmptyString(record.id) &&
    isIsoDateTime(record.finishedAt) &&
    isNonNegativeNumber(record.wpm) &&
    isNonNegativeNumber(record.accuracy) &&
    record.accuracy <= 100 &&
    isNonNegativeNumber(record.elapsedMs) &&
    Number.isInteger(record.errors) &&
    record.errors >= 0 &&
    MODES.includes(record.mode) &&
    isNonEmptyString(record.exercise)
  );
}

/**
 * Interpreta el valor guardado. Nunca lanza.
 * @returns {{ sessions: object[], status: 'ok'|'empty'|'corrupt', discarded: number }}
 */
export function parseHistory(raw) {
  if (raw === null || raw === undefined) return { sessions: [], status: 'empty', discarded: 0 };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { sessions: [], status: 'corrupt', discarded: 0 };
  }
  if (!data || data.version !== HISTORY_VERSION || !Array.isArray(data.sessions)) {
    return { sessions: [], status: 'corrupt', discarded: 0 };
  }
  const sessions = data.sessions.filter(isValidRecord).map(pickRecordFields);
  return { sessions, status: 'ok', discarded: data.sessions.length - sessions.length };
}

function classifyWriteError(error) {
  if (QUOTA_ERRORS.has(error?.name)) return 'quota';
  if (error?.name === 'SecurityError') return 'unavailable';
  return 'write-failed';
}

/**
 * Historial sobre un almacenamiento con la interfaz de localStorage, o null si
 * no está disponible (la aplicación sigue funcionando sin historial).
 */
// Límite efectivo: un entero ≥ 1 (con 0, slice(-0) conservaría todo el historial).
function normalizeMaxSessions(value) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : DEFAULT_MAX_SESSIONS;
}

export function createHistoryStore(storage, { maxSessions = DEFAULT_MAX_SESSIONS } = {}) {
  const limit = normalizeMaxSessions(maxSessions);
  function load() {
    if (!storage) return { sessions: [], status: 'unavailable', discarded: 0 };
    try {
      return parseHistory(storage.getItem(HISTORY_KEY));
    } catch {
      return { sessions: [], status: 'unavailable', discarded: 0 };
    }
  }

  function write(sessions) {
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify({ version: HISTORY_VERSION, sessions }));
      return { ok: true, saved: true };
    } catch (error) {
      return { ok: false, error: classifyWriteError(error) };
    }
  }

  // Un historial corrupto se sustituye: sus datos ya no se pueden recuperar.
  function add(record) {
    if (!isValidRecord(record)) return { ok: false, error: 'invalid' };
    const current = load();
    if (current.status === 'unavailable') return { ok: false, error: 'unavailable' };
    if (current.sessions.some((session) => session.id === record.id)) {
      return { ok: true, saved: false, reason: 'duplicate' };
    }
    return write([...current.sessions, pickRecordFields(record)].slice(-limit));
  }

  function clear() {
    if (!storage) return { ok: false, error: 'unavailable' };
    try {
      storage.removeItem(HISTORY_KEY);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: classifyWriteError(error) };
    }
  }

  return { load, add, clear };
}
