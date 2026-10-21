import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyInput,
  restartGame,
  getElapsedMs,
  getStats,
  getProgress,
} from '../js/game.js';
import { splitIntoChunks } from '../js/chunks.js';
import { prepareText } from '../js/text-prep.js';

// Congela el estado en profundidad: cualquier mutación lanzará TypeError (modo estricto).
function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(obj);
}

// Simula escribir `text` carácter a carácter, un evento input por carácter.
function typeChars(state, text, startAt = 1000, stepMs = 100) {
  let current = state;
  let now = startAt;
  for (const char of text) {
    current = applyInput(current, current.typed + char, now);
    now += stepMs;
  }
  return current;
}

function backspace(state, now) {
  return applyInput(state, state.typed.slice(0, -1), now);
}

describe('createGame', () => {
  it('crea un estado inicial idle con contadores y tiempos vacíos', () => {
    assert.deepEqual(createGame('hola'), {
      status: 'idle',
      text: 'hola',
      typed: '',
      startedAt: null,
      finishedAt: null,
      keystrokes: { total: 0, correct: 0, incorrect: 0 },
      corrections: 0,
      // Contrato T4c: sin configuración, un único segmento que cubre todo el texto.
      segmentEnds: [4],
      segmentIndex: 0,
      // Contrato T7: sin configuración, modo estricto (comportamiento anterior).
      mode: 'strict',
    });
  });

  it('normaliza el texto objetivo a NFC', () => {
    const game = createGame('canción'); // "ó" descompuesta
    assert.equal(game.text, 'canción');
    assert.equal(game.text.length, 7);
  });

  it('lanza TypeError si el texto está vacío o no es un string', () => {
    assert.throws(() => createGame(''), TypeError);
    assert.throws(() => createGame(undefined), TypeError);
    assert.throws(() => createGame(42), TypeError);
  });
});

describe('applyInput: inicio y cronómetro', () => {
  it('la primera inserción pasa a running y fija startedAt', () => {
    const game = applyInput(createGame('hola'), 'h', 500);
    assert.equal(game.status, 'running');
    assert.equal(game.startedAt, 500);
  });

  it('una entrada sin cambios devuelve el mismo estado', () => {
    const game = createGame('hola');
    assert.equal(applyInput(game, '', 500), game);
  });

  it('borrar con el campo vacío no arranca el cronómetro', () => {
    const game = createGame('hola');
    const next = applyInput(game, '', 500);
    assert.equal(next.status, 'idle');
    assert.equal(next.startedAt, null);
  });

  it('startedAt no cambia con las entradas siguientes', () => {
    const game = typeChars(createGame('hola'), 'ho', 500);
    assert.equal(game.startedAt, 500);
  });
});

describe('applyInput: aciertos, errores y correcciones', () => {
  it('un carácter correcto suma una pulsación correcta', () => {
    const game = applyInput(createGame('hola'), 'h', 0);
    assert.deepEqual(game.keystrokes, { total: 1, correct: 1, incorrect: 0 });
    assert.equal(game.typed, 'h');
  });

  it('un carácter incorrecto suma una pulsación incorrecta', () => {
    const game = applyInput(createGame('hola'), 'x', 0);
    assert.deepEqual(game.keystrokes, { total: 1, correct: 0, incorrect: 1 });
  });

  it('borrar un error suma una corrección y conserva el error histórico', () => {
    const withError = applyInput(createGame('hola'), 'x', 0);
    const corrected = backspace(withError, 100);
    assert.equal(corrected.typed, '');
    assert.equal(corrected.corrections, 1);
    assert.deepEqual(corrected.keystrokes, { total: 1, correct: 0, incorrect: 1 });
  });

  it('borrar un carácter correcto no suma correcciones', () => {
    const game = backspace(applyInput(createGame('hola'), 'h', 0), 100);
    assert.equal(game.corrections, 0);
  });

  it('reescribir un carácter correcto cuenta como nueva pulsación', () => {
    let game = applyInput(createGame('hola'), 'h', 0);
    game = backspace(game, 100);
    game = applyInput(game, 'h', 200);
    assert.deepEqual(game.keystrokes, { total: 2, correct: 2, incorrect: 0 });
  });

  it('borrar varios caracteres a la vez cuenta cada error borrado', () => {
    const game = typeChars(createGame('hola'), 'hxy');
    const next = applyInput(game, 'h', 2000);
    assert.equal(next.corrections, 2);
    assert.equal(next.typed, 'h');
  });

  it('una sustitución de un carácter equivale a borrar e insertar', () => {
    const withError = typeChars(createGame('hola'), 'hx');
    const replaced = applyInput(withError, 'ho', 2000); // selecciona "x" y escribe "o"
    assert.equal(replaced.typed, 'ho');
    assert.equal(replaced.corrections, 1);
    assert.deepEqual(replaced.keystrokes, { total: 3, correct: 2, incorrect: 1 });
  });
});

describe('applyInput: entradas rechazadas', () => {
  it('rechaza el pegado (más de un carácter insertado) sin arrancar', () => {
    const game = createGame('hola');
    assert.equal(applyInput(game, 'hola', 0), game);
  });

  it('rechaza el pegado a mitad de partida', () => {
    const game = applyInput(createGame('hola'), 'h', 0);
    assert.equal(applyInput(game, 'hola', 100), game);
  });

  it('ignora los caracteres que exceden la longitud del texto', () => {
    const game = typeChars(createGame('ab'), 'ax');
    assert.equal(applyInput(game, 'axz', 5000), game);
  });

  it('ignora valores que no son string', () => {
    const game = createGame('hola');
    assert.equal(applyInput(game, null, 0), game);
    assert.equal(applyInput(game, 5, 0), game);
  });

  it('ignora instantes no finitos', () => {
    const game = createGame('hola');
    assert.equal(applyInput(game, 'h', NaN), game);
    assert.equal(applyInput(game, 'h', undefined), game);
  });
});

describe('applyInput: finalización', () => {
  it('termina cuando el texto coincide exactamente y congela finishedAt', () => {
    const game = typeChars(createGame('hola'), 'hola', 1000, 100);
    assert.equal(game.status, 'finished');
    assert.equal(game.finishedAt, 1300);
  });

  it('no termina al alcanzar la longitud con errores', () => {
    const game = typeChars(createGame('hola'), 'holx');
    assert.equal(game.status, 'running');
    assert.equal(game.finishedAt, null);
  });

  it('termina tras corregir el último error', () => {
    let game = typeChars(createGame('hola'), 'holx', 1000, 100);
    game = backspace(game, 2000);
    game = applyInput(game, 'hola', 2100);
    assert.equal(game.status, 'finished');
    assert.equal(game.finishedAt, 2100);
  });

  it('ignora cualquier entrada una vez finalizada', () => {
    const game = typeChars(createGame('ab'), 'ab');
    assert.equal(applyInput(game, 'a', 9000), game);
    assert.equal(applyInput(game, 'abc', 9000), game);
  });
});

describe('applyInput: caracteres españoles', () => {
  it('acepta ñ, tildes y signos de apertura', () => {
    const game = typeChars(createGame('¿Año?'), '¿Año?');
    assert.equal(game.status, 'finished');
    assert.deepEqual(game.keystrokes, { total: 5, correct: 5, incorrect: 0 });
  });

  it('trata una tilde descompuesta (NFD) como un solo carácter correcto', () => {
    const game = applyInput(createGame('á'), 'á', 0);
    assert.equal(game.status, 'finished');
    assert.deepEqual(game.keystrokes, { total: 1, correct: 1, incorrect: 0 });
  });

  it('distingue vocales con y sin tilde', () => {
    const game = applyInput(createGame('é'), 'e', 0);
    assert.deepEqual(game.keystrokes, { total: 1, correct: 0, incorrect: 1 });
  });
});

describe('inmutabilidad', () => {
  it('applyInput no muta el estado recibido', () => {
    const original = deepFreeze(applyInput(createGame('hola'), 'h', 0));
    const snapshot = structuredClone(original);
    applyInput(original, 'hx', 100);
    backspace(original, 200);
    assert.deepEqual(original, snapshot);
  });

  it('el nuevo estado no comparte el objeto keystrokes con el anterior', () => {
    const first = applyInput(createGame('hola'), 'h', 0);
    const second = applyInput(first, 'ho', 100);
    assert.notEqual(second.keystrokes, first.keystrokes);
  });
});

describe('restartGame', () => {
  it('vuelve a idle con el mismo texto y contadores a cero', () => {
    const played = deepFreeze(typeChars(createGame('hola'), 'hxla'));
    assert.deepEqual(restartGame(played), createGame('hola'));
  });

  it('permite reiniciar una partida terminada', () => {
    const finished = typeChars(createGame('ab'), 'ab');
    const restarted = restartGame(finished);
    assert.equal(restarted.status, 'idle');
    assert.equal(applyInput(restarted, 'a', 0).status, 'running');
  });
});

describe('getElapsedMs', () => {
  it('devuelve 0 en idle', () => {
    assert.equal(getElapsedMs(createGame('hola'), 5000), 0);
  });

  it('devuelve el tiempo desde la primera entrada mientras corre', () => {
    const game = applyInput(createGame('hola'), 'h', 1000);
    assert.equal(getElapsedMs(game, 4000), 3000);
  });

  it('devuelve 0 si now es anterior al inicio o no es finito', () => {
    const game = applyInput(createGame('hola'), 'h', 1000);
    assert.equal(getElapsedMs(game, 500), 0);
    assert.equal(getElapsedMs(game, NaN), 0);
  });

  it('queda congelado al finalizar', () => {
    const game = typeChars(createGame('ab'), 'ab', 1000, 500);
    assert.equal(getElapsedMs(game, 99_999), 500);
  });
});

describe('getStats', () => {
  it('devuelve ceros en idle', () => {
    assert.deepEqual(getStats(createGame('hola'), 0), {
      wpm: 0,
      accuracy: 0,
      elapsedMs: 0,
      errors: 0,
      corrections: 0,
    });
  });

  it('usa los caracteres correctos actuales para el WPM (neto)', () => {
    // 10 correctos + 1 error visible en 6 s → (10 / 5) / 0.1 min = 20 WPM
    const game = typeChars(createGame('abcdefghijkl'), 'abcdefghijX', 0, 600);
    const stats = getStats(game, 6000);
    assert.equal(stats.wpm, 20);
    assert.equal(stats.errors, 1);
  });

  it('la precisión incluye los errores ya corregidos', () => {
    let game = typeChars(createGame('abcd'), 'abX', 0, 100);
    game = backspace(game, 300);
    game = typeChars(game, 'cd', 400, 100);
    const stats = getStats(game, 10_000);
    assert.equal(game.status, 'finished');
    assert.equal(stats.accuracy, 80); // 4 correctas de 5 pulsaciones
    assert.equal(stats.errors, 1);
    assert.equal(stats.corrections, 1);
  });

  it('las estadísticas finales no cambian con el paso del tiempo', () => {
    const game = typeChars(createGame('abcde'), 'abcde', 0, 1000);
    assert.deepEqual(getStats(game, 4000), getStats(game, 1_000_000));
  });
});

// --- T4c: segmentos ---------------------------------------------------------

// "ab cd ef" en tres segmentos: "ab " [0,3) · "cd " [3,6) · "ef" [6,8)
const SEG_TEXT = 'ab cd ef';
const SEG_ENDS = [3, 6, 8];

function segGame() {
  return createGame(SEG_TEXT, { segmentEnds: SEG_ENDS });
}

describe('createGame: segmentos', () => {
  it('acepta límites de segmento y empieza en el segmento 0', () => {
    const game = segGame();
    assert.deepEqual(game.segmentEnds, [3, 6, 8]);
    assert.equal(game.segmentIndex, 0);
  });

  it('acepta los límites generados por splitIntoChunks', () => {
    const text = 'uno dos tres cuatro cinco';
    const ends = splitIntoChunks(text, 2).map((c) => c.end);
    assert.deepEqual(createGame(text, { segmentEnds: ends }).segmentEnds, [8, 20, 25]);
  });

  it('valida los límites contra el texto normalizado (NFC)', () => {
    assert.equal(createGame('canción', { segmentEnds: [7] }).text, 'canción');
    assert.throws(() => createGame('canción', { segmentEnds: [8] }), TypeError);
  });

  it('lanza TypeError con límites inválidos', () => {
    const bad = [
      'x', null, [], [8.5], [NaN], ['8'],
      [3, 3, 8], [6, 3, 8], [0, 8], [-1, 8],
      [3, 6], [3, 6, 9],
    ];
    for (const segmentEnds of bad) {
      assert.throws(
        () => createGame(SEG_TEXT, { segmentEnds }),
        TypeError,
        `segmentEnds: ${JSON.stringify(segmentEnds)}`
      );
    }
  });

  it('guarda una copia: mutar el array original no altera el estado', () => {
    const ends = [3, 6, 8];
    const game = createGame(SEG_TEXT, { segmentEnds: ends });
    ends[0] = 99;
    assert.deepEqual(game.segmentEnds, [3, 6, 8]);
  });
});

describe('applyInput: segmentos', () => {
  it('permite escribir y corregir dentro del segmento activo', () => {
    let game = typeChars(segGame(), 'ax');
    game = backspace(game, 5000);
    game = applyInput(game, 'ab', 5100);
    assert.equal(game.typed, 'ab');
    assert.equal(game.corrections, 1);
    assert.equal(game.segmentIndex, 0);
  });

  it('el espacio final completa el segmento y activa el siguiente de inmediato', () => {
    const game = typeChars(segGame(), 'ab ');
    assert.equal(game.typed, 'ab ');
    assert.equal(game.segmentIndex, 1);
  });

  it('la frontera no bloquea la primera letra del siguiente segmento', () => {
    const atBoundary = typeChars(segGame(), 'ab ');
    const next = applyInput(atBoundary, 'ab c', 9000);
    assert.notEqual(next, atBoundary);
    assert.equal(next.typed, 'ab c');
    assert.deepEqual(next.keystrokes, { total: 4, correct: 4, incorrect: 0 });
  });

  it('la primera letra incorrecta del siguiente segmento se acepta como error', () => {
    const next = applyInput(typeChars(segGame(), 'ab '), 'ab x', 9000);
    assert.equal(next.typed, 'ab x');
    assert.equal(next.keystrokes.incorrect, 1);
  });

  it('no avanza si el segmento llega a su final con errores', () => {
    const game = typeChars(segGame(), 'ax ');
    assert.equal(game.typed, 'ax ');
    assert.equal(game.segmentIndex, 0);
  });

  it('impide escribir más allá del final del segmento activo con errores', () => {
    const game = typeChars(segGame(), 'ax ');
    const next = applyInput(game, 'ax c', 9000);
    assert.equal(next, game);
    assert.equal(next.keystrokes.total, 3);
  });

  it('un espacio incorrecto al final impide avanzar hasta corregirlo', () => {
    let game = typeChars(segGame(), 'abx');
    assert.equal(game.segmentIndex, 0);
    assert.equal(applyInput(game, 'abxc', 9000), game);
    game = backspace(game, 9100);
    game = applyInput(game, 'ab ', 9200);
    assert.equal(game.segmentIndex, 1);
  });

  it('avanza al corregir el último error del segmento', () => {
    let game = typeChars(segGame(), 'ax ');
    game = applyInput(game, 'ax', 9000);
    game = applyInput(game, 'a', 9100);
    game = typeChars(game, 'b ', 9200);
    assert.equal(game.segmentIndex, 1);
  });

  it('impide borrar dentro de un segmento cerrado', () => {
    const game = typeChars(segGame(), 'ab ');
    assert.equal(backspace(game, 9000), game);
    assert.equal(applyInput(game, '', 9000), game);
  });

  it('impide sustituir texto que cruza la frontera de un segmento cerrado', () => {
    const game = typeChars(segGame(), 'ab c');
    assert.equal(applyInput(game, 'aXc', 9000), game);
    assert.equal(applyInput(game, 'ab', 9000), game);
  });

  it('permite borrar hasta el inicio del segmento activo, pero no más', () => {
    let game = typeChars(segGame(), 'ab cx');
    game = applyInput(game, 'ab ', 9000);
    assert.equal(game.typed, 'ab ');
    assert.equal(game.segmentIndex, 1);
    assert.equal(backspace(game, 9100), game);
  });

  it('el avance no detiene ni reinicia el cronómetro', () => {
    const game = typeChars(segGame(), 'ab cd', 1000, 100);
    assert.equal(game.status, 'running');
    assert.equal(game.startedAt, 1000);
    assert.equal(game.finishedAt, null);
    assert.equal(getElapsedMs(game, 3000), 2000);
  });

  it('mantiene los contadores globales entre segmentos', () => {
    let game = typeChars(segGame(), 'ax', 0, 100);
    game = backspace(game, 200);
    game = typeChars(game, 'b cy', 300, 100);
    game = backspace(game, 700);
    game = typeChars(game, 'd ef', 800, 100);
    assert.equal(game.status, 'finished');
    assert.deepEqual(game.keystrokes, { total: 10, correct: 8, incorrect: 2 });
    assert.equal(game.corrections, 2);
  });

  it('el último segmento termina la partida sin avanzar más allá', () => {
    const game = typeChars(segGame(), SEG_TEXT, 1000, 100);
    assert.equal(game.status, 'finished');
    assert.equal(game.finishedAt, 1700);
    assert.equal(game.segmentIndex, 2);
  });

  it('el último segmento no termina con errores', () => {
    const game = typeChars(segGame(), 'ab cd ex');
    assert.equal(game.status, 'running');
    assert.equal(game.segmentIndex, 2);
  });

  it('un segmento de una palabra corta avanza con su espacio final', () => {
    let game = createGame('a b', { segmentEnds: [2, 3] });
    game = applyInput(game, 'a', 0);
    assert.equal(game.segmentIndex, 0);
    game = applyInput(game, 'a ', 100);
    assert.equal(game.segmentIndex, 1);
    game = applyInput(game, 'a b', 200);
    assert.equal(game.status, 'finished');
  });

  it('sigue rechazando el pegado dentro del segmento activo', () => {
    const game = typeChars(segGame(), 'ab ');
    assert.equal(applyInput(game, 'ab cd', 9000), game);
  });

  it('juega una partida completa con prepareText y splitIntoChunks', () => {
    const { text } = prepareText('  ¿Qué tal?\n«Muy» bien…  ', 100);
    const ends = splitIntoChunks(text, 2).map((c) => c.end);
    let game = createGame(text, { segmentEnds: ends });
    const seen = [];
    for (const char of text) {
      game = applyInput(game, game.typed + char, 0);
      seen.push(game.segmentIndex);
    }
    assert.equal(game.status, 'finished');
    assert.equal(game.segmentIndex, ends.length - 1);
    assert.deepEqual([...new Set(seen)], [0, 1]);
  });

  it('no muta el estado ni los límites al avanzar', () => {
    const before = deepFreeze(typeChars(segGame(), 'ab'));
    const snapshot = structuredClone(before);
    const after = applyInput(before, 'ab ', 9000);
    assert.equal(after.segmentIndex, 1);
    assert.deepEqual(before, snapshot);
  });
});

describe('applyInput: escritura no secuencial (pendiente)', () => {
  // Defecto conocido (code-reviewer H2): el motor asume escritura secuencial y
  // compara solo el prefijo común. Un borrado con el cursor en mitad del texto se
  // interpreta como "borrar el resto e insertar 1 carácter" y suma una pulsación.
  // En T5b la UI fijará el cursor al final y anulará selecciones; este test
  // describe el comportamiento CORRECTO y queda pendiente como prueba de integración.
  it(
    'borrar en mitad del segmento no cuenta como pulsación',
    { todo: 'T5b: controlar cursor y selecciones desde la UI; revisar diffInput' },
    () => {
      let game = createGame('abc d', { segmentEnds: [4, 5] });
      game = typeChars(game, 'axc');
      const before = game.keystrokes;
      game = applyInput(game, 'ac', 9000); // retroceso con el cursor tras la "x"
      assert.deepEqual(game.keystrokes, before);
    }
  );
});

describe('restartGame: segmentos', () => {
  it('conserva los límites y vuelve al segmento 0', () => {
    const played = deepFreeze(typeChars(segGame(), 'ab cd'));
    const restarted = restartGame(played);
    assert.deepEqual(restarted, segGame());
    assert.equal(restarted.segmentIndex, 0);
  });
});

describe('getProgress', () => {
  it('devuelve el progreso inicial', () => {
    assert.deepEqual(getProgress(segGame()), {
      segmentIndex: 0,
      segmentCount: 3,
      typedChars: 0,
      correctChars: 0,
      ratio: 0,
    });
  });

  // T7: el progreso mide el texto recorrido; la corrección se informa aparte.
  it('el ratio depende del texto recorrido, no de su corrección', () => {
    const game = typeChars(segGame(), 'ab cx');
    assert.deepEqual(getProgress(game), {
      segmentIndex: 1,
      segmentCount: 3,
      typedChars: 5,
      correctChars: 4,
      ratio: 5 / 8,
    });
  });

  it('llega a ratio 1 al terminar', () => {
    const progress = getProgress(typeChars(segGame(), SEG_TEXT));
    assert.equal(progress.ratio, 1);
    assert.equal(progress.correctChars, 8);
    assert.equal(progress.segmentIndex, 2);
  });

  it('funciona sin segmentos configurados', () => {
    assert.deepEqual(getProgress(typeChars(createGame('hola'), 'ho')), {
      segmentIndex: 0,
      segmentCount: 1,
      typedChars: 2,
      correctChars: 2,
      ratio: 0.5,
    });
  });

  it('retrocede al borrar', () => {
    const game = backspace(typeChars(segGame(), 'ax'), 9000);
    assert.equal(getProgress(game).typedChars, 1);
  });
});

// --- T7: modos de entrenamiento ----------------------------------------------

function freeGame() {
  return createGame(SEG_TEXT, { segmentEnds: SEG_ENDS, mode: 'free' });
}

describe('createGame: modo', () => {
  it('acepta los modos libre y estricto', () => {
    assert.equal(freeGame().mode, 'free');
    assert.equal(createGame('hola', { mode: 'strict' }).mode, 'strict');
  });

  it('lanza TypeError con un modo desconocido', () => {
    for (const mode of ['libre', '', null, 1, 'FREE']) {
      assert.throws(() => createGame('hola', { mode }), TypeError, `mode: ${mode}`);
    }
  });

  it('restartGame conserva el modo', () => {
    const restarted = restartGame(deepFreeze(typeChars(freeGame(), 'ax ')));
    assert.deepEqual(restarted, freeGame());
  });

  it('restartGame puede empezar con otro modo (opción cambiada entre partidas)', () => {
    const restarted = restartGame(deepFreeze(typeChars(freeGame(), 'ax ')), { mode: 'strict' });
    assert.deepEqual(restarted, createGame(SEG_TEXT, { segmentEnds: SEG_ENDS, mode: 'strict' }));
  });

  it('restartGame valida el modo nuevo', () => {
    assert.throws(() => restartGame(freeGame(), { mode: 'otro' }), TypeError);
  });
});

describe('applyInput: modo estricto explícito', () => {
  it('conserva el bloqueo con errores al final del fragmento', () => {
    const game = typeChars(createGame(SEG_TEXT, { segmentEnds: SEG_ENDS, mode: 'strict' }), 'ax ');
    assert.equal(game.segmentIndex, 0);
    assert.equal(applyInput(game, 'ax c', 9000), game);
  });
});

describe('applyInput: modo libre', () => {
  it('completa un fragmento con errores y activa el siguiente', () => {
    const game = typeChars(freeGame(), 'ax ');
    assert.equal(game.typed, 'ax ');
    assert.equal(game.segmentIndex, 1);
    assert.deepEqual(game.keystrokes, { total: 3, correct: 2, incorrect: 1 });
  });

  it('un error en el espacio final no bloquea el avance', () => {
    const game = typeChars(freeGame(), 'abx');
    assert.equal(game.segmentIndex, 1);
    const next = applyInput(game, 'abxc', 9000);
    assert.equal(next.typed, 'abxc');
    assert.equal(next.keystrokes.correct, 3);
  });

  it('la primera letra del siguiente fragmento nunca queda bloqueada', () => {
    const atBoundary = typeChars(freeGame(), 'ax ');
    const next = applyInput(atBoundary, 'ax c', 9000);
    assert.notEqual(next, atBoundary);
    assert.equal(next.typed, 'ax c');
  });

  it('permite corregir con retroceso dentro del fragmento activo', () => {
    let game = typeChars(freeGame(), 'ax');
    game = backspace(game, 5000);
    game = applyInput(game, 'ab', 5100);
    assert.equal(game.typed, 'ab');
    assert.equal(game.segmentIndex, 0);
    assert.equal(game.corrections, 1);
  });

  it('no permite modificar un fragmento completado con errores', () => {
    const game = typeChars(freeGame(), 'ax ');
    assert.equal(backspace(game, 9000), game);
    assert.equal(applyInput(game, '', 9000), game);
    assert.equal(applyInput(game, 'ab ', 9000), game);
  });

  it('permite borrar hasta el inicio del fragmento activo, pero no más', () => {
    let game = typeChars(freeGame(), 'ax cy');
    game = backspace(game, 9000);
    assert.equal(game.typed, 'ax c');
    game = backspace(game, 9100);
    assert.equal(game.typed, 'ax ');
    assert.equal(backspace(game, 9200), game);
  });

  it('termina la partida con errores al recorrer todo el texto', () => {
    const game = typeChars(freeGame(), 'ax cd eZ', 1000, 100);
    assert.equal(game.status, 'finished');
    assert.equal(game.finishedAt, 1700);
    assert.equal(game.segmentIndex, 2);
    assert.deepEqual(game.keystrokes, { total: 8, correct: 6, incorrect: 2 });
  });

  it('no termina antes de recorrer el último carácter', () => {
    const game = typeChars(freeGame(), 'ax cd e');
    assert.equal(game.status, 'running');
  });

  it('rechaza cualquier entrada tras terminar', () => {
    const game = typeChars(freeGame(), 'ax cd eZ');
    assert.equal(backspace(game, 9000), game);
    assert.equal(applyInput(game, 'ax cd eZz', 9000), game);
  });

  it('los errores corregidos siguen contando en las estadísticas', () => {
    let game = typeChars(freeGame(), 'ax', 0, 100);
    game = backspace(game, 200);
    game = typeChars(game, 'b cd ef', 300, 100);
    assert.equal(game.status, 'finished');
    assert.deepEqual(game.keystrokes, { total: 9, correct: 8, incorrect: 1 });
    assert.equal(getStats(game, 0).errors, 1);
  });

  it('las entradas rechazadas no cuentan como pulsaciones', () => {
    const game = typeChars(freeGame(), 'ax ');
    const pasted = applyInput(game, 'ax cd', 9000);
    const intoClosed = applyInput(game, 'ab ', 9000);
    assert.equal(pasted, game);
    assert.equal(intoClosed, game);
    assert.equal(game.keystrokes.total, 3);
  });

  it('el WPM usa solo los caracteres correctos y la precisión todas las pulsaciones', () => {
    // 6 de 8 caracteres correctos en 60 s → (6 / 5) WPM; 6 de 8 pulsaciones correctas.
    const game = typeChars(freeGame(), 'ax cd eZ', 0, 60_000 / 7);
    const stats = getStats(game, 0);
    assert.ok(Math.abs(stats.wpm - 6 / 5) < 1e-9);
    assert.equal(stats.accuracy, 75);
    assert.equal(stats.errors, 2);
  });

  it('el progreso avanza con el texto recorrido aunque tenga errores', () => {
    const progress = getProgress(typeChars(freeGame(), 'ax c'));
    assert.equal(progress.typedChars, 4);
    assert.equal(progress.correctChars, 3);
    assert.equal(progress.ratio, 0.5);
    assert.equal(progress.segmentIndex, 1);
  });

  it('el cronómetro y los contadores son globales entre fragmentos', () => {
    const game = typeChars(freeGame(), 'ax cy', 1000, 100);
    assert.equal(game.startedAt, 1000);
    assert.equal(game.status, 'running');
    assert.deepEqual(game.keystrokes, { total: 5, correct: 3, incorrect: 2 });
  });

  it('un texto de un solo fragmento termina con errores', () => {
    const game = typeChars(createGame('hola', { mode: 'free' }), 'hoxa');
    assert.equal(game.status, 'finished');
  });

  it('no muta el estado al avanzar con errores', () => {
    const before = deepFreeze(typeChars(freeGame(), 'ax'));
    const snapshot = structuredClone(before);
    const after = applyInput(before, 'ax ', 9000);
    assert.equal(after.segmentIndex, 1);
    assert.deepEqual(before, snapshot);
  });
});
