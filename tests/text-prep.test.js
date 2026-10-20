import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeText,
  findUnsupportedChars,
  validateText,
  prepareText,
} from '../js/text-prep.js';

describe('sanitizeText: normalización Unicode', () => {
  it('compone las tildes descompuestas (NFC)', () => {
    const result = sanitizeText('canción ñu');
    assert.equal(result, 'canción ñu');
    assert.equal(result.length, 10);
  });

  it('conserva tildes, diéresis, ñ y mayúsculas', () => {
    const text = 'áéíóú ÁÉÍÓÚ ü Ü ñ Ñ';
    assert.equal(sanitizeText(text), text);
  });

  it('devuelve un string vacío si la entrada no es un string', () => {
    assert.equal(sanitizeText(undefined), '');
    assert.equal(sanitizeText(null), '');
    assert.equal(sanitizeText(42), '');
  });
});

describe('sanitizeText: puntuación española y tipográfica', () => {
  it('conserva ¿ ¡ y la puntuación escribible', () => {
    const text = '¿Cómo estás?, (sí); "no": ¡ya! [a] {b} -c- \'d\'';
    assert.equal(sanitizeText(text), text);
  });

  it('convierte comillas angulares y tipográficas dobles en "', () => {
    assert.equal(sanitizeText('«Hola» “mundo” „x‟ 5″'), '"Hola" "mundo" "x" 5"');
  });

  it("convierte comillas simples, apóstrofos y primas en '", () => {
    assert.equal(sanitizeText('l’amic ‘x’ ‚y‛ ‹z› 5′'), "l'amic 'x' 'y' 'z' 5'");
  });

  it('convierte rayas, guiones y signo menos tipográficos en -', () => {
    assert.equal(
      sanitizeText('a—b – c ‒ d − e ― f ‐ g ‑ h'),
      'a-b - c - d - e - f - g - h'
    );
  });

  it('convierte los puntos suspensivos en tres puntos', () => {
    assert.equal(sanitizeText('Y…'), 'Y...');
  });
});

describe('sanitizeText: espacios y saltos de línea', () => {
  it('convierte saltos de línea y tabulaciones en espacios', () => {
    assert.equal(sanitizeText('a\r\nb\nc\rd\te\vf\fg'), 'a b c d e f g');
  });

  it('convierte separadores Unicode de línea y párrafo en espacios', () => {
    assert.equal(sanitizeText('a b c\u0085d'), 'a b c d');
  });

  it('convierte espacios especiales (NBSP, fino, ideográfico…) en espacio normal', () => {
    assert.equal(sanitizeText('a b c d　e f'), 'a b c d e f');
  });

  it('reduce los espacios repetidos a uno', () => {
    assert.equal(sanitizeText('a   b \n\n  c'), 'a b c');
  });

  it('recorta los espacios iniciales y finales', () => {
    assert.equal(sanitizeText('  \n hola \t '), 'hola');
  });

  it('devuelve un string vacío si solo hay espacios', () => {
    assert.equal(sanitizeText(' \n\t  '), '');
    assert.equal(sanitizeText(''), '');
  });
});

describe('sanitizeText: caracteres invisibles y de control', () => {
  it('elimina guiones blandos y caracteres de ancho cero', () => {
    assert.equal(sanitizeText('pa­la​bra⁠s'), 'palabras');
  });

  it('elimina la marca BOM inicial', () => {
    assert.equal(sanitizeText('﻿Hola'), 'Hola');
  });

  it('elimina caracteres de control no imprimibles', () => {
    assert.equal(sanitizeText('a\u0000b\u0007c\u007Fd\u009Fe'), 'abcde');
  });
});

describe('sanitizeText: propiedades', () => {
  it('es idempotente', () => {
    const raw = '  «Hola»\r\n\tmundo…  ¿qué tal?  ';
    const once = sanitizeText(raw);
    assert.equal(once, '"Hola" mundo... ¿qué tal?');
    assert.equal(sanitizeText(once), once);
  });
});

describe('findUnsupportedChars', () => {
  it('no detecta nada en texto español', () => {
    assert.deepEqual(findUnsupportedChars('¿Año? ¡Pingüino! "Sí", dijo.'), []);
  });

  it('detecta emojis (fuera del plano básico Unicode)', () => {
    assert.deepEqual(findUnsupportedChars('hola 😀 adiós'), ['😀']);
  });

  it('detecta cada parte de un emoji compuesto tras sanear', () => {
    assert.deepEqual(findUnsupportedChars(sanitizeText('👩‍💻')), ['👩', '💻']);
  });

  it('detecta combinaciones con marcas que NFC no puede componer', () => {
    assert.deepEqual(findUnsupportedChars(sanitizeText('q̃')), ['q̃']);
  });

  it('devuelve cada carácter no soportado una sola vez', () => {
    assert.deepEqual(findUnsupportedChars('😀a😀b🎉'), ['😀', '🎉']);
  });

  it('no marca otros alfabetos del plano básico (sin garantizar su escritura con IME)', () => {
    assert.deepEqual(findUnsupportedChars('Ωmega привет 漢字'), []);
  });
});

describe('validateText', () => {
  it('acepta un texto válido e informa de su longitud', () => {
    assert.deepEqual(validateText('hola', 10), { ok: true, error: null, length: 4 });
  });

  it('rechaza el texto vacío', () => {
    assert.deepEqual(validateText('', 10), { ok: false, error: 'empty', length: 0 });
  });

  it('acepta un texto con la longitud máxima exacta', () => {
    assert.equal(validateText('a'.repeat(5000), 5000).ok, true);
  });

  it('rechaza un texto que supera el límite e indica la longitud recibida', () => {
    assert.deepEqual(validateText('a'.repeat(5001), 5000), {
      ok: false,
      error: 'too-long',
      length: 5001,
      maxLength: 5000,
    });
  });

  it('cuenta la longitud en caracteres, no en unidades UTF-16', () => {
    assert.deepEqual(validateText('😀😀', 10).length, 2);
  });

  it('rechaza textos con caracteres no soportados y los enumera', () => {
    assert.deepEqual(validateText('hola 😀', 10), {
      ok: false,
      error: 'unsupported-chars',
      length: 6,
      chars: ['😀'],
    });
  });

  it('comprueba el límite antes que los caracteres no soportados', () => {
    assert.equal(validateText('😀'.repeat(6), 5).error, 'too-long');
  });

  it('lanza TypeError si el texto no es un string', () => {
    assert.throws(() => validateText(null, 10), TypeError);
  });

  it('lanza TypeError si el límite no es un entero positivo', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '10', undefined]) {
      assert.throws(() => validateText('hola', bad), TypeError, `límite: ${String(bad)}`);
    }
  });
});

describe('prepareText', () => {
  it('sanea y valida un texto correcto, devolviendo el texto limpio', () => {
    assert.deepEqual(prepareText('  «Hola»\n mundo  ', 20), {
      ok: true,
      error: null,
      length: 12,
      text: '"Hola" mundo',
    });
  });

  it('rechaza como vacío un texto que solo contiene espacios e invisibles', () => {
    assert.deepEqual(prepareText(' \n\t\u00A0\u200B ', 10), {
      ok: false,
      error: 'empty',
      length: 0,
      text: '',
    });
  });

  it('trata como vacía una entrada que no es string', () => {
    assert.equal(prepareText(null, 10).error, 'empty');
  });

  it('acepta la longitud máxima exacta medida tras sanear', () => {
    const result = prepareText('a'.repeat(10), 10);
    assert.equal(result.ok, true);
    assert.equal(result.length, 10);
  });

  it('rechaza un texto que supera el límite e indica la longitud saneada', () => {
    assert.deepEqual(prepareText('a'.repeat(11), 10), {
      ok: false,
      error: 'too-long',
      length: 11,
      maxLength: 10,
      text: 'a'.repeat(11),
    });
  });

  it('acepta un texto que solo cabe en el límite después de acortarse al sanear', () => {
    const raw = '   cancio\u0301n \r\n\t ';  // 16 unidades en bruto, 7 caracteres saneado
    assert.ok(raw.length > 7);
    assert.deepEqual(prepareText(raw, 7), { ok: true, error: null, length: 7, text: 'canción' });
  });

  it('rechaza un texto que supera el límite al alargarse al sanear (… → ...)', () => {
    const raw = 'Y…';                       // 2 caracteres en bruto, 4 saneado
    assert.equal(validateText(raw, 3).ok, true);
    assert.deepEqual(prepareText(raw, 3), {
      ok: false,
      error: 'too-long',
      length: 4,
      maxLength: 3,
      text: 'Y...',
    });
  });

  it('informa de los caracteres no soportados junto al texto saneado', () => {
    assert.deepEqual(prepareText('hola\n😀', 10), {
      ok: false,
      error: 'unsupported-chars',
      length: 6,
      chars: ['😀'],
      text: 'hola 😀',
    });
  });

  it('no marca como no soportadas las tildes descompuestas (las compone antes)', () => {
    assert.equal(validateText('cancio\u0301n', 10).error, 'unsupported-chars');
    assert.equal(prepareText('cancio\u0301n', 10).ok, true);
  });

  it('lanza TypeError si el límite no es un entero positivo', () => {
    assert.throws(() => prepareText('hola', 0), TypeError);
  });
});
