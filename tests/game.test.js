import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyInput,
  restartGame,
  getElapsedMs,
  getStats,
} from '../js/game.js';

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
