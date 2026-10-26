// Evolución de las dificultades a lo largo de varias sesiones (T12). Agrega los
// diagnósticos de T11 ya guardados en el Historial; no guarda nada nuevo.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_TREND_OPPORTUNITIES,
  MIN_TREND_SESSIONS,
  MIN_PERIOD_OPPORTUNITIES,
  collectAnalyses,
  aggregateChars,
  compareRates,
  charEvolution,
  aggregateConfusions,
  analyzeTrends,
} from '../js/typing-trends.js';

// Registro de historial con un diagnóstico en el formato guardado de T11.
// chars: { 'ñ': [oportunidades, fallos], … }; confusions: [['ñ', 'l', 2], …].
let counter = 0;
function session(day, chars = {}, confusions = [], { hour = 10 } = {}) {
  counter++;
  const packed = Object.entries(chars).map(([c, [opp, fails]]) => [c, opp, fails, opp + fails, fails, fails]);
  return {
    id: `s${counter}`,
    finishedAt: `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    wpm: 20, accuracy: 90, elapsedMs: 60000, errors: 0, mode: 'free', exercise: 'a-der-j',
    analysis: { version: 1, chars: packed, confusions },
  };
}
const oldSession = (day) => {
  const s = session(day);
  delete s.analysis;
  return s;
};
const char = (report, c) => report.chars.find((x) => x.char === c);

describe('collectAnalyses: qué sesiones cuentan', () => {
  it('ignora sesiones antiguas (sin diagnóstico) y diagnósticos corruptos, sin lanzar', () => {
    const corrupt = { ...session(3), analysis: { version: 1, chars: [['ñ', 1, 9, 1, 1, 0]], confusions: [] } };
    const { entries, withoutDiagnosis } = collectAnalyses([oldSession(1), session(2, { a: [5, 1] }), corrupt, null]);
    assert.equal(entries.length, 1);
    assert.equal(withoutDiagnosis, 3);
  });

  it('ordena cronológicamente aunque el Historial llegue desordenado', () => {
    const { entries } = collectAnalyses([session(9, { a: [1, 0] }), session(2, { b: [1, 0] }), session(5, { c: [1, 0] })]);
    assert.deepEqual(entries.map((e) => e.summary.chars[0].char), ['b', 'c', 'a']);
  });

  it('con fechas iguales conserva el orden de guardado (determinista)', () => {
    const { entries } = collectAnalyses([session(4, { x: [1, 0] }), session(4, { y: [1, 0] }), session(4, { z: [1, 0] })]);
    assert.deepEqual(entries.map((e) => e.summary.chars[0].char), ['x', 'y', 'z']);
  });
});

describe('aggregateChars: suma ponderada (agregación)', () => {
  it('suma oportunidades y fallos de varias sesiones', () => {
    const { entries } = collectAnalyses([session(1, { a: [10, 2] }), session(2, { a: [30, 3] })]);
    const a = aggregateChars(entries).get('a');
    assert.equal(a.opportunities, 40);
    assert.equal(a.firstTryErrors, 5);
    assert.equal(a.sessions, 2);
  });

  it('tasa acumulada = Σ fallos / Σ oportunidades, NO el promedio de las tasas', () => {
    const { entries } = collectAnalyses([session(1, { ñ: [2, 1] }), session(2, { ñ: [18, 2] })]);
    const ene = aggregateChars(entries).get('ñ');
    assert.equal(ene.rate, 3 / 20); // 15 %, no (50 % + 11,1 %) / 2
  });

  it('caracteres presentes en unas sesiones y ausentes en otras', () => {
    const { entries } = collectAnalyses([session(1, { a: [5, 1], b: [4, 0] }), session(2, { a: [6, 0] })]);
    const totals = aggregateChars(entries);
    assert.equal(totals.get('a').sessions, 2);
    assert.equal(totals.get('b').sessions, 1);
    assert.equal(totals.get('b').opportunities, 4);
  });
});

describe('compareRates: mejora, empeoramiento o sin cambios claros', () => {
  it('mejora real con muestras comparables (40 % → 11,4 %)', () => {
    assert.equal(compareRates({ opportunities: 30, firstTryErrors: 12 }, { opportunities: 35, firstTryErrors: 4 }), 'improving');
  });

  it('empeoramiento', () => {
    assert.equal(compareRates({ opportunities: 40, firstTryErrors: 2 }, { opportunities: 40, firstTryErrors: 12 }), 'worsening');
  });

  it('diferencias pequeñas o con poca muestra: sin cambios claros', () => {
    assert.equal(compareRates({ opportunities: 40, firstTryErrors: 4 }, { opportunities: 40, firstTryErrors: 3 }), 'stable');
    assert.equal(compareRates({ opportunities: 16, firstTryErrors: 3 }, { opportunities: 16, firstTryErrors: 1 }), 'stable');
    assert.equal(compareRates({ opportunities: 50, firstTryErrors: 0 }, { opportunities: 50, firstTryErrors: 0 }), 'stable');
  });
});

describe('charEvolution: primeras prácticas frente a las más recientes', () => {
  it('divide por oportunidades en dos periodos cronológicos y muestra su respaldo', () => {
    const { entries } = collectAnalyses([
      session(1, { ñ: [15, 6] }), session(2, { ñ: [15, 6] }), session(3, { ñ: [20, 2] }), session(4, { ñ: [15, 2] }),
    ]);
    const evolution = charEvolution(entries, 'ñ');
    assert.deepEqual(evolution.early, { opportunities: 30, firstTryErrors: 12, sessions: 2, rate: 0.4 });
    assert.deepEqual(evolution.recent, { opportunities: 35, firstTryErrors: 4, sessions: 2, rate: 4 / 35 });
    assert.equal(evolution.status, 'improving');
  });

  it(`con menos de ${MIN_PERIOD_OPPORTUNITIES} oportunidades en algún periodo: datos insuficientes`, () => {
    const { entries } = collectAnalyses([session(1, { ñ: [8, 4] }), session(2, { ñ: [8, 0] })]);
    assert.equal(charEvolution(entries, 'ñ').status, 'insufficient');
  });

  it('una sola sesión no permite hablar de evolución', () => {
    const { entries } = collectAnalyses([session(1, { ñ: [200, 40] })]);
    assert.equal(charEvolution(entries, 'ñ').status, 'insufficient');
  });
});

describe('aggregateConfusions', () => {
  it('suma las confusiones de todas las sesiones y cuenta en cuántas aparecen', () => {
    const { entries } = collectAnalyses([
      session(1, { ñ: [5, 2] }, [['ñ', 'l', 2]]), session(2, { ñ: [5, 4] }, [['ñ', 'l', 3], ['ñ', 'n', 1]]),
    ]);
    assert.deepEqual(aggregateConfusions(entries), [
      { expected: 'ñ', typed: 'l', count: 5, sessions: 2 }, { expected: 'ñ', typed: 'n', count: 1, sessions: 1 },
    ]);
  });
});

describe('analyzeTrends: informe «Mi evolución»', () => {
  // Tres sesiones con la ñ claramente peor que la media y la a casi sin fallos.
  const history = [
    session(1, { ñ: [10, 5], a: [40, 1] }), session(2, { ñ: [10, 4], a: [40, 1] }), session(3, { ñ: [10, 4], a: [40, 0] }),
  ];

  it('sin diagnósticos (solo sesiones antiguas): estado vacío, nunca «sin errores»', () => {
    const report = analyzeTrends([oldSession(1), oldSession(2)]);
    assert.equal(report.status, 'empty');
    assert.equal(report.sessionsWithoutDiagnosis, 2);
    assert.deepEqual(report.recurrent, []);
  });

  it(`muestra mínima: ${MIN_TREND_OPPORTUNITIES} oportunidades en ${MIN_TREND_SESSIONS} sesiones`, () => {
    const few = analyzeTrends([session(1, { ñ: [30, 15] }), session(2, { ñ: [30, 15] })]);
    assert.equal(few.status, 'insufficient');
    assert.equal(char(few, 'ñ').sufficient, false, 'mucha muestra pero en solo 2 sesiones');
    const report = analyzeTrends(history);
    assert.equal(char(report, 'ñ').sufficient, true);
  });

  it('dificultad recurrente: tasa alta Y claramente por encima de la media, no muchos errores absolutos', () => {
    const report = analyzeTrends(history);
    assert.deepEqual(report.recurrent.map((c) => c.char), ['ñ']);
    assert.equal(char(report, 'a').recurrent, false, 'muy practicada y con pocos fallos');
    // Muchos fallos absolutos pero tasa baja: no es recurrente.
    const busy = analyzeTrends([1, 2, 3].map((d) => session(d, { e: [400, 20], o: [30, 1] })));
    assert.equal(char(busy, 'e').recurrent, false);
  });

  it('resumen: sesiones con diagnóstico, caracteres y oportunidades acumuladas', () => {
    const report = analyzeTrends([oldSession(0), ...history]);
    assert.equal(report.sessionsAnalyzed, 3);
    assert.equal(report.sessionsWithoutDiagnosis, 1);
    assert.equal(report.charsAnalyzed, 2);
    assert.equal(report.opportunities, 150);
  });

  it('en mejora y necesitan atención (empeora, o sigue alta sin mejorar)', () => {
    // «a», muy practicada y sin fallos, sitúa la media en un nivel realista (12 %).
    const report = analyzeTrends([
      session(1, { ñ: [15, 6], d: [15, 1], k: [20, 6], a: [60, 0] }),
      session(2, { ñ: [15, 6], d: [15, 1], k: [20, 6], a: [60, 0] }),
      session(3, { ñ: [20, 2], d: [20, 7], k: [20, 6], a: [60, 0] }),
      session(4, { ñ: [15, 2], d: [15, 6], k: [20, 6], a: [60, 0] }),
    ]);
    assert.deepEqual(report.improving.map((c) => c.char), ['ñ']);
    assert.deepEqual(report.attention.map((c) => [c.char, c.reason]), [['d', 'worsening'], ['k', 'high']]);
  });

  it('confusiones relevantes solo si se repiten', () => {
    const report = analyzeTrends([
      session(1, { ñ: [10, 2] }, [['ñ', 'l', 2]]), session(2, { ñ: [10, 3] }, [['ñ', 'l', 2], ['ñ', 'n', 1]]),
    ]);
    assert.deepEqual(report.confusions, [{ expected: 'ñ', typed: 'l', count: 4, sessions: 2 }]);
  });

  it('límites: 500 sesiones con el diagnóstico máximo se analizan rápido y con listas acotadas', () => {
    const pool = [...'abcdefghijklmnñopqrstuvwxyzABCDEFGHIJKLMNÑOPQRSTUVWXYZáéíóú0123456'].slice(0, 64);
    const big = Array.from({ length: 500 }, (_, i) => session(1 + (i % 28), Object.fromEntries(pool.map((c, j) => [c, [50, (i + j) % 9]]))));
    const start = performance.now();
    const report = analyzeTrends(big);
    assert.ok(performance.now() - start < 1500);
    assert.ok(report.recurrent.length <= 5 && report.improving.length <= 5 && report.attention.length <= 5);
    assert.equal(report.chars.length, 64);
  });
});
