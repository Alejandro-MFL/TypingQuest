import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareWithReference,
  describeComparison,
  SPEED_STABLE_MIN_CPM,
  ACCURACY_STABLE_POINTS,
} from '../js/session-compare.js';

// Registros como los de storage.js: velocidad guardada en WPM (PPM = WPM × 5).
let counter = 0;
function record(overrides = {}) {
  counter += 1;
  return {
    id: `r${counter}`,
    finishedAt: `2026-11-0${Math.min(counter, 9)}T10:00:00.000Z`,
    wpm: 20,
    accuracy: 95,
    elapsedMs: 30_000,
    errors: 2,
    mode: 'free',
    exercise: 'a-der-j',
    ...overrides,
  };
}

// Compara `current` con el historial ya guardado (que incluye la partida actual).
function compare(previous, current, options) {
  return compareWithReference({ sessions: [...previous, current], current, ...options });
}

describe('compareWithReference: referencia comparable', () => {
  it('primera sesión del ejercicio: primera referencia disponible, sin tendencias', () => {
    const result = compare([], record());
    assert.equal(result.status, 'first');
    assert.equal(result.speed, undefined);
  });

  it('solo compara con el MISMO ejercicio y el MISMO modo', () => {
    const otherExercise = record({ exercise: 'a-der-j-ampliada', wpm: 5 });
    const otherMode = record({ mode: 'strict', wpm: 5 });
    assert.equal(compare([otherExercise, otherMode], record()).status, 'first');
  });

  it('usa el intento anterior más reciente de ese ejercicio y modo', () => {
    const older = record({ wpm: 10 });
    const newer = record({ wpm: 18 });
    const result = compare([older, newer, record({ exercise: 'otro' })], record({ wpm: 20 }));
    assert.equal(result.status, 'compared');
    assert.equal(result.reference.id, newer.id);
    assert.equal(result.speed.delta, 10); // 100 − 90 PPM
  });

  it('no se compara consigo misma aunque el historial ya la incluya', () => {
    const current = record();
    assert.equal(compareWithReference({ sessions: [current], current }).status, 'first');
  });

  it('práctica libre (texto personalizado): no comparable, los textos cambian', () => {
    const previous = record({ exercise: 'custom-text' });
    const result = compare([previous], record({ exercise: 'custom-text' }));
    assert.equal(result.status, 'not-comparable');
  });

  it('sin historial disponible: información insuficiente, sin inventar nada', () => {
    const result = compare([record()], record(), { historyAvailable: false });
    assert.equal(result.status, 'unavailable');
  });

  it('ignora referencias con datos no válidos', () => {
    const broken = record({ wpm: NaN, accuracy: 'x' });
    assert.equal(compare([broken], record()).status, 'first');
  });
});

describe('compareWithReference: tendencias', () => {
  it('mejora de velocidad (precisión estable)', () => {
    const result = compare([record({ wpm: 20, accuracy: 95 })], record({ wpm: 24, accuracy: 95.4 }));
    assert.equal(result.speed.trend, 'up');
    assert.equal(result.speed.delta, 20);
    assert.equal(result.accuracy.trend, 'same');
    assert.equal(result.verdict, 'improved');
  });

  it('mejora de precisión (velocidad estable)', () => {
    const result = compare([record({ accuracy: 92.5 })], record({ accuracy: 94.8 }));
    assert.equal(result.accuracy.trend, 'up');
    assert.ok(Math.abs(result.accuracy.delta - 2.3) < 1e-9);
    assert.equal(result.speed.trend, 'same');
    assert.equal(result.verdict, 'improved');
  });

  it('mejora en ambas', () => {
    const result = compare([record({ wpm: 20, accuracy: 90 })], record({ wpm: 25, accuracy: 95 }));
    assert.equal(result.verdict, 'improved');
  });

  it('empeoramiento', () => {
    const result = compare([record({ wpm: 25, accuracy: 97 })], record({ wpm: 20, accuracy: 93 }));
    assert.equal(result.speed.trend, 'down');
    assert.equal(result.accuracy.trend, 'down');
    assert.equal(result.verdict, 'declined');
  });

  it('resultado mixto: más rápido pero menos preciso (la velocidad no compensa)', () => {
    const result = compare([record({ wpm: 20, accuracy: 97 })], record({ wpm: 26, accuracy: 92 }));
    assert.equal(result.verdict, 'mixed');
  });

  it('rendimiento estable con diferencias pequeñas', () => {
    const result = compare([record({ wpm: 20, accuracy: 95 })], record({ wpm: 20.6, accuracy: 95.5 }));
    assert.equal(result.speed.delta, 3);
    assert.equal(result.speed.trend, 'same');
    assert.equal(result.accuracy.trend, 'same');
    assert.equal(result.verdict, 'stable');
  });

  it('umbrales: velocidad ≥ 5 PPM (o 5 % de la referencia) y precisión ≥ 1 punto', () => {
    assert.equal(SPEED_STABLE_MIN_CPM, 5);
    assert.equal(ACCURACY_STABLE_POINTS, 1);
    assert.equal(compare([record({ wpm: 20 })], record({ wpm: 21 })).speed.trend, 'up'); // +5 PPM
    // Con 300 PPM de referencia hacen falta 15 (5 %).
    assert.equal(compare([record({ wpm: 60 })], record({ wpm: 62 })).speed.trend, 'same'); // +10
    assert.equal(compare([record({ wpm: 60 })], record({ wpm: 63 })).speed.trend, 'up'); // +15
    assert.equal(compare([record({ accuracy: 95 })], record({ accuracy: 96 })).accuracy.trend, 'up');
  });

  it('medición demasiado corta: la velocidad no se compara, la precisión sí', () => {
    const result = compare([record({ wpm: 20, accuracy: 90 })], record({ wpm: 40, accuracy: 95, elapsedMs: 2000 }));
    assert.equal(result.speed.trend, 'unreliable');
    assert.equal(result.accuracy.trend, 'up');
    assert.equal(result.verdict, 'improved');
  });
});

describe('describeComparison', () => {
  const formatDate = () => '03/11/2026, 10:00';

  it('primera referencia', () => {
    const view = describeComparison(compare([], record()), { formatDate });
    assert.equal(view.title, 'Primera referencia disponible');
    assert.equal(view.lines.length, 0);
    assert.match(view.note, /próxima vez/);
  });

  it('no comparable y no disponible', () => {
    const custom = describeComparison(compare([], record({ exercise: 'custom-text' })), { formatDate });
    assert.equal(custom.title, 'Sin comparación');
    const off = describeComparison(compare([], record(), { historyAvailable: false }), { formatDate });
    assert.equal(off.title, 'Sin comparación');
    assert.match(off.note, /historial/);
  });

  it('valores exactos con signo, icono y palabra (no solo color)', () => {
    const result = compare([record({ wpm: 20, accuracy: 92.5 })], record({ wpm: 22.4, accuracy: 94.8 }));
    const view = describeComparison(result, { formatDate });
    assert.equal(view.title, 'Mejora en velocidad y precisión');
    assert.equal(view.icon, '↑');
    assert.deepEqual(view.lines, [
      { trend: 'up', icon: '↑', text: 'Velocidad: +12 PPM (de 100 a 112), mejora' },
      { trend: 'up', icon: '↑', text: 'Precisión: +2,3 puntos (de 92,5 % a 94,8 %), mejora' },
    ]);
    assert.equal(view.note, 'Comparado con tu intento anterior de este ejercicio en modo libre (03/11/2026, 10:00).');
  });

  it('empeoramiento con signo menos tipográfico', () => {
    const view = describeComparison(compare([record({ wpm: 25, accuracy: 97 })], record({ wpm: 20, accuracy: 93 })), { formatDate });
    assert.equal(view.title, 'Peor que tu intento anterior en velocidad y precisión');
    assert.equal(view.lines[0].text, 'Velocidad: −25 PPM (de 125 a 100), empeora');
    assert.equal(view.lines[1].text, 'Precisión: −4,0 puntos (de 97,0 % a 93,0 %), empeora');
  });

  it('mixto: explica que la precisión va primero', () => {
    const view = describeComparison(compare([record({ wpm: 20, accuracy: 97 })], record({ wpm: 26, accuracy: 92 })), { formatDate });
    assert.equal(view.title, 'Resultado mixto');
    assert.match(view.advice, /más rápido.*menos precisión/i);
  });

  it('estable y velocidad no fiable', () => {
    const stable = describeComparison(compare([record()], record({ wpm: 20.2 })), { formatDate });
    assert.equal(stable.title, 'Rendimiento estable');
    assert.equal(stable.lines[0].text, 'Velocidad: +1 PPM (de 100 a 101), sin cambios claros');
    const short = describeComparison(compare([record()], record({ elapsedMs: 1000 })), { formatDate });
    assert.equal(short.lines[0].text, 'Velocidad: no se compara (medición demasiado corta)');
  });

  it('una sola métrica mejora: título específico', () => {
    const speed = describeComparison(compare([record({ wpm: 20 })], record({ wpm: 24 })), { formatDate });
    assert.equal(speed.title, 'Mejora de velocidad');
    const accuracy = describeComparison(compare([record({ accuracy: 90 })], record({ accuracy: 93 })), { formatDate });
    assert.equal(accuracy.title, 'Mejora de precisión');
  });
});
