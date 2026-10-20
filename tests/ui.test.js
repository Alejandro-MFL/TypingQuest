import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatValidationError, charStates, formatLiveWpm } from '../js/ui.js';
import { createGame, applyInput } from '../js/game.js';
import { prepareText } from '../js/text-prep.js';

describe('formatTime', () => {
  it('formatea minutos y segundos con dos dígitos', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(5_999), '0:05');
    assert.equal(formatTime(65_000), '1:05');
    assert.equal(formatTime(600_000), '10:00');
  });

  it('devuelve 0:00 con valores no válidos', () => {
    assert.equal(formatTime(-1), '0:00');
    assert.equal(formatTime(NaN), '0:00');
  });
});

describe('formatLiveWpm', () => {
  it('oculta el WPM hasta alcanzar el tiempo mínimo (evita picos al empezar)', () => {
    assert.equal(formatLiveWpm({ wpm: 120000, elapsedMs: 0.5 }, 1000), '—');
    assert.equal(formatLiveWpm({ wpm: 0, elapsedMs: 0 }, 1000), '—');
  });

  it('muestra el WPM redondeado a partir del tiempo mínimo', () => {
    assert.equal(formatLiveWpm({ wpm: 41.6, elapsedMs: 1000 }, 1000), '42');
    assert.equal(formatLiveWpm({ wpm: 7.2, elapsedMs: 60_000 }, 1000), '7');
  });
});

describe('formatValidationError', () => {
  it('devuelve null si el texto es válido', () => {
    assert.equal(formatValidationError(prepareText('hola', 10)), null);
  });

  it('explica el texto vacío', () => {
    assert.match(formatValidationError(prepareText('  ', 10)), /Escribe o pega un texto/);
  });

  it('indica la longitud recibida y el máximo', () => {
    const message = formatValidationError(prepareText('a'.repeat(6000), 5000));
    assert.match(message, /6000 caracteres/);
    assert.match(message, /máximo es 5000/);
  });

  it('enumera los caracteres no soportados', () => {
    const message = formatValidationError(prepareText('hola 😀 🎉', 100));
    assert.match(message, /😀 🎉/);
  });

  it('limita la lista de caracteres no soportados', () => {
    const emojis = [...'😀😁😂😃😄😅😆😇😈😉😊😋'];
    const message = formatValidationError({ error: 'unsupported-chars', chars: emojis });
    assert.ok(message.includes('😉…'));
    assert.ok(!message.includes('😊'));
  });
});

describe('charStates', () => {
  const chunk = { start: 3, end: 6 };

  it('marca correctos, incorrectos, el carácter actual y los pendientes', () => {
    let state = createGame('ab cd ef', { segmentEnds: [3, 6, 8] });
    for (const value of ['a', 'ab', 'ab ', 'ab x']) state = applyInput(state, value, 0);
    assert.deepEqual(charStates(state, chunk), [
      { char: 'c', status: 'incorrect', isSpace: false },
      { char: 'd', status: 'current', isSpace: false },
      { char: ' ', status: 'pending', isSpace: true },
    ]);
  });

  it('marca un espacio incorrecto como espacio', () => {
    let state = createGame('ab cd', { segmentEnds: [3, 5] });
    for (const value of ['a', 'ab', 'abx']) state = applyInput(state, value, 0);
    assert.deepEqual(charStates(state, { start: 0, end: 3 })[2], {
      char: ' ',
      status: 'incorrect',
      isSpace: true,
    });
  });

  it('no muestra cursor cuando la partida ha terminado', () => {
    let state = createGame('ab');
    for (const value of ['a', 'ab']) state = applyInput(state, value, 0);
    assert.ok(charStates(state, { start: 0, end: 2 }).every((c) => c.status === 'correct'));
  });
});
