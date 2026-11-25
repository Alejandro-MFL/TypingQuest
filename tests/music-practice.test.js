// Práctica de Música 02.1: escribir MIENTRAS suena la canción. Reloj y reproductor
// falsos (tiempos explícitos), así que las pruebas son deterministas. Letras INVENTADAS.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPractice,
  startPractice,
  goToPhrase,
  repeatPhrase,
  tickPractice,
  typePhrase,
  continuePlayback,
  skipPhrase,
  practiceTotals,
  restartPractice,
  PRE_ROLL_MS,
  MAX_KEY_GAP_MS,
} from '../js/music-practice.js';
import { buildPhrases } from '../js/music-sync.js';

// Ejemplo del enunciado: A 00:15, B 00:20, C 00:26 (anticipación 1 s, margen 0,3 s).
const phrases = buildPhrases([
  { timeMs: 15_000, text: 'ab' },
  { timeMs: 20_000, text: 'cd' },
  { timeMs: 26_000, text: 'ef' },
]);
const ctx = (extra = {}) => ({ offsetMs: 0, now: 0, ...extra });

// Reproductor falso: lectura en `t` ms (el reloj local avanza igual que el vídeo).
const tick = (state, t, playerState = 'playing', extra = {}) =>
  tickPractice(state, { ...ctx({ now: t }), timeMs: t, playerState, ...extra });

// Escribe `text` desde `startAt`, una tecla cada `stepMs` (reloj y vídeo a la vez).
function typeText(state, text, startAt, stepMs = 100) {
  let current = state;
  let typed = current.game.typed;
  let now = startAt;
  let lastCommand = null;
  for (const char of text) {
    typed += char;
    const result = typePhrase(current, typed, now, ctx({ now, timeMs: now }));
    current = result.state;
    lastCommand = result.command ?? lastCommand;
    now += stepMs;
  }
  return { state: current, command: lastCommand };
}

// Arranca y deja que el vídeo llegue al segundo `t` (lecturas cada 100 ms, ya saltado).
function startAndPlayTo(t, from = 12_000, extra = {}) {
  let { state } = startPractice(createPractice(phrases, extra), ctx({ now: from }));
  for (let time = from; time <= t; time += 100) state = tick(state, time).state;
  return state;
}

describe('inicio de la práctica', () => {
  it('salta 2 s antes del canto de la primera frase (1 s de preparación + 1 s de anticipación)', () => {
    assert.equal(PRE_ROLL_MS, 1000);
    const { state, command } = startPractice(createPractice(phrases), ctx());
    assert.deepEqual(command, { type: 'play', fromMs: 13_000 });
    assert.equal(state.status, 'active');
    assert.equal(state.index, 0);
    assert.equal(state.shown, false);
  });

  it('sin frases no empieza', () => {
    const { state, command } = startPractice(createPractice([]), ctx());
    assert.equal(state.status, 'empty');
    assert.equal(command, null);
  });
});

describe('paso 1: la frase aparece antes de cantarse', () => {
  it('a 00:13,9 aún no se ve; a 00:14 (1 s antes) sí, con el vídeo sonando', () => {
    const before = startAndPlayTo(13_900, 13_000);
    assert.equal(before.shown, false);
    const { state, command } = tick(before, 14_000);
    assert.equal(state.shown, true);
    assert.equal(command, null, 'no se pausa ni se salta nada');
  });

  it('no se puede escribir antes de que aparezca', () => {
    const before = startAndPlayTo(13_500, 13_000);
    const result = typePhrase(before, 'a', 13_500, ctx({ now: 13_500, timeMs: 13_500 }));
    assert.equal(result.accepted, false);
    assert.equal(result.state, before);
  });
});

describe('pasos 2 y 3: escribir mientras suena y terminar a tiempo', () => {
  it('se escribe con el vídeo en marcha; terminar a tiempo no pausa ni salta', () => {
    const shown = startAndPlayTo(15_000, 13_000);
    const { state, command } = typeText(shown, 'ab', 16_000, 1000); // termina a las 00:17
    assert.equal(command, null, 'ni pausa ni salto');
    assert.deepEqual(state.results[0], { correctChars: 2, correct: 2, total: 2, activeMs: 1000 });
    assert.equal(state.index, 1, 'la siguiente frase queda preparada');
    assert.equal(state.shown, false, 'y aparecerá con su anticipación');
    assert.equal(state.waiting, false);
  });

  it('la siguiente aparece en 00:19 (1 s antes de su canto) y la música sigue', () => {
    let { state } = typeText(startAndPlayTo(15_000, 13_000), 'ab', 16_000, 1000);
    for (let t = 17_100; t <= 18_900; t += 100) {
      const result = tick(state, t);
      assert.equal(result.command, null, `sin órdenes en ${t}`);
      state = result.state;
    }
    assert.equal(state.shown, false);
    state = tick(state, 19_000).state;
    assert.equal(state.shown, true);
  });

  it('si se termina después de que la siguiente ya debía verse, aparece en seguida', () => {
    let state = startAndPlayTo(19_300, 13_000);
    ({ state } = typeText(state, 'ab', 19_300, 100)); // 19,3 y 19,4 s
    assert.equal(state.index, 1);
    assert.equal(state.shown, true);
  });
});

describe('paso 4: pausa antes de la siguiente frase si la actual sigue incompleta', () => {
  it('pausa al llegar a 00:19,7 (0,3 s antes de B) y la frase pendiente sigue visible', () => {
    let state = startAndPlayTo(19_600, 13_000);
    ({ state } = typeText(state, 'a', 16_000));
    const result = tick(state, 19_700);
    assert.deepEqual(result.command, { type: 'pause' });
    assert.equal(result.state.waiting, true);
    assert.equal(result.state.shown, true);
    assert.equal(result.state.index, 0);
  });

  it('una pausa tardía se registra para el diagnóstico (sin saltos automáticos)', () => {
    const state = startAndPlayTo(19_600, 13_000);
    const { state: late, command } = tick(state, 19_850);
    assert.deepEqual(command, { type: 'pause' });
    assert.deepEqual(late.diagnostics.at(-1), { kind: 'late-pause', index: 0, expectedMs: 19_700, observedMs: 19_850, lateMs: 150 });
  });

  it('el vídeo tarda un instante en pausarse: ese «playing» residual no salta la frase', () => {
    const { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    const lagging = tick(state, 19_800, 'playing', { now: 19_800 });
    assert.equal(lagging.state.waiting, true);
    assert.equal(lagging.state.index, 0);
    assert.equal(lagging.command, null);
  });

  it('mientras espera en pausa, las lecturas no dan más órdenes (sin bucles)', () => {
    let { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    for (let t = 0; t < 20; t++) {
      const result = tick(state, 19_720, 'paused', { now: 20_000 + t * 100 });
      assert.equal(result.command, null);
      state = result.state;
    }
    assert.equal(state.waiting, true);
  });
});

describe('paso 5: reanudar al completar la frase pendiente', () => {
  it('reanuda sin salto y la siguiente frase aparece (su anticipación ya pasó)', () => {
    let { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    const result = typeText(state, 'ab', 21_000, 500);
    assert.deepEqual(result.command, { type: 'resume' }, 'continúa desde donde se pausó: no repite ni salta');
    assert.equal(result.state.waiting, false);
    assert.equal(result.state.index, 1);
    // El vídeo sigue en 00:19,7 (pausado): la frase B ya debía verse.
    assert.equal(tick(result.state, 19_750).state.shown, true);
  });

  it('si la pausa llegó tarde y el vídeo ya entró en la frase B, retrocede una vez para no perder su inicio', () => {
    let { state } = tick(startAndPlayTo(19_600, 13_000), 20_150); // muy tarde: B ya empezó
    const result = typeText(state, 'ab', 21_000, 500);
    assert.deepEqual(result.command, { type: 'play', fromMs: 19_700 });
    assert.equal(result.state.diagnostics.at(-1).kind, 'rewind');
  });

  it('si el navegador bloquea la reanudación, se ofrece «Continuar»', () => {
    let { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    ({ state } = typeText(state, 'ab', 21_000, 500));
    state = tick(state, 19_700, 'paused', { now: 21_600 }).state;
    assert.equal(state.blocked, false, 'aún dentro del margen de espera');
    state = tick(state, 19_700, 'paused', { now: 23_000 }).state;
    assert.equal(state.blocked, true);
    const result = continuePlayback(state, ctx({ now: 23_100 }));
    assert.deepEqual(result.command, { type: 'resume' });
    assert.equal(result.state.blocked, false);
    assert.equal(tick(result.state, 19_800, 'playing', { now: 23_300 }).state.blocked, false);
  });

  it('si el usuario reanuda el vídeo sin terminar, la frase pendiente se salta (sin volver a pausar en bucle)', () => {
    let { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    const result = tick(state, 19_800, 'playing', { now: 25_000 });
    assert.equal(result.state.waiting, false);
    assert.equal(result.state.index, 1);
    assert.equal(result.state.results[0], undefined, 'saltada: sin resultado');
    assert.equal(result.command, null);
  });

  it('«Saltar» desde la pausa hace lo mismo y reanuda', () => {
    const { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    const result = skipPhrase(state, ctx({ now: 21_000, timeMs: 19_700 }));
    assert.deepEqual(result.command, { type: 'resume' });
    assert.equal(result.state.index, 1);
    assert.equal(result.state.shown, true);
  });
});

describe('casos extremos', () => {
  it('desfase positivo y negativo mueven aparición y límite', () => {
    const later = startPractice(createPractice(phrases), ctx({ offsetMs: 2000 }));
    assert.deepEqual(later.command, { type: 'play', fromMs: 15_000 });
    assert.equal(tick(later.state, 15_900, 'playing', { offsetMs: 2000 }).state.shown, false);
    assert.equal(tick(later.state, 16_000, 'playing', { offsetMs: 2000 }).state.shown, true);
    const earlier = startPractice(createPractice(phrases), ctx({ offsetMs: -2000 }));
    const paused = tick(tick(earlier.state, 12_000, 'playing', { offsetMs: -2000 }).state, 17_700, 'playing', { offsetMs: -2000 });
    assert.deepEqual(paused.command, { type: 'pause' });
  });

  it('frases muy próximas: la pausa llega en su inicio y al terminar continúa', () => {
    const tight = buildPhrases([{ timeMs: 10_000, text: 'uno' }, { timeMs: 10_200, text: 'dos' }]);
    let { state } = startPractice(createPractice(tight), ctx({ now: 8000 }));
    state = tick(state, 9000).state;
    assert.equal(state.shown, true);
    const pause = tick(state, 10_000);
    assert.deepEqual(pause.command, { type: 'pause' });
    const done = typeText(pause.state, 'uno', 11_000);
    assert.deepEqual(done.command, { type: 'resume' });
  });

  it('última frase: sin límite; nunca se pausa y al terminarla acaba la práctica', () => {
    let { state } = goToPhrase(startAndPlayTo(13_000, 13_000), 2, ctx({ now: 20_000 }));
    state = tick(state, 24_000).state;
    state = tick(state, 25_000).state;
    assert.equal(state.shown, true);
    assert.equal(tick(state, 90_000, 'playing', { now: 25_100 }).command, null);
    ({ state } = typeText(state, 'ef', 26_000));
    assert.equal(state.status, 'finished');
  });

  it('si el vídeo termina con la frase a medias, espera a que se termine', () => {
    let { state } = goToPhrase(startAndPlayTo(13_000, 13_000), 2, ctx({ now: 20_000 }));
    state = tick(tick(state, 24_000).state, 25_000).state;
    state = tick(state, 30_000, 'ended').state;
    assert.equal(state.waiting, true);
    ({ state } = typeText(state, 'ef', 31_000));
    assert.equal(state.status, 'finished');
  });

  it('salto manual del vídeo hacia delante: pasa a la frase de ese momento, desde cero', () => {
    let state = startAndPlayTo(16_000, 13_000);
    ({ state } = typeText(state, 'a', 16_000));
    const result = tick(state, 27_000, 'playing', { now: 30_000 });
    assert.equal(result.state.index, 2);
    assert.equal(result.state.game.typed, '');
    assert.equal(result.command, null);
  });

  it('salto manual hacia atrás: vuelve a la frase de ese momento', () => {
    const state = startAndPlayTo(21_000, 13_000);
    const result = tick(state, 15_500, 'playing', { now: 30_000 });
    assert.equal(result.state.index, 0);
  });

  it('el salto propio (al empezar o navegar) no se confunde con uno manual', () => {
    let { state } = goToPhrase(startAndPlayTo(13_000, 13_000), 2, ctx({ now: 20_000 }));
    // El reproductor aún informa del tiempo anterior antes de completar el salto.
    state = tick(state, 13_100, 'buffering', { now: 20_050 }).state;
    state = tick(state, 13_200, 'playing', { now: 20_100 }).state;
    assert.equal(state.index, 2);
  });

  it('un tiempo no válido del reproductor se ignora', () => {
    const state = startAndPlayTo(14_000, 13_000);
    assert.equal(tick(state, NaN).state, state);
  });
});

describe('escritura con el motor de TypingQuest', () => {
  it('modo estricto: la frase no termina con errores (y se pausa en el límite)', () => {
    let state = startAndPlayTo(15_000, 13_000, { mode: 'strict' });
    ({ state } = typeText(state, 'ax', 16_000));
    assert.equal(state.index, 0);
  });

  it('modo libre: termina al recorrerla aunque tenga errores, que cuentan', () => {
    let state = startAndPlayTo(15_000, 13_000, { mode: 'free' });
    ({ state } = typeText(state, 'ax', 16_000, 500));
    assert.deepEqual(state.results[0], { correctChars: 1, correct: 1, total: 2, activeMs: 500 });
  });

  it('al cambiar de frase el motor empieza desde cero (sin caracteres duplicados)', () => {
    let state = startAndPlayTo(15_000, 13_000);
    ({ state } = typeText(state, 'ab', 16_000));
    assert.equal(state.game.typed, '');
    assert.equal(state.game.text, 'cd');
  });
});

describe('métricas: solo el tiempo activo de escritura', () => {
  it('la escucha anterior a la primera tecla no cuenta', () => {
    let state = startAndPlayTo(14_000, 13_000);
    ({ state } = typeText(state, 'ab', 18_000, 300)); // 4 s escuchando, después 0,3 s escribiendo
    assert.equal(state.results[0].activeMs, 300);
  });

  it('una espera en pausa sin escribir cuenta como máximo 2 s (no infla ni desinfla las PPM)', () => {
    assert.equal(MAX_KEY_GAP_MS, 2000);
    let { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    ({ state } = typeText(state, 'a', 19_000));
    ({ state } = typeText(state, 'b', 60_000)); // 41 s sin escribir esperando
    assert.equal(state.results[0].activeMs, 2000);
  });

  it('escribir mientras suena SÍ cuenta (no se resta el tiempo de reproducción)', () => {
    let state = startAndPlayTo(15_000, 13_000);
    ({ state } = typeText(state, 'ab', 15_000, 800));
    assert.equal(state.results[0].activeMs, 800);
  });

  it('totales con frases terminadas y la actual', () => {
    let state = startAndPlayTo(15_000, 13_000);
    ({ state } = typeText(state, 'ab', 15_000, 1000)); // 2 correctas, 1 s
    state = tick(state, 19_000).state;
    ({ state } = typeText(state, 'c', 19_100)); // en curso: 1 correcta, 0 s
    const totals = practiceTotals(state);
    assert.equal(totals.phrasesDone, 1);
    assert.equal(totals.activeMs, 1000);
    assert.equal(totals.cpm, 3 / (1000 / 60_000));
    assert.equal(totals.accuracy, 100);
  });

  it('sin nada escrito: métricas a cero, nunca NaN', () => {
    const totals = practiceTotals(createPractice(phrases));
    assert.deepEqual([totals.cpm, totals.accuracy, totals.activeMs, totals.phrasesDone], [0, 0, 0, 0]);
  });
});

describe('controles', () => {
  it('frase siguiente/anterior: escritura desde cero y el vídeo 2 s antes de su canto', () => {
    const state = startAndPlayTo(16_000, 13_000);
    const next = goToPhrase(state, 1, ctx({ now: 17_000 }));
    assert.deepEqual(next.command, { type: 'play', fromMs: 18_000 });
    assert.equal(next.state.index, 1);
    assert.equal(next.state.shown, false);
    assert.equal(goToPhrase(state, -1, ctx()).state, state);
    assert.equal(goToPhrase(state, 3, ctx()).state, state);
  });

  it('repetir fragmento: vuelve 2 s antes de su canto, conserva lo escrito y la frase visible', () => {
    let state = startAndPlayTo(16_000, 13_000);
    ({ state } = typeText(state, 'a', 16_000));
    const repeated = repeatPhrase(state, ctx({ now: 17_000 }));
    assert.deepEqual(repeated.command, { type: 'play', fromMs: 13_000 });
    assert.equal(repeated.state.game.typed, 'a');
    assert.equal(repeated.state.shown, true);
    // El salto propio hacia atrás no se trata como manual.
    assert.equal(tick(repeated.state, 13_100, 'playing', { now: 17_200 }).state.index, 0);
  });

  it('repetir desde la pausa deja de esperar y vuelve a escuchar la frase', () => {
    const { state } = tick(startAndPlayTo(19_600, 13_000), 19_700);
    const repeated = repeatPhrase(state, ctx({ now: 21_000 }));
    assert.equal(repeated.state.waiting, false);
    assert.deepEqual(repeated.command, { type: 'play', fromMs: 13_000 });
  });

  it('volver a escribir una frase sustituye su resultado', () => {
    let state = startAndPlayTo(15_000, 13_000);
    ({ state } = typeText(state, 'ab', 15_000, 1000));
    ({ state } = goToPhrase(state, 0, ctx({ now: 18_000 })));
    state = tick(state, 14_000, 'playing', { now: 18_100 }).state;
    ({ state } = typeText(state, 'ab', 18_200, 100));
    assert.equal(state.results[0].activeMs, 100);
    assert.equal(practiceTotals(state).phrasesDone, 1);
  });

  it('reiniciar: resultados borrados, primera frase y vídeo al principio de la práctica', () => {
    let state = startAndPlayTo(15_000, 13_000);
    ({ state } = typeText(state, 'ab', 15_000));
    const { state: restarted, command } = restartPractice(state, ctx());
    assert.equal(restarted.index, 0);
    assert.deepEqual(restarted.results, {});
    assert.deepEqual(command, { type: 'play', fromMs: 13_000 });
  });
});

// 02.3: cada cambio de frase o reinicio de la escritura tiene un motivo explícito.
describe('motivo de cada cambio de frase (diagnóstico)', () => {
  it('inicio, completada, navegación, salto del vídeo y saltada al reanudar', () => {
    let { state } = startPractice(createPractice(phrases), ctx({ now: 13_000 }));
    assert.deepEqual([state.attempt, state.attemptReason], [1, 'inicio']);
    state = tick(tick(state, 13_000).state, 14_000).state;
    ({ state } = typeText(state, 'ab', 15_000));
    assert.deepEqual([state.attempt, state.attemptReason], [2, 'completada']);
    ({ state } = goToPhrase(state, 2, ctx({ now: 16_000 })));
    assert.equal(state.attemptReason, 'navegación');
    state = tick(state, 24_000, 'playing', { now: 16_100 }).state;
    state = tick(state, 15_000, 'playing', { now: 18_000 }).state;
    assert.equal(state.attemptReason, 'salto-del-vídeo');
    state = tick(state, 15_100, 'playing', { now: 18_100 }).state;
    for (let t = 15_200; t <= 19_700; t += 100) state = tick(state, t, 'playing', { now: t + 2900 }).state;
    assert.equal(state.waiting, true);
    state = tick(state, 19_800, 'playing', { now: 30_000 }).state;
    assert.equal(state.attemptReason, 'saltada-al-reanudar');
  });

  it('las pulsaciones y las lecturas del vídeo no cambian el intento', () => {
    let state = startAndPlayTo(15_000, 13_000);
    const attempt = state.attempt;
    ({ state } = typeText(state, 'a', 15_100));
    state = tick(state, 15_300).state;
    assert.equal(state.attempt, attempt);
  });
});
