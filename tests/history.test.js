import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeHistory,
  chartScaleMax,
  chartPoints,
  describeSeries,
  formatDateTime,
} from '../js/history.js';

function session(wpm, accuracy) {
  return { id: `${wpm}-${accuracy}`, finishedAt: '2026-10-21T10:30:00.000Z', wpm, accuracy };
}

describe('summarizeHistory', () => {
  it('resume el número de sesiones, el mejor WPM y la precisión media', () => {
    assert.deepEqual(summarizeHistory([session(30, 90), session(45.5, 100), session(40, 95)]), {
      count: 3,
      bestWpm: 45.5,
      averageAccuracy: 95,
    });
  });

  it('sin sesiones devuelve valores nulos, nunca NaN ni -Infinity', () => {
    assert.deepEqual(summarizeHistory([]), { count: 0, bestWpm: null, averageAccuracy: null });
  });
});

describe('chartScaleMax', () => {
  it('redondea el máximo hacia arriba a la decena', () => {
    assert.equal(chartScaleMax([12, 38.2, 20]), 40);
    assert.equal(chartScaleMax([40]), 40);
  });

  it('nunca es menor que 10', () => {
    assert.equal(chartScaleMax([0, 3]), 10);
    assert.equal(chartScaleMax([]), 10);
  });
});

describe('chartPoints', () => {
  const box = { width: 100, height: 50, maxValue: 100 };

  it('reparte los puntos en horizontal y escala los valores en vertical', () => {
    assert.deepEqual(chartPoints([0, 50, 100], box), [
      { x: 0, y: 50 },
      { x: 50, y: 25 },
      { x: 100, y: 0 },
    ]);
  });

  it('centra un único punto', () => {
    assert.deepEqual(chartPoints([50], box), [{ x: 50, y: 25 }]);
  });

  it('limita los valores al rango del gráfico', () => {
    assert.deepEqual(chartPoints([-10, 150], box), [{ x: 0, y: 50 }, { x: 100, y: 0 }]);
  });

  it('sin valores devuelve una lista vacía', () => {
    assert.deepEqual(chartPoints([], box), []);
  });
});

describe('describeSeries', () => {
  it('resume una serie para lectores de pantalla', () => {
    assert.equal(
      describeSeries('WPM', [30.4, 45.6, 41.2]),
      'WPM en las últimas 3 sesiones: mínimo 30, máximo 46, última 41.'
    );
  });

  it('usa el singular con una sesión', () => {
    assert.equal(describeSeries('Precisión (%)', [97]), 'Precisión (%) en la última sesión: 97.');
  });

  it('sin datos', () => {
    assert.equal(describeSeries('WPM', []), 'WPM: sin sesiones.');
  });
});

describe('formatDateTime', () => {
  it('formatea fecha y hora locales en español', () => {
    const iso = new Date(2026, 9, 21, 9, 5).toISOString();
    assert.equal(formatDateTime(iso), '21/10/2026, 09:05');
  });
});
