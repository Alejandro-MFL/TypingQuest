// Comparación de una partida con una referencia comparable (experimento 01).
// Módulo PURO: sin DOM, sin almacenamiento y sin reloj.
//
// Referencia comparable = el intento ANTERIOR más reciente del MISMO ejercicio en el
// MISMO modo. Nunca se compara con otro ejercicio (una práctica breve de introducción
// y una ampliada no son comparables) ni la práctica libre (cada texto puede cambiar).
// Los registros guardan la velocidad en WPM; aquí se compara en PPM (× 5, exacto).
import { wpmToCpm } from './metrics.js';
import { MIN_RELIABLE_WPM_MS } from './objectives.js';
import { EXERCISE_CUSTOM_TEXT } from './storage.js';

// Umbrales PROVISIONALES de «sin cambios claros»: diferencias menores no se
// presentan como mejora ni empeoramiento (ruido normal entre intentos).
export const SPEED_STABLE_MIN_CPM = 5;
export const SPEED_STABLE_RATIO = 0.05;
export const ACCURACY_STABLE_POINTS = 1;

function isComparableRecord(r) {
  return Boolean(r) && wpmToCpm(r.wpm) !== null && Number.isFinite(r.accuracy) && Number.isFinite(r.elapsedMs);
}

// Intento anterior más reciente (orden de guardado = orden de finalización).
function findReference(sessions, current) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.id === current.id) continue;
    if (s.exercise === current.exercise && s.mode === current.mode && isComparableRecord(s)) return s;
  }
  return null;
}

function speedComparison(reference, current) {
  const from = wpmToCpm(reference.wpm);
  const to = wpmToCpm(current.wpm);
  const delta = to - from;
  const reliable = reference.elapsedMs >= MIN_RELIABLE_WPM_MS && current.elapsedMs >= MIN_RELIABLE_WPM_MS;
  const threshold = Math.max(SPEED_STABLE_MIN_CPM, from * SPEED_STABLE_RATIO);
  return { from, to, delta, trend: !reliable ? 'unreliable' : trendOf(delta, threshold) };
}

function accuracyComparison(reference, current) {
  const delta = current.accuracy - reference.accuracy;
  return { from: reference.accuracy, to: current.accuracy, delta, trend: trendOf(delta, ACCURACY_STABLE_POINTS) };
}

function trendOf(delta, threshold) {
  if (Math.abs(delta) < threshold) return 'same';
  return delta > 0 ? 'up' : 'down';
}

// Veredicto con las métricas fiables: una mejora de velocidad NO compensa una
// pérdida de precisión (eso es «mixto», nunca «mejora»).
function verdictOf(...metrics) {
  const trends = metrics.map((m) => m.trend).filter((t) => t !== 'unreliable');
  const ups = trends.includes('up');
  const downs = trends.includes('down');
  if (ups && downs) return 'mixed';
  if (ups) return 'improved';
  if (downs) return 'declined';
  return 'stable';
}

/**
 * Compara la partida `current` (registro de historial) con su referencia comparable.
 * @param {{ sessions: object[], current: object, historyAvailable?: boolean }} input
 *   `sessions`: historial guardado (puede incluir ya `current`, que se ignora).
 * @returns {{ status: 'unavailable' | 'not-comparable' | 'first' | 'compared', ... }}
 */
export function compareWithReference({ sessions, current, historyAvailable = true }) {
  if (!historyAvailable || !isComparableRecord(current)) return { status: 'unavailable' };
  if (current.exercise === EXERCISE_CUSTOM_TEXT) return { status: 'not-comparable' };
  const reference = findReference(Array.isArray(sessions) ? sessions : [], current);
  if (!reference) return { status: 'first', mode: current.mode };
  const speed = speedComparison(reference, current);
  const accuracy = accuracyComparison(reference, current);
  return { status: 'compared', mode: current.mode, reference, speed, accuracy, verdict: verdictOf(speed, accuracy) };
}

// --- Textos (puros) -----------------------------------------------------------------

const ICONS = Object.freeze({ up: '↑', down: '↓', same: '=', unreliable: '–', mixed: '↕' });
const TREND_WORDS = Object.freeze({ up: 'mejora', down: 'empeora', same: 'sin cambios claros' });
const MODE_WORDS = Object.freeze({ free: 'modo libre', strict: 'modo estricto' });
const ONE_DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Signo explícito con el menos tipográfico (−), p. ej. «+12» o «−2,3».
function signed(value, format) {
  if (format(Math.abs(value)) === format(0)) return format(0);
  return `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

function speedLine(speed) {
  if (speed.trend === 'unreliable') {
    return { trend: 'unreliable', icon: ICONS.unreliable, text: 'Velocidad: no se compara (medición demasiado corta)' };
  }
  const delta = signed(speed.delta, (v) => String(Math.round(v)));
  const range = `de ${Math.round(speed.from)} a ${Math.round(speed.to)}`;
  return { trend: speed.trend, icon: ICONS[speed.trend], text: `Velocidad: ${delta} PPM (${range}), ${TREND_WORDS[speed.trend]}` };
}

function accuracyLine(accuracy) {
  const delta = signed(accuracy.delta, (v) => ONE_DECIMAL.format(v));
  const range = `de ${ONE_DECIMAL.format(accuracy.from)} % a ${ONE_DECIMAL.format(accuracy.to)} %`;
  return {
    trend: accuracy.trend, icon: ICONS[accuracy.trend],
    text: `Precisión: ${delta} puntos (${range}), ${TREND_WORDS[accuracy.trend]}`,
  };
}

// «velocidad», «precisión» o «velocidad y precisión» según qué métricas tienen `trend`.
function metricsWith(result, trend) {
  const names = [];
  if (result.speed.trend === trend) names.push('velocidad');
  if (result.accuracy.trend === trend) names.push('precisión');
  return names.join(' y ');
}

function comparedTitle(result) {
  switch (result.verdict) {
    case 'improved': {
      const which = metricsWith(result, 'up');
      return which.includes(' y ') ? `Mejora en ${which}` : `Mejora de ${which}`;
    }
    case 'declined': return `Peor que tu intento anterior en ${metricsWith(result, 'down')}`;
    case 'mixed': return 'Resultado mixto';
    default: return 'Rendimiento estable';
  }
}

function mixedAdvice(result) {
  return result.speed.trend === 'up'
    ? 'Has ido más rápido, pero con menos precisión: recupera primero la precisión.'
    : 'Has sido más preciso, pero más lento: es normal al priorizar la precisión.';
}

const VERDICT_ICONS = Object.freeze({ improved: ICONS.up, declined: ICONS.down, mixed: ICONS.mixed, stable: ICONS.same });

/**
 * Textos de la comparación para Resultados: título, icono, líneas (con icono y
 * palabra, no solo color), consejo opcional y de dónde sale la referencia.
 * @param {object} result de compareWithReference
 * @param {{ formatDate: (iso: string) => string }} options
 */
export function describeComparison(result, { formatDate }) {
  const empty = { icon: ICONS.unreliable, lines: [], advice: '' };
  if (result.status === 'unavailable') {
    return { ...empty, title: 'Sin comparación', note: 'No se puede comparar porque el historial no está disponible.' };
  }
  if (result.status === 'not-comparable') {
    return { ...empty, title: 'Sin comparación', note: 'En la práctica libre cada texto puede ser distinto, así que no se compara con otros intentos.' };
  }
  if (result.status === 'first') {
    return {
      ...empty, title: 'Primera referencia disponible',
      note: `Es tu primer resultado guardado de este ejercicio en ${MODE_WORDS[result.mode] ?? 'este modo'}. La próxima vez podrás compararlo.`,
    };
  }
  return {
    title: comparedTitle(result),
    icon: VERDICT_ICONS[result.verdict],
    lines: [speedLine(result.speed), accuracyLine(result.accuracy)],
    advice: result.verdict === 'mixed' ? mixedAdvice(result) : '',
    note: `Comparado con tu intento anterior de este ejercicio en ${MODE_WORDS[result.mode] ?? 'este modo'} `
      + `(${formatDate(result.reference.finishedAt)}).`,
  };
}
