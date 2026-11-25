// Estado de una práctica de Música (experimento 02.1): escribir MIENTRAS suena la canción.
// Módulo PURO: sin DOM, red ni reloj (el instante llega como `now` y el tiempo del vídeo
// como `timeMs`). Las funciones devuelven { state, command }; `command` es la orden para
// el reproductor: { type: 'play', fromMs } (saltar y reproducir), { type: 'resume' }
// (seguir desde donde está, sin saltar) o { type: 'pause' }.
//
// Por frase (ver phraseTimes en music-sync.js): aparece en showAtMs (1 s antes de su
// canto), se escribe con el vídeo en marcha y, si al llegar a deadlineMs (0,3 s antes de
// la siguiente frase) sigue incompleta, el vídeo se pausa hasta terminarla; entonces se
// reanuda sin saltos. Terminar a tiempo nunca pausa ni salta. La escritura usa el motor
// de siempre (createGame/applyInput): mismas reglas, modos y errores.
import { createGame, applyInput, getProgress } from './game.js';
import { calcCpm, calcAccuracy } from './metrics.js';
import { phraseTimes, phraseForTime } from './music-sync.js';

// Al empezar o navegar, el vídeo arranca 1 s antes de que aparezca la frase.
export const PRE_ROLL_MS = 1000;
// Entre dos teclas, como mucho cuentan 2 s: una espera sin escribir no se mide entera.
export const MAX_KEY_GAP_MS = 2000;
// Diferencia con el tiempo esperado a partir de la cual se considera un salto manual.
const JUMP_TOLERANCE_MS = 1500;
// Mientras el reproductor completa un salto propio puede informar del tiempo anterior.
const SEEK_TOLERANCE_MS = 1500;
const MAX_SEEK_TICKS = 20;
// Si tras una orden de reproducir el vídeo no arranca en 1,5 s: «Continuar».
const RESUME_TIMEOUT_MS = 1500;
// Tras ordenar la pausa, el reproductor puede seguir informando «playing» un instante.
const PAUSE_GRACE_MS = 1000;
// Pausas con más retraso que esto se registran para el diagnóstico.
const LATE_TOLERANCE_MS = 50;
const MAX_DIAGNOSTICS = 50;

/** Práctica nueva (sin empezar) con las frases de buildPhrases. */
export function createPractice(phrases, { mode = 'free' } = {}) {
  return {
    phrases, mode, status: phrases.length > 0 ? 'ready' : 'empty', index: 0, game: null,
    shown: false, waiting: false, waitReason: null, pausedAtMs: null, pauseRequestedAt: null,
    resumeAt: null, blocked: false, seek: null, lastTick: null,
    typing: { lastInputAt: null, activeMs: 0 }, results: {}, diagnostics: [],
    // 02.3: cada frase escrita desde cero es un «intento» con su motivo (diagnóstico).
    attempt: 0, attemptReason: null,
  };
}

const unchanged = (state) => ({ state, command: null });
const timesOf = (state, index, ctx) => phraseTimes(state.phrases, index, ctx);

function withDiagnostic(state, entry) {
  return { ...state, diagnostics: [...state.diagnostics, entry].slice(-MAX_DIAGNOSTICS) };
}

// Frase `index` lista para escribir desde cero (todavía sin mostrar); `reason` explica el
// cambio: inicio, navegación, completada, saltada, saltada-al-reanudar o salto-del-vídeo.
function freshPhrase(state, index, reason) {
  return {
    ...state, status: 'active', index, game: createGame(state.phrases[index].text, { mode: state.mode }),
    attempt: state.attempt + 1, attemptReason: reason,
    shown: false, waiting: false, waitReason: null, pausedAtMs: null, blocked: false,
    typing: { lastInputAt: null, activeMs: 0 },
  };
}

// Salto propio a 1 s antes de que aparezca la frase (2 s antes de su canto).
function playFrom(state, index, ctx) {
  const fromMs = Math.max(0, timesOf(state, index, ctx).showAtMs - PRE_ROLL_MS);
  return {
    state: { ...state, seek: { targetMs: fromMs, ticks: 0 }, lastTick: null, resumeAt: ctx.now },
    command: { type: 'play', fromMs },
  };
}

/** Frase `index` desde cero; el vídeo salta 2 s antes de su canto. */
export function goToPhrase(state, index, ctx, reason = 'navegación') {
  if (state.status === 'empty' || index < 0 || index >= state.phrases.length) return unchanged(state);
  return playFrom(freshPhrase(state, index, reason), index, ctx);
}

export function startPractice(state, ctx) {
  return state.status === 'empty' ? unchanged(state) : goToPhrase(state, 0, ctx, 'inicio');
}

/** Vuelve a escuchar la frase actual (2 s antes de su canto) conservando lo escrito. */
export function repeatPhrase(state, ctx) {
  if (state.status === 'finished') return goToPhrase(state, state.index, ctx, 'repetición');
  if (state.status !== 'active') return unchanged(state);
  return playFrom({ ...state, waiting: false, waitReason: null, pausedAtMs: null, blocked: false }, state.index, ctx);
}

/** «Continuar» cuando el navegador bloqueó la reanudación automática. */
export function continuePlayback(state, ctx) {
  if (state.status !== 'active' && state.status !== 'finished') return unchanged(state);
  return { state: { ...state, blocked: false, resumeAt: ctx.now, lastTick: null }, command: { type: 'resume' } };
}

// Pasa a la frase siguiente (mostrada ya si su aparición pasó) o termina la práctica.
function advance(state, timeMs, ctx, reason) {
  const next = state.index + 1;
  if (next >= state.phrases.length) return { ...state, status: 'finished', waiting: false, waitReason: null };
  const prepared = freshPhrase(state, next, reason);
  return { ...prepared, shown: Number.isFinite(timeMs) && timeMs >= timesOf(prepared, next, ctx).showAtMs };
}

/** Deja la frase pendiente sin terminar (sin resultado) y sigue la canción. */
export function skipPhrase(state, ctx) {
  if (state.status !== 'active') return unchanged(state);
  const next = { ...advance(state, ctx.timeMs, ctx, 'saltada'), lastTick: null, resumeAt: ctx.now };
  return { state: next, command: state.waiting ? { type: 'resume' } : null };
}

// Durante un salto propio, los tiempos lejanos del destino se ignoran unos instantes.
function settleSeek(state, timeMs) {
  if (!state.seek) return { state, waiting: false };
  if (Math.abs(timeMs - state.seek.targetMs) <= SEEK_TOLERANCE_MS || state.seek.ticks >= MAX_SEEK_TICKS) {
    return { state: { ...state, seek: null, lastTick: null }, waiting: false };
  }
  return { state: { ...state, seek: { ...state.seek, ticks: state.seek.ticks + 1 } }, waiting: true };
}

function isJump(lastTick, tick) {
  if (!lastTick) return false;
  const expected = lastTick.playing ? lastTick.timeMs + (tick.now - lastTick.now) : lastTick.timeMs;
  return Math.abs(tick.timeMs - expected) > JUMP_TOLERANCE_MS;
}

// Tras un salto manual: la frase de ese momento, desde cero (los resultados se conservan).
function resync(state, tick) {
  const index = phraseForTime(state.phrases, tick.timeMs, tick);
  return freshPhrase(state, index, 'salto-del-vídeo');
}

function updateResume(state, tick) {
  if (state.resumeAt === null) return state;
  if (tick.playerState === 'playing') return { ...state, resumeAt: null, blocked: false };
  return tick.now - state.resumeAt >= RESUME_TIMEOUT_MS ? { ...state, blocked: true } : state;
}

// Con el vídeo detenido: si terminó con la frase a medias, se espera a terminarla.
function tickStopped(state, tick) {
  const ended = tick.playerState === 'ended' && !state.waiting;
  const next = ended ? { ...state, waiting: true, waitReason: 'ended', pausedAtMs: tick.timeMs } : state;
  return unchanged({ ...next, lastTick: { timeMs: tick.timeMs, now: tick.now, playing: false } });
}

// Aparición y límite de la frase actual con el vídeo en marcha.
function tickPlaying(state, tick) {
  const { showAtMs, deadlineMs } = timesOf(state, state.index, tick);
  const shown = state.shown || tick.timeMs >= showAtMs;
  const current = { ...state, shown, lastTick: { timeMs: tick.timeMs, now: tick.now, playing: true } };
  if (deadlineMs === null || tick.timeMs < deadlineMs) return unchanged(current);
  const paused = { ...current, waiting: true, waitReason: 'deadline', pausedAtMs: tick.timeMs, pauseRequestedAt: tick.now };
  const lateMs = tick.timeMs - deadlineMs;
  const diagnosed = lateMs > LATE_TOLERANCE_MS
    ? withDiagnostic(paused, { kind: 'late-pause', index: state.index, expectedMs: deadlineMs, observedMs: tick.timeMs, lateMs })
    : paused;
  return { state: diagnosed, command: { type: 'pause' } };
}

/**
 * Lectura del reproductor (cada 20-200 ms, ver nextTickDelay).
 * @param {{ timeMs: number, playerState: string, now: number, offsetMs: number }} tick
 */
export function tickPractice(state, tick) {
  if (!Number.isFinite(tick.timeMs) || state.status !== 'active') return unchanged(state);
  const current = updateResume(state, tick);
  if (tick.playerState !== 'playing') return tickStopped(current, tick);
  const settled = settleSeek(current, tick.timeMs);
  if (settled.waiting) return unchanged(settled.state);
  let next = settled.state;
  if (next.waiting && next.waitReason === 'deadline' && tick.now - next.pauseRequestedAt < PAUSE_GRACE_MS) {
    return unchanged(next);
  }
  // El usuario ha reanudado el vídeo sin terminar la frase pendiente: se salta.
  if (next.waiting) next = { ...advance(next, tick.timeMs, tick, 'saltada-al-reanudar'), lastTick: null };
  if (next.status !== 'active') return unchanged(next);
  if (isJump(next.lastTick, tick)) next = resync(next, tick);
  return tickPlaying(next, tick);
}

function phraseResult(game, typing) {
  return {
    correctChars: getProgress(game).correctChars,
    correct: game.keystrokes.correct,
    total: game.keystrokes.total,
    activeMs: typing.activeMs,
  };
}

// Tiempo activo: suma de los intervalos entre teclas, cada uno como mucho MAX_KEY_GAP_MS.
function addKeystroke(typing, now) {
  if (typing.lastInputAt === null) return { lastInputAt: now, activeMs: 0 };
  return { lastInputAt: now, activeMs: typing.activeMs + Math.min(Math.max(0, now - typing.lastInputAt), MAX_KEY_GAP_MS) };
}

// Orden al terminar una frase que tenía el vídeo en pausa: seguir sin saltos; solo si la
// pausa llegó cuando ya sonaba la siguiente frase, volver una vez a su límite.
function resumeCommand(state, ctx) {
  if (!state.waiting || state.waitReason !== 'deadline') return { state, command: null };
  const nextStart = timesOf(state, state.index + 1, ctx).startMs;
  if (state.pausedAtMs === null || state.pausedAtMs < nextStart) return { state, command: { type: 'resume' } };
  const fromMs = Math.max(0, nextStart - (ctx.safetyMs ?? 300));
  const entry = { kind: 'rewind', index: state.index + 1, pausedAtMs: state.pausedAtMs, fromMs };
  return { state: withDiagnostic(state, entry), command: { type: 'play', fromMs } };
}

/**
 * Valor del campo de escritura (mismas reglas que applyInput). `ctx.timeMs` es el tiempo
 * del vídeo, para mostrar en seguida la siguiente frase si su aparición ya pasó.
 * @returns {{ state: object, accepted: boolean, command: object | null }}
 */
export function typePhrase(state, value, now, ctx = {}) {
  if (state.status !== 'active' || !state.shown) return { state, accepted: false, command: null };
  const game = applyInput(state.game, value, now);
  if (game === state.game) return { state, accepted: false, command: null };
  const typing = addKeystroke(state.typing, now);
  if (game.status !== 'finished') return { state: { ...state, game, typing }, accepted: true, command: null };
  const done = { ...state, game, typing, results: { ...state.results, [state.index]: phraseResult(game, typing) } };
  const { state: diagnosed, command } = resumeCommand(done, ctx);
  const next = advance(diagnosed, ctx.timeMs, ctx, 'completada');
  const resumed = command ? { ...next, lastTick: null, resumeAt: now, seek: command.type === 'play' ? { targetMs: command.fromMs, ticks: 0 } : null } : next;
  return { state: resumed, accepted: true, command };
}

/** PPM y precisión de lo escrito (frases terminadas y la actual), con el tiempo activo. */
export function practiceTotals(state) {
  const parts = Object.values(state.results);
  if (state.game?.status === 'running') parts.push(phraseResult(state.game, state.typing));
  const sum = (key) => parts.reduce((total, part) => total + part[key], 0);
  const activeMs = sum('activeMs');
  return {
    phrasesDone: Object.keys(state.results).length,
    phrasesTotal: state.phrases.length,
    activeMs,
    cpm: calcCpm(sum('correctChars'), activeMs),
    accuracy: calcAccuracy(sum('correct'), sum('total')),
  };
}

/** Misma letra desde la primera frase, sin resultados. */
export function restartPractice(state, ctx) {
  return startPractice(createPractice(state.phrases, { mode: ctx.mode ?? state.mode }), ctx);
}
