// Textos del «Análisis de escritura» (T11): helpers puros de js/analysis-ui.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  charName,
  formatRate,
  statusMessage,
  describeDifficulty,
  insufficientMessage,
  difficultKeys,
  DIAGNOSIS_EXPLANATION,
} from '../js/analysis-ui.js';
import { diagnose, MIN_OPPORTUNITIES } from '../js/typing-analysis.js';

const summary = (chars, confusions = []) => ({ version: 1, chars, confusions });
const c = (char, opportunities, firstTryErrors, corrected = firstTryErrors) => ({
  char, opportunities, firstTryErrors, attempts: opportunities + firstTryErrors, errors: firstTryErrors, corrected,
});

describe('charName y formatRate', () => {
  it('nombra el espacio y entrecomilla el resto', () => {
    assert.equal(charName(' '), 'espacio');
    assert.equal(charName('ñ'), '«ñ»');
    assert.equal(charName('«'), '««»');
  });

  it('porcentaje redondeado', () => {
    assert.equal(formatRate(0.375), '38 %');
    assert.equal(formatRate(1), '100 %');
  });
});

describe('statusMessage', () => {
  it('sesiones sin análisis: «Diagnóstico no disponible para esta sesión.»', () => {
    assert.equal(statusMessage(diagnose(null)), 'Diagnóstico no disponible para esta sesión.');
  });

  it('textos breves, sesión sin dificultades y con dificultades', () => {
    assert.match(statusMessage(diagnose(summary([c('a', 2, 1)]))), new RegExp(`${MIN_OPPORTUNITIES} oportunidades`));
    assert.match(statusMessage(diagnose(summary([c('a', 10, 0)]))), /Sin dificultades destacables/);
    assert.match(statusMessage(diagnose(summary([c('a', 10, 2)]))), /más fallos al primer intento/);
  });
});

describe('describeDifficulty', () => {
  const [ene] = diagnose(summary([c('ñ', 8, 3, 2)], [{ expected: 'ñ', typed: 'l', count: 3 }])).difficulties;
  const text = describeDifficulty(ene);

  it('carácter, fallos al primer intento con su denominador y tasa', () => {
    assert.equal(text.title, '«ñ»');
    assert.equal(text.rate, 'Falló al primer intento 3 de 8 veces (38 %); corregidos: 2.');
  });

  it('tecla y dedo RECOMENDADOS por la guía de T9 (no el dedo usado)', () => {
    assert.equal(text.key, 'Recomendado: pulsa Ñ con el meñique derecho.');
  });

  it('confusiones relevantes', () => {
    assert.equal(text.confusions, 'Se confundió con «l» (3 veces).');
  });

  it('sin confusiones repetidas, sin texto de confusión', () => {
    const [d] = diagnose(summary([c('a', 10, 2)], [{ expected: 'a', typed: 's', count: 1 }])).difficulties;
    assert.equal(describeDifficulty(d).confusions, '');
  });

  it('tildes: dos pasos de la guía (tecla muerta y vocal)', () => {
    const [d] = diagnose(summary([c('á', 6, 2)])).difficulties;
    assert.match(describeDifficulty(d).key, /^Recomendado: pulsa la tilde/);
  });
});

describe('insufficientMessage', () => {
  it('caracteres con errores pero poca muestra: se nombran sin valorarlos', () => {
    const d = diagnose(summary([c('q', 1, 1), c('z', 2, 1), c('a', 10, 0)]));
    assert.equal(insufficientMessage(d),
      `Con menos de ${MIN_OPPORTUNITIES} oportunidades no se valoran (datos insuficientes): «q» (1 de 1), «z» (1 de 2).`);
  });

  it('vacío si no hay caracteres en esa situación', () => {
    assert.equal(insufficientMessage(diagnose(summary([c('a', 10, 2)]))), '');
  });
});

describe('difficultKeys (teclado de resultados)', () => {
  it('tecla principal de cada dificultad, en orden y sin repetir', () => {
    const d = diagnose(summary([c('a', 10, 5), c('A', 10, 4), c('ñ', 10, 3), c('á', 10, 2)]));
    assert.deepEqual(difficultKeys(d), [
      { code: 'KeyA', rank: 1 }, { code: 'Semicolon', rank: 3 },
    ]);
  });

  it('sin dificultades, sin teclas', () => {
    assert.deepEqual(difficultKeys(diagnose(null)), []);
  });
});

describe('DIAGNOSIS_EXPLANATION', () => {
  it('explica oportunidad, primer intento, muestra mínima y dedo recomendado', () => {
    assert.match(DIAGNOSIS_EXPLANATION, /oportunidad/);
    assert.match(DIAGNOSIS_EXPLANATION, /primer intento/);
    assert.match(DIAGNOSIS_EXPLANATION, new RegExp(String(MIN_OPPORTUNITIES)));
    assert.match(DIAGNOSIS_EXPLANATION, /recomendad/);
  });
});
