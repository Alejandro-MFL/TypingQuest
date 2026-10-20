// Punto de entrada: coordina eventos, motor (game.js) e interfaz (ui.js).
// No contiene reglas de juego: toda decisión sobre la entrada la toma applyInput.
import { CONFIG } from './config.js';
import { prepareText } from './text-prep.js';
import { splitIntoChunks } from './chunks.js';
import { createGame, applyInput, restartGame, getStats, getProgress } from './game.js';
import * as ui from './ui.js';

// Escritura secuencial: solo se admite insertar al final y borrar hacia atrás.
const ALLOWED_INPUT_TYPES = new Set([
  'insertText',
  'insertCompositionText',
  'deleteContentBackward',
  'deleteWordBackward',
  'deleteSoftLineBackward',
  'deleteHardLineBackward',
]);
// Teclas que moverían el cursor fuera del final del texto.
const NAVIGATION_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown',
]);
// Atajos con Ctrl/Cmd: seleccionar todo, deshacer y rehacer.
const BLOCKED_SHORTCUTS = new Set(['a', 'z', 'y']);

const els = ui.getElements();
let session = null; // { state, chunks }
let composing = false;
let statsTimer = null;

// --- Preparación ---------------------------------------------------------------

function updateSourceCount() {
  const { length } = prepareText(els.sourceText.value, CONFIG.maxTextLength);
  ui.renderSourceCount(els, length, CONFIG.maxTextLength);
}

function handleSetupSubmit(event) {
  event.preventDefault();
  const result = prepareText(els.sourceText.value, CONFIG.maxTextLength);
  const message = ui.formatValidationError(result);
  ui.renderSetupError(els, message);
  if (message) {
    els.sourceText.focus();
    return;
  }
  const chunks = splitIntoChunks(result.text, CONFIG.wordsPerChunk);
  const state = createGame(result.text, { segmentEnds: chunks.map((c) => c.end) });
  session = { state, chunks };
  enterPlay();
}

// --- Partida -------------------------------------------------------------------

function enterPlay() {
  stopStatsTimer();
  composing = false;
  ui.showScreen(els, 'play');
  ui.syncInput(els.input, session.state.typed);
  render();
  els.input.focus();
}

function isPlaying() {
  return session !== null && !els.screens.play.hidden && session.state.status !== 'finished';
}

function render() {
  const { state, chunks } = session;
  ui.renderChunks(els, state, chunks);
  ui.renderProgress(els, getProgress(state));
  ui.renderStats(els, getStats(state, performance.now()), CONFIG.minWpmElapsedMs);
}

function processInput() {
  if (!isPlaying()) return;
  const previous = session.state;
  const next = applyInput(previous, els.input.value, performance.now());
  if (next !== previous) {
    session.state = next;
    if (previous.status === 'idle') startStatsTimer();
  }
  // Rechazada: restaura el textarea. Aceptada: lo alinea con el texto normalizado.
  ui.syncInput(els.input, session.state.typed);
  render();
  if (session.state.status === 'finished') finishGame();
}

function finishGame() {
  stopStatsTimer();
  const stats = getStats(session.state, performance.now());
  ui.renderResults(els, stats);
  ui.setFocusHint(els, false);
  ui.showScreen(els, 'results');
  els.retryButton.focus();
}

function startStatsTimer() {
  stopStatsTimer();
  statsTimer = setInterval(() => {
    ui.renderStats(els, getStats(session.state, performance.now()), CONFIG.minWpmElapsedMs);
  }, CONFIG.statsRefreshMs);
}

function stopStatsTimer() {
  clearInterval(statsTimer);
  statsTimer = null;
}

// --- Control de la entrada (escritura secuencial) ------------------------------

function isCaretAtEnd(input) {
  const end = input.value.length;
  return input.selectionStart === end && input.selectionEnd === end;
}

function handleBeforeInput(event) {
  if (!ALLOWED_INPUT_TYPES.has(event.inputType)) {
    event.preventDefault();
    return;
  }
  // La composición no es cancelable; fuera de ella, solo se edita desde el final.
  if (!event.isComposing && event.inputType !== 'insertCompositionText' && !isCaretAtEnd(els.input)) {
    event.preventDefault();
    ui.moveCaretToEnd(els.input);
  }
}

function handleInput(event) {
  // Durante una composición (teclas muertas, IME) se espera al compositionend.
  if (composing || event.isComposing) return;
  processInput();
}

function handleKeyDown(event) {
  const shortcut = (event.ctrlKey || event.metaKey) && BLOCKED_SHORTCUTS.has(event.key.toLowerCase());
  if (NAVIGATION_KEYS.has(event.key) || shortcut) event.preventDefault();
}

function keepCaretAtEnd() {
  if (!composing) ui.moveCaretToEnd(els.input);
}

function bindTypingInput() {
  const { input } = els;
  input.addEventListener('beforeinput', handleBeforeInput);
  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeyDown);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => {
    composing = false;
    processInput();
  });
  for (const type of ['select', 'pointerup', 'focus']) input.addEventListener(type, keepCaretAtEnd);
  for (const type of ['paste', 'drop', 'cut']) input.addEventListener(type, (e) => e.preventDefault());
  input.addEventListener('focus', () => ui.setFocusHint(els, false));
  input.addEventListener('blur', () => {
    if (isPlaying()) ui.setFocusHint(els, true);
  });
  els.lane.addEventListener('click', () => {
    if (isPlaying()) input.focus();
  });
}

// --- Resultados ----------------------------------------------------------------

function handleRetry() {
  session.state = restartGame(session.state);
  enterPlay();
}

function handleNewText() {
  stopStatsTimer();
  session = null;
  ui.showScreen(els, 'setup');
  els.sourceText.focus();
  els.sourceText.select();
}

// --- Inicio --------------------------------------------------------------------

function init() {
  els.setupForm.addEventListener('submit', handleSetupSubmit);
  els.sourceText.addEventListener('input', updateSourceCount);
  els.retryButton.addEventListener('click', handleRetry);
  els.newTextButton.addEventListener('click', handleNewText);
  bindTypingInput();
  updateSourceCount();
  ui.showScreen(els, 'setup');
  els.sourceText.focus();
}

init();
