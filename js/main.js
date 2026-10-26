// Punto de entrada: coordina eventos, rutas, motor (game.js) e interfaz (ui.js,
// course-ui.js, keyboard-ui.js). No contiene reglas de juego ni de progreso: las deciden
// applyInput (game.js) y las funciones puras de progress.js.
import { CONFIG } from './config.js';
import { prepareText } from './text-prep.js';
import { splitIntoChunks } from './chunks.js';
import { createGame, applyInput, restartGame, getStats, getProgress } from './game.js';
import { createSoundPlayer } from './sound.js';
import {
  createHistoryStore, createProgressStore, createSessionRecord, EXERCISE_CUSTOM_TEXT,
} from './storage.js';
import { createCatalog, libraryLessons, filterLessons, exerciseTitle } from './catalog.js';
import {
  getExerciseProgress, recordCompletion, getCurrentExerciseId, nextInCourse,
  advanceCourse, skipCurrent, academyView, resolveRetiredPosition, restartCourse,
} from './progress.js';
import { evaluateObjectives } from './objectives.js';
import { formatDateTime } from './history.js';
import {
  createLibraryReturn, nextLibraryReturn, restoreTarget, sanitizeLibraryFilters,
} from './library-memory.js';
import { parseRoute, routeHash } from './router.js';
import * as ui from './ui.js';
import * as courseUi from './course-ui.js';
import * as analysisUi from './analysis-ui.js';
import * as trendsUi from './trends-ui.js';
import { analyzeTrends } from './typing-trends.js';
import { recommendPractice } from './recommendations.js';
import {
  createTypingAnalysis, recordTransition, summarizeAnalysis, packAnalysis, unpackAnalysis, diagnose,
} from './typing-analysis.js';
import {
  getKey, resolveCharacter, resolveBackspace, describeResolution, guideTarget, isWrongInsertion,
  DEFAULT_HELP_MODES, helpContext, showsRestReminder,
} from './keyboard.js';
import { createKeyboard, createHands, renderGuide } from './keyboard-ui.js';

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
// Pantalla de cada ruta de la navegación principal.
const ROUTE_SCREENS = { home: 'home', academy: 'academy', library: 'library', history: 'history', practice: 'setup' };
const CATALOG_FILES = { exercises: 'data/exercises.json', course: 'data/course.json' };

const els = ui.getElements();
const ce = courseUi.getCourseElements();
const de = analysisUi.getDiagnosisElements();
const sound = createSoundPlayer({ enabled: CONFIG.soundEnabled });
const storage = getLocalStorage();
const historyStore = createHistoryStore(storage, { maxSessions: CONFIG.maxHistorySessions });
const progressStore = createProgressStore(storage);
// Catálogo validado (null si no se pudo cargar) y progreso académico en memoria.
let catalog = null;
let progress = progressStore.load().progress;
// Partida en curso: { state, chunks, savedRecordId, origin, exercise }.
// origin: 'free' (práctica libre), 'academy' o 'library'; exercise: null en libre.
// savedRecordId evita guardar dos veces la misma finalización.
let session = null;
let currentScreen = 'home';
// Modo elegido en Opciones para las partidas nuevas y los reintentos.
let selectedMode = CONFIG.blockOnErrorsDefault ? 'strict' : 'free';
let composing = false;
let statsTimer = null;
// Avisos contextuales: estado de interfaz, ajeno al motor y a las métricas.
const notices = { focusLost: false, errorsBlocking: false, spaceReady: false };
let spaceHintTimer = null;
let spaceHintAt = null;
// Guía de teclado (solo presentación). Ayudas por contexto ('exercise' | 'free'),
// tecla física de la última pulsación y tecla del último error para marcarla.
const guide = createGuide();
const helpModes = { ...DEFAULT_HELP_MODES };
// Teclas que nunca cuentan como «la tecla pulsada» de un carácter.
const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'AltRight', 'AltLeft', 'ControlLeft', 'ControlRight', 'CapsLock']);
let lastKeyCode = null;
let guideErrorCode = null;
// Billete de vuelta a la Biblioteca (T12, library-memory.js): solo en memoria.
let libraryReturn = null;
// Al volver de una práctica recomendada (T13), el foco va a «Practicar mis dificultades».
let pendingPracticeFocus = false;
// Entrada del historial del navegador añadida al abrir una práctica desde la
// Biblioteca: así «Atrás» vuelve a la Biblioteca y no a la sección anterior.
const LIBRARY_GAME_STATE = 'typingquest-library-game';

// --- Navegación ------------------------------------------------------------------

function navigate(route) {
  const hash = routeHash(route);
  // Volver a la misma ruta (p. ej. desde una partida) no dispara hashchange.
  if (location.hash === hash) showRoute(route);
  else location.hash = hash;
}

// Cambiar de sección descarta cualquier partida o resultado en pantalla. Al
// volver a la Biblioteca con billete, se deja como estaba (una sola vez).
function showRoute(route) {
  leaveGame();
  closeOptions();
  courseUi.renderNav(ce, route);
  const ticket = route === 'library' && catalog ? libraryReturn : null;
  if (route === 'library') {
    if (ticket) courseUi.writeLibraryFilters(ce, sanitizeLibraryFilters(ticket.filters, courseUi.libraryFilterOptions(ce)));
    libraryReturn = nextLibraryReturn(libraryReturn, { type: 'library-shown' });
  }
  renderRoute(route);
  showScreen(ROUTE_SCREENS[route]);
  if (ticket) restoreLibraryPosition(ticket);
  else if (route === 'practice') els.sourceText.focus();
  else els.screens[ROUTE_SCREENS[route]].querySelector('.screen-title').focus();
  if (route === 'history' && pendingPracticeFocus) focusPracticeSection();
  pendingPracticeFocus = false;
}

// «Volver a Mi evolución»: el Historial, desplazado hasta las recomendaciones.
function focusPracticeSection() {
  const title = document.getElementById('practice-title');
  if (!title) return;
  title.focus({ preventScroll: true });
  title.scrollIntoView({ block: 'start' });
}

function returnToEvolution() {
  pendingPracticeFocus = true;
  navigate('history');
}

// Desplazamiento guardado y foco en el botón de la práctica abierta (sin saltos:
// preventScroll), que además queda marcada. Si ya no está visible, foco al título.
function restoreLibraryPosition(ticket) {
  const buttons = [...ce.library.list.querySelectorAll('[data-exercise-id]')];
  const target = restoreTarget(ticket, buttons.map((b) => b.dataset.exerciseId));
  window.scrollTo(0, target.scrollY);
  const button = buttons.find((b) => b.dataset.exerciseId === target.exerciseId);
  if (!button) {
    els.screens.library.querySelector('.screen-title').focus({ preventScroll: true });
    return;
  }
  courseUi.markReturnedPractice(button);
  button.focus({ preventScroll: true });
  button.closest('.library-lesson').scrollIntoView({ block: 'nearest' });
}

// Volver a la Biblioteca desde su práctica (botones o enlace): si se añadió la
// entrada del historial, se retrocede (popstate restaura) para no dejarla huérfana.
function returnToLibrary() {
  if (history.state === LIBRARY_GAME_STATE) history.back();
  else navigate('library');
}

// «Atrás» desde una práctica abierta en la Biblioteca: misma URL, sin hashchange.
function handlePopState() {
  const inGame = currentScreen === 'play' || currentScreen === 'results';
  if (inGame && session?.origin === 'library' && parseRoute(location.hash) === 'library') showRoute('library');
}

function renderRoute(route) {
  if (route === 'home') courseUi.renderHome(ce, currentCourseExercise());
  else if (route === 'academy') renderAcademy();
  else if (route === 'library') renderLibrary();
  else if (route === 'history') {
    renderHistory();
    courseUi.renderCourseReset(ce, { available: catalog !== null });
  }
}

function handleHashChange() {
  showRoute(parseRoute(location.hash));
}

function handleNavClick(event) {
  const link = event.target.closest('a[href^="#/"]');
  // Con el hash ya activo no habría hashchange: se muestra la ruta igualmente.
  if (link && link.getAttribute('href') === location.hash) {
    event.preventDefault();
    if (session?.origin === 'library' && parseRoute(location.hash) === 'library') returnToLibrary();
    else showRoute(parseRoute(location.hash));
  }
}

// --- Catálogo, Academia y Biblioteca -----------------------------------------------

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

// Sin catálogo, la práctica libre y el historial siguen funcionando.
async function loadCatalog() {
  try {
    const [exercisesData, courseData] = await Promise.all([
      fetchJson(CATALOG_FILES.exercises), fetchJson(CATALOG_FILES.course),
    ]);
    const result = createCatalog(exercisesData, courseData, { maxTextLength: CONFIG.maxTextLength });
    if (!result.ok) throw new Error(`Catálogo no válido:\n${result.errors.join('\n')}`);
    catalog = result.catalog;
    migrateRetiredPosition();
    courseUi.renderLibraryFilters(ce, catalog);
    courseUi.renderCatalogError(ce, null);
  } catch (error) {
    console.error(error);
    courseUi.renderCatalogError(ce, 'No se pudieron cargar los ejercicios. Recarga la página para intentarlo de nuevo.');
  }
}

function currentCourseExercise() {
  if (!catalog) return null;
  return catalog.byId.get(getCurrentExerciseId(progress, catalog.courseOrder)) ?? null;
}

function currentCourseId() {
  return getCurrentExerciseId(progress, catalog.courseOrder);
}

function renderAcademy() {
  const view = catalog ? academyView(catalog, progress) : null;
  if (view) courseUi.renderAcademy(ce, view);
}

// Una tarjeta por lección; la búsqueda y los filtros miran sus dos prácticas.
function renderLibrary() {
  if (!catalog) return;
  const lessons = filterLessons(libraryLessons(catalog), courseUi.readLibraryFilters(ce));
  const levelTitles = new Map(catalog.levels.map((l) => [l.level, l.title]));
  courseUi.renderLibrary(ce, lessons, (id) => getExerciseProgress(progress, id).status, levelTitles);
}

// Una posición guardada en una lección retirada pasa a su continuación y se guarda.
function migrateRetiredPosition() {
  const resolved = resolveRetiredPosition(progress, catalog.courseOrder, catalog.retired);
  if (resolved !== progress) saveProgress(resolved);
}

// Nombre para el Historial: también de ejercicios retirados y de la práctica libre.
function exerciseName(id) {
  return exerciseTitle(catalog, id);
}

// «Empezar» en una tarjeta de la Biblioteca (delegación). Nunca es un paso del recorrido.
// Antes de abrir se guarda el billete de vuelta (búsqueda, filtros, desplazamiento
// y práctica) y se añade una entrada al historial del navegador con la misma URL.
function handleLibraryClick(event) {
  const button = event.target.closest('[data-exercise-id]');
  const id = button?.dataset.exerciseId;
  if (!id) return;
  const ticket = createLibraryReturn({ filters: courseUi.readLibraryFilters(ce), scrollY: window.scrollY, exerciseId: id });
  startExercise(id, 'library');
  if (session?.exercise?.id !== id) return;
  libraryReturn = nextLibraryReturn(libraryReturn, { type: 'open-library-exercise', ticket });
  if (history.state !== LIBRARY_GAME_STATE) history.pushState(LIBRARY_GAME_STATE, '');
}

// «Empezar» / «Repetir» la lección actual: es el paso actual del recorrido.
function handleLessonStart() {
  if (catalog) startExercise(currentCourseId(), 'academy', { courseStep: true });
}

// Práctica ampliada: opcional y nunca hace avanzar el recorrido.
function handleExtendedStart() {
  const id = ce.academy.extendedButton.dataset.exerciseId;
  if (id) startExercise(id, 'academy');
}

// «Siguiente ejercicio» desde la Academia (base ya terminada, sin repetirla):
// avanza exactamente una posición y abre la siguiente práctica base, igual que
// el mismo botón de Resultados.
function handleLessonNext() {
  if (!catalog || !academyView(catalog, progress)?.canAdvance) return;
  saveProgress(advanceCourse(progress, catalog.courseOrder));
  startExercise(currentCourseId(), 'academy', { courseStep: true });
}

function saveProgress(next) {
  progress = next;
  const result = progressStore.save(progress);
  return result.ok ? null : 'No se pudo guardar el progreso de la Academia en este navegador.';
}

// --- Preparación (práctica libre) ------------------------------------------------

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
  startGame(result.text, { origin: 'free', exercise: null });
}

// --- Partida -------------------------------------------------------------------

// Los textos del catálogo ya están validados con prepareText (catalog.js).
// courseStep: true solo para la lección actual abierta desde la Academia; es lo
// único que ofrece «Saltar» y «Siguiente ejercicio».
function startExercise(id, origin, { courseStep = false } = {}) {
  const exercise = catalog?.byId.get(id);
  if (exercise) startGame(exercise.text, { origin, exercise, courseStep });
}

function startGame(text, { origin, exercise, courseStep = false }) {
  leaveGame();
  if (origin !== 'library') libraryReturn = nextLibraryReturn(libraryReturn, { type: 'open-other-exercise' });
  const chunks = splitIntoChunks(text, CONFIG.wordsPerChunk);
  const state = createGame(text, { segmentEnds: chunks.map((c) => c.end), mode: selectedMode });
  session = { state, chunks, savedRecordId: null, origin, exercise, courseStep, analysis: createTypingAnalysis(state.text) };
  enterPlay();
}

function enterPlay() {
  ui.renderOptionsOpen(els, false);
  stopStatsTimer();
  resetNotices();
  composing = false;
  showScreen('play');
  ui.renderPlayMode(els, session.state.mode);
  courseUi.renderPlayExercise(ce, session.exercise, { canSkip: session.courseStep });
  ui.syncInput(els.input, session.state.typed);
  guideErrorCode = null;
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
  renderKeyboardGuide();
}

// --- Guía de teclado ---------------------------------------------------------------

function createGuide() {
  const byId = (id) => document.getElementById(id);
  return {
    section: byId('guide'),
    hint: byId('guide-hint'),
    rest: byId('guide-rest'),
    keyboard: byId('keyboard'),
    hands: byId('hands'),
    keys: createKeyboard(byId('keyboard')),
    fingers: createHands(byId('hands')),
  };
}

function currentHelpContext() {
  return helpContext({ origin: session?.origin ?? null, screen: currentScreen });
}

// Siguiente carácter esperado según el estado del motor (o Retroceso si el
// fragmento está bloqueado). Solo lee el estado: no lo modifica.
function currentResolution() {
  const target = guideTarget(session.state, { blocked: ui.isFragmentBlocked(session.state, session.chunks) });
  if (target === null) return null;
  return target.kind === 'backspace' ? resolveBackspace() : resolveCharacter(target.char);
}

function renderKeyboardGuide() {
  const resolution = session ? currentResolution() : null;
  renderGuide(guide, {
    mode: session ? helpModes[currentHelpContext()] : 'none',
    resolution,
    text: resolution ? describeResolution(resolution) : '',
    errorCode: guideErrorCode,
    showRest: showsRestReminder(session?.exercise ?? null),
  });
}

// Tecla que se marca como error: la física pulsada (KeyboardEvent.code) o, si no se
// conoce, la que escribiría el carácter erróneo en el teclado español.
function errorKeyFor(wrongChar) {
  if (lastKeyCode && getKey(lastKeyCode) && !MODIFIER_CODES.has(lastKeyCode)) return lastKeyCode;
  return resolveCharacter(wrongChar).steps.at(-1)?.code ?? null;
}

function processInput() {
  if (!isPlaying()) return;
  const previous = session.state;
  const attempted = els.input.value;
  const next = applyInput(previous, attempted, performance.now());
  if (next !== previous) {
    session.state = next;
    // Diagnóstico (T11): solo transiciones aceptadas por el motor.
    session.analysis = recordTransition(session.analysis, previous, next);
    guideErrorCode = isWrongInsertion(previous, next) ? errorKeyFor(next.typed.at(-1)) : null;
    if (previous.status === 'idle') {
      startStatsTimer();
      // Primera pulsación: a partir de aquí el modo queda bloqueado.
      refreshOptionsState();
    }
    notices.errorsBlocking = false;
  } else if (attempted.length > previous.typed.length && ui.isFragmentBlocked(previous, session.chunks)) {
    // Intento de avanzar con el fragmento lleno de errores: el motor lo rechazó.
    notices.errorsBlocking = true;
    guideErrorCode = errorKeyFor(attempted.at(-1));
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
  guideErrorCode = null;
  const stats = getStats(session.state, performance.now());
  const evaluation = session.exercise ? evaluateObjectives(stats, session.exercise) : null;
  ui.renderResults(els, stats, session.state.mode);
  courseUi.renderObjectiveResults(ce, session.exercise, evaluation);
  const analysis = summarizeAnalysis(session.analysis, session.state.typed);
  analysisUi.renderDiagnosis(de.resultsBody, diagnose(analysis));
  courseUi.renderResultsActions(els, ce, {
    origin: session.origin, courseStep: session.courseStep, hasNext: hasNextCourseStep(),
  });
  // La pantalla se muestra antes de guardar: así el aviso de fallo se escribe en
  // una región visible y el lector de pantalla lo anuncia.
  showScreen('results');
  saveFinishedSession(stats, evaluation, analysis);
  ui.renderResultsTrends(els, historyStore.load().sessions, CONFIG.historyChartSessions);
  els.retryButton.focus();
}

// true si el paso actual del recorrido tiene un siguiente (solo en courseStep).
function hasNextCourseStep() {
  if (!catalog || !session?.courseStep) return false;
  return nextInCourse(catalog.courseOrder, currentCourseId()) !== null;
}

// Abandona la partida o los resultados en pantalla: detiene cronómetro, avisos
// y efectos y descarta el progreso de la partida (nunca se guarda).
function leaveGame() {
  stopStatsTimer();
  resetNotices();
  ui.clearChunkEffects(els);
  ui.clearResultsAnnouncement(els);
  ui.renderSaveError(els, null);
  composing = false;
  session = null;
  guideErrorCode = null;
  renderKeyboardGuide();
}

// --- Historial y progreso al terminar ------------------------------------------------

// Acceder a window.localStorage puede lanzar (almacenamiento bloqueado): sin él,
// el juego sigue funcionando y el historial informa de que no está disponible.
function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createRecordId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Solo se guardan partidas terminadas, una vez por finalización. El registro
// contiene métricas, modo y el ID del ejercicio, nunca el texto practicado. Los
// datos no válidos llegan como error controlado de storage.js ('invalid'), sin
// try/catch aquí: cualquier otro fallo de programación no se oculta.
function saveFinishedSession(stats, evaluation, analysis) {
  if (session.savedRecordId !== null) return;
  session.savedRecordId = createRecordId();
  const record = createSessionRecord({
    id: session.savedRecordId,
    finishedAt: Date.now(),
    stats,
    mode: session.state.mode,
    exercise: session.exercise ? session.exercise.id : EXERCISE_CUSTOM_TEXT,
    analysis: packAnalysis(analysis),
  });
  const result = historyStore.add(record);
  const historyError = result.ok ? null : ui.saveErrorMessage(result.error);
  ui.renderSaveError(els, historyError ?? recordExerciseProgress(stats, evaluation));
}

// Estado individual del ejercicio (Academia y Biblioteca). No mueve el recorrido.
function recordExerciseProgress(stats, evaluation) {
  if (!session.exercise) return null;
  return saveProgress(recordCompletion(progress, session.exercise.id, {
    accuracy: stats.accuracy,
    wpm: stats.wpm,
    passed: evaluation.passed,
  }));
}

function renderHistory({ cleared = false } = {}) {
  const history = historyStore.load();
  ui.renderHistory(els, history, { chartSessions: CONFIG.historyChartSessions, exerciseName, cleared });
  // «Mi evolución» (T12) y sus recomendaciones (T13): al vuelo, con lo ya guardado.
  const report = analyzeTrends(history.sessions);
  const recommendations = catalog
    ? recommendPractice({ report, catalog, progress })
    : { status: report.status === 'ok' ? 'none' : report.status, items: [] };
  trendsUi.renderEvolution(document.getElementById('evolution-body'), report, recommendations);
  de.history.panel.hidden = true;
}

// «Ver» en una fila del Historial (delegación): diagnóstico guardado de esa sesión.
// Las sesiones anteriores a T11 no tienen análisis: diagnose(null) lo indica.
function handleHistoryDiagnosis(event) {
  const button = event.target.closest('.history-diagnosis-button');
  if (!button) return;
  const record = historyStore.load().sessions.find((s) => s.id === button.dataset.sessionId);
  if (!record) return;
  const h = de.history;
  h.session.textContent = [
    formatDateTime(record.finishedAt), exerciseName(record.exercise), ui.formatMode(record.mode),
  ].join(' · ');
  analysisUi.renderDiagnosis(h.body, diagnose(unpackAnalysis(record.analysis)));
  h.panel.hidden = false;
  h.title.focus();
}

function handleHistoryDiagnosisClose() {
  de.history.panel.hidden = true;
  els.history.title.focus();
}

function handleClearRequest() {
  ui.renderHistoryConfirm(els, true);
  els.history.cancelButton.focus();
}

function handleClearCancel() {
  ui.renderHistoryConfirm(els, false);
  els.history.clearButton.focus();
}

function handleClearConfirm() {
  const result = historyStore.clear();
  renderHistory({ cleared: result.ok });
  els.history.title.focus();
}

// «Reiniciar Academia»: pide confirmación en la propia pantalla (sin confirm()).
function handleCourseResetRequest() {
  courseUi.renderCourseReset(ce, { available: true, confirming: true });
  ce.courseReset.cancelButton.focus();
}

function handleCourseResetCancel() {
  courseUi.renderCourseReset(ce, { available: true });
  ce.courseReset.button.focus();
}

// Solo la posición vuelve a la primera lección: historial, estados y marcas se conservan.
function handleCourseResetConfirm() {
  if (!catalog) return;
  const error = saveProgress(restartCourse(progress, catalog.courseOrder));
  renderAcademy();
  const message = error ?? 'Academia reiniciada: al volver a la Academia empezarás por la primera lección.';
  courseUi.renderCourseReset(ce, { available: true, message });
  ce.courseReset.button.focus();
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
  // Posición física de la última tecla (para marcar un error en el teclado visual).
  if (!MODIFIER_CODES.has(event.code)) lastKeyCode = event.code;
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

// --- Acciones de partida y resultados ----------------------------------------------

// Vuelve a empezar la sesión actual (texto, ejercicio, origen y paso del
// recorrido) con el MISMO modo y desde cero: cronómetro, entrada, métricas,
// fragmentos, avisos, efectos y guía. No toca el progreso ni el historial; la
// nueva partida, si termina, se guarda como otra sesión.
function restartSession() {
  ui.clearChunkEffects(els);
  ui.clearResultsAnnouncement(els);
  ui.renderSaveError(els, null);
  syncSelectedMode(session.state.mode);
  session.state = restartGame(session.state);
  session.analysis = createTypingAnalysis(session.state.text);
  session.savedRecordId = null;
  lastKeyCode = null;
  enterPlay();
}

// «Repetir ejercicio» / «Repetir texto» (Resultados). Solo actúa desde Resultados:
// un segundo clic ya no repite ni duplica nada.
function handleRetry() {
  if (currentScreen !== 'results' || !session) return;
  restartSession();
}

// «Reiniciar ejercicio» (partida en curso): descarta la partida SIN guardarla y
// devuelve el foco al campo de escritura (enterPlay). Sin confirmación.
function handleRestart() {
  if (!isPlaying()) return;
  restartSession();
}

// La casilla «Bloquear avance con errores» refleja el modo de la partida repetida.
function syncSelectedMode(mode) {
  selectedMode = mode;
  els.blockOnErrors.checked = mode === 'strict';
  ui.renderSelectedMode(els, selectedMode);
}

// «Siguiente ejercicio» (paso actual de la Academia): avanza exactamente un
// elemento aunque no se haya alcanzado el objetivo y abre el nuevo actual.
function handleNextExercise() {
  if (!hasNextCourseStep()) return;
  saveProgress(advanceCourse(progress, catalog.courseOrder));
  startExercise(currentCourseId(), 'academy', { courseStep: true });
}

// «Saltar ejercicio» (paso actual de la Academia): lo marca como saltado si no
// tenía un logro superior y avanza exactamente uno. En el último, vuelve a la Academia.
function handleSkip() {
  if (!catalog || !session?.courseStep) return;
  const before = currentCourseId();
  saveProgress(skipCurrent(progress, catalog.courseOrder));
  if (currentCourseId() !== before) startExercise(currentCourseId(), 'academy', { courseStep: true });
  else navigate('academy');
}

function handleBackToOrigin() {
  if (session?.origin === 'library') returnToLibrary();
  else if (session?.origin === 'evolution') returnToEvolution();
  else navigate('academy');
}

// «Practicar» en «Mi evolución» (delegación): como una práctica de la Biblioteca,
// actualiza el estado del ejercicio pero nunca la posición del recorrido.
function handlePracticeClick(event) {
  const id = event.target.closest('[data-practice-id]')?.dataset.practiceId;
  if (id) startExercise(id, 'evolution');
}

function handleNewText() {
  navigate('practice');
  els.sourceText.select();
}

// Abandona la partida: el ejercicio vuelve a su sección; la práctica libre, a
// la preparación con el texto original intacto para reutilizarlo o editarlo.
function handleExit() {
  const origin = session?.origin ?? 'free';
  if (origin === 'library') returnToLibrary();
  else if (origin === 'evolution') returnToEvolution();
  else navigate(origin === 'free' ? 'practice' : origin);
}

// --- Pantallas y menú Opciones -------------------------------------------------

function showScreen(name) {
  currentScreen = name;
  ui.showScreen(els, name);
  refreshOptionsState();
}

function refreshOptionsState() {
  ui.renderOptionsState(els, { locked: ui.isModeLocked(currentScreen, session?.state ?? null) });
}

// Antes de la primera pulsación también se puede cambiar el modo de la partida
// en pantalla: se vuelve a crear con el modo nuevo (aún no hay nada escrito).
function handleModeChange() {
  selectedMode = els.blockOnErrors.checked ? 'strict' : 'free';
  ui.renderSelectedMode(els, selectedMode);
  if (currentScreen === 'play' && session.state.status === 'idle') {
    session.state = restartGame(session.state, { mode: selectedMode });
    session.analysis = createTypingAnalysis(session.state.text);
    ui.renderPlayMode(els, selectedMode);
    render();
  }
}

// Ayudas visuales: cambian solo la presentación, también en mitad de una partida.
function renderHelpOption() {
  const context = currentHelpContext();
  els.helpContext.textContent = context === 'free' ? 'en práctica libre' : 'en ejercicios';
  for (const radio of els.helpRadios) radio.checked = radio.value === helpModes[context];
}

function handleHelpChange(event) {
  if (event.target.name !== 'help-mode') return;
  helpModes[currentHelpContext()] = event.target.value;
  renderKeyboardGuide();
}

function isOptionsOpen() {
  return !els.options.panel.hidden;
}

function closeOptions({ restoreFocus = false } = {}) {
  if (!isOptionsOpen()) return;
  ui.renderOptionsOpen(els, false);
  if (isPlaying()) els.input.focus();
  else if (restoreFocus) els.options.toggle.focus();
}

function handleOptionsToggle() {
  if (isOptionsOpen()) {
    closeOptions();
    return;
  }
  renderHelpOption();
  ui.renderOptionsOpen(els, true);
  els.blockOnErrors.focus();
}

function handleDocumentKeyDown(event) {
  if (event.key === 'Escape' && isOptionsOpen()) closeOptions({ restoreFocus: true });
}

function handleDocumentClick(event) {
  if (isOptionsOpen() && !event.target.closest('.options')) closeOptions();
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

function bindEvents() {
  els.setupForm.addEventListener('submit', handleSetupSubmit);
  els.sourceText.addEventListener('input', updateSourceCount);
  els.retryButton.addEventListener('click', handleRetry);
  els.newTextButton.addEventListener('click', handleNewText);
  els.restartButton.addEventListener('click', handleRestart);
  els.exitButton.addEventListener('click', handleExit);
  ce.skipButton.addEventListener('click', handleSkip);
  ce.nextExerciseButton.addEventListener('click', handleNextExercise);
  ce.backToOriginButton.addEventListener('click', handleBackToOrigin);
  ce.academy.startButton.addEventListener('click', handleLessonStart);
  ce.academy.nextButton.addEventListener('click', handleLessonNext);
  ce.academy.extendedButton.addEventListener('click', handleExtendedStart);
  ce.library.list.addEventListener('click', handleLibraryClick);
  ce.library.filters.addEventListener('input', renderLibrary);
  ce.library.filters.addEventListener('submit', (event) => event.preventDefault());
  ce.nav.addEventListener('click', handleNavClick);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handlePopState);
  els.soundToggle.addEventListener('click', handleSoundToggle);
  els.options.toggle.addEventListener('click', handleOptionsToggle);
  els.blockOnErrors.addEventListener('change', handleModeChange);
  els.helpOption.addEventListener('change', handleHelpChange);
  document.addEventListener('keydown', handleDocumentKeyDown);
  document.addEventListener('click', handleDocumentClick);
  els.history.clearButton.addEventListener('click', handleClearRequest);
  els.history.cancelButton.addEventListener('click', handleClearCancel);
  els.history.confirmButton.addEventListener('click', handleClearConfirm);
  els.history.rows.addEventListener('click', handleHistoryDiagnosis);
  de.history.closeButton.addEventListener('click', handleHistoryDiagnosisClose);
  document.getElementById('evolution-body').addEventListener('click', handlePracticeClick);
  ce.courseReset.button.addEventListener('click', handleCourseResetRequest);
  ce.courseReset.cancelButton.addEventListener('click', handleCourseResetCancel);
  ce.courseReset.confirmButton.addEventListener('click', handleCourseResetConfirm);
  els.startButton.addEventListener('click', () => sound.unlock());
  bindTypingInput();
}

async function init() {
  // T12: el desplazamiento de la Biblioteca lo restaura la aplicación, no el
  // navegador; y tras recargar no queda ninguna partida a la que volver.
  history.scrollRestoration = 'manual';
  if (history.state === LIBRARY_GAME_STATE) history.replaceState(null, '');
  bindEvents();
  ui.setChunkAnimationMs(els, CONFIG.chunkAnimationMs);
  ui.renderSoundToggle(els, sound.isEnabled());
  ui.renderSelectedMode(els, selectedMode);
  updateSourceCount();
  await loadCatalog();
  showRoute(parseRoute(location.hash));
}

init();
