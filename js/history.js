// Cálculos del historial para la pantalla de historial. Módulo PURO: sin DOM
// ni almacenamiento. Las sesiones llegan de storage.js en orden de finalización.

/** Totales del historial. Con 0 sesiones, los valores agregados son null. */
export function summarizeHistory(sessions) {
  if (sessions.length === 0) return { count: 0, bestWpm: null, averageAccuracy: null };
  const totalAccuracy = sessions.reduce((sum, s) => sum + s.accuracy, 0);
  return {
    count: sessions.length,
    bestWpm: Math.max(...sessions.map((s) => s.wpm)),
    averageAccuracy: totalAccuracy / sessions.length,
  };
}

/** Máximo del eje vertical: el mayor valor redondeado a la decena, mínimo 10. */
export function chartScaleMax(values) {
  const max = values.length > 0 ? Math.max(...values) : 0;
  return Math.max(10, Math.ceil(max / 10) * 10);
}

// Escalas adaptadas a los datos (experimento 01): margen sobre los datos, rango
// mínimo para no exagerar diferencias pequeñas, límites válidos y valores redondos.
const ACCURACY_LIMITS = Object.freeze({ min: 0, max: 100 });
const MARGIN_RATIO = 0.15;

function isValidAccuracy(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isValidSpeed(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// Desplaza [low, high] para que quepa en [lower, upper] sin perder rango y lo recorta.
function fitRange(low, high, lower, upper) {
  let [lo, hi] = [low, high];
  if (hi > upper) [lo, hi] = [lo - (hi - upper), upper];
  if (lo < lower) [lo, hi] = [lower, hi + (lower - lo)];
  return [Math.max(lower, lo), Math.min(upper, hi)];
}

/**
 * Escala de unos datos ya válidos: margen (15 % del rango, al menos `minMargin`),
 * rango mínimo `minSpan` centrado (un dato o valores idénticos), dentro de
 * [lower, upper] y con límites múltiplos de `step`. `adjusted`: el mínimo no es `lower`.
 */
function fitScale(valid, { lower, upper, minSpan, minMargin, step }) {
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const margin = Math.max((hi - lo) * MARGIN_RATIO, minMargin);
  let [low, high] = [lo - margin, hi + margin];
  if (high - low < minSpan) {
    const center = (lo + hi) / 2;
    [low, high] = [center - minSpan / 2, center + minSpan / 2];
  }
  [low, high] = fitRange(low, high, lower, upper);
  const min = Math.floor(low / step) * step;
  return { min, max: Math.min(upper, Math.ceil(high / step) * step), adjusted: min > lower };
}

/**
 * Eje vertical de la precisión ajustado a los datos VÁLIDOS: margen (mín. 1 punto),
 * al menos 5 puntos de rango, nunca fuera de 0-100 % y límites enteros. Sin datos
 * válidos, 0-100 %. Los valores no se modifican: solo la escala.
 * @param {unknown[]} values porcentajes de precisión
 * @returns {{ min: number, max: number, adjusted: boolean }}
 */
export function accuracyScale(values) {
  const valid = values.filter(isValidAccuracy);
  if (valid.length === 0) return { ...ACCURACY_LIMITS, adjusted: false };
  return fitScale(valid, { lower: 0, upper: 100, minSpan: 5, minMargin: 1, step: 1 });
}

/**
 * Eje vertical de la velocidad (PPM) ajustado a los datos VÁLIDOS (exp. 01.2): margen
 * (mín. 5 PPM), rango mínimo de 20 PPM o del 10 % del máximo (para no exagerar cambios
 * pequeños), nunca por debajo de 0 y límites múltiplos de 5. Sin datos válidos, 0-10.
 * @param {unknown[]} values PPM
 * @returns {{ min: number, max: number, adjusted: boolean }}
 */
export function speedScale(values) {
  const valid = values.filter(isValidSpeed);
  if (valid.length === 0) return { min: 0, max: 10, adjusted: false };
  const minSpan = Math.max(20, Math.max(...valid) * 0.1);
  return fitScale(valid, { lower: 0, upper: Infinity, minSpan, minMargin: 5, step: 5 });
}

/**
 * Eje de la gráfica de velocidad. Por defecto, el ORIGINAL (de 0 a la decena
 * superior), que usa el Historial. Con `adaptive` (solo Resultados), speedScale y
 * una nota que avisa del ajuste. Nunca cambia los valores.
 */
export function speedAxis(values, { adaptive = false } = {}) {
  if (!adaptive) return { minValue: 0, maxValue: chartScaleMax(values), scaleNote: '' };
  const { min, max, adjusted } = speedScale(values);
  return { minValue: min, maxValue: max, scaleNote: adjusted ? `Escala ajustada a los datos: de ${min} a ${max} PPM.` : '' };
}

/**
 * Eje de la gráfica de precisión. Por defecto, el ORIGINAL (0-100 %), que usa el
 * Historial. Con `adaptive` (solo la gráfica de Resultados, experimento 01.1), la
 * escala de accuracyScale y una nota que avisa del ajuste. Nunca cambia los valores.
 */
export function accuracyAxis(values, { adaptive = false } = {}) {
  if (!adaptive) return { minValue: ACCURACY_LIMITS.min, maxValue: ACCURACY_LIMITS.max, scaleNote: '' };
  const { min, max, adjusted } = accuracyScale(values);
  return { minValue: min, maxValue: max, scaleNote: adjusted ? `Escala ajustada a los datos: de ${min} % a ${max} %.` : '' };
}

/**
 * Coordenadas de una línea dentro de una caja width × height (origen arriba a
 * la izquierda, como en SVG). Los valores se limitan a [minValue, maxValue]
 * (minValue = 0 por defecto); solo cambia la posición, nunca el valor.
 */
export function chartPoints(values, { width, height, minValue = 0, maxValue }) {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const range = maxValue - minValue;
  return values.map((value, i) => {
    const clamped = Math.min(Math.max(value, minValue), maxValue);
    return {
      x: values.length > 1 ? i * step : width / 2,
      y: height - ((clamped - minValue) / range) * height,
    };
  });
}

/** Resumen textual de una serie, como alternativa accesible al gráfico. */
export function describeSeries(label, values) {
  if (values.length === 0) return `${label}: sin sesiones.`;
  const last = Math.round(values.at(-1));
  if (values.length === 1) return `${label} en la última sesión: ${last}.`;
  const first = Math.round(values[0]);
  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));
  const trend = last > first ? `sube de ${first} a ${last}` : last < first
    ? `baja de ${first} a ${last}` : `se mantiene en ${last}`;
  return `${label} en las últimas ${values.length} sesiones: ${trend} (mínimo ${min}, máximo ${max}).`;
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fecha y hora locales de un registro (ISO 8601), p. ej. «21/10/2026, 09:05». */
export function formatDateTime(iso) {
  return DATE_TIME_FORMAT.format(new Date(iso));
}
