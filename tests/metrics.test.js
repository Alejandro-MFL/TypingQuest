import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcWpm, calcAccuracy } from '../js/metrics.js';

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
