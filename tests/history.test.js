import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeHistory,
  chartScaleMax,
  chartPoints,
  accuracyScale,
  accuracyAxis,
  speedScale,
  speedAxis,
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
  // T8: la descripción sustituye al listado de Resultados, así que incluye la tendencia.
  it('resume una serie con su tendencia para lectores de pantalla', () => {
    assert.equal(
      describeSeries('WPM', [30.4, 45.6, 41.2]),
      'WPM en las últimas 3 sesiones: sube de 30 a 41 (mínimo 30, máximo 46).'
    );
  });

  it('indica si la serie baja o se mantiene', () => {
    assert.match(describeSeries('WPM', [50, 40]), /: baja de 50 a 40 /);
    assert.match(describeSeries('WPM', [40.2, 39.8]), /: se mantiene en 40 /);
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

// Experimento 01: escala vertical de la precisión adaptada a los datos.
describe('accuracyScale', () => {
  const span = ({ min, max }) => max - min;

  it('ajusta la escala a los datos con un pequeño margen (90-98 %)', () => {
    const scale = accuracyScale([90, 94.5, 98]);
    assert.deepEqual(scale, { min: 88, max: 100, adjusted: true });
  });

  it('nunca supera 100 % ni baja de 0 %', () => {
    for (const values of [[99.9, 100], [0, 0.5], [0, 100], [100], [0]]) {
      const { min, max } = accuracyScale(values);
      assert.ok(min >= 0 && max <= 100 && min < max, `${values}: ${min}-${max}`);
    }
  });

  it('todos los valores idénticos: rango mínimo de 5 puntos centrado en el dato', () => {
    assert.deepEqual(accuracyScale([95, 95, 95]), { min: 92, max: 98, adjusted: true });
  });

  it('un único dato: mismo criterio que los valores idénticos', () => {
    assert.deepEqual(accuracyScale([95]), accuracyScale([95, 95]));
  });

  it('valores muy cercanos no se exageran: al menos 5 puntos de rango', () => {
    const scale = accuracyScale([96.1, 96.3]);
    assert.ok(span(scale) >= 5);
    assert.ok(scale.min <= 96.1 && scale.max >= 96.3);
  });

  it('precisión del 100 %: el máximo es 100 y el rango baja', () => {
    assert.deepEqual(accuracyScale([100, 100]), { min: 95, max: 100, adjusted: true });
  });

  it('valores cercanos al 0 %: la escala empieza en 0 (sin ajustar)', () => {
    assert.deepEqual(accuracyScale([0, 1]), { min: 0, max: 5, adjusted: false });
  });

  it('con datos muy dispersos vuelve a 0-100 %', () => {
    assert.deepEqual(accuracyScale([3, 99]), { min: 0, max: 100, adjusted: false });
  });

  it('ignora los datos no válidos y, sin ninguno válido, usa 0-100 %', () => {
    assert.deepEqual(accuracyScale([NaN, 'x', null, -5, 120, Infinity]), { min: 0, max: 100, adjusted: false });
    assert.deepEqual(accuracyScale([]), { min: 0, max: 100, adjusted: false });
    assert.deepEqual(accuracyScale([NaN, 95]), accuracyScale([95]));
  });

  it('los límites son enteros (etiquetas legibles) y contienen todos los datos', () => {
    const values = [91.37, 97.82, 93.05];
    const { min, max } = accuracyScale(values);
    assert.ok(Number.isInteger(min) && Number.isInteger(max));
    assert.ok(min <= Math.min(...values) && max >= Math.max(...values));
  });
});

describe('chartPoints con mínimo (escala ajustada)', () => {
  it('coloca el mínimo abajo y el máximo arriba sin alterar los valores', () => {
    const box = { width: 100, height: 50, minValue: 90, maxValue: 100 };
    assert.deepEqual(chartPoints([90, 95, 100], box), [
      { x: 0, y: 50 },
      { x: 50, y: 25 },
      { x: 100, y: 0 },
    ]);
  });

  it('limita al rango los valores fuera de la escala', () => {
    const box = { width: 100, height: 50, minValue: 90, maxValue: 100 };
    assert.deepEqual(chartPoints([80, 101], box), [{ x: 0, y: 50 }, { x: 100, y: 0 }]);
  });
});

// Experimento 01.1: la escala adaptativa SOLO en Resultados; el Historial vuelve a 0-100 %.
describe('accuracyAxis', () => {
  const values = [90, 94.5, 98];

  it('Historial (sin ajuste): la escala original de la rama estable, 0-100 % y sin nota', () => {
    assert.deepEqual(accuracyAxis(values, { adaptive: false }), { minValue: 0, maxValue: 100, scaleNote: '' });
    assert.deepEqual(accuracyAxis([], { adaptive: false }), { minValue: 0, maxValue: 100, scaleNote: '' });
  });

  it('por defecto no ajusta (las gráficas generales no cambian)', () => {
    assert.deepEqual(accuracyAxis(values), accuracyAxis(values, { adaptive: false }));
  });

  it('Resultados (ajustada): mínimo real con margen y nota visible', () => {
    assert.deepEqual(accuracyAxis(values, { adaptive: true }), {
      minValue: 88, maxValue: 100, scaleNote: 'Escala ajustada a los datos: de 88 % a 100 %.',
    });
  });

  it('ajustada con un dato o valores idénticos', () => {
    assert.deepEqual(accuracyAxis([95], { adaptive: true }).minValue, 92);
    assert.deepEqual(accuracyAxis([100, 100], { adaptive: true }), {
      minValue: 95, maxValue: 100, scaleNote: 'Escala ajustada a los datos: de 95 % a 100 %.',
    });
  });

  it('si el ajuste no sube el mínimo (datos cerca de 0 %), no hay nota', () => {
    assert.deepEqual(accuracyAxis([0, 1], { adaptive: true }), { minValue: 0, maxValue: 5, scaleNote: '' });
  });

  it('no modifica los porcentajes reales', () => {
    const data = [91.37, 97.82];
    accuracyAxis(data, { adaptive: true });
    assert.deepEqual(data, [91.37, 97.82]);
  });
});

// Experimento 01.2: escala de la velocidad (PPM) adaptada, SOLO en Resultados.
describe('speedScale', () => {
  it('ajusta la escala a los datos con un margen (150-175 PPM)', () => {
    assert.deepEqual(speedScale([150, 160, 175]), { min: 145, max: 180, adjusted: true });
  });

  it('un único valor o valores idénticos: rango mínimo de 20 PPM centrado', () => {
    assert.deepEqual(speedScale([150]), { min: 140, max: 160, adjusted: true });
    assert.deepEqual(speedScale([150, 150, 150]), speedScale([150]));
  });

  it('no exagera cambios pequeños en velocidades altas: rango mínimo del 10 % del máximo', () => {
    const { min, max } = speedScale([1000, 1005]);
    assert.ok(max - min >= 100, `${min}-${max}`);
    assert.ok(min <= 1000 && max >= 1005);
  });

  it('nunca baja de 0: con datos cerca de 0 empieza en 0 (sin ajustar)', () => {
    assert.deepEqual(speedScale([0, 5]), { min: 0, max: 20, adjusted: false });
    assert.deepEqual(speedScale([3]), { min: 0, max: 20, adjusted: false });
  });

  it('límites múltiplos de 5 (etiquetas legibles) que contienen todos los datos', () => {
    const values = [137.4, 161.9, 149.2];
    const { min, max } = speedScale(values);
    assert.equal(min % 5, 0);
    assert.equal(max % 5, 0);
    assert.ok(min <= Math.min(...values) && max >= Math.max(...values));
  });

  it('ignora los datos no válidos; sin ninguno, la escala por defecto 0-10', () => {
    assert.deepEqual(speedScale([NaN, null, -3, Infinity, 'x']), { min: 0, max: 10, adjusted: false });
    assert.deepEqual(speedScale([]), { min: 0, max: 10, adjusted: false });
    assert.deepEqual(speedScale([NaN, 150]), speedScale([150]));
  });
});

describe('speedAxis', () => {
  it('Historial (sin ajuste): la escala original, desde 0 hasta la decena superior', () => {
    assert.deepEqual(speedAxis([150, 175], { adaptive: false }), { minValue: 0, maxValue: 180, scaleNote: '' });
    assert.deepEqual(speedAxis([150, 175]), speedAxis([150, 175], { adaptive: false }));
  });

  it('Resultados (ajustada): mínimo real con margen y nota discreta en PPM', () => {
    assert.deepEqual(speedAxis([150, 160, 175], { adaptive: true }), {
      minValue: 145, maxValue: 180, scaleNote: 'Escala ajustada a los datos: de 145 a 180 PPM.',
    });
  });

  it('ajustada pero sin subir el mínimo: sin nota', () => {
    assert.deepEqual(speedAxis([0, 5], { adaptive: true }), { minValue: 0, maxValue: 20, scaleNote: '' });
  });

  it('no modifica las PPM reales', () => {
    const data = [151.3, 172.8];
    speedAxis(data, { adaptive: true });
    assert.deepEqual(data, [151.3, 172.8]);
  });
});
