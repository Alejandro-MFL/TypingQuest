import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_WPM_TEXT_LENGTH,
  MIN_RELIABLE_WPM_MS,
  isWpmGoalAllowed,
  evaluateObjectives,
  practiceAdvice,
} from '../js/objectives.js';

const GOALS = { targetAccuracy: 90, targetWpm: 20 };
const evaluate = (accuracy, wpm, elapsedMs = 30_000, goals = GOALS) =>
  evaluateObjectives({ accuracy, wpm, elapsedMs }, goals);

describe('evaluateObjectives: ambos objetivos', () => {
  it('precisión alcanzada pero WPM insuficientes: no superado', () => {
    const result = evaluate(96, 15);
    assert.equal(result.accuracy.met, true);
    assert.equal(result.wpm.met, false);
    assert.equal(result.passed, false);
  });

  it('WPM alcanzadas pero precisión insuficiente: no superado', () => {
    const result = evaluate(85, 40);
    assert.equal(result.accuracy.met, false);
    assert.equal(result.wpm.met, true);
    assert.equal(result.passed, false);
  });

  it('ambos objetivos alcanzados: superado', () => {
    assert.equal(evaluate(90, 20).passed, true, 'los valores exactos cuentan como alcanzados');
    assert.equal(evaluate(99, 55).passed, true);
  });

  it('ninguno alcanzado', () => {
    const result = evaluate(50, 5);
    assert.deepEqual([result.accuracy.met, result.wpm.met, result.passed], [false, false, false]);
  });

  it('devuelve objetivos y valores medidos para mostrarlos', () => {
    assert.deepEqual(evaluate(96, 15), {
      accuracy: { target: 90, value: 96, met: true },
      wpm: { target: 20, value: 15, applicable: true, reliable: true, met: false },
      passed: false,
    });
  });
});

describe('evaluateObjectives: WPM no aplicable o no fiable', () => {
  it('sin objetivo de WPM (ejercicio breve) solo cuenta la precisión', () => {
    const goals = { targetAccuracy: 85, targetWpm: null };
    const result = evaluate(90, 0, 500, goals);
    assert.equal(result.wpm.applicable, false);
    assert.equal(result.wpm.met, false);
    assert.equal(result.passed, true);
    assert.equal(evaluate(80, 100, 30_000, goals).passed, false);
  });

  it('un tiempo cercano a cero no aprueba el objetivo de WPM (medición engañosa)', () => {
    const result = evaluate(100, 900, 400);
    assert.equal(result.wpm.reliable, false);
    assert.equal(result.wpm.met, false);
    assert.equal(result.passed, false);
  });

  it('a partir del tiempo mínimo la medición es fiable', () => {
    assert.equal(evaluate(100, 25, MIN_RELIABLE_WPM_MS).wpm.reliable, true);
    assert.equal(evaluate(100, 25, MIN_RELIABLE_WPM_MS - 1).wpm.reliable, false);
  });
});

describe('isWpmGoalAllowed', () => {
  it('los textos demasiado breves no admiten objetivo de WPM', () => {
    assert.equal(isWpmGoalAllowed('a'.repeat(MIN_WPM_TEXT_LENGTH - 1)), false);
    assert.equal(isWpmGoalAllowed('a'.repeat(MIN_WPM_TEXT_LENGTH)), true);
  });

  it('cuenta caracteres, no unidades UTF-16', () => {
    assert.equal(isWpmGoalAllowed('ñ'.normalize('NFD').repeat(MIN_WPM_TEXT_LENGTH - 1)), false);
  });

  it('los umbrales son razonables', () => {
    // 40 caracteres en 3 s equivalen a 160 WPM: por debajo de 3 s no es una medición humana fiable.
    assert.equal(MIN_WPM_TEXT_LENGTH, 40);
    assert.equal(MIN_RELIABLE_WPM_MS, 3000);
  });
});

describe('practiceAdvice: qué hacer a continuación (T14)', () => {
  const advice = (accuracy, wpm, elapsedMs = 30_000, goals = GOALS) => practiceAdvice(evaluate(accuracy, wpm, elapsedMs, goals)).kind;
  const NO_WPM = { targetAccuracy: 90, targetWpm: null };

  it('precisión y WPM alcanzadas: continuar', () => {
    assert.equal(advice(95, 25), 'continue');
  });

  it('precisión alcanzada, WPM pendientes: fluidez', () => {
    assert.equal(advice(95, 10), 'fluency');
  });

  it('WPM alcanzadas, precisión pendiente: bajar la velocidad', () => {
    assert.equal(advice(80, 30), 'slow-down');
  });

  it('ambos pendientes: repetir con calma', () => {
    assert.equal(advice(80, 10), 'calm');
  });

  it('sin objetivo de WPM: solo cuenta la precisión', () => {
    assert.equal(advice(95, 5, 30_000, NO_WPM), 'continue');
    assert.equal(advice(80, 50, 30_000, NO_WPM), 'calm');
  });

  it('medición de WPM no fiable (muy corta): sin conclusiones sobre la velocidad', () => {
    assert.equal(advice(95, 100, 1000), 'unreliable');
    assert.equal(advice(80, 100, 1000), 'calm');
  });

  it('mensajes breves, sin comparar con sesiones anteriores ni bloquear', () => {
    for (const [acc, wpm, ms, goals] of [[95, 25], [95, 10], [80, 30], [80, 10], [95, 5, 30_000, NO_WPM], [95, 100, 1000]]) {
      const { text } = practiceAdvice(evaluate(acc, wpm, ms, goals));
      assert.ok(text.length > 0 && text.length <= 180, text);
      assert.doesNotMatch(text, /anterior|mejorado|bloque/i);
    }
  });
});
