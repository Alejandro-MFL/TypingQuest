import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  formatValidationError,
  charStates,
  formatLiveWpm,
  spaceHintPosition,
  isFragmentBlocked,
  resolveNotice,
  formatResultsSummary,
  formatMode,
  historyStatusMessage,
  saveErrorMessage,
  isModeLocked,
  formatSelectedMode,
  renderSaveError,
  isRealFocusLoss,
  keepsTypingFocus,
} from '../js/ui.js';
import { splitIntoChunks } from '../js/chunks.js';
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

describe('spaceHintPosition', () => {
  // "ab cd ef" en fragmentos de 1 palabra: "ab " · "cd " · "ef"
  const TEXT = 'ab cd ef';
  const CHUNKS = splitIntoChunks(TEXT, 1);

  function play(values) {
    let state = createGame(TEXT, { segmentEnds: CHUNKS.map((c) => c.end) });
    for (const value of values) state = applyInput(state, value, 0);
    return state;
  }

  it('devuelve null durante la escritura normal', () => {
    assert.equal(spaceHintPosition(play([]), CHUNKS), null);
    assert.equal(spaceHintPosition(play(['a']), CHUNKS), null);
  });

  it('devuelve la posición del espacio final cuando el jugador llega a él', () => {
    assert.equal(spaceHintPosition(play(['a', 'ab']), CHUNKS), 2);
  });

  it('también en fragmentos intermedios posteriores', () => {
    assert.equal(spaceHintPosition(play(['a', 'ab', 'ab ', 'ab c', 'ab cd']), CHUNKS), 5);
  });

  it('vuelve a null al escribir el espacio y avanzar', () => {
    assert.equal(spaceHintPosition(play(['a', 'ab', 'ab ']), CHUNKS), null);
  });

  it('vuelve a null al abandonar la posición con retroceso', () => {
    assert.equal(spaceHintPosition(play(['a', 'ab', 'a']), CHUNKS), null);
  });

  it('no se muestra en el último fragmento, que no tiene espacio final', () => {
    assert.equal(spaceHintPosition(play(['a', 'ab', 'ab ', 'ab c', 'ab cd', 'ab cd ', 'ab cd e']), CHUNKS), null);
  });

  it('no se muestra con un único fragmento ni al terminar', () => {
    const single = splitIntoChunks('ab', 7);
    let state = createGame('ab');
    state = applyInput(state, 'a', 0);
    assert.equal(spaceHintPosition(state, single), null);
    state = applyInput(state, 'ab', 0);
    assert.equal(spaceHintPosition(state, single), null);
  });
});

// --- T5c: avisos contextuales (M1, M3) y mensaje de marcas aisladas (M2) -----

describe('spaceHintPosition: solo con el fragmento correcto (M1)', () => {
  const TEXT = 'uno dos tres';
  const CHUNKS = splitIntoChunks(TEXT, 2); // "uno dos " · "tres"

  function play(values) {
    let state = createGame(TEXT, { segmentEnds: CHUNKS.map((c) => c.end) });
    for (const value of values) state = applyInput(state, value, 0);
    return state;
  }

  it('no avisa de pulsar espacio si hay errores antes del espacio final', () => {
    const state = play(['u', 'un', 'unx', 'unx ', 'unx d', 'unx do', 'unx dos']);
    assert.equal(spaceHintPosition(state, CHUNKS), null);
  });

  it('avisa cuando todo es correcto y solo falta el espacio final', () => {
    const state = play(['u', 'un', 'uno', 'uno ', 'uno d', 'uno do', 'uno dos']);
    assert.equal(spaceHintPosition(state, CHUNKS), 7);
  });
});

describe('isFragmentBlocked (M3)', () => {
  const TEXT = 'ab cd';
  const CHUNKS = splitIntoChunks(TEXT, 1); // "ab " · "cd"

  function play(values) {
    let state = createGame(TEXT, { segmentEnds: CHUNKS.map((c) => c.end) });
    for (const value of values) state = applyInput(state, value, 0);
    return state;
  }

  it('está bloqueado cuando el fragmento está lleno y tiene errores', () => {
    assert.equal(isFragmentBlocked(play(['a', 'ax', 'ax ']), CHUNKS), true);
  });

  it('no está bloqueado si el fragmento aún no está lleno', () => {
    assert.equal(isFragmentBlocked(play(['a', 'ax']), CHUNKS), false);
  });

  it('no está bloqueado si el fragmento está lleno y correcto', () => {
    assert.equal(isFragmentBlocked(play(['a', 'ab']), CHUNKS), false);
  });

  it('también detecta el último fragmento lleno con errores', () => {
    assert.equal(isFragmentBlocked(play(['a', 'ab', 'ab ', 'ab c', 'ab cx']), CHUNKS), true);
  });
});

describe('resolveNotice', () => {
  it('no muestra nada sin condiciones', () => {
    assert.equal(resolveNotice({ focusLost: false, errorsBlocking: false, spaceReady: false }), null);
  });

  it('muestra el aviso de espacio cuando procede', () => {
    assert.equal(resolveNotice({ focusLost: false, errorsBlocking: false, spaceReady: true }), 'space');
  });

  it('da prioridad al aviso de errores sobre el de espacio', () => {
    assert.equal(resolveNotice({ focusLost: false, errorsBlocking: true, spaceReady: true }), 'errors');
  });

  it('el aviso de foco perdido tiene prioridad: sin foco no se puede escribir', () => {
    assert.equal(resolveNotice({ focusLost: true, errorsBlocking: true, spaceReady: true }), 'focus');
  });
});

describe('formatValidationError: marcas combinantes aisladas (M2)', () => {
  it('muestra una tilde aislada sobre un círculo punteado para que sea visible', () => {
    const message = formatValidationError(prepareText('\u0301abc', 100));
    assert.ok(message.includes('\u25CC\u0301'), message);
  });

  it('muestra una marca tras un espacio también sobre el círculo punteado', () => {
    const message = formatValidationError(prepareText('a \u0301b', 100));
    assert.ok(message.includes('\u25CC\u0301'), message);
  });
});

describe('formatResultsSummary (B2)', () => {
  it('resume los resultados en una frase para lectores de pantalla', () => {
    assert.equal(
      formatResultsSummary({ wpm: 19.4, accuracy: 97.6, elapsedMs: 26_000, errors: 2 }),
      'Partida terminada. 19 palabras por minuto, 98 % de precisión, tiempo 0:26 y 2 errores.'
    );
  });

  it('usa el singular con un solo error', () => {
    assert.match(formatResultsSummary({ wpm: 10, accuracy: 90, elapsedMs: 60_000, errors: 1 }), /y 1 error\.$/);
  });

  it('indica cero errores en plural', () => {
    assert.match(formatResultsSummary({ wpm: 10, accuracy: 100, elapsedMs: 60_000, errors: 0 }), /y 0 errores\.$/);
  });
});

// --- T7: modos de entrenamiento ----------------------------------------------

describe('formatMode', () => {
  it('nombra cada modo en español', () => {
    assert.equal(formatMode('free'), 'Libre');
    assert.equal(formatMode('strict'), 'Estricto');
  });

  it('devuelve un texto neutro con un modo desconocido', () => {
    assert.equal(formatMode('otro'), 'Desconocido');
  });
});

describe('formatResultsSummary: modo', () => {
  it('añade el modo cuando se indica', () => {
    assert.match(
      formatResultsSummary({ wpm: 10, accuracy: 90, elapsedMs: 60_000, errors: 1 }, 'free'),
      /y 1 error. Modo libre.$/
    );
  });
});

describe('avisos en modo libre', () => {
  const TEXT = 'ab cd';
  const CHUNKS = splitIntoChunks(TEXT, 1); // "ab " · "cd"

  function playFree(values) {
    let state = createGame(TEXT, { segmentEnds: CHUNKS.map((c) => c.end), mode: 'free' });
    for (const value of values) state = applyInput(state, value, 0);
    return state;
  }

  it('el fragmento nunca queda bloqueado: los errores no impiden avanzar', () => {
    assert.equal(isFragmentBlocked(playFree(['a', 'ax']), CHUNKS), false);
    assert.equal(isFragmentBlocked(playFree(['a', 'ax', 'ax ']), CHUNKS), false);
  });

  it('«Pulsa espacio» aparece en el espacio final aunque haya errores', () => {
    assert.equal(spaceHintPosition(playFree(['a', 'ax']), CHUNKS), 2);
  });

  it('«Pulsa espacio» sigue apareciendo con el fragmento correcto', () => {
    assert.equal(spaceHintPosition(playFree(['a', 'ab']), CHUNKS), 2);
  });

  it('no aparece fuera del espacio final', () => {
    assert.equal(spaceHintPosition(playFree(['a']), CHUNKS), null);
  });
});

// --- T7: historial -------------------------------------------------------------

describe('historyStatusMessage', () => {
  it('estado vacío', () => {
    assert.equal(
      historyStatusMessage({ status: 'empty', count: 0, discarded: 0 }),
      'Todavía no hay sesiones completadas. Termina una partida para verla aquí.'
    );
  });

  it('confirma el borrado', () => {
    assert.match(historyStatusMessage({ status: 'empty', count: 0, discarded: 0, cleared: true }), /^Historial borrado./);
  });

  it('almacenamiento no disponible: el juego sigue funcionando', () => {
    assert.match(historyStatusMessage({ status: 'unavailable', count: 0, discarded: 0 }), /no está disponible.*seguir jugando/);
  });

  it('historial dañado', () => {
    assert.match(historyStatusMessage({ status: 'corrupt', count: 0, discarded: 0 }), /dañado/);
  });

  it('informa de los registros omitidos, en singular y plural', () => {
    assert.equal(historyStatusMessage({ status: 'ok', count: 2, discarded: 1 }), 'Se ha omitido 1 registro dañado.');
    assert.equal(historyStatusMessage({ status: 'ok', count: 2, discarded: 3 }), 'Se han omitido 3 registros dañados.');
  });

  it('sin mensaje cuando hay sesiones y todo es correcto', () => {
    assert.equal(historyStatusMessage({ status: 'ok', count: 2, discarded: 0 }), '');
  });
});

describe('saveErrorMessage', () => {
  it('explica cada fallo al guardar', () => {
    assert.match(saveErrorMessage('quota'), /lleno/);
    assert.match(saveErrorMessage('unavailable'), /no está disponible/);
    assert.match(saveErrorMessage('write-failed'), /No se pudo guardar/);
  });
});

// --- T7: menú Opciones ---------------------------------------------------------

describe('isModeLocked', () => {
  const idle = createGame('ab', { mode: 'free' });
  const running = applyInput(idle, 'a', 0);
  const finished = applyInput(running, 'ab', 100);

  it('permite cambiar el modo fuera de la partida', () => {
    for (const screen of ['setup', 'results', 'history']) {
      assert.equal(isModeLocked(screen, running), false, screen);
    }
    assert.equal(isModeLocked('setup', null), false);
  });

  it('permite cambiarlo en la partida antes de la primera pulsación', () => {
    assert.equal(isModeLocked('play', idle), false);
  });

  it('lo bloquea en cuanto la partida ha empezado', () => {
    assert.equal(isModeLocked('play', running), true);
  });

  it('una partida terminada ya no bloquea', () => {
    assert.equal(isModeLocked('play', finished), false);
  });
});

describe('formatSelectedMode', () => {
  it('describe el modo elegido', () => {
    assert.equal(formatSelectedMode('free'), 'Modo libre');
    assert.equal(formatSelectedMode('strict'), 'Modo estricto');
  });
});

describe('renderSaveError: región de estado sin anuncios repetidos', () => {
  // Elemento falso que cuenta las escrituras de textContent.
  function fakeEls() {
    const element = {
      writes: 0,
      value: '',
      get textContent() { return this.value; },
      set textContent(text) { this.writes++; this.value = text; },
    };
    return { resultSaveError: element };
  }

  it('escribe el mensaje una sola vez aunque se repita', () => {
    const els = fakeEls();
    renderSaveError(els, 'No se pudo guardar.');
    renderSaveError(els, 'No se pudo guardar.');
    assert.equal(els.resultSaveError.textContent, 'No se pudo guardar.');
    assert.equal(els.resultSaveError.writes, 1);
  });

  it('sin mensaje deja la región vacía, pero presente', () => {
    const els = fakeEls();
    renderSaveError(els, 'Error');
    renderSaveError(els, null);
    assert.equal(els.resultSaveError.textContent, '');
    assert.equal('hidden' in els.resultSaveError, false);
  });
});

describe('foco durante la escritura (T15.2)', () => {
  it('solo es pérdida real de foco si se juega y la ventana sigue activa', () => {
    assert.equal(isRealFocusLoss({ playing: true, windowFocused: true }), true);
    assert.equal(isRealFocusLoss({ playing: true, windowFocused: false }), false, 'cambiar de aplicación no es perder el foco');
    assert.equal(isRealFocusLoss({ playing: false, windowFocused: true }), false);
  });

  it('un clic en una zona no interactiva conserva el foco; los controles lo reciben', () => {
    const target = (match) => ({ closest: (selector) => (match && selector.includes(match) ? {} : null) });
    assert.equal(keepsTypingFocus(target(null)), true, 'estadísticas, teclado, manos');
    for (const control of ['button', 'a', 'input', 'select', 'textarea', 'label', 'summary']) {
      assert.equal(keepsTypingFocus(target(control)), false, control);
    }
    assert.equal(keepsTypingFocus(null), false);
  });
});
