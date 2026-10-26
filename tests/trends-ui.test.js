// Textos de «Mi evolución» (T12): helpers puros de js/trends-ui.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPercent,
  failCount,
  statusText,
  summaryText,
  recurrentText,
  evolutionText,
  confusionText,
  trendLabel,
  EVOLUTION_DEFINITIONS,
} from '../js/trends-ui.js';
import { MIN_TREND_OPPORTUNITIES, MIN_TREND_SESSIONS } from '../js/typing-trends.js';

const period = (opportunities, firstTryErrors) => ({ opportunities, firstTryErrors, sessions: 2, rate: firstTryErrors / opportunities });
const charReport = (char, opp, fails, sessions, evolution) => ({
  char, opportunities: opp, firstTryErrors: fails, sessions, rate: fails / opp, evolution,
});

describe('formatPercent y failCount', () => {
  it('un decimal con coma, sin «,0»', () => {
    assert.equal(formatPercent(4 / 35), '11,4 %');
    assert.equal(formatPercent(0.4), '40 %');
    assert.equal(formatPercent(0), '0 %');
  });

  it('siempre con el denominador que respalda la tasa', () => {
    assert.equal(failCount(12, 30), '12 de 30 veces (40 %)');
  });
});

describe('statusText', () => {
  it('estado vacío útil: qué hacer para ver la evolución', () => {
    assert.match(statusText({ status: 'empty', sessionsAnalyzed: 0 }), /Termina algunas prácticas/);
  });

  it('datos insuficientes: explica la muestra mínima', () => {
    const text = statusText({ status: 'insufficient', sessionsAnalyzed: 2 });
    assert.match(text, new RegExp(`${MIN_TREND_OPPORTUNITIES} oportunidades`));
    assert.match(text, new RegExp(`${MIN_TREND_SESSIONS} sesiones`));
    assert.match(text, /2 sesiones con diagnóstico/);
  });

  it('con datos: sin mensaje de estado', () => {
    assert.equal(statusText({ status: 'ok', sessionsAnalyzed: 5 }), '');
  });
});

describe('summaryText', () => {
  it('sesiones, caracteres y oportunidades; las antiguas se mencionan aparte', () => {
    assert.equal(
      summaryText({ sessionsAnalyzed: 12, sessionsWithoutDiagnosis: 3, charsAnalyzed: 25, opportunities: 1430 }),
      '12 sesiones con diagnóstico: 25 caracteres y 1430 oportunidades. '
        + 'No cuentan 3 sesiones sin diagnóstico válido (las anteriores a esta función o con datos dañados).',
    );
    assert.equal(
      summaryText({ sessionsAnalyzed: 1, sessionsWithoutDiagnosis: 0, charsAnalyzed: 1, opportunities: 1 }),
      '1 sesión con diagnóstico: 1 carácter y 1 oportunidad.',
    );
  });
});

describe('textos por carácter', () => {
  it('dificultad recurrente', () => {
    assert.equal(recurrentText(charReport('ñ', 30, 13, 3)), '«ñ»: fallas 13 de 30 veces (43,3 %) en 3 sesiones.');
  });

  it('una dificultad recurrente indica también su evolución (puede estar mejorando)', () => {
    const c = charReport('ñ', 65, 15, 6, { status: 'improving', early: period(30, 12), recent: period(35, 3) });
    assert.equal(recurrentText(c), '«ñ»: fallas 15 de 65 veces (23,1 %) en 6 sesiones. Evolución: ↓ Mejora.');
    const unknown = charReport('ñ', 30, 13, 3, { status: 'insufficient', early: null, recent: null });
    assert.equal(recurrentText(unknown), '«ñ»: fallas 13 de 30 veces (43,3 %) en 3 sesiones.');
  });

  it('mejora: primeras frente a recientes, con la cautela «parece»', () => {
    const c = charReport('ñ', 65, 16, 4, { status: 'improving', early: period(30, 12), recent: period(35, 4) });
    assert.equal(evolutionText(c),
      '«ñ»: en tus primeras prácticas fallaste 12 de 30 veces (40 %); en las más recientes, '
        + '4 de 35 veces (11,4 %). Parece que estás mejorando.');
  });

  it('empeora y «sigue alta» sin lenguaje alarmista', () => {
    const worse = charReport('d', 65, 15, 4, { status: 'worsening', early: period(30, 2), recent: period(35, 13) });
    assert.match(evolutionText(worse), /Parece que te está costando más que antes\.$/);
    const high = charReport('k', 80, 24, 4, { status: 'stable', early: period(40, 12), recent: period(40, 12) });
    assert.equal(evolutionText(high, 'high'), '«k»: sigue alta, 24 de 80 veces (30 %), sin cambios claros.');
  });

  it('confusiones acumuladas', () => {
    assert.equal(confusionText({ expected: 'ñ', typed: 'l', count: 7, sessions: 3 }),
      'Esperabas «ñ» y escribiste «l»: 7 veces (en 3 sesiones).');
  });

  it('etiqueta de evolución con símbolo y texto (no solo color)', () => {
    assert.equal(trendLabel('improving'), '↓ Mejora');
    assert.equal(trendLabel('worsening'), '↑ Empeora');
    assert.equal(trendLabel('stable'), '→ Sin cambios claros');
    assert.equal(trendLabel('insufficient'), '· Datos insuficientes');
  });
});

describe('EVOLUTION_DEFINITIONS', () => {
  it('explica tasa de fallo, muestra mínima, mejora y la limitación de dificultad', () => {
    const text = EVOLUTION_DEFINITIONS.join(' ');
    assert.match(text, /Tasa de fallo: porcentaje de veces que no escribiste correctamente una letra al primer intento/);
    assert.match(text, new RegExp(`${MIN_TREND_OPPORTUNITIES} oportunidades`));
    assert.match(text, /más difíciles/);
  });
});
