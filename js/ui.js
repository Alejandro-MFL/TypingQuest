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

/** Resumen de resultados en una frase, para anunciarlo a lectores de pantalla. */
export function formatResultsSummary(stats) {
  const errors = stats.errors === 1 ? '1 error' : `${stats.errors} errores`;
  return `Partida terminada. ${Math.round(stats.wpm)} palabras por minuto, ` +
    `${Math.round(stats.accuracy)} % de precisión, tiempo ${formatTime(stats.elapsedMs)} y ${errors}.`;
}

// Una marca combinante sin base (o sobre un espacio) es invisible: se muestra
// sobre un círculo punteado (U+25CC), la convención tipográfica habitual.
function displayableChar(char) {
  if (/^\p{M}/u.test(char)) return `◌${char}`;
  return char.replace(/^\s(?=\p{M})/u, '◌');
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
      const listed = result.chars.slice(0, MAX_LISTED_CHARS).map(displayableChar).join(' ');
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

/**
 * Posición del espacio final del fragmento activo si el jugador está justo en él,
 * con todo lo anterior del fragmento correcto (solo le falta pulsar espacio), o null.
 * Nunca en el último fragmento ni con la partida terminada.
 */
export function spaceHintPosition(state, chunks) {
  if (state.status === 'finished') return null;
  const isLast = state.segmentIndex >= chunks.length - 1;
  const chunk = chunks[state.segmentIndex];
  if (isLast || !chunk) return null;
  const position = chunk.end - 1;
  if (state.text[position] !== ' ' || state.typed.length !== position) return null;
  const typedPart = state.typed.slice(chunk.start);
  return typedPart === state.text.slice(chunk.start, position) ? position : null;
}

/**
 * true si el fragmento activo está completo en longitud pero tiene errores:
 * el motor rechazará cualquier carácter más hasta que se corrijan.
 */
export function isFragmentBlocked(state, chunks) {
  const chunk = chunks[state.segmentIndex];
  if (state.status === 'finished' || !chunk || state.typed.length !== chunk.end) return false;
  return state.typed.slice(chunk.start) !== state.text.slice(chunk.start, chunk.end);
}

/**
 * Aviso que debe mostrarse en la zona de avisos, por prioridad:
 * foco perdido (no se puede escribir) > errores que bloquean > pulsar espacio.
 * @returns {'focus'|'errors'|'space'|null}
 */
export function resolveNotice({ focusLost, errorsBlocking, spaceReady }) {
  if (focusLost) return 'focus';
  if (errorsBlocking) return 'errors';
  if (spaceReady) return 'space';
  return null;
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
    startButton: byId('start-button'),
    wpm: byId('wpm'),
    accuracy: byId('accuracy'),
    timer: byId('timer'),
    progressBar: byId('progress-bar'),
    progressFill: byId('progress-fill'),
    progressLabel: byId('progress-label'),
    lane: byId('lane'),
    chunkNext: byId('chunk-next'),
    chunkActive: byId('chunk-active'),
    notice: byId('lane-notice'),
    input: byId('typing-input'),
    soundToggle: byId('sound-toggle'),
    resultsTitle: byId('results-title'),
    resultWpm: byId('result-wpm'),
    resultAccuracy: byId('result-accuracy'),
    resultTime: byId('result-time'),
    resultErrors: byId('result-errors'),
    retryButton: byId('retry-button'),
    newTextButton: byId('new-text-button'),
    exitButton: byId('exit-button'),
    resultsAnnouncer: byId('results-announcer'),
  };
}

/** Elimina los fragmentos fantasma que sigan animándose (p. ej. al salir). */
export function clearChunkEffects(els) {
  for (const ghost of els.lane.querySelectorAll('.chunk-leaving')) ghost.remove();
}

/** Duración de la animación de fragmento, como variable CSS del carril. */
export function setChunkAnimationMs(els, ms) {
  els.lane.style.setProperty('--chunk-animation-ms', `${ms}ms`);
}

const NOTICE_TEXT = {
  focus: 'Haz clic aquí para seguir escribiendo',
  errors: 'Corrige los errores en rojo',
};

/**
 * Pinta el aviso indicado por resolveNotice en la zona de avisos (solo
 * presentación). Solo toca el DOM si el aviso cambia, para que la región
 * aria-live no lo repita en cada tecla.
 */
export function renderNotice(els, kind) {
  const { notice } = els;
  const current = notice.dataset.kind ?? '';
  if (current === (kind ?? '')) return;
  if (kind) notice.dataset.kind = kind;
  else delete notice.dataset.kind;
  els.lane.classList.toggle('lane-blurred', kind === 'focus');
  if (kind === 'space') {
    const key = document.createElement('kbd');
    key.className = 'key-space';
    key.textContent = 'espacio';
    notice.replaceChildren('Pulsa ', key);
  } else {
    notice.textContent = kind ? NOTICE_TEXT[kind] : '';
  }
}

/**
 * Anima el fragmento recién completado: una copia decorativa dorada se superpone
 * en la posición activa y baja una posición del carril mientras se desvanece.
 * El fragmento nuevo ya está renderizado debajo y se puede escribir sin esperar.
 */
export function playChunkComplete(els, completedText, durationMs) {
  const active = els.chunkActive;
  // Distancia real entre la posición de vista previa y la activa del carril.
  const laneStep = active.offsetTop - els.chunkNext.offsetTop;
  const ghost = document.createElement('p');
  ghost.className = 'chunk chunk-active chunk-leaving';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = completedText;
  ghost.style.top = `${active.offsetTop}px`;
  ghost.style.left = `${active.offsetLeft}px`;
  ghost.style.width = `${active.offsetWidth}px`;
  ghost.style.setProperty('--chunk-travel', `${laneStep}px`);
  const remove = () => ghost.remove();
  ghost.addEventListener('animationend', remove, { once: true });
  // Respaldo por si animationend no llega (pestaña oculta, animaciones desactivadas).
  setTimeout(remove, durationMs + 100);
  els.lane.append(ghost);
}

export function renderSoundToggle(els, enabled) {
  els.soundToggle.setAttribute('aria-pressed', String(enabled));
  els.soundToggle.title = enabled ? 'Silenciar sonido' : 'Activar sonido';
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
  els.resultsAnnouncer.textContent = formatResultsSummary(stats);
}

/** Vacía el anunciador para que el siguiente resultado se anuncie de nuevo. */
export function clearResultsAnnouncement(els) {
  els.resultsAnnouncer.textContent = '';
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
