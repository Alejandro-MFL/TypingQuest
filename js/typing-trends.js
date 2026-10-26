// Evolución de las dificultades a lo largo de varias sesiones (T12). Módulo PURO.
//
// Agrega (suma) los diagnósticos de T11 ya guardados en el Historial: no guarda
// nada nuevo ni necesita el texto. Las sesiones sin diagnóstico (T7-T10) o con un
// diagnóstico no válido se ignoran: nunca cuentan como sesiones sin errores.
//
// Tasa acumulada de un carácter = Σ fallos al primer intento / Σ oportunidades
// (ponderada por oportunidades: una sesión con 2 oportunidades pesa menos que una
// con 18). Nunca se promedian las tasas de cada sesión.
//
// Umbrales PROVISIONALES (prudentes, no científicos; revisables con uso real):
// - Muestra suficiente: ≥ MIN_TREND_OPPORTUNITIES oportunidades en ≥ MIN_TREND_SESSIONS sesiones.
// - Dificultad recurrente: muestra suficiente, tasa ≥ RECURRENT_MIN_RATE y ≥
//   RECURRENT_RELATIVE veces la tasa media del alumno (destaca sobre su propio nivel).
// - Evolución: las sesiones del carácter, en orden cronológico, se parten en dos
//   periodos con un número de oportunidades lo más parecido posible; cada uno
//   necesita ≥ MIN_PERIOD_OPPORTUNITIES. Mejora o empeora solo si la diferencia es
//   ≥ MIN_RATE_CHANGE y una prueba de dos proporciones da |z| ≥ Z_THRESHOLD (≈ 95 %).
// Limitación: los ejercicios no son comparables entre sí (fila central frente a
// textos avanzados); la evolución no corrige esa diferencia de dificultad.
import { unpackAnalysis } from './typing-analysis.js';

export const MIN_TREND_OPPORTUNITIES = 20;
export const MIN_TREND_SESSIONS = 3;
export const RECURRENT_MIN_RATE = 0.1;
export const RECURRENT_RELATIVE = 1.5;
export const MIN_PERIOD_OPPORTUNITIES = 15;
export const MIN_RATE_CHANGE = 0.05;
export const Z_THRESHOLD = 1.96;
export const MIN_CONFUSION_TOTAL = 3;
export const MAX_LISTED = 5;

/**
 * Diagnósticos válidos en orden cronológico (a igual fecha, el orden de guardado).
 * @returns {{ entries: { finishedAt: string, summary: object }[], withoutDiagnosis: number }}
 */
export function collectAnalyses(sessions) {
  const entries = [];
  let withoutDiagnosis = 0;
  sessions.forEach((session, index) => {
    const summary = session ? unpackAnalysis(session.analysis) : null;
    if (summary === null || typeof session.finishedAt !== 'string') withoutDiagnosis++;
    else entries.push({ finishedAt: session.finishedAt, index, summary });
  });
  entries.sort((a, b) => (a.finishedAt < b.finishedAt ? -1 : a.finishedAt > b.finishedAt ? 1 : a.index - b.index));
  return { entries: entries.map(({ finishedAt, summary }) => ({ finishedAt, summary })), withoutDiagnosis };
}

function emptyTotals(char) {
  return { char, opportunities: 0, firstTryErrors: 0, attempts: 0, errors: 0, corrected: 0, sessions: 0, rate: 0 };
}

/** Totales por carácter (Map carácter → totales con su tasa acumulada). */
export function aggregateChars(entries) {
  const totals = new Map();
  for (const { summary } of entries) {
    for (const c of summary.chars) {
      const t = totals.get(c.char) ?? emptyTotals(c.char);
      totals.set(c.char, {
        ...t,
        opportunities: t.opportunities + c.opportunities,
        firstTryErrors: t.firstTryErrors + c.firstTryErrors,
        attempts: t.attempts + c.attempts,
        errors: t.errors + c.errors,
        corrected: t.corrected + c.corrected,
        sessions: t.sessions + 1,
      });
    }
  }
  for (const t of totals.values()) t.rate = t.firstTryErrors / t.opportunities;
  return totals;
}

/** 'improving', 'worsening' o 'stable' entre dos periodos { opportunities, firstTryErrors }. */
export function compareRates(early, recent) {
  const n1 = early.opportunities;
  const n2 = recent.opportunities;
  const diff = recent.firstTryErrors / n2 - early.firstTryErrors / n1;
  const pooled = (early.firstTryErrors + recent.firstTryErrors) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0 || Math.abs(diff) < MIN_RATE_CHANGE || Math.abs(diff / se) < Z_THRESHOLD) return 'stable';
  return diff < 0 ? 'improving' : 'worsening';
}

function periodOf(parts) {
  const opportunities = parts.reduce((n, p) => n + p.opportunities, 0);
  const firstTryErrors = parts.reduce((n, p) => n + p.firstTryErrors, 0);
  return { opportunities, firstTryErrors, sessions: parts.length, rate: opportunities ? firstTryErrors / opportunities : 0 };
}

// Corte entre sesiones que deja dos periodos con oportunidades más parecidas.
function balancedCut(parts) {
  const total = parts.reduce((n, p) => n + p.opportunities, 0);
  let best = 1;
  let acc = 0;
  for (let i = 1; i < parts.length; i++) {
    acc += parts[i - 1].opportunities;
    const bestAcc = parts.slice(0, best).reduce((n, p) => n + p.opportunities, 0);
    if (Math.abs(total - 2 * acc) < Math.abs(total - 2 * bestAcc)) best = i;
  }
  return best;
}

/** Primeras prácticas frente a las más recientes de un carácter. */
export function charEvolution(entries, char) {
  const parts = entries.map((e) => e.summary.chars.find((c) => c.char === char)).filter(Boolean);
  if (parts.length < 2) return { status: 'insufficient', early: null, recent: null };
  const cut = balancedCut(parts);
  const early = periodOf(parts.slice(0, cut));
  const recent = periodOf(parts.slice(cut));
  const enough = early.opportunities >= MIN_PERIOD_OPPORTUNITIES && recent.opportunities >= MIN_PERIOD_OPPORTUNITIES;
  return { status: enough ? compareRates(early, recent) : 'insufficient', early, recent };
}

/** Confusiones sumadas de todas las sesiones, de más a menos frecuentes. */
export function aggregateConfusions(entries) {
  const pairs = new Map();
  for (const { summary } of entries) {
    for (const c of summary.confusions) {
      const key = c.expected + c.typed;
      const p = pairs.get(key) ?? { expected: c.expected, typed: c.typed, count: 0, sessions: 0 };
      pairs.set(key, { ...p, count: p.count + c.count, sessions: p.sessions + 1 });
    }
  }
  return [...pairs.values()].sort((a, b) => b.count - a.count || (a.expected + a.typed < b.expected + b.typed ? -1 : 1));
}

// Cada carácter con su muestra, si es recurrente y su evolución.
function describeChars(entries, totals, averageRate) {
  return [...totals.values()].map((t) => {
    const sufficient = t.opportunities >= MIN_TREND_OPPORTUNITIES && t.sessions >= MIN_TREND_SESSIONS;
    const recurrent = sufficient && t.rate >= RECURRENT_MIN_RATE && t.rate >= RECURRENT_RELATIVE * averageRate;
    return { ...t, sufficient, recurrent, evolution: charEvolution(entries, t.char) };
  }).sort((a, b) => b.rate - a.rate || b.firstTryErrors - a.firstTryErrors || (a.char < b.char ? -1 : 1));
}

const change = (c) => c.evolution.recent.rate - c.evolution.early.rate;

// Necesitan atención: primero las que empeoran (más subida primero), después las
// recurrentes que no mejoran (tasa más alta primero).
function attentionList(chars) {
  const worsening = chars.filter((c) => c.evolution.status === 'worsening')
    .sort((a, b) => change(b) - change(a)).map((c) => ({ ...c, reason: 'worsening' }));
  const high = chars.filter((c) => c.recurrent && !['worsening', 'improving'].includes(c.evolution.status))
    .map((c) => ({ ...c, reason: 'high' }));
  return [...worsening, ...high].slice(0, MAX_LISTED);
}

/**
 * Informe «Mi evolución». status: 'empty' (ninguna sesión con diagnóstico),
 * 'insufficient' (ningún carácter con muestra suficiente) u 'ok'.
 */
export function analyzeTrends(sessions) {
  const { entries, withoutDiagnosis } = collectAnalyses(sessions);
  const totals = aggregateChars(entries);
  const opportunities = [...totals.values()].reduce((n, t) => n + t.opportunities, 0);
  const firstTryErrors = [...totals.values()].reduce((n, t) => n + t.firstTryErrors, 0);
  const averageRate = opportunities ? firstTryErrors / opportunities : 0;
  const chars = describeChars(entries, totals, averageRate);
  const sufficient = chars.filter((c) => c.sufficient);
  const status = entries.length === 0 ? 'empty' : sufficient.length === 0 ? 'insufficient' : 'ok';
  return {
    status,
    sessionsAnalyzed: entries.length,
    sessionsWithoutDiagnosis: withoutDiagnosis,
    charsAnalyzed: chars.length,
    opportunities,
    firstTryErrors,
    averageRate,
    chars,
    recurrent: chars.filter((c) => c.recurrent).slice(0, MAX_LISTED),
    improving: chars.filter((c) => c.evolution.status === 'improving')
      .sort((a, b) => change(a) - change(b)).slice(0, MAX_LISTED),
    attention: attentionList(chars),
    confusions: aggregateConfusions(entries).filter((c) => c.count >= MIN_CONFUSION_TOTAL).slice(0, MAX_LISTED),
  };
}
