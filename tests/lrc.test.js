// Analizador LRC. Todas las letras de estas pruebas son frases INVENTADAS para el
// proyecto (nunca letras comerciales).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, parseTimestamp } from '../js/lrc.js';

const times = (result) => result.lines.map((l) => l.timeMs);
const texts = (result) => result.lines.map((l) => l.text);

describe('parseTimestamp', () => {
  it('admite los formatos habituales de marca de tiempo', () => {
    assert.equal(parseTimestamp('00:12.34'), 12_340);
    assert.equal(parseTimestamp('01:02.5'), 62_500);
    assert.equal(parseTimestamp('01:02.123'), 62_123);
    assert.equal(parseTimestamp('03:07'), 187_000);
    assert.equal(parseTimestamp('1:05.00'), 65_000);
    assert.equal(parseTimestamp('102:00.00'), 6_120_000);
    assert.equal(parseTimestamp('00:12:34'), 12_340, 'variante con dos puntos para las centésimas');
  });

  it('rechaza marcas mal formadas', () => {
    for (const bad of ['', 'aa:bb', '00:60.00', '00:5.00', '-01:00.00', '00:12.', '00:12.3456', '12', 'ti:Título']) {
      assert.equal(parseTimestamp(bad), null, bad);
    }
  });
});

describe('parseLrc: frases', () => {
  it('lee las frases en orden, con su tiempo en milisegundos', () => {
    const result = parseLrc('[00:01.00]Primera frase inventada\n[00:04.50]Segunda línea de prueba\n');
    assert.equal(result.ok, true);
    assert.deepEqual(result.lines, [
      { timeMs: 1000, text: 'Primera frase inventada' },
      { timeMs: 4500, text: 'Segunda línea de prueba' },
    ]);
  });

  it('ordena por tiempo aunque el archivo esté desordenado (orden estable)', () => {
    const result = parseLrc('[00:09.00]tres\n[00:01.00]uno\n[00:05.00]dos\n');
    assert.deepEqual(texts(result), ['uno', 'dos', 'tres']);
  });

  it('una línea con varias marcas se repite en cada tiempo', () => {
    const result = parseLrc('[00:10.00][00:30.00]Estribillo inventado\n[00:20.00]Estrofa\n');
    assert.deepEqual(times(result), [10_000, 20_000, 30_000]);
    assert.deepEqual(texts(result), ['Estribillo inventado', 'Estrofa', 'Estribillo inventado']);
  });

  it('las líneas vacías con marca se conservan como pausas (texto vacío)', () => {
    const result = parseLrc('[00:01.00]Hola mundo\n[00:03.00]\n[00:08.00]Adiós\n');
    assert.deepEqual(texts(result), ['Hola mundo', '', 'Adiós']);
  });

  it('marcas duplicadas: se conserva la primera frase con texto y se informa', () => {
    const result = parseLrc('[00:02.00]Original\n[00:02.00]Traducción repetida\n[00:05.00]Siguiente\n');
    assert.deepEqual(texts(result), ['Original', 'Siguiente']);
    assert.equal(result.duplicates, 1);
  });

  it('una pausa duplicada no borra la frase con texto del mismo tiempo', () => {
    const result = parseLrc('[00:02.00]\n[00:02.00]Con texto\n');
    assert.deepEqual(texts(result), ['Con texto']);
  });

  it('ignora líneas mal formadas y las cuenta', () => {
    const result = parseLrc('esto no es LRC\n[00:01.00]Válida\n[aa:bb]rota\n[00:61.00]minuto imposible\n');
    assert.deepEqual(texts(result), ['Válida']);
    assert.equal(result.malformed, 3);
  });

  it('quita las marcas de palabra del formato mejorado (<mm:ss.xx>)', () => {
    const result = parseLrc('[00:01.00]<00:01.00>Hola <00:01.50>mundo\n');
    assert.deepEqual(texts(result), ['Hola mundo']);
  });

  it('admite CRLF, BOM y espacios alrededor', () => {
    const result = parseLrc('﻿[00:01.00]  Uno  \r\n[00:02.00]Dos\r\n');
    assert.deepEqual(texts(result), ['Uno', 'Dos']);
  });
});

describe('parseLrc: Unicode y texto seguro', () => {
  it('conserva tildes, ñ, ü y signos de apertura, normalizados a NFC', () => {
    const result = parseLrc('[00:01.00]¿Qué tal, pingüino? ¡Mañana!\n[00:02.00]café\n');
    assert.deepEqual(texts(result), ['¿Qué tal, pingüino? ¡Mañana!', 'café']);
  });

  it('otros alfabetos se conservan como texto', () => {
    assert.deepEqual(texts(parseLrc('[00:01.00]Привет мир\n[00:02.00]こんにちは\n')), ['Привет мир', 'こんにちは']);
  });

  it('el HTML es texto literal (nunca se interpreta)', () => {
    const result = parseLrc('[00:01.00]<img src=x onerror=alert(1)>\n[00:02.00]<script>alert(1)</script>\n');
    assert.deepEqual(texts(result), ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>']);
  });

  it('elimina caracteres de control y de dirección (bidi)', () => {
    assert.deepEqual(texts(parseLrc('[00:01.00]ho‮la\u0007!\n')), ['hola!']);
  });
});

describe('parseLrc: metadatos', () => {
  it('lee título, artista, álbum, duración y desfase', () => {
    const result = parseLrc('[ti:Canción de prueba]\n[ar:Artista Inventado]\n[al:Disco]\n[length: 03:25]\n[offset:+250]\n[by:alguien]\n[00:01.00]Hola\n');
    assert.deepEqual(result.meta, {
      title: 'Canción de prueba', artist: 'Artista Inventado', album: 'Disco', lengthMs: 205_000, offsetMs: 250,
    });
  });

  it('desfase negativo y metadatos ausentes', () => {
    const result = parseLrc('[offset:-1200]\n[00:01.00]Hola\n');
    assert.equal(result.meta.offsetMs, -1200);
    assert.equal(result.meta.title, null);
    assert.equal(result.meta.lengthMs, null);
  });

  it('un desfase no numérico se ignora', () => {
    assert.equal(parseLrc('[offset:mucho]\n[00:01.00]Hola\n').meta.offsetMs, 0);
  });
});

describe('parseLrc: archivos sin datos útiles', () => {
  it('texto vacío o no textual', () => {
    assert.deepEqual(parseLrc(''), { ok: false, error: 'empty' });
    assert.deepEqual(parseLrc(null), { ok: false, error: 'empty' });
  });

  it('letra sin marcas de tiempo (no sincronizada)', () => {
    assert.deepEqual(parseLrc('Una letra\nsin tiempos\n'), { ok: false, error: 'not-synced' });
  });

  it('solo metadatos o solo pausas: sin frases que escribir', () => {
    assert.deepEqual(parseLrc('[ti:Algo]\n[ar:Alguien]\n'), { ok: false, error: 'not-synced' });
    assert.deepEqual(parseLrc('[00:01.00]\n[00:02.00]   \n'), { ok: false, error: 'no-text' });
  });

  it('demasiado grande', () => {
    assert.deepEqual(parseLrc(`[00:01.00]${'a'.repeat(300_000)}`), { ok: false, error: 'too-large' });
  });
});
