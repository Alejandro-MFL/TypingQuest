// Capa de interfaz: única que toca el DOM. No contiene reglas de juego.
// Las funciones de formato y charStates son puras para poder probarlas con Node.

const MAX_LISTED_CHARS = 10;

// --- Funciones puras ---------------------------------------------------------

/** Tiempo en formato m:ss a partir de milisegundos. */
export function formatTime(ms) {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * WPM en vivo. Con muy poco tiempo transcurrido la fórmula da picos enormes
 * (1 carácter en 1 ms), así que se muestra «—» hasta alcanzar `minElapsedMs`.
 * Solo afecta a la presentación: getStats y metrics.js no cambian.
 */
export function formatLiveWpm(stats, minElapsedMs) {
  return stats.elapsedMs < minElapsedMs ? '—' : String(Math.round(stats.wpm));
}

/** Mensaje comprensible para un resultado de prepareText/validateText, o null si es válido. */
export function formatValidationError(result) {
  switch (result.error) {
    case null:
      return null;
    case 'empty':
      return 'Escribe o pega un texto para empezar.';
    case 'too-long':
      return `El texto tiene ${result.length.toLocaleString('es-ES')} caracteres y el máximo es ` +
        `${result.maxLength.toLocaleString('es-ES')}. Acórtalo para continuar.`;
    case 'unsupported-chars': {
      const listed = result.chars.slice(0, MAX_LISTED_CHARS).join(' ');
      const more = result.chars.length > MAX_LISTED_CHARS ? '…' : '';
      return `El texto contiene caracteres que todavía no se pueden escribir: ${listed}${more}. ` +
        'Elimínalos para continuar.';
    }
    default:
      return 'El texto no es válido.';
  }
}

/**
 * Estado visual de cada carácter del fragmento activo.
 * @returns {{ char: string, status: 'correct'|'incorrect'|'current'|'pending', isSpace: boolean }[]}
 */
export function charStates(state, chunk) {
  const result = [];
  for (let i = chunk.start; i < chunk.end; i++) {
    const char = state.text[i];
    let status = 'pending';
    if (i < state.typed.length) {
      status = state.typed[i] === char ? 'correct' : 'incorrect';
    } else if (i === state.typed.length && state.status !== 'finished') {
      status = 'current';
    }
    result.push({ char, status, isSpace: char === ' ' });
  }
  return result;
}

// --- DOM ---------------------------------------------------------------------

export function getElements(doc = document) {
  const byId = (id) => doc.getElementById(id);
  return {
    screens: {
      setup: byId('setup-screen'),
      play: byId('play-screen'),
      results: byId('results-screen'),
    },
    setupForm: byId('setup-form'),
    sourceText: byId('source-text'),
    sourceCount: byId('source-count'),
    setupError: byId('setup-error'),
    wpm: byId('wpm'),
    accuracy: byId('accuracy'),
    timer: byId('timer'),
    progressBar: byId('progress-bar'),
    progressFill: byId('progress-fill'),
    progressLabel: byId('progress-label'),
    lane: byId('lane'),
    chunkNext: byId('chunk-next'),
    chunkActive: byId('chunk-active'),
    focusHint: byId('focus-hint'),
    input: byId('typing-input'),
    resultsTitle: byId('results-title'),
    resultWpm: byId('result-wpm'),
    resultAccuracy: byId('result-accuracy'),
    resultTime: byId('result-time'),
    resultErrors: byId('result-errors'),
    resultCorrections: byId('result-corrections'),
    retryButton: byId('retry-button'),
    newTextButton: byId('new-text-button'),
  };
}

export function showScreen(els, name) {
  for (const [key, section] of Object.entries(els.screens)) {
    section.hidden = key !== name;
  }
}

export function renderSourceCount(els, length, maxLength) {
  els.sourceCount.textContent =
    `${length.toLocaleString('es-ES')} / ${maxLength.toLocaleString('es-ES')} caracteres`;
  els.sourceCount.classList.toggle('source-count-over', length > maxLength);
}

export function renderSetupError(els, message) {
  els.setupError.textContent = message ?? '';
  els.setupError.hidden = !message;
}

function createCharSpan({ char, status, isSpace }) {
  const span = document.createElement('span');
  span.className = `char char-${status}${isSpace ? ' char-space' : ''}`;
  span.textContent = char;
  return span;
}

export function renderChunks(els, state, chunks) {
  const active = chunks[state.segmentIndex];
  els.chunkActive.replaceChildren(...charStates(state, active).map(createCharSpan));
  const next = chunks[state.segmentIndex + 1];
  els.chunkNext.textContent = next ? state.text.slice(next.start, next.end) : '';
}

export function renderStats(els, stats, minWpmElapsedMs) {
  els.wpm.textContent = formatLiveWpm(stats, minWpmElapsedMs);
  els.accuracy.textContent = String(Math.round(stats.accuracy));
  els.timer.textContent = formatTime(stats.elapsedMs);
}

export function renderProgress(els, progress) {
  const percent = Math.round(progress.ratio * 100);
  els.progressFill.style.width = `${percent}%`;
  els.progressBar.setAttribute('aria-valuenow', String(percent));
  const label = `Fragmento ${progress.segmentIndex + 1} de ${progress.segmentCount}`;
  // Solo se reescribe al cambiar, para que la región aria-live no anuncie cada tecla.
  if (els.progressLabel.textContent !== label) els.progressLabel.textContent = label;
}

export function renderResults(els, stats) {
  els.resultWpm.textContent = String(Math.round(stats.wpm));
  els.resultAccuracy.textContent = `${Math.round(stats.accuracy)} %`;
  els.resultTime.textContent = formatTime(stats.elapsedMs);
  els.resultErrors.textContent = String(stats.errors);
  els.resultCorrections.textContent = String(stats.corrections);
}

export function setFocusHint(els, visible) {
  els.focusHint.hidden = !visible;
  els.lane.classList.toggle('lane-blurred', visible);
}

/** Sincroniza el textarea con el texto aceptado por el motor y deja el cursor al final. */
export function syncInput(input, typed) {
  if (input.value !== typed) input.value = typed;
  moveCaretToEnd(input);
}

export function moveCaretToEnd(input) {
  const end = input.value.length;
  if (input.selectionStart !== end || input.selectionEnd !== end) {
    input.setSelectionRange(end, end);
  }
}
