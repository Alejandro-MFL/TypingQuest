import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoChunks } from '../js/chunks.js';
import { prepareText } from '../js/text-prep.js';

function slices(text, chunks) {
  return chunks.map((c) => text.slice(c.start, c.end));
}

function words(count) {
  return Array.from({ length: count }, (_, i) => `w${i + 1}`).join(' ');
}

// Invariantes que debe cumplir cualquier división.
function assertValidChunks(text, chunks) {
  assert.equal(slices(text, chunks).join(''), text, 'la concatenación reconstruye el texto');
  if (text.length === 0) return;
  assert.equal(chunks[0].start, 0, 'empieza en 0');
  assert.equal(chunks.at(-1).end, text.length, 'termina en la longitud del texto');
  chunks.forEach((c, i) => {
    assert.ok(c.end > c.start, `fragmento ${i} no vacío`);
    if (i > 0) assert.equal(c.start, chunks[i - 1].end, `fragmento ${i} contiguo`);
  });
}

describe('splitIntoChunks: agrupación de palabras', () => {
  it('agrupa por el número de palabras indicado con rangos [start, end)', () => {
    assert.deepEqual(splitIntoChunks('uno dos tres', 2), [
      { start: 0, end: 8 },
      { start: 8, end: 12 },
    ]);
  });

  it('incluye el espacio final en los fragmentos intermedios, no en el último', () => {
    const text = 'uno dos tres cuatro cinco';
    assert.deepEqual(slices(text, splitIntoChunks(text, 2)), ['uno dos ', 'tres cuatro ', 'cinco']);
  });

  it('usa 7 palabras por fragmento por defecto', () => {
    const text = words(8);
    assert.deepEqual(slices(text, splitIntoChunks(text)), [
      'w1 w2 w3 w4 w5 w6 w7 ',
      'w8',
    ]);
  });

  it('con exactamente 7 palabras devuelve un único fragmento sin espacio final', () => {
    const text = words(7);
    assert.deepEqual(splitIntoChunks(text), [{ start: 0, end: text.length }]);
  });

  it('con un múltiplo exacto no crea un fragmento vacío al final', () => {
    const text = words(14);
    const chunks = splitIntoChunks(text);
    assert.equal(chunks.length, 2);
    assert.equal(slices(text, chunks)[1], 'w8 w9 w10 w11 w12 w13 w14');
  });

  it('permite cambiar el número de palabras sin cambiar el algoritmo', () => {
    const text = words(10);
    assert.equal(splitIntoChunks(text, 1).length, 10);
    assert.equal(splitIntoChunks(text, 3).length, 4);
    assert.equal(splitIntoChunks(text, 10).length, 1);
    assert.equal(splitIntoChunks(text, 50).length, 1);
  });

  it('con 1 palabra por fragmento cada palabra lleva su espacio', () => {
    const text = 'a bb ccc';
    assert.deepEqual(slices(text, splitIntoChunks(text, 1)), ['a ', 'bb ', 'ccc']);
  });
});

describe('splitIntoChunks: textos cortos y vacíos', () => {
  it('devuelve un único fragmento si el texto es más corto que un fragmento', () => {
    assert.deepEqual(splitIntoChunks('hola mundo'), [{ start: 0, end: 10 }]);
  });

  it('devuelve un único fragmento para una sola palabra', () => {
    assert.deepEqual(splitIntoChunks('hola'), [{ start: 0, end: 4 }]);
  });

  it('devuelve una lista vacía para el texto vacío', () => {
    assert.deepEqual(splitIntoChunks(''), []);
  });
});

describe('splitIntoChunks: puntuación, mayúsculas y caracteres españoles', () => {
  it('mantiene la puntuación unida a su palabra', () => {
    const text = '¿Qué tal? ¡Muy bien, gracias!';
    assert.deepEqual(slices(text, splitIntoChunks(text, 2)), [
      '¿Qué tal? ',
      '¡Muy bien, ',
      'gracias!',
    ]);
  });

  it('conserva mayúsculas, tildes y ñ en sus posiciones', () => {
    const text = 'El Ñandú corrió Rápido';
    const parts = slices(text, splitIntoChunks(text, 2));
    assert.deepEqual(parts, ['El Ñandú ', 'corrió Rápido']);
  });

  it('funciona con el texto devuelto por prepareText', () => {
    const { text } = prepareText('  «Hola»\n mundo…  ¿qué\ttal?  ', 100);
    assert.equal(text, '"Hola" mundo... ¿qué tal?');
    assert.deepEqual(slices(text, splitIntoChunks(text, 2)), ['"Hola" mundo... ', '¿qué tal?']);
  });
});

describe('splitIntoChunks: invariantes', () => {
  it('reconstruye el texto sin huecos ni solapes para varios tamaños', () => {
    const { text } = prepareText(
      'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho ' +
        'tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, ' +
        'rocín flaco y galgo corredor. ¿Y qué? ¡Nada!',
      5000
    );
    for (let n = 1; n <= 12; n++) {
      assertValidChunks(text, splitIntoChunks(text, n));
    }
  });

  it('cada fragmento intermedio termina en espacio y el último no', () => {
    const text = words(20);
    const parts = slices(text, splitIntoChunks(text, 3));
    parts.slice(0, -1).forEach((p) => assert.ok(p.endsWith(' ')));
    assert.ok(!parts.at(-1).endsWith(' '));
  });

  it('devuelve solo rangos numéricos y no modifica el texto', () => {
    const text = 'uno dos tres';
    const chunks = splitIntoChunks(text, 2);
    assert.equal(text, 'uno dos tres');
    chunks.forEach((c) => assert.deepEqual(Object.keys(c), ['start', 'end']));
  });

  it('mantiene la reconstrucción incluso con texto sin preparar', () => {
    const text = '  a  b \n c  ';
    assertValidChunks(text, splitIntoChunks(text, 2));
  });
});

describe('splitIntoChunks: validación', () => {
  it('lanza TypeError si el texto no es un string', () => {
    for (const bad of [null, undefined, 42, ['a']]) {
      assert.throws(() => splitIntoChunks(bad), TypeError);
    }
  });

  it('lanza TypeError si wordsPerChunk no es un entero positivo', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '7', null]) {
      assert.throws(() => splitIntoChunks('a b', bad), TypeError, `valor: ${String(bad)}`);
    }
  });

  it('usa el valor por defecto si wordsPerChunk es undefined', () => {
    assert.deepEqual(splitIntoChunks(words(8), undefined), splitIntoChunks(words(8), 7));
  });
});
