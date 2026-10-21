import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusInfo,
  formatAccuracyFloor,
  formatGoals,
  formatObjectiveResults,
  formatLessonCount,
} from '../js/course-ui.js';
import { EXERCISE_STATUS } from '../js/progress.js';
import { evaluateObjectives } from '../js/objectives.js';

describe('statusInfo', () => {
  it('cada estado tiene etiqueta e icono además del color (clase)', () => {
    const expected = {
      [EXERCISE_STATUS.NOT_STARTED]: 'No realizado',
      [EXERCISE_STATUS.SKIPPED]: 'Saltado',
      [EXERCISE_STATUS.COMPLETED]: 'Terminado',
      [EXERCISE_STATUS.PASSED]: 'Objetivo superado',
    };
    const icons = new Set();
    for (const [status, label] of Object.entries(expected)) {
      const info = statusInfo(status);
      assert.equal(info.label, label);
      assert.equal(info.className, `status-${status}`);
      assert.ok(info.icon.length > 0);
      icons.add(info.icon);
    }
    assert.equal(icons.size, 4, 'iconos distintos');
  });

  it('un estado desconocido se muestra como no realizado', () => {
    assert.equal(statusInfo('otro').label, 'No realizado');
  });
});

describe('formatAccuracyFloor', () => {
  it('trunca a un decimal para no redondear hacia el objetivo', () => {
    assert.equal(formatAccuracyFloor(94.96), '94,9 %');
    assert.equal(formatAccuracyFloor(90), '90 %');
    assert.equal(formatAccuracyFloor(100), '100 %');
  });
});

describe('formatGoals', () => {
  it('describe los dos objetivos', () => {
    assert.equal(formatGoals({ targetAccuracy: 92, targetWpm: 22 }), 'Objetivos: 92 % de precisión y 22 WPM');
  });

  it('indica cuándo la velocidad no se evalúa', () => {
    assert.equal(formatGoals({ targetAccuracy: 85, targetWpm: null }),
      'Objetivo: 85 % de precisión (la velocidad no se evalúa en textos breves)');
  });
});

describe('formatObjectiveResults', () => {
  const goals = { targetAccuracy: 90, targetWpm: 20 };
  const results = (accuracy, wpm, elapsedMs = 30_000, g = goals) =>
    formatObjectiveResults(evaluateObjectives({ accuracy, wpm, elapsedMs }, g));
  const states = (r) => r.items.map((item) => item.state);

  it('ambos objetivos cumplidos', () => {
    const r = results(96.4, 25.8);
    assert.equal(r.passed, true);
    assert.equal(r.title, 'Objetivo superado');
    assert.deepEqual(states(r), ['met', 'met']);
    assert.deepEqual(r.items.map((i) => i.text), [
      'Precisión 96,4 % (mínimo 90 %): cumplido',
      'Velocidad 25 WPM (mínimo 20 WPM): cumplido',
    ]);
  });

  it('precisión cumplida y velocidad pendiente', () => {
    const r = results(95, 15.9);
    assert.equal(r.passed, false);
    assert.equal(r.title, 'Ejercicio terminado, objetivo pendiente');
    assert.deepEqual(states(r), ['met', 'pending']);
    assert.equal(r.items[1].text, 'Velocidad 15 WPM (mínimo 20 WPM): pendiente');
  });

  it('velocidad cumplida y precisión pendiente (sin redondear hacia el objetivo)', () => {
    const r = results(89.99, 30);
    assert.deepEqual(states(r), ['pending', 'met']);
    assert.equal(r.items[0].text, 'Precisión 89,9 % (mínimo 90 %): pendiente');
  });

  it('las WPM no se redondean hacia el objetivo', () => {
    assert.equal(results(95, 19.99).items[1].state, 'pending');
    assert.match(results(95, 19.99).items[1].text, /^Velocidad 19 WPM/);
  });

  it('velocidad no aplicable en ejercicios breves', () => {
    const r = results(95, 0, 500, { targetAccuracy: 85, targetWpm: null });
    assert.equal(r.passed, true);
    assert.deepEqual(states(r), ['met', 'not-applicable']);
    assert.equal(r.items[1].text, 'Velocidad: no se evalúa en este ejercicio breve');
  });

  it('velocidad no fiable por un tiempo demasiado corto', () => {
    const r = results(100, 600, 300);
    assert.equal(r.passed, false);
    assert.deepEqual(states(r), ['met', 'unreliable']);
    assert.match(r.items[1].text, /demasiado corto/);
  });

  it('cada resultado tiene un icono, no solo color', () => {
    for (const item of results(95, 15.9).items) assert.ok(item.icon.length > 0);
  });
});

describe('formatLessonCount', () => {
  it('cuenta lecciones (tarjetas de la Biblioteca) en singular y plural', () => {
    assert.equal(formatLessonCount(13), '13 lecciones');
    assert.equal(formatLessonCount(1), '1 lección');
    assert.equal(formatLessonCount(0), 'Ninguna lección coincide con la búsqueda');
  });
});
