// 02.2: el marcador de Música (carácter «current» que pinta el carril con charStates, el
// mismo de la partida normal) debe ser SIEMPRE el índice efectivo del motor
// (game.typed.length), también con lecturas del vídeo entre pulsaciones, pausas,
// reanudaciones y cambios de frase. Reloj y reproductor falsos. Letras INVENTADAS.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { charStates } from '../js/ui.js';
import { buildPhrases } from '../js/music-sync.js';
import {
  createPractice, startPractice, goToPhrase, repeatPhrase, tickPractice, typePhrase, restartPractice,
} from '../js/music-practice.js';

const phrases = buildPhrases([
  { timeMs: 15_000, text: '¿Qué tal, Ñandú?' },
  { timeMs: 20_000, text: 'hola mundo' },
  { timeMs: 26_000, text: 'fin.' },
]);

// Lo que pinta el carril de Música para la frase actual.
function painted(state) {
  const chars = charStates(state.game, { start: 0, end: state.game.text.length });
  return {
    marker: chars.findIndex((c) => c.status === 'current'),
    done: chars.filter((c) => c.status === 'correct' || c.status === 'incorrect').length,
  };
}

// El marcador está justo en el siguiente carácter que corresponde escribir.
function assertMarker(state, label = '') {
  const { marker, done } = painted(state);
  assert.equal(done, state.game.typed.length, `caracteres escritos ${label}`);
  const expected = state.game.typed.length < state.game.text.length ? state.game.typed.length : -1;
  assert.equal(marker, expected, `marcador ${label}`);
}

const tick = (state, t, playerState = 'playing', now = t) =>
  tickPractice(state, { offsetMs: 0, now, timeMs: t, playerState }).state;

// Arranca y deja que la primera frase aparezca (00:14).
function shownFirst() {
  let { state } = startPractice(createPractice(phrases), { offsetMs: 0, now: 13_000 });
  state = tick(state, 13_000);
  return tick(state, 14_000);
}

// Escribe `value` (valor completo del campo) en `now`, como el evento input.
const type = (state, value, now, timeMs = now) => typePhrase(state, value, now, { offsetMs: 0, timeMs }).state;

// Escribe `text` tecla a tecla con una lectura del vídeo ENTRE cada pulsación.
function typeWithTicks(state, text, startAt, stepMs = 200) {
  let current = state;
  let now = startAt;
  for (const char of text) {
    const index = current.index;
    current = type(current, current.game.typed + char, now);
    if (current.index === index && current.status === 'active') assertMarker(current, `tras «${char}»`);
    current = tick(current, now + stepMs / 2, 'playing', now + stepMs / 2);
    if (current.index === index && current.status === 'active') assertMarker(current, `tras la lectura del vídeo`);
    now += stepMs;
  }
  return current;
}

describe('marcador de Música = índice del motor', () => {
  it('1-2. carácter a carácter, con lecturas del vídeo entre pulsaciones', () => {
    let state = shownFirst();
    assertMarker(state, 'al aparecer');
    state = typeWithTicks(state, '¿Qué', 14_100);
    assert.equal(state.game.typed, '¿Qué');
  });

  it('3. escritura rápida (sin lecturas entre teclas)', () => {
    let state = shownFirst();
    for (const [i, value] of ['¿', '¿Q', '¿Qu', '¿Qué', '¿Qué '].entries()) {
      state = type(state, value, 14_100 + i * 30);
      assertMarker(state, value);
    }
  });

  it('4-6. correctos, errores y retroceso', () => {
    let state = shownFirst();
    state = type(state, '¿', 14_100);
    state = type(state, '¿X', 14_200);
    assertMarker(state, 'con error');
    assert.equal(painted(state).done, 2);
    state = tick(state, 14_300);
    assertMarker(state, 'error tras lectura');
    state = type(state, '¿', 14_400);
    assertMarker(state, 'tras retroceso');
    assert.equal(painted(state).marker, 1, 'vuelve solo por el retroceso');
  });

  it('7-8. espacios, puntuación y Unicode (Ñ y vocal compuesta con tecla muerta)', () => {
    let state = typeWithTicks(shownFirst(), '¿Qué tal, ', 14_100, 100);
    state = type(state, '¿Qué tal, Ñ', 15_200); // NFC: «Ñ» es UN carácter
    assert.equal(state.game.typed, '¿Qué tal, Ñ');
    assertMarker(state, 'tras Ñ compuesta');
  });

  it('9 y 12. frase pendiente durante la pausa: el marcador no se mueve con la pausa ni al reanudar', () => {
    let state = typeWithTicks(shownFirst(), '¿Qué', 14_100, 100);
    for (let t = 15_000; t < 19_700; t += 100) state = tick(state, t);
    const paused = tickPractice(state, { offsetMs: 0, now: 19_700, timeMs: 19_700, playerState: 'playing' });
    assert.deepEqual(paused.command, { type: 'pause' });
    state = paused.state;
    assertMarker(state, 'en pausa');
    state = tick(state, 19_710, 'paused', 30_000);
    assertMarker(state, 'lecturas en pausa');
    assert.equal(state.game.typed, '¿Qué');
  });

  it('10-11. frase completada antes de tiempo: la siguiente empieza con el marcador en 0', () => {
    let state = typeWithTicks(shownFirst(), '¿Qué tal, Ñandú?', 14_100, 100);
    assert.equal(state.index, 1);
    assert.equal(state.game.typed, '');
    state = tick(state, 19_000);
    assertMarker(state, 'siguiente frase');
    state = typeWithTicks(state, 'hola', 19_100, 100);
    assertMarker(state, 'segunda frase');
  });

  it('13. repetir frase: conserva lo escrito y el marcador; el vídeo vuelve atrás sin reiniciar la escritura', () => {
    let state = typeWithTicks(shownFirst(), '¿Qu', 14_100, 100);
    state = repeatPhrase(state, { offsetMs: 0, now: 15_000 }).state;
    assertMarker(state, 'tras repetir');
    state = tick(state, 13_100, 'playing', 15_100);
    state = tick(state, 13_300, 'playing', 15_300);
    assertMarker(state, 'lecturas tras repetir');
    assert.equal(state.game.typed, '¿Qu');
  });

  it('14. frase anterior y siguiente: el marcador al principio de la frase elegida', () => {
    let state = typeWithTicks(shownFirst(), '¿Q', 14_100, 100);
    state = goToPhrase(state, 1, { offsetMs: 0, now: 16_000 }).state;
    assertMarker(state, 'siguiente');
    assert.equal(painted(state).marker, 0);
    state = goToPhrase(state, 0, { offsetMs: 0, now: 17_000 }).state;
    assert.equal(painted(state).marker, 0);
  });

  it('15. reiniciar práctica: marcador al principio de la primera frase', () => {
    const state = restartPractice(typeWithTicks(shownFirst(), '¿Qué', 14_100), { offsetMs: 0, now: 16_000 }).state;
    assert.equal(state.index, 0);
    assert.equal(painted(state).marker, 0);
  });

  it('las lecturas del vídeo nunca cambian el estado de escritura (mismo objeto del motor)', () => {
    let state = typeWithTicks(shownFirst(), '¿Qu', 14_100, 100);
    const game = state.game;
    for (let t = 14_500; t < 15_500; t += 50) state = tick(state, t);
    assert.equal(state.game, game);
  });
});
