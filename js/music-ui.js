// Interfaz de Música (experimento 02): solo presentación. Los textos y validaciones
// son funciones PURAS (se prueban con Node); las demás pintan el DOM con textContent
// (las letras y los datos de LRCLIB nunca se interpretan como HTML).
import { charStates, keepsTypingFocus, isRealFocusLoss } from './ui.js';
import { formatTrackDuration } from './lrclib.js';
import { formatOffset, describeOffset, clampOffset } from './music-sync.js';

export const MAX_LRC_FILE_BYTES = 200_000;
const DURATION_MISMATCH_MS = 5000;

// --- Funciones puras -----------------------------------------------------------------

/** Comprueba nombre y tamaño de un archivo .lrc antes de leerlo. */
export function validateLrcFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'empty' };
  if (!/\.lrc$/i.test(file.name ?? '')) return { ok: false, error: 'extension' };
  if (file.size > MAX_LRC_FILE_BYTES) return { ok: false, error: 'too-large' };
  return { ok: true };
}

const LYRICS_MESSAGES = Object.freeze({
  extension: 'Elige un archivo con la extensión .lrc.',
  'too-large': 'El archivo es demasiado grande para una letra (máximo 200 KB).',
  empty: 'El archivo está vacío.',
  read: 'No se pudo leer el archivo. Inténtalo de nuevo.',
  'not-synced': 'La letra no tiene marcas de tiempo [mm:ss.xx]: hace falta una letra sincronizada.',
  'no-text': 'La letra no tiene frases que escribir (solo pausas o metadatos).',
  'too-large-text': 'La letra es demasiado larga.',
});

export function lyricsErrorMessage(error) {
  return LYRICS_MESSAGES[error] ?? 'No se pudo usar esta letra.';
}

const VIDEO_MESSAGES = Object.freeze({
  empty: 'Pega el enlace de un vídeo de YouTube.',
  'too-long': 'El enlace es demasiado largo.',
  'not-youtube': 'El enlace no es de YouTube. Usa una dirección como https://www.youtube.com/watch?v=…',
  'no-video': 'El enlace no apunta a un vídeo concreto (por ejemplo, es un canal o una lista).',
  load: 'No se pudo cargar el reproductor de YouTube. Revisa tu conexión o si un bloqueador lo impide.',
  invalid: 'YouTube no reconoce este vídeo.',
  html5: 'El reproductor no puede reproducir este vídeo en tu navegador.',
  'not-found': 'El vídeo no existe o es privado.',
  'not-embeddable': 'El propietario del vídeo no permite reproducirlo fuera de YouTube. Prueba con otro vídeo.',
  configuration: 'YouTube no acepta la configuración del reproductor en esta página.',
});

export function videoErrorMessage(error) {
  return VIDEO_MESSAGES[error] ?? 'No se puede reproducir este vídeo.';
}

/** Aviso si el vídeo y la letra no duran lo mismo (puede hacer falta un desfase). */
export function durationMismatchNote(videoDurationMs, lyricsDurationS) {
  if (!Number.isFinite(videoDurationMs) || !Number.isFinite(lyricsDurationS)) return null;
  if (Math.abs(videoDurationMs - lyricsDurationS * 1000) <= DURATION_MISMATCH_MS) return null;
  return `El vídeo dura ${formatTrackDuration(videoDurationMs / 1000)} y la letra ${formatTrackDuration(lyricsDurationS)}: `
    + 'puede que sea otra versión o que tengas que ajustar el desfase.';
}

/** Qué hace la práctica ahora, en una frase (02.1: se escribe mientras suena). */
export function practicePhaseText(state) {
  if (state.status === 'ready') return 'Pulsa «Empezar práctica»: cada frase aparecerá un momento antes de cantarse.';
  if (state.status === 'finished') return '¡Práctica terminada! Puedes repetir cualquier frase o reiniciar la práctica.';
  if (state.status !== 'active') return '';
  if (state.blocked) return 'El navegador ha detenido la reproducción. Pulsa «Continuar».';
  if (state.waiting) {
    return state.waitReason === 'ended'
      ? 'La canción ha terminado: termina la frase.'
      : 'Vídeo en pausa: termina la frase y la canción seguirá.';
  }
  if (state.shown) return 'Escribe la frase mientras suena.';
  return state.results[state.index - 1] ? 'Frase completada. La siguiente aparecerá en breve…' : 'La frase aparecerá un momento antes de cantarse…';
}

/** Frase actual y total (02.4: las completadas solo en las métricas, sin duplicar). */
export function phraseProgressText(state) {
  return `Frase ${state.index + 1} de ${state.phrases.length}`;
}

/** Milisegundos del deslizador (segundos con un decimal), limitados a ±30 s. */
export function offsetFromSlider(value) {
  return clampOffset(Number(value) * 1000);
}

/** Valor del deslizador para un desfase en milisegundos. */
export function sliderValue(offsetMs) {
  return String(offsetMs / 1000);
}

/** Texto accesible del deslizador: valor con signo y su significado. */
export function offsetValueText(offsetMs) {
  if (offsetMs === 0) return `${formatOffset(0)}: sin desfase`;
  const amount = formatOffset(Math.abs(offsetMs)).replace('+', '');
  return `${formatOffset(offsetMs)}: la letra aparece ${amount} ${offsetMs > 0 ? 'más tarde' : 'antes'}`;
}

/** El panel «Vídeo y letra» se abre mientras falte el vídeo o la letra. */
export function setupShouldOpen({ hasVideo, hasLyrics }) {
  return !(hasVideo && hasLyrics);
}

/** Mensaje de preparación (dentro del panel, nunca en la zona de práctica). */
export function setupStatusText({ hasVideo, hasLyrics }) {
  if (!hasVideo && !hasLyrics) return 'Carga un vídeo y elige una letra para empezar.';
  if (!hasLyrics) return 'Elige una letra sincronizada para empezar.';
  if (!hasVideo) return 'Carga el vídeo de YouTube para empezar.';
  return 'Todo listo: cierra este panel o pulsa «Empezar práctica».';
}

/**
 * 02.2: durante la práctica, si el foco entra en el reproductor (p. ej. tras un clic en
 * sus controles), las teclas dejan de llegar al campo de escritura: se devuelve al campo.
 */
export function shouldReclaimTypingFocus({ screenVisible, practiceActive, focusInPlayer, setupOpen }) {
  return screenVisible && practiceActive && focusInPlayer && !setupOpen;
}

/**
 * 02.3 (como en Academia): un clic en una zona no interactiva de la práctica (estado,
 * estadísticas, márgenes) no debe quitar el foco del campo; si ya se había perdido, lo
 * devuelve. Botones, enlaces y campos sí lo reciben.
 */
export function clickKeepsTypingFocus({ practiceActive, inputEnabled, target }) {
  return practiceActive && inputEnabled && keepsTypingFocus(target);
}

const FOCUS_LOST_NOTICE = 'Haz clic aquí para seguir escribiendo';

/** Aviso si el campo pierde el foco DENTRO de la página (cambiar de ventana no cuenta). */
export function focusLostNotice({ practiceActive, inputFocused, windowFocused }) {
  return practiceActive && !inputFocused && isRealFocusLoss({ playing: true, windowFocused }) ? FOCUS_LOST_NOTICE : '';
}

/** Si un resultado de LRCLIB se puede usar y cómo se describe. */
export function resultAvailability(result) {
  if (result.synced) return { usable: true, label: 'Letra sincronizada' };
  if (result.hasPlain) return { usable: false, label: 'Solo letra sin sincronizar' };
  if (result.instrumental) return { usable: false, label: 'Instrumental (sin letra)' };
  return { usable: false, label: 'Sin letra' };
}

// --- DOM ---------------------------------------------------------------------------------

export function getMusicElements(doc = document) {
  const byId = (id) => doc.getElementById(id);
  const ids = {
    screen: 'music-screen', setup: 'music-setup', setupSummary: 'music-setup-summary', setupStatus: 'music-setup-status',
    videoForm: 'music-video-form', url: 'music-url', videoStatus: 'music-video-status', searchForm: 'music-search-form',
    track: 'music-track', artist: 'music-artist', searchButton: 'music-search-button', searchStatus: 'music-search-status',
    results: 'music-results', file: 'music-file', lyricsStatus: 'music-lyrics-status', stage: 'music-stage',
    video: 'music-video', offset: 'music-offset', offsetValue: 'music-offset-value', offsetHelp: 'music-offset-help',
    offsetReset: 'music-offset-reset', checkButton: 'music-check-button', liveLine: 'music-live-line', note: 'music-note',
    progress: 'music-progress', phase: 'music-phase', lane: 'music-lane', chunkActive: 'music-chunk-active',
    input: 'music-input', startButton: 'music-start-button', continueButton: 'music-continue-button',
    playButton: 'music-play-button', repeatButton: 'music-repeat-button', prevButton: 'music-prev-button',
    nextButton: 'music-next-button', restartButton: 'music-restart-button', cpm: 'music-cpm',
    accuracy: 'music-accuracy', done: 'music-done', diagnostics: 'music-diagnostics',
    traceActions: 'music-trace-actions', traceCopy: 'music-trace-copy', traceDownload: 'music-trace-download',
    traceStatus: 'music-trace-status',
  };
  const els = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, byId(id)]));
  els.offsetButtons = [...doc.querySelectorAll('[data-offset-step]')];
  return els;
}

/** Mensaje de estado; solo se reescribe si cambia (región viva). */
export function renderStatus(element, message, kind = 'info') {
  const text = message ?? '';
  if (element.textContent !== text) element.textContent = text;
  element.dataset.kind = kind;
}

function resultItem(result, index) {
  const { usable, label } = resultAvailability(result);
  const item = document.createElement('li');
  item.className = `music-result${usable ? '' : ' music-result-unusable'}`;
  const title = document.createElement('p');
  title.className = 'music-result-title';
  title.textContent = `${result.track} · ${result.artist}`;
  const details = document.createElement('p');
  details.className = 'music-result-details';
  details.textContent = [result.album, formatTrackDuration(result.durationS), label].filter(Boolean).join(' · ');
  item.append(title, details);
  if (usable) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-secondary button-small';
    button.dataset.resultIndex = String(index);
    const hidden = document.createElement('span');
    hidden.className = 'visually-hidden';
    hidden.textContent = `: ${result.track} de ${result.artist}`;
    button.append('Usar esta letra', hidden);
    item.append(button);
  }
  return item;
}

export function renderResults(els, results) {
  els.results.replaceChildren(...results.map(resultItem));
}

export function renderOffset(els, offsetMs) {
  els.offset.value = sliderValue(offsetMs);
  els.offset.setAttribute('aria-valuetext', offsetValueText(offsetMs));
  els.offsetValue.textContent = formatOffset(offsetMs);
  els.offsetHelp.textContent = describeOffset(offsetMs);
}

/** Estado de preparación y canción elegida (resumen del desplegable). */
export function renderSetup(els, { hasVideo, hasLyrics, song }) {
  renderStatus(els.setupStatus, setupStatusText({ hasVideo, hasLyrics }), hasVideo && hasLyrics ? 'success' : 'info');
  els.setupSummary.textContent = song ? ` · ${song}` : '';
}

export function renderNote(els, note) {
  els.note.textContent = note ?? '';
  els.note.hidden = !note;
}

function createCharSpan({ char, status, isSpace }) {
  const span = document.createElement('span');
  span.className = `char char-${status}${isSpace ? ' char-space' : ''}`;
  span.textContent = char;
  return span;
}

// La frase se ve desde su aparición (1 s antes de cantarse); antes, un texto de espera.
function renderLane(els, state) {
  const showPhrase = state.status === 'active' && state.game && state.shown;
  els.lane.classList.toggle('music-lane-waiting', !showPhrase);
  if (!showPhrase) {
    els.chunkActive.textContent = state.status === 'active' ? '…' : '';
    return;
  }
  els.chunkActive.replaceChildren(...charStates(state.game, { start: 0, end: state.game.text.length }).map(createCharSpan));
}

const BUTTONS_BY_STATUS = Object.freeze({
  empty: ['startButton'],
  ready: ['startButton'],
  active: ['playButton', 'repeatButton', 'prevButton', 'nextButton', 'restartButton'],
  finished: ['playButton', 'repeatButton', 'prevButton', 'restartButton'],
});

function playLabel(state, playing) {
  if (state.status === 'active' && state.waiting) return 'Saltar frase y seguir';
  return playing ? 'Pausar' : 'Reproducir';
}

function renderControls(els, state, { playing }) {
  const visible = new Set(BUTTONS_BY_STATUS[state.status] ?? []);
  if (state.blocked) visible.add('continueButton');
  for (const key of ['startButton', 'continueButton', 'playButton', 'repeatButton', 'prevButton', 'nextButton', 'restartButton']) {
    els[key].hidden = !visible.has(key);
  }
  els.nextButton.disabled = state.index >= state.phrases.length - 1;
  els.prevButton.disabled = state.index === 0;
  els.playButton.textContent = playLabel(state, playing);
}

function renderStats(els, totals) {
  const hasTyping = totals.activeMs > 0;
  els.cpm.textContent = hasTyping ? String(Math.round(totals.cpm)) : '—';
  els.accuracy.textContent = hasTyping ? String(Math.round(totals.accuracy)) : '—';
  els.done.textContent = `${totals.phrasesDone} de ${totals.phrasesTotal}`;
}

/** Pinta el estado de la práctica: progreso, fase, frase, controles y métricas. */
export function renderPractice(els, state, { totals, playing, ready, focusNotice = '' }) {
  els.startButton.disabled = !ready;
  els.progress.textContent = state.status === 'active' || state.status === 'finished' ? phraseProgressText(state) : '';
  const phase = ready || state.status !== 'ready' ? practicePhaseText(state) : '';
  renderStatus(els.phase, focusNotice || phase, focusNotice ? 'focus' : 'info');
  renderLane(els, state);
  els.lane.classList.toggle('lane-blurred', Boolean(focusNotice));
  // El campo sigue activo durante la práctica (el foco no se pierde entre frases); el
  // motor rechaza lo escrito antes de que la frase aparezca.
  els.input.disabled = state.status !== 'active';
  renderControls(els, state, { playing });
  renderStats(els, totals);
}

/** Frase que suena ahora durante la comprobación de la sincronización. */
export function renderLiveLine(els, text) {
  const value = text ?? '';
  if (els.liveLine.textContent !== value) els.liveLine.textContent = value;
}

/** Diagnóstico de desarrollo: tiempos previstos y observados (solo con ?diagnostico=1). */
export function renderDiagnostics(els, info) {
  els.diagnostics.hidden = info === null;
  if (info !== null) els.diagnostics.textContent = JSON.stringify(info, null, 2);
}
