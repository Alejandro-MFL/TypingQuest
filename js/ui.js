// Capa de interfaz: única que toca el DOM. No contiene reglas de juego.
// Las funciones de formato y charStates son puras para poder probarlas con Node.
import { summarizeHistory, chartScaleMax, chartPoints, describeSeries, formatDateTime } from './history.js';

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

const MODE_NAMES = { free: 'Libre', strict: 'Estricto' };

/** Nombre visible de un modo de entrenamiento ('free' | 'strict'). */
export function formatMode(mode) {
  return MODE_NAMES[mode] ?? 'Desconocido';
}

/** Modo elegido en Opciones, p. ej. «Modo libre». */
export function formatSelectedMode(mode) {
  return `Modo ${formatMode(mode).toLowerCase()}`;
}

/**
 * true si el modo no se puede cambiar: hay una partida en pantalla que ya ha
 * empezado (primera pulsación) y no ha terminado. Antes de escribir sí se puede.
 */
export function isModeLocked(screen, state) {
  return screen === 'play' && state !== null && state.status === 'running';
}

/** Resumen de resultados en una frase, para anunciarlo a lectores de pantalla. */
export function formatResultsSummary(stats, mode) {
  const errors = stats.errors === 1 ? '1 error' : `${stats.errors} errores`;
  const modeText = mode ? ` Modo ${formatMode(mode).toLowerCase()}.` : '';
  return `Partida terminada. ${Math.round(stats.wpm)} palabras por minuto, ` +
    `${Math.round(stats.accuracy)} % de precisión, tiempo ${formatTime(stats.elapsedMs)} y ${errors}.${modeText}`;
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
 * En modo libre los errores no impiden avanzar, así que basta con estar en él.
 * Nunca en el último fragmento ni con la partida terminada.
 */
export function spaceHintPosition(state, chunks) {
  if (state.status === 'finished') return null;
  const isLast = state.segmentIndex >= chunks.length - 1;
  const chunk = chunks[state.segmentIndex];
  if (isLast || !chunk) return null;
  const position = chunk.end - 1;
  if (state.text[position] !== ' ' || state.typed.length !== position) return null;
  if (state.mode === 'free') return position;
  const typedPart = state.typed.slice(chunk.start);
  return typedPart === state.text.slice(chunk.start, position) ? position : null;
}

/**
 * true si el fragmento activo está completo en longitud pero tiene errores:
 * el motor rechazará cualquier carácter más hasta que se corrijan. En modo
 * libre nunca ocurre: el fragmento se cierra en cuanto se recorre.
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

/**
 * Mensaje de estado de la pantalla de historial, o '' si no hace falta.
 * @param {{ status: string, count: number, discarded: number, cleared?: boolean }} info
 */
export function historyStatusMessage({ status, count, discarded, cleared = false }) {
  if (status === 'unavailable') {
    return 'El historial no está disponible: este navegador no permite guardar datos. ' +
      'Puedes seguir jugando con normalidad.';
  }
  if (status === 'corrupt') {
    return 'No se pudo leer el historial guardado porque estaba dañado. ' +
      'Las nuevas partidas se guardarán con normalidad.';
  }
  if (count === 0) {
    const empty = 'Todavía no hay sesiones completadas. Termina una partida para verla aquí.';
    return cleared ? `Historial borrado. ${empty}` : empty;
  }
  if (discarded === 1) return 'Se ha omitido 1 registro dañado.';
  if (discarded > 1) return `Se han omitido ${discarded} registros dañados.`;
  return '';
}

const SAVE_ERROR_TEXT = {
  quota: 'No se pudo guardar la partida en el historial: el almacenamiento está lleno.',
  unavailable: 'No se pudo guardar la partida: el historial no está disponible en este navegador.',
};

/** Mensaje para un fallo al guardar la partida (error de createHistoryStore().add). */
export function saveErrorMessage(error) {
  return SAVE_ERROR_TEXT[error] ?? 'No se pudo guardar la partida en el historial.';
}

// --- DOM ---------------------------------------------------------------------

export function getElements(doc = document) {
  const byId = (id) => doc.getElementById(id);
  return {
    screens: {
      home: byId('home-screen'),
      academy: byId('academy-screen'),
      library: byId('library-screen'),
      setup: byId('setup-screen'),
      play: byId('play-screen'),
      results: byId('results-screen'),
      history: byId('history-screen'),
    },
    setupForm: byId('setup-form'),
    sourceText: byId('source-text'),
    sourceCount: byId('source-count'),
    setupError: byId('setup-error'),
    startButton: byId('start-button'),
    blockOnErrors: byId('block-on-errors'),
    helpOption: byId('help-option'),
    helpContext: byId('help-context'),
    helpRadios: [...doc.querySelectorAll('input[name="help-mode"]')],
    setupMode: byId('setup-mode'),
    playMode: byId('play-mode'),
    resultMode: byId('result-mode'),
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
    resultSaveError: byId('result-save-error'),
    options: {
      toggle: byId('options-toggle'),
      panel: byId('options-panel'),
      locked: byId('options-locked'),
    },
    resultsTrends: {
      empty: byId('results-trends-empty'),
      body: byId('results-trends-body'),
      ...chartElements(byId, 'results'),
    },
    history: {
      title: byId('history-title'),
      status: byId('history-status'),
      content: byId('history-content'),
      count: byId('history-count'),
      bestWpm: byId('history-best-wpm'),
      averageAccuracy: byId('history-average-accuracy'),
      ...chartElements(byId, 'history'),
      rows: byId('history-rows'),
      confirm: byId('history-confirm'),
      confirmButton: byId('history-confirm-button'),
      cancelButton: byId('history-cancel-button'),
      actions: byId('history-actions'),
      clearButton: byId('history-clear-button'),
    },
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

/** Modo de la partida en curso, visible durante la escritura. */
export function renderPlayMode(els, mode) {
  els.playMode.textContent = formatSelectedMode(mode);
}

// --- Menú Opciones -----------------------------------------------------------------

/** Modo elegido en Opciones: casilla y resumen visible en la preparación. */
export function renderSelectedMode(els, mode) {
  els.blockOnErrors.checked = mode === 'strict';
  els.setupMode.textContent = formatSelectedMode(mode);
}

export function renderOptionsOpen(els, open) {
  els.options.panel.hidden = !open;
  els.options.toggle.setAttribute('aria-expanded', String(open));
}

/** Bloquea el cambio de modo durante una partida empezada. */
export function renderOptionsState(els, { locked }) {
  els.blockOnErrors.disabled = locked;
  els.options.locked.hidden = !locked;
}

export function renderResults(els, stats, mode) {
  els.resultWpm.textContent = String(Math.round(stats.wpm));
  els.resultAccuracy.textContent = `${Math.round(stats.accuracy)} %`;
  els.resultTime.textContent = formatTime(stats.elapsedMs);
  els.resultErrors.textContent = String(stats.errors);
  els.resultMode.textContent = formatSelectedMode(mode);
  els.resultsAnnouncer.textContent = formatResultsSummary(stats, mode);
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

/** Muestra u oculta el aviso de fallo al guardar la partida en el historial. */
// Es una región role="status" siempre presente: solo cambia su texto, y solo si
// cambia, para que el lector de pantalla lo anuncie una vez.
export function renderSaveError(els, message) {
  const text = message ?? '';
  if (els.resultSaveError.textContent !== text) els.resultSaveError.textContent = text;
}

// --- Gráficas de evolución (resultados e historial) -------------------------------

// Elementos de las dos gráficas de un contenedor: ids `<prefijo>-chart-wpm`, etc.
function chartElements(byId, prefix) {
  return {
    chartWpm: byId(`${prefix}-chart-wpm`),
    chartWpmDescription: byId(`${prefix}-chart-wpm-description`),
    chartAccuracy: byId(`${prefix}-chart-accuracy`),
    chartAccuracyDescription: byId(`${prefix}-chart-accuracy-description`),
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// Área de trazado dentro del viewBox 320 × 140 del gráfico (margen para el eje).
const CHART_BOX = { left: 34, top: 12, width: 276, height: 100 };

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

// Línea horizontal de referencia con su valor a la izquierda.
function chartGridLine(y, label) {
  const text = svgElement('text', { x: CHART_BOX.left - 6, y: y + 4, 'text-anchor': 'end' });
  text.textContent = label;
  const group = svgElement('g', { class: 'chart-grid' });
  group.append(svgElement('line', { x1: CHART_BOX.left, x2: CHART_BOX.left + CHART_BOX.width, y1: y, y2: y }), text);
  return group;
}

function chartDot({ x, y }, tooltip) {
  const dot = svgElement('circle', { class: 'chart-dot', cx: x, cy: y, r: 3.5 });
  const title = svgElement('title');
  title.textContent = tooltip;
  dot.append(title);
  return dot;
}

/**
 * Gráfico de línea en SVG, sin librerías. El SVG es decorativo (aria-hidden):
 * la descripción textual visible (describeSeries) da los datos y la tendencia.
 * @param {{ value: number, date: string }[]} points en orden cronológico
 */
function renderChart(svg, description, points, { label, maxValue, unit }) {
  const values = points.map((p) => p.value);
  const coords = chartPoints(values, { width: CHART_BOX.width, height: CHART_BOX.height, maxValue })
    .map(({ x, y }) => ({ x: x + CHART_BOX.left, y: y + CHART_BOX.top }));
  const line = svgElement('polyline', {
    class: 'chart-line',
    points: coords.map(({ x, y }) => `${x},${y}`).join(' '),
  });
  const dots = coords.map((c, i) => chartDot(c, `${points[i].date}: ${Math.round(values[i])}${unit}`));
  svg.replaceChildren(
    chartGridLine(CHART_BOX.top, String(maxValue)),
    chartGridLine(CHART_BOX.top + CHART_BOX.height, '0'),
    line,
    ...dots
  );
  description.textContent = describeSeries(label, values);
}

// `exerciseName(id)` traduce el ID guardado al título del catálogo.
function createHistoryRow(session, exerciseName) {
  const row = document.createElement('tr');
  const cells = [
    formatDateTime(session.finishedAt),
    exerciseName(session.exercise),
    String(Math.round(session.wpm)),
    `${Math.round(session.accuracy)} %`,
    formatMode(session.mode),
  ];
  for (const text of cells) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
  }
  return row;
}

function renderHistorySummary(h, sessions) {
  const summary = summarizeHistory(sessions);
  h.count.textContent = String(summary.count);
  h.bestWpm.textContent = summary.bestWpm === null ? '—' : String(Math.round(summary.bestWpm));
  h.averageAccuracy.textContent =
    summary.averageAccuracy === null ? '—' : `${Math.round(summary.averageAccuracy)} %`;
}

// Pinta las gráficas de WPM y precisión de las `recent` sesiones (cronológicas).
function renderTrendCharts(target, recent) {
  const point = (value, s) => ({ value, date: formatDateTime(s.finishedAt) });
  const wpm = recent.map((s) => point(s.wpm, s));
  const accuracy = recent.map((s) => point(s.accuracy, s));
  renderChart(target.chartWpm, target.chartWpmDescription, wpm, {
    label: 'WPM', maxValue: chartScaleMax(wpm.map((p) => p.value)), unit: ' WPM',
  });
  renderChart(target.chartAccuracy, target.chartAccuracyDescription, accuracy, {
    label: 'Precisión (%)', maxValue: 100, unit: ' %',
  });
}

/**
 * Evolución permanente en la pantalla de resultados: gráficas de las últimas
 * `chartSessions` sesiones guardadas con su descripción textual (el listado de
 * sesiones está en Historial). Sin sesiones, solo un mensaje.
 */
export function renderResultsTrends(els, sessions, chartSessions) {
  const t = els.resultsTrends;
  const recent = sessions.slice(-chartSessions);
  t.empty.hidden = recent.length > 0;
  t.body.hidden = recent.length === 0;
  if (recent.length === 0) return;
  renderTrendCharts(t, recent);
}

/**
 * Pinta la pantalla de historial con el resultado de storage.load().
 * Con 0 sesiones solo se muestra el mensaje de estado.
 */
export function renderHistory(els, { sessions, status, discarded }, { chartSessions, exerciseName, cleared = false }) {
  const h = els.history;
  const message = historyStatusMessage({ status, count: sessions.length, discarded, cleared });
  // Solo se reescribe al cambiar, para que la región viva no lo repita.
  if (h.status.textContent !== message) h.status.textContent = message;
  h.content.hidden = sessions.length === 0;
  h.clearButton.hidden = sessions.length === 0 && status !== 'corrupt';
  renderHistoryConfirm(els, false);
  if (sessions.length === 0) return;
  renderHistorySummary(h, sessions);
  renderTrendCharts(h, sessions.slice(-chartSessions));
  h.rows.replaceChildren(...sessions.toReversed().map((s) => createHistoryRow(s, exerciseName)));
}

/** Alterna entre las acciones normales y la confirmación de borrado. */
export function renderHistoryConfirm(els, visible) {
  els.history.confirm.hidden = !visible;
  els.history.actions.hidden = visible;
}
