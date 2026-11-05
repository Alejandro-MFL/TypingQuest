import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcWpm, calcAccuracy, calcCpm, wpmToCpm, CHARS_PER_WORD } from '../js/metrics.js';

const ONE_MINUTE_MS = 60_000;

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `esperado ~${expected}, obtenido ${actual}`
  );
}

describe('calcWpm', () => {
  it('calcula 10 WPM con 50 caracteres correctos en un minuto', () => {
    assert.equal(calcWpm(50, ONE_MINUTE_MS), 10);
  });

  it('escala con el tiempo: 25 caracteres en 30 s son 10 WPM', () => {
    assert.equal(calcWpm(25, 30_000), 10);
  });

  it('devuelve resultados decimales sin redondear', () => {
    assert.equal(calcWpm(37, ONE_MINUTE_MS), 7.4);
    assertClose(calcWpm(10, 45_000), 2.6666666666666665);
  });

  it('devuelve 0 con tiempo cero (nunca Infinity)', () => {
    assert.equal(calcWpm(50, 0), 0);
  });

  it('devuelve 0 con cero caracteres', () => {
    assert.equal(calcWpm(0, ONE_MINUTE_MS), 0);
  });

  it('devuelve 0 con entradas negativas o no numéricas', () => {
    assert.equal(calcWpm(-5, ONE_MINUTE_MS), 0);
    assert.equal(calcWpm(50, -1000), 0);
    assert.equal(calcWpm(NaN, ONE_MINUTE_MS), 0);
    assert.equal(calcWpm(50, undefined), 0);
  });

  it('devuelve 0 con entradas infinitas', () => {
    assert.equal(calcWpm(Infinity, ONE_MINUTE_MS), 0);
    assert.equal(calcWpm(50, Infinity), 0);
  });
});

describe('calcAccuracy', () => {
  it('devuelve 100 cuando todas las pulsaciones son correctas', () => {
    assert.equal(calcAccuracy(20, 20), 100);
  });

  it('cuenta los errores: 9 correctas de 10 son 90 %', () => {
    assert.equal(calcAccuracy(9, 10), 90);
  });

  it('devuelve 0 cuando todas las pulsaciones son errores', () => {
    assert.equal(calcAccuracy(0, 10), 0);
  });

  it('devuelve resultados decimales sin redondear', () => {
    assertClose(calcAccuracy(2, 3), 66.66666666666667);
  });

  it('devuelve 0 con cero pulsaciones (nunca NaN)', () => {
    assert.equal(calcAccuracy(0, 0), 0);
  });

  it('devuelve 0 con entradas negativas o no numéricas', () => {
    assert.equal(calcAccuracy(-1, 10), 0);
    assert.equal(calcAccuracy(5, -10), 0);
    assert.equal(calcAccuracy(NaN, 10), 0);
  });

  it('devuelve 0 con entradas infinitas', () => {
    assert.equal(calcAccuracy(Infinity, 10), 0);
    assert.equal(calcAccuracy(5, Infinity), 0);
  });

  it('no supera 100 si las correctas exceden las totales', () => {
    assert.equal(calcAccuracy(12, 10), 100);
  });
});

// Experimento 01: pulsaciones por minuto (PPM). Misma base que el WPM (caracteres
// correctos presentes en el texto escrito), sin dividir entre 5.
describe('calcCpm', () => {
  it('cuenta 300 PPM con 300 caracteres correctos en un minuto', () => {
    assert.equal(calcCpm(300, ONE_MINUTE_MS), 300);
  });

  it('escala con duraciones cortas y largas', () => {
    assert.equal(calcCpm(25, 5000), 300);
    assert.equal(calcCpm(1500, 10 * ONE_MINUTE_MS), 150);
    assertClose(calcCpm(10, 45_000), 13.333333333333334);
  });

  it('equivale siempre a WPM × 5', () => {
    for (const [chars, ms] of [[37, 60_000], [123, 41_250], [1, 999], [4999, 3_600_000]]) {
      assertClose(calcCpm(chars, ms), calcWpm(chars, ms) * CHARS_PER_WORD, 1e-9);
    }
  });

  it('devuelve 0 con tiempo cero, cero caracteres o entradas no válidas', () => {
    assert.equal(calcCpm(50, 0), 0);
    assert.equal(calcCpm(0, ONE_MINUTE_MS), 0);
    assert.equal(calcCpm(-5, ONE_MINUTE_MS), 0);
    assert.equal(calcCpm(NaN, ONE_MINUTE_MS), 0);
    assert.equal(calcCpm(50, Infinity), 0);
  });
});

describe('wpmToCpm (compatibilidad con los registros guardados en WPM)', () => {
  it('convierte multiplicando por los 5 caracteres de una palabra', () => {
    assert.equal(CHARS_PER_WORD, 5);
    assert.equal(wpmToCpm(18), 90);
    assert.equal(wpmToCpm(0), 0);
  });

  it('recupera las PPM de un registro con WPM redondeadas a 2 decimales con un error ≤ 0,025', () => {
    for (const [chars, ms] of [[37, 60_000], [123, 41_250], [211, 77_777], [99, 30_001]]) {
      const stored = Math.round(calcWpm(chars, ms) * 100) / 100;
      assert.ok(Math.abs(wpmToCpm(stored) - calcCpm(chars, ms)) <= 0.025 + 1e-9);
    }
  });

  it('devuelve null con valores ausentes o no válidos, sin inventar datos', () => {
    assert.equal(wpmToCpm(null), null);
    assert.equal(wpmToCpm(undefined), null);
    assert.equal(wpmToCpm(-1), null);
    assert.equal(wpmToCpm(NaN), null);
    assert.equal(wpmToCpm(Infinity), null);
  });
});
