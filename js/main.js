// Punto de entrada: coordina eventos, motor (game.js) e interfaz (ui.js).
// No contiene reglas de juego: toda decisión sobre la entrada la toma applyInput.
import { CONFIG } from './config.js';
import { prepareText } from './text-prep.js';
import { splitIntoChunks } from './chunks.js';
import { createGame, applyInput, restartGame, getStats, getProgress } from './game.js';
import { createSoundPlayer } from './sound.js';
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
const sound = createSoundPlayer({ enabled: CONFIG.soundEnabled });
let session = null; // { state, chunks }
let composing = false;
let statsTimer = null;
// Avisos contextuales: estado de interfaz, ajeno al motor y a las métricas.
const notices = { focusLost: false, errorsBlocking: false, spaceReady: false };
let spaceHintTimer = null;
let spaceHintAt = null;

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
  resetNotices();
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
  const attempted = els.input.value;
  const next = applyInput(previous, attempted, performance.now());
  if (next !== previous) {
    session.state = next;
    if (previous.status === 'idle') startStatsTimer();
    notices.errorsBlocking = false;
  } else if (attempted.length > previous.typed.length && ui.isFragmentBlocked(previous, session.chunks)) {
    // Intento de avanzar con el fragmento lleno de errores: el motor lo rechazó.
    notices.errorsBlocking = true;
  }
  // Rechazada: restaura el textarea. Aceptada: lo alinea con el texto normalizado.
  ui.syncInput(els.input, session.state.typed);
  render();
  if (session.state.segmentIndex > previous.segmentIndex) celebrateChunk(previous.segmentIndex);
  if (session.state.status === 'finished') {
    sound.playChunkComplete();
    finishGame();
    return;
  }
  updateSpaceHint();
  updateNotice();
}

// Efectos al completar un fragmento intermedio. Solo presentación: el nuevo
// fragmento ya está activo y el cronómetro sigue corriendo.
function celebrateChunk(completedIndex) {
  const { start, end } = session.chunks[completedIndex];
  ui.playChunkComplete(els, session.state.text.slice(start, end), CONFIG.chunkAnimationMs);
  sound.playChunkComplete();
}

// «Pulsa espacio» aparece tras esperar CONFIG.spaceHintDelayMs en el espacio final
// de un fragmento correcto, y se retira en cuanto deja de cumplirse.
function updateSpaceHint() {
  const position = isPlaying() ? ui.spaceHintPosition(session.state, session.chunks) : null;
  if (position === spaceHintAt) return;
  clearSpaceHint();
  spaceHintAt = position;
  if (position !== null) {
    spaceHintTimer = setTimeout(() => {
      notices.spaceReady = true;
      updateNotice();
    }, CONFIG.spaceHintDelayMs);
  }
}

function clearSpaceHint() {
  clearTimeout(spaceHintTimer);
  spaceHintTimer = null;
  spaceHintAt = null;
  notices.spaceReady = false;
}

function updateNotice() {
  ui.renderNotice(els, ui.resolveNotice(notices));
}

function resetNotices() {
  clearSpaceHint();
  notices.focusLost = false;
  notices.errorsBlocking = false;
  updateNotice();
}

function finishGame() {
  stopStatsTimer();
  resetNotices();
  const stats = getStats(session.state, performance.now());
  ui.renderResults(els, stats);
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
  // Una pulsación es una interacción válida para crear o reanudar el audio.
  sound.unlock();
  const shortcut = (event.ctrlKey || event.metaKey) && BLOCKED_SHORTCUTS.has(event.key?.toLowerCase());
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
  // El textarea tiene pointer-events: none; el ratón llega a través del carril.
  for (const type of ['select', 'focus']) input.addEventListener(type, keepCaretAtEnd);
  for (const type of ['paste', 'drop', 'cut']) input.addEventListener(type, (e) => e.preventDefault());
  input.addEventListener('focus', () => {
    notices.focusLost = false;
    updateNotice();
  });
  input.addEventListener('blur', () => {
    if (!isPlaying()) return;
    notices.focusLost = true;
    updateNotice();
  });
  els.lane.addEventListener('click', () => {
    if (isPlaying()) input.focus();
  });
}

// --- Resultados ----------------------------------------------------------------

function handleRetry() {
  ui.clearResultsAnnouncement(els);
  session.state = restartGame(session.state);
  enterPlay();
}

function handleNewText() {
  returnToSetup();
  els.sourceText.select();
}

// Abandona la partida en curso: se descarta el progreso y se vuelve a la
// preparación con el texto original intacto para reutilizarlo o editarlo.
function handleExit() {
  returnToSetup();
}

// Vuelta a la preparación: detiene cronómetro, avisos y efectos de la partida.
function returnToSetup() {
  stopStatsTimer();
  resetNotices();
  ui.clearChunkEffects(els);
  ui.clearResultsAnnouncement(els);
  composing = false;
  session = null;
  ui.showScreen(els, 'setup');
  els.sourceText.focus();
}

// --- Sonido --------------------------------------------------------------------

function handleSoundToggle() {
  const enabled = sound.toggle();
  if (enabled) sound.unlock();
  ui.renderSoundToggle(els, enabled);
  // Pulsar el botón no debe sacar al jugador de la partida.
  if (isPlaying()) els.input.focus();
}

// --- Inicio --------------------------------------------------------------------

function init() {
  els.setupForm.addEventListener('submit', handleSetupSubmit);
  els.sourceText.addEventListener('input', updateSourceCount);
  els.retryButton.addEventListener('click', handleRetry);
  els.newTextButton.addEventListener('click', handleNewText);
  els.exitButton.addEventListener('click', handleExit);
  els.soundToggle.addEventListener('click', handleSoundToggle);
  els.startButton.addEventListener('click', () => sound.unlock());
  bindTypingInput();
  ui.setChunkAnimationMs(els, CONFIG.chunkAnimationMs);
  ui.renderSoundToggle(els, sound.isEnabled());
  updateSourceCount();
  ui.showScreen(els, 'setup');
  els.sourceText.focus();
}

init();
