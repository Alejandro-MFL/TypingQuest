// Punto de entrada: coordina eventos, rutas, motor (game.js) e interfaz (ui.js,
// course-ui.js). No contiene reglas de juego ni de progreso: las deciden
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
  advanceCourse, skipCurrent, academyView, resolveRetiredPosition,
} from './progress.js';
import { evaluateObjectives } from './objectives.js';
import { parseRoute, routeHash } from './router.js';
import * as ui from './ui.js';
import * as courseUi from './course-ui.js';

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

// --- Navegación ------------------------------------------------------------------

function navigate(route) {
  const hash = routeHash(route);
  // Volver a la misma ruta (p. ej. desde una partida) no dispara hashchange.
  if (location.hash === hash) showRoute(route);
  else location.hash = hash;
}

// Cambiar de sección descarta cualquier partida o resultado en pantalla.
function showRoute(route) {
  leaveGame();
  closeOptions();
  courseUi.renderNav(ce, route);
  renderRoute(route);
  showScreen(ROUTE_SCREENS[route]);
  if (route === 'practice') els.sourceText.focus();
  else els.screens[ROUTE_SCREENS[route]].querySelector('.screen-title').focus();
}

function renderRoute(route) {
  if (route === 'home') courseUi.renderHome(ce, currentCourseExercise());
  else if (route === 'academy') renderAcademy();
  else if (route === 'library') renderLibrary();
  else if (route === 'history') renderHistory();
}

function handleHashChange() {
  showRoute(parseRoute(location.hash));
}

function handleNavClick(event) {
  const link = event.target.closest('a[href^="#/"]');
  // Con el hash ya activo no habría hashchange: se muestra la ruta igualmente.
  if (link && link.getAttribute('href') === location.hash) {
    event.preventDefault();
    showRoute(parseRoute(location.hash));
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
  courseUi.renderLibrary(ce, lessons, (id) => getExerciseProgress(progress, id).status);
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
function handleLibraryClick(event) {
  const button = event.target.closest('[data-exercise-id]');
  if (button?.dataset.exerciseId) startExercise(button.dataset.exerciseId, 'library');
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
  const chunks = splitIntoChunks(text, CONFIG.wordsPerChunk);
  const state = createGame(text, { segmentEnds: chunks.map((c) => c.end), mode: selectedMode });
  session = { state, chunks, savedRecordId: null, origin, exercise, courseStep };
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
    if (previous.status === 'idle') {
      startStatsTimer();
      // Primera pulsación: a partir de aquí el modo queda bloqueado.
      refreshOptionsState();
    }
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
  const evaluation = session.exercise ? evaluateObjectives(stats, session.exercise) : null;
  ui.renderResults(els, stats, session.state.mode);
  courseUi.renderObjectiveResults(ce, session.exercise, evaluation);
  courseUi.renderResultsActions(els, ce, {
    origin: session.origin, courseStep: session.courseStep, hasNext: hasNextCourseStep(),
  });
  // La pantalla se muestra antes de guardar: así el aviso de fallo se escribe en
  // una región visible y el lector de pantalla lo anuncia.
  showScreen('results');
  saveFinishedSession(stats, evaluation);
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
function saveFinishedSession(stats, evaluation) {
  if (session.savedRecordId !== null) return;
  session.savedRecordId = createRecordId();
  const record = createSessionRecord({
    id: session.savedRecordId,
    finishedAt: Date.now(),
    stats,
    mode: session.state.mode,
    exercise: session.exercise ? session.exercise.id : EXERCISE_CUSTOM_TEXT,
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
  ui.renderHistory(els, historyStore.load(), { chartSessions: CONFIG.historyChartSessions, exerciseName, cleared });
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

// --- Acciones de partida y resultados ----------------------------------------------

// «Reintentar» / «Repetir»: el mismo texto con el modo elegido ahora.
function handleRetry() {
  ui.clearResultsAnnouncement(els);
  ui.renderSaveError(els, null);
  session.state = restartGame(session.state, { mode: selectedMode });
  session.savedRecordId = null;
  enterPlay();
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
  navigate(session?.origin === 'library' ? 'library' : 'academy');
}

function handleNewText() {
  navigate('practice');
  els.sourceText.select();
}

// Abandona la partida: el ejercicio vuelve a su sección; la práctica libre, a
// la preparación con el texto original intacto para reutilizarlo o editarlo.
function handleExit() {
  const origin = session?.origin ?? 'free';
  navigate(origin === 'free' ? 'practice' : origin);
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
    ui.renderPlayMode(els, selectedMode);
    render();
  }
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
  els.soundToggle.addEventListener('click', handleSoundToggle);
  els.options.toggle.addEventListener('click', handleOptionsToggle);
  els.blockOnErrors.addEventListener('change', handleModeChange);
  document.addEventListener('keydown', handleDocumentKeyDown);
  document.addEventListener('click', handleDocumentClick);
  els.history.clearButton.addEventListener('click', handleClearRequest);
  els.history.cancelButton.addEventListener('click', handleClearCancel);
  els.history.confirmButton.addEventListener('click', handleClearConfirm);
  els.startButton.addEventListener('click', () => sound.unlock());
  bindTypingInput();
}

async function init() {
  bindEvents();
  ui.setChunkAnimationMs(els, CONFIG.chunkAnimationMs);
  ui.renderSoundToggle(els, sound.isEnabled());
  ui.renderSelectedMode(els, selectedMode);
  updateSourceCount();
  await loadCatalog();
  showRoute(parseRoute(location.hash));
}

init();
