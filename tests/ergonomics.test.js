import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checklistSummary } from '../js/ergonomics.js';

describe('lista de comprobación de Ergonomía (T16)', () => {
  it('sin marcar: invita a usarla, sin obligar', () => {
    assert.equal(checklistSummary(0, 5), 'Marca lo que ya tengas en cuenta. Es opcional y no se guarda.');
  });

  it('a medias: cuántos puntos de cuántos', () => {
    assert.equal(checklistSummary(1, 5), '1 de 5 puntos revisados.');
    assert.equal(checklistSummary(3, 5), '3 de 5 puntos revisados.');
  });

  it('completa: un cierre breve', () => {
    assert.equal(checklistSummary(5, 5), '5 de 5 puntos revisados. Listo para escribir con comodidad.');
  });

  it('valores fuera de rango se acotan (nunca negativos ni más que el total)', () => {
    assert.equal(checklistSummary(-2, 5), checklistSummary(0, 5));
    assert.equal(checklistSummary(9, 5), checklistSummary(5, 5));
  });
});
