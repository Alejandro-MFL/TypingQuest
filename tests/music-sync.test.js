// Frases y sincronización de Música. Letras INVENTADAS para las pruebas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPhrases,
  phraseWindow,
  phraseIndexAt,
  clampOffset,
  formatOffset,
  describeOffset,
  effectiveOffset,
  MAX_OFFSET_MS,
  MAX_LAST_PHRASE_MS,
  DEFAULT_TIMING,
  phraseTimes,
  phraseForTime,
  estimatePlayerTime,
  nextTickDelay,
} from '../js/music-sync.js';

const lines = [
  { timeMs: 2000, text: 'Primera frase' },
  { timeMs: 5000, text: 'Segunda frase' },
  { timeMs: 9000, text: '' },
  { timeMs: 15000, text: 'Tras la pausa' },
];

describe('buildPhrases', () => {
  it('una frase empieza en su marca y termina donde empieza la siguiente línea (también una pausa)', () => {
    const phrases = buildPhrases(lines);
    assert.deepEqual(phrases.map((p) => [p.text, p.startMs, p.nextMs]), [
      ['Primera frase', 2000, 5000],
      ['Segunda frase', 5000, 9000],
      ['Tras la pausa', 15000, null],
    ]);
  });

  it('las pausas (líneas vacías) no son frases que escribir', () => {
    assert.equal(buildPhrases(lines).every((p) => p.text !== ''), true);
  });

  it('quita caracteres que el motor no puede escribir (emojis); si no queda nada, no es frase', () => {
    const phrases = buildPhrases([
      { timeMs: 0, text: 'Hola 🎵 mundo' },
      { timeMs: 1000, text: '🎶🎶' },
      { timeMs: 2000, text: 'Fin' },
    ]);
    assert.deepEqual(phrases.map((p) => [p.text, p.nextMs]), [['Hola mundo', 1000], ['Fin', null]]);
  });

  it('sin frases con texto devuelve una lista vacía', () => {
    assert.deepEqual(buildPhrases([{ timeMs: 0, text: '' }]), []);
    assert.deepEqual(buildPhrases([]), []);
  });
});

describe('phraseWindow: desfase', () => {
  const [first, second, last] = buildPhrases(lines);

  it('sin desfase: de su marca a la siguiente línea', () => {
    assert.deepEqual(phraseWindow(first, { offsetMs: 0 }), { startMs: 2000, endMs: 5000 });
  });

  it('desfase positivo: la letra llega más tarde (todo se desplaza hacia delante)', () => {
    assert.deepEqual(phraseWindow(second, { offsetMs: 700 }), { startMs: 5700, endMs: 9700 });
  });

  it('desfase negativo: la letra llega antes, sin bajar de 0', () => {
    assert.deepEqual(phraseWindow(second, { offsetMs: -1500 }), { startMs: 3500, endMs: 7500 });
    assert.deepEqual(phraseWindow(first, { offsetMs: -3000 }), { startMs: 0, endMs: 2000 });
  });

  it('desfase que deja el final en 0 o antes: ventana mínima, nunca negativa', () => {
    const window = phraseWindow(first, { offsetMs: -6000 });
    assert.ok(window.endMs > window.startMs);
  });
});

describe('phraseWindow: última frase', () => {
  const last = buildPhrases(lines).at(-1);

  it('termina con el vídeo si su duración es fiable', () => {
    assert.deepEqual(phraseWindow(last, { offsetMs: 0, videoDurationMs: 20_000 }), { startMs: 15000, endMs: 20_000 });
  });

  it('sin duración del vídeo: final desconocido (control manual), nunca inventado', () => {
    assert.equal(phraseWindow(last, { offsetMs: 0 }).endMs, null);
    assert.equal(phraseWindow(last, { offsetMs: 0, videoDurationMs: NaN }).endMs, null);
    assert.equal(phraseWindow(last, { offsetMs: 0, videoDurationMs: 0 }).endMs, null);
  });

  it('duración anómala (antes del inicio o demasiado lejos): final desconocido', () => {
    assert.equal(phraseWindow(last, { offsetMs: 0, videoDurationMs: 10_000 }).endMs, null);
    assert.equal(phraseWindow(last, { offsetMs: 0, videoDurationMs: 15_000 + MAX_LAST_PHRASE_MS + 1 }).endMs, null);
  });

  it('la duración del vídeo no se desplaza con el desfase', () => {
    assert.deepEqual(phraseWindow(last, { offsetMs: 1000, videoDurationMs: 20_000 }), { startMs: 16000, endMs: 20_000 });
  });
});

describe('phraseIndexAt (comprobar la sincronización)', () => {
  const phrases = buildPhrases(lines);

  it('frase que suena en cada momento, o ninguna en una pausa o antes de empezar', () => {
    assert.equal(phraseIndexAt(phrases, 1000, { offsetMs: 0 }), -1);
    assert.equal(phraseIndexAt(phrases, 2000, { offsetMs: 0 }), 0);
    assert.equal(phraseIndexAt(phrases, 6000, { offsetMs: 0 }), 1);
    assert.equal(phraseIndexAt(phrases, 10_000, { offsetMs: 0 }), -1, 'pausa instrumental');
    assert.equal(phraseIndexAt(phrases, 16_000, { offsetMs: 0, videoDurationMs: 20_000 }), 2);
  });

  it('respeta el desfase', () => {
    assert.equal(phraseIndexAt(phrases, 2200, { offsetMs: 500 }), -1);
    assert.equal(phraseIndexAt(phrases, 2600, { offsetMs: 500 }), 0);
  });

  it('última frase sin final conocido: activa desde su inicio', () => {
    assert.equal(phraseIndexAt(phrases, 99_000, { offsetMs: 0 }), 2);
  });
});

describe('desfase: límites y textos', () => {
  it('se limita a ±30 s (02.1: el deslizador) y se redondea a décimas', () => {
    assert.equal(MAX_OFFSET_MS, 30_000);
    assert.equal(clampOffset(32_345), 30_000);
    assert.equal(clampOffset(-99_999), -30_000);
    assert.equal(clampOffset(12_345), 12_300);
    assert.equal(clampOffset(349), 300);
    assert.equal(clampOffset(NaN), 0);
  });

  it('suma el desfase del usuario y el del archivo LRC ([offset] adelanta la letra)', () => {
    assert.equal(effectiveOffset(500, 200), 300);
    assert.equal(effectiveOffset(0, -400), 400);
  });

  it('formato visible con signo y coma decimal', () => {
    assert.equal(formatOffset(0), '0,0 s');
    assert.equal(formatOffset(300), '+0,3 s');
    assert.equal(formatOffset(-1500), '−1,5 s');
  });

  it('explica el efecto en lenguaje sencillo', () => {
    assert.equal(describeOffset(0), 'Sin desfase: la letra usa los tiempos originales.');
    assert.equal(describeOffset(300), 'La letra se muestra 0,3 s más tarde.');
    assert.equal(describeOffset(-1500), 'La letra se muestra 1,5 s antes.');
  });
});

// --- 02.1: escritura mientras suena la canción ------------------------------------
// Ejemplo del enunciado: A 00:15, B 00:20, C 00:26; anticipación 1 s; margen 0,3 s.
const abc = buildPhrases([
  { timeMs: 15_000, text: 'Frase A' },
  { timeMs: 20_000, text: 'Frase B' },
  { timeMs: 26_000, text: 'Frase C' },
]);
const timing = { offsetMs: 0, leadMs: 1000, safetyMs: 300 };

describe('phraseTimes: aparición, inicio y límite de cada frase', () => {
  it('valores iniciales: 1 s de anticipación y 0,3 s de margen', () => {
    assert.deepEqual(DEFAULT_TIMING, { leadMs: 1000, safetyMs: 300 });
  });

  it('la frase aparece 1 s antes de cantarse y debe terminarse 0,3 s antes de la siguiente', () => {
    assert.deepEqual(phraseTimes(abc, 0, timing), { showAtMs: 14_000, startMs: 15_000, deadlineMs: 19_700 });
    assert.deepEqual(phraseTimes(abc, 1, timing), { showAtMs: 19_000, startMs: 20_000, deadlineMs: 25_700 });
  });

  it('la última frase no tiene límite (no hay siguiente que proteger)', () => {
    assert.equal(phraseTimes(abc, 2, timing).deadlineMs, null);
  });

  it('el límite es la siguiente FRASE: una pausa instrumental intermedia se puede escuchar y aprovechar', () => {
    const withBreak = buildPhrases([
      { timeMs: 10_000, text: 'antes' }, { timeMs: 14_000, text: '' }, { timeMs: 40_000, text: 'después' },
    ]);
    assert.equal(phraseTimes(withBreak, 0, timing).deadlineMs, 39_700);
  });

  it('desfase positivo (más tarde) y negativo (antes) desplazan aparición, inicio y límite', () => {
    assert.deepEqual(phraseTimes(abc, 0, { ...timing, offsetMs: 2000 }), { showAtMs: 16_000, startMs: 17_000, deadlineMs: 21_700 });
    assert.deepEqual(phraseTimes(abc, 0, { ...timing, offsetMs: -2000 }), { showAtMs: 12_000, startMs: 13_000, deadlineMs: 17_700 });
  });

  it('nunca antes de 0 (desfase negativo grande o frase al principio)', () => {
    const early = buildPhrases([{ timeMs: 500, text: 'ya' }, { timeMs: 3000, text: 'luego' }]);
    assert.deepEqual(phraseTimes(early, 0, timing), { showAtMs: 0, startMs: 500, deadlineMs: 2700 });
    assert.equal(phraseTimes(abc, 0, { ...timing, offsetMs: -30_000 }).showAtMs, 0);
  });

  it('frases más próximas que el margen: el límite no queda antes de su inicio', () => {
    const tight = buildPhrases([{ timeMs: 10_000, text: 'uno' }, { timeMs: 10_200, text: 'dos' }]);
    assert.equal(phraseTimes(tight, 0, timing).deadlineMs, 10_000);
  });
});

describe('phraseForTime (saltos manuales del vídeo)', () => {
  it('la frase cuyo límite aún no ha pasado', () => {
    assert.equal(phraseForTime(abc, 0, timing), 0);
    assert.equal(phraseForTime(abc, 18_000, timing), 0);
    assert.equal(phraseForTime(abc, 19_800, timing), 1);
    assert.equal(phraseForTime(abc, 30_000, timing), 2);
  });
});

describe('estimatePlayerTime: tiempo entre lecturas del reproductor', () => {
  it('reproduciendo, suma el tiempo local desde la última lectura distinta (máx. 0,5 s)', () => {
    assert.equal(estimatePlayerTime({ reportedMs: 10_000, reportedAtMs: 1000, now: 1200, playing: true }), 10_200);
    assert.equal(estimatePlayerTime({ reportedMs: 10_000, reportedAtMs: 1000, now: 5000, playing: true }), 10_500);
  });

  it('en pausa o sin dato válido, el valor leído', () => {
    assert.equal(estimatePlayerTime({ reportedMs: 10_000, reportedAtMs: 1000, now: 1200, playing: false }), 10_000);
    assert.ok(Number.isNaN(estimatePlayerTime({ reportedMs: NaN, reportedAtMs: 0, now: 5, playing: true })));
  });
});

describe('nextTickDelay: comprobaciones más frecuentes cerca del límite', () => {
  it('lejos de cualquier momento importante: 200 ms', () => {
    assert.equal(nextTickDelay(5000), 200);
    assert.equal(nextTickDelay(null), 200);
  });

  it('cerca: espera hasta poco antes del momento, nunca menos de 20 ms', () => {
    assert.equal(nextTickDelay(150), 110);
    assert.equal(nextTickDelay(30), 20);
    assert.equal(nextTickDelay(-100), 20);
  });
});
