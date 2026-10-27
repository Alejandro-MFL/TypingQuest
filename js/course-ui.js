// Interfaz de Inicio, Academia y Biblioteca, y de la información del ejercicio
// en la partida y los resultados. Solo pinta: no decide progreso ni recorrido.
// Los helpers del principio son puros y se prueban con Node.
import { EXERCISE_STATUS } from './progress.js';
import { DIFFICULTIES, CATEGORIES, difficultyLabel, kindLabel } from './catalog.js';

const STATUS_INFO = Object.freeze({
  [EXERCISE_STATUS.NOT_STARTED]: { label: 'No realizado', icon: '○' },
  [EXERCISE_STATUS.SKIPPED]: { label: 'Saltado', icon: '↷' },
  [EXERCISE_STATUS.COMPLETED]: { label: 'Terminado', icon: '◐' },
  [EXERCISE_STATUS.PASSED]: { label: 'Objetivo superado', icon: '✓' },
});

// Icono de cada resultado de un objetivo (el color nunca va solo).
const OBJECTIVE_ICON = Object.freeze({ met: '✓', pending: '◐', unreliable: '◐', 'not-applicable': '—' });

// --- Funciones puras -------------------------------------------------------------

/** Etiqueta, icono y clase de color de un estado: el color nunca va solo. */
export function statusInfo(status) {
  const key = STATUS_INFO[status] ? status : EXERCISE_STATUS.NOT_STARTED;
  return { ...STATUS_INFO[key], className: `status-${key}` };
}

/** Precisión truncada a un decimal: 94,96 % se muestra 94,9 %, nunca «95 %». */
export function formatAccuracyFloor(accuracy) {
  const value = Math.floor(accuracy * 10) / 10;
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}

/** Número de tarjetas de la Biblioteca, para su región de estado. */
export function formatLessonCount(count) {
  if (count === 0) return 'Ninguna lección coincide con la búsqueda';
  return count === 1 ? '1 lección' : `${count} lecciones`;
}

const BLOCK_LETTERS = 'ABCDE';

/** Nombre corto del bloque del temario de un nivel: 1 → «Bloque A». */
export function blockLabel(level) {
  const letter = BLOCK_LETTERS[level - 1];
  return letter ? `Bloque ${letter}` : `Nivel ${level}`;
}

/** Lecciones agrupadas por nivel, en el orden en que llegan (orden del curso). */
export function groupLessonsByLevel(lessons) {
  const groups = [];
  for (const lesson of lessons) {
    const last = groups.at(-1);
    if (last && last.level === lesson.level) last.lessons.push(lesson);
    else groups.push({ level: lesson.level, lessons: [lesson] });
  }
  return groups;
}

/** Objetivos de un ejercicio en una frase. */
export function formatGoals({ targetAccuracy, targetWpm }) {
  if (targetWpm === null) {
    return `Objetivo: ${targetAccuracy} % de precisión (la velocidad no se evalúa en esta práctica)`;
  }
  return `Objetivos: ${targetAccuracy} % de precisión y ${targetWpm} WPM`;
}

function wpmItem(wpm) {
  if (!wpm.applicable) return { state: 'not-applicable', text: 'Velocidad: no se evalúa en esta práctica' };
  if (!wpm.reliable) {
    return { state: 'unreliable', text: 'Velocidad: tiempo demasiado corto para medirla con fiabilidad; pendiente' };
  }
  // WPM truncadas: 19,99 se muestra 19, nunca «20».
  const value = `Velocidad ${Math.floor(wpm.value)} WPM (mínimo ${wpm.target} WPM)`;
  return { state: wpm.met ? 'met' : 'pending', text: `${value}: ${wpm.met ? 'cumplido' : 'pendiente'}` };
}

/**
 * Resultado de cada objetivo (evaluateObjectives) para la pantalla de
 * resultados: qué se cumple y qué queda pendiente. Terminar no es superar.
 */
export function formatObjectiveResults(evaluation) {
  const { accuracy, wpm, passed } = evaluation;
  const accuracyText = `Precisión ${formatAccuracyFloor(accuracy.value)} (mínimo ${accuracy.target} %)`;
  const items = [
    { state: accuracy.met ? 'met' : 'pending', text: `${accuracyText}: ${accuracy.met ? 'cumplido' : 'pendiente'}` },
    wpmItem(wpm),
  ];
  return {
    passed,
    title: passed ? 'Objetivo superado' : 'Ejercicio terminado, objetivo pendiente',
    items: items.map((item) => ({ ...item, icon: OBJECTIVE_ICON[item.state] })),
  };
}

// --- DOM -------------------------------------------------------------------------

export function getCourseElements(doc = document) {
  const byId = (id) => doc.getElementById(id);
  return {
    nav: byId('main-nav'),
    subtitle: byId('site-subtitle'),
    homeContinue: byId('home-continue'),
    academy: {
      error: byId('academy-error'),
      content: byId('academy-content'),
      position: byId('lesson-position'),
      title: byId('lesson-title'),
      description: byId('lesson-description'),
      goals: byId('lesson-goals'),
      status: byId('lesson-status'),
      startButton: byId('lesson-start'),
      nextButton: byId('lesson-next'),
      courseEnd: byId('lesson-course-end'),
      extended: byId('lesson-extended'),
      extendedGoals: byId('lesson-extended-goals'),
      extendedStatus: byId('lesson-extended-status'),
      extendedButton: byId('lesson-extended-start'),
      introPanel: byId('academy-intro'),
      introTitle: byId('academy-intro-title'),
      introDone: byId('academy-intro-done'),
      introSkip: byId('academy-intro-skip'),
      introOpen: byId('academy-intro-open'),
      lessonIntroToggle: byId('lesson-intro-toggle'),
      lessonIntro: byId('lesson-intro'),
      lessonIntroText: byId('lesson-intro-text'),
      overviewSummary: byId('course-overview-summary'),
      skill: byId('lesson-skill'),
      newLesson: byId('lesson-new'),
      overviewBlocks: byId('course-overview-blocks'),
      overviewCurrent: byId('course-overview-current'),
    },
    library: {
      error: byId('library-error'),
      content: byId('library-content'),
      filters: byId('library-filters'),
      query: byId('library-query'),
      level: byId('library-level'),
      difficulty: byId('library-difficulty'),
      category: byId('library-category'),
      count: byId('library-count'),
      list: byId('library-list'),
    },
    playExercise: byId('play-exercise'),
    playExerciseTitle: byId('play-exercise-title'),
    playExerciseTarget: byId('play-exercise-target'),
    skipButton: byId('skip-button'),
    resultExercise: byId('result-exercise'),
    targetResult: byId('target-result'),
    targetResultTitle: byId('target-result-title'),
    resultAdvice: byId('result-advice'),
    homeProgress: byId('home-progress'),
    homeProgressText: byId('home-progress-text'),
    homeProgressFill: byId('home-progress-fill'),
    objectiveList: byId('objective-list'),
    resultsObjectives: byId('results-objectives'),
    resultsDetails: byId('results-details'),
    speedNote: byId('result-speed-note'),
    extendedResultsButton: byId('extended-results-button'),
    courseEnd: byId('course-end'),
    nextExerciseButton: byId('next-exercise-button'),
    backToOriginButton: byId('back-to-origin-button'),
    courseReset: {
      section: byId('course-reset'),
      actions: byId('course-reset-actions'),
      button: byId('course-reset-button'),
      confirm: byId('course-reset-confirm'),
      confirmButton: byId('course-reset-confirm-button'),
      cancelButton: byId('course-reset-cancel-button'),
      status: byId('course-reset-status'),
    },
  };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Marca el enlace de la sección actual con aria-current="page"; el subtítulo, solo en Inicio. */
export function renderNav(ce, route) {
  ce.subtitle.hidden = route !== 'home';
  for (const link of ce.nav.querySelectorAll('[data-route]')) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

export function renderHome(ce, currentExercise) {
  ce.homeContinue.textContent = currentExercise ? `Ejercicio actual: ${currentExercise.title}` : '';
}

/** Si el catálogo no se pudo cargar, Academia y Biblioteca lo explican. */
export function renderCatalogError(ce, message) {
  for (const section of [ce.academy, ce.library]) {
    section.error.textContent = message ?? '';
    section.error.hidden = !message;
    section.content.hidden = Boolean(message);
  }
}

function statusBadge(status) {
  const info = statusInfo(status);
  const badge = element('span', `status-badge ${info.className}`);
  const icon = element('span', null, info.icon);
  icon.setAttribute('aria-hidden', 'true');
  badge.append(icon, ` ${info.label}`);
  return badge;
}

function hasFinished(status) {
  return status === EXERCISE_STATUS.COMPLETED || status === EXERCISE_STATUS.PASSED;
}

// Bloqueo de la ampliada en la Academia: icono decorativo y texto (no solo color).
function lockedBadge() {
  const badge = element('span', 'status-badge status-locked');
  const icon = element('span', null, '🔒');
  icon.setAttribute('aria-hidden', 'true');
  badge.append(icon, ' Bloqueada');
  return badge;
}

// Estado y objetivos de la práctica ampliada opcional, y su botón (T15.3: solo
// cuando la base tiene el objetivo superado; si no, se explica cómo desbloquearla).
function renderExtended(a, extended) {
  a.extended.hidden = !extended;
  a.extendedButton.hidden = !extended?.unlocked;
  if (!extended) return;
  a.extendedGoals.textContent = extended.unlocked
    ? formatGoals(extended.exercise) : 'Supera el objetivo de la práctica base para desbloquearla.';
  a.extendedStatus.replaceChildren(extended.unlocked ? statusBadge(extended.status) : lockedBadge());
  a.extendedButton.dataset.exerciseId = extended.exercise.id;
}

/**
 * Academia: SOLO la lección actual (academyView), en una única tarjeta con dos
 * botones: «Práctica base» (paso del recorrido; repetirla también se hace desde
 * aquí) y «Práctica ampliada» (opcional). Si la base ya está terminada se ofrece
 * «Siguiente ejercicio» sin repetirla.
 */
export function renderAcademy(ce, view) {
  const a = ce.academy;
  const { exercise, level } = view;
  a.position.textContent = `${level.title} — Ejercicio ${view.position} de ${view.total}`;
  a.title.textContent = exercise.title;
  a.newLesson.hidden = view.status !== EXERCISE_STATUS.NOT_STARTED;
  a.description.textContent = exercise.description;
  a.goals.textContent = formatGoals(exercise);
  a.status.replaceChildren(statusBadge(view.status));
  a.startButton.dataset.exerciseId = exercise.id;
  a.startButton.classList.toggle('button-secondary', view.canAdvance);
  a.nextButton.hidden = !view.canAdvance;
  a.courseEnd.hidden = !(view.isLast && hasFinished(view.status));
  renderExtended(a, view.extended);
}

// --- Experiencia pedagógica (T14) -------------------------------------------------------

/** Resumen del recorrido: recorridas, restantes, terminadas y superadas, por separado. */
export function overviewSummaryText({ lessons, traveled, remaining, finished, passed }) {
  return `Has recorrido ${traveled} de ${lessons} lecciones y te quedan ${remaining}. `
    + `Prácticas base terminadas: ${finished}; con el objetivo superado: ${passed}.`;
}

export function blockProgressText({ total, traveled, finished, passed, current }) {
  const text = `${traveled} de ${total} recorridas · ${finished} terminadas · ${passed} superadas`;
  return current ? `${text} · bloque actual` : text;
}

/** Porcentaje recorrido de un bloque (entero). */
export function blockPercent({ traveled, total }) {
  return total ? Math.round((traveled / total) * 100) : 0;
}

/** Texto breve de los bloques que no son el actual (T15.2). */
export function blockShortText(block) {
  if (block.total > 0 && block.traveled === block.total) return `✓ Completado · ${block.traveled} de ${block.total}`;
  return `${block.traveled} de ${block.total} · ${blockPercent(block)} %`;
}

/** Línea discreta de progreso en la tarjeta «Continuar la Academia» de Inicio. */
export function homeProgressText({ blocks, totals }) {
  const current = blocks.find((b) => b.current);
  const traveled = `${totals.traveled} de ${totals.lessons} lecciones recorridas`;
  return current ? `${current.title} · ${traveled}` : traveled;
}

// Una fila por bloque: título, barra discreta del recorrido (decorativa) y su texto.
// El bloque actual muestra el detalle completo; los demás, un resumen breve.
function createBlockRow(block) {
  const complete = block.total > 0 && block.traveled === block.total;
  const item = element('li', `course-block${block.current ? ' is-current' : ''}${complete ? ' is-complete' : ''}`);
  const track = element('div', 'course-block-track');
  track.setAttribute('aria-hidden', 'true');
  const fill = element('div', 'course-block-fill');
  fill.style.width = `${blockPercent(block)}%`;
  track.append(fill);
  const text = block.current ? blockProgressText(block) : blockShortText(block);
  item.append(element('span', 'course-block-title', block.title), track, element('span', 'course-block-text', text));
  return item;
}

/** Inicio: bloque actual y progreso del recorrido en la tarjeta principal. */
export function renderHomeProgress(ce, overview) {
  ce.homeProgress.hidden = !overview;
  if (!overview) return;
  ce.homeProgressText.textContent = homeProgressText(overview);
  ce.homeProgressFill.style.width = `${overview.totals.lessons ? (overview.totals.traveled / overview.totals.lessons) * 100 : 0}%`;
}

// T15.3: el bloque actual siempre visible; todos los bloques, en «Ver todos los bloques».
export function renderCourseOverview(ce, overview) {
  ce.academy.overviewSummary.textContent = overviewSummaryText(overview.totals);
  ce.academy.overviewCurrent.replaceChildren(...overview.blocks.filter((b) => b.current).map(createBlockRow));
  ce.academy.overviewBlocks.replaceChildren(...overview.blocks.map((b) => createBlockRow({ ...b, current: false })));
}

/** Instrucciones de la lección actual; `expanded` decide si se ven ya. */
export function renderLessonIntro(ce, intro, expanded) {
  const a = ce.academy;
  a.lessonIntroToggle.hidden = !intro;
  a.lessonIntro.hidden = !intro || !expanded;
  // La habilidad se ve siempre bajo el título, aunque las instrucciones estén plegadas.
  a.skill.hidden = !intro;
  a.skill.textContent = intro ? `Qué aprenderás: ${intro.skill}` : '';
  if (!intro) return;
  a.lessonIntroToggle.setAttribute('aria-expanded', String(expanded));
  a.lessonIntroToggle.textContent = expanded ? 'Ocultar instrucciones' : 'Ver instrucciones';
  a.lessonIntroText.replaceChildren(...intro.sentences.map((text) => element('p', null, text)));
}

export function renderAcademyIntro(ce, visible) {
  ce.academy.introPanel.hidden = !visible;
  ce.academy.introOpen.hidden = visible;
}

/** Consejo de Resultados (practiceAdvice) o nada en la práctica libre. */
export function renderAdvice(ce, advice) {
  ce.resultAdvice.hidden = !advice;
  ce.resultAdvice.replaceChildren(...(advice ? [element('strong', null, 'Siguiente paso: '), advice.text] : []));
}

// Una práctica (base o ampliada) dentro de la tarjeta de su lección: tipo, estado
// y botón «Empezar» (T15.3: objetivos y marcas, a demanda). El botón lleva
// data-exercise-id; main.js escucha los clics por delegación.
function createPracticeRow(exercise, status, lessonTitle) {
  const kind = kindLabel(exercise.kind);
  const row = element('div', `lesson-practice ${statusInfo(status).className}`);
  const details = element('dd');
  const button = element('button', 'button button-small button-secondary', 'Empezar');
  button.type = 'button';
  button.dataset.exerciseId = exercise.id;
  button.setAttribute('aria-label', `Empezar ${kind.toLowerCase()} de «${lessonTitle}»`);
  details.append(statusBadge(status), button);
  row.append(element('dt', null, kind), details);
  return row;
}

// «Ver objetivos y resultados»: dificultad, objetivos y mejor marca de cada práctica.
function createLessonDetails(exercises, progressOf) {
  const details = element('details', 'lesson-details');
  const list = element('ul', 'lesson-details-list');
  list.append(...exercises.map((exercise) => {
    const item = element('li');
    item.append(element('strong', null, `${kindLabel(exercise.kind)}: `),
      `${difficultyLabel(exercise.difficulty)} · ${formatGoals(exercise)}. ${bestMarksText(progressOf(exercise.id))}.`);
    return item;
  }));
  details.append(element('summary', null, 'Ver objetivos y resultados'), list);
  return details;
}

/** Tarjeta de una lección (libraryLessons): sus dos prácticas, cada una con su estado. */
function createLessonCard(lesson, progressOf) {
  const card = element('li', 'exercise-card library-lesson');
  const practices = element('dl', 'lesson-practices');
  const exercises = [lesson.base, lesson.extended].filter(Boolean);
  for (const exercise of exercises) {
    practices.append(createPracticeRow(exercise, progressOf(exercise.id).status, lesson.title));
  }
  card.append(
    element('h4', 'exercise-card-title', libraryLessonTitle(lesson)),
    element('p', 'exercise-card-description', lesson.description),
    practices,
    createLessonDetails(exercises, progressOf)
  );
  return card;
}

function fillSelect(select, allLabel, options) {
  const all = element('option', null, allLabel);
  all.value = '';
  select.replaceChildren(all, ...options.map(({ value, label }) => {
    const option = element('option', null, label);
    option.value = value;
    return option;
  }));
}

/** Opciones de los filtros de la Biblioteca a partir del catálogo. */
export function renderLibraryFilters(ce, catalog) {
  fillSelect(ce.library.level, 'Todos', catalog.levels.map((l) => ({ value: String(l.level), label: l.title })));
  fillSelect(ce.library.difficulty, 'Todas', DIFFICULTIES.map((d) => ({ value: d.id, label: d.label })));
  const used = new Set(catalog.exercises.map((e) => e.category));
  fillSelect(ce.library.category, 'Todas', CATEGORIES.filter((c) => used.has(c.id))
    .map((c) => ({ value: c.id, label: c.label })));
}

/** Valores que ofrece cada filtro (para descartar los que ya no existen). */
export function libraryFilterOptions(ce) {
  const values = (select) => [...select.options].map((o) => o.value).filter((v) => v !== '');
  return {
    levels: values(ce.library.level).map(Number),
    difficulties: values(ce.library.difficulty),
    categories: values(ce.library.category),
  };
}

/** Escribe búsqueda y filtros (los inversos de readLibraryFilters). */
export function writeLibraryFilters(ce, { query, level, difficulty, category }) {
  ce.library.query.value = query;
  ce.library.level.value = level === null ? '' : String(level);
  ce.library.difficulty.value = difficulty;
  ce.library.category.value = category;
}

// Práctica desde la que se volvió: borde y un texto visible (no solo color). Se
// quita sola en el siguiente pintado de la Biblioteca (filtrar, volver a entrar).
export function markReturnedPractice(button) {
  const row = button.closest('.lesson-practice');
  button.closest('.library-lesson')?.classList.add('is-returned');
  if (!row || row.querySelector('.returned-label')) return;
  row.querySelector('dt')?.append(element('span', 'returned-label', ' · Última práctica abierta'));
}

export function readLibraryFilters(ce) {
  const { query, level, difficulty, category } = ce.library;
  return {
    query: query.value,
    level: level.value === '' ? null : Number(level.value),
    difficulty: difficulty.value,
    category: category.value,
  };
}

// Un bloque del temario en la Biblioteca: encabezado y sus tarjetas.
function createLibraryGroup({ level, lessons }, levelTitles, progressOf) {
  const group = element('section', 'library-group');
  const headingId = `library-group-${level}`;
  group.setAttribute('aria-labelledby', headingId);
  const heading = element('h3', 'library-group-title', levelTitles.get(level) ?? blockLabel(level));
  heading.id = headingId;
  const list = element('ul', 'exercise-list');
  list.append(...lessons.map((lesson) => createLessonCard(lesson, progressOf)));
  group.append(heading, list);
  return group;
}

/**
 * Biblioteca: una tarjeta por lección (filterLessons), agrupadas por bloque del
 * temario; `progressOf(id)` da el progreso de cada práctica (estado y mejores marcas).
 */
export function renderLibrary(ce, lessons, progressOf, levelTitles = new Map()) {
  ce.library.list.replaceChildren(...groupLessonsByLevel(lessons)
    .map((group) => createLibraryGroup(group, levelTitles, progressOf)));
  const count = formatLessonCount(lessons.length);
  if (ce.library.count.textContent !== count) ce.library.count.textContent = count;
}

/** Cabecera del ejercicio durante la partida; null en la práctica libre. */
export function renderPlayExercise(ce, exercise, { canSkip }) {
  ce.playExercise.hidden = !exercise;
  ce.playExerciseTitle.textContent = exercise ? exercise.title : '';
  ce.playExerciseTarget.textContent = exercise ? formatGoals(exercise) : '';
  ce.skipButton.hidden = !canSkip;
}

/** Nombre y resultado de cada objetivo en Resultados; nada en la práctica libre. */
export function renderObjectiveResults(ce, exercise, evaluation) {
  ce.resultExercise.hidden = !exercise;
  ce.targetResult.hidden = !exercise;
  ce.resultsObjectives.hidden = !exercise;
  ce.speedNote.textContent = speedNote(exercise);
  ce.speedNote.hidden = !ce.speedNote.textContent;
  if (!exercise) return;
  const result = formatObjectiveResults(evaluation);
  ce.resultExercise.textContent = `${kindLabel(exercise.kind)}: ${exercise.title}`;
  ce.targetResult.classList.toggle('target-met', result.passed);
  ce.targetResultTitle.textContent = `${result.passed ? '✓' : '◐'} ${result.title}`;
  ce.objectiveList.replaceChildren(...result.items.map(({ state, icon, text }) => {
    const item = element('li', `objective objective-${state}`);
    const mark = element('span', 'objective-icon', icon);
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, ` ${text}`);
    return item;
  }));
}

const ORIGIN_BACK_LABEL = {
  academy: 'Volver a la Academia', library: 'Volver a la Biblioteca', evolution: 'Volver a Mi evolución',
};

/** Rótulo del botón de Resultados que vuelve al origen del ejercicio. */
export function backToOriginLabel(origin) {
  return ORIGIN_BACK_LABEL[origin] ?? '';
}

/**
 * «Reiniciar Academia» (en Historial): solo con el curso cargado. `confirming`
 * alterna entre el botón y la confirmación; `message` va a la región de estado
 * y solo se reescribe al cambiar, para no repetir el anuncio.
 */
export function renderCourseReset(ce, { available, confirming = false, message = '' }) {
  const r = ce.courseReset;
  r.section.hidden = !available;
  r.confirm.hidden = !confirming;
  r.actions.hidden = confirming;
  if (r.status.textContent !== message) r.status.textContent = message;
}

/** Título numerado de una lección en la Biblioteca: «A2. Mano derecha: J». */
export function libraryLessonTitle({ code, title }) {
  return code ? `${code}. ${title}` : title;
}

/** Mejores marcas de una práctica, solo a demanda en la Biblioteca. */
export function bestMarksText({ bestAccuracy, bestWpm }) {
  if (bestAccuracy === null || bestWpm === null) return 'Todavía sin resultados';
  return `Mejor resultado: ${formatAccuracyFloor(bestAccuracy)} de precisión · ${Math.floor(bestWpm)} WPM`;
}

/** Aviso en Resultados cuando la velocidad se mide pero no forma parte del objetivo. */
export function speedNote(exercise) {
  return exercise && exercise.targetWpm === null ? 'La velocidad se informa, pero no se evalúa en esta práctica.' : '';
}

/**
 * Qué acciones ofrece Resultados (T15.3). Solo el paso actual de la Academia ofrece
 * el recorrido: «Siguiente ejercicio» (avance libre, como siempre) y «Práctica
 * ampliada» si está desbloqueada. Tras una ampliada, la Biblioteca o Mi evolución, no.
 */
export function resultsActions({ origin, courseStep, hasNext, extendedAvailable }) {
  const isExercise = origin !== 'free';
  const step = origin === 'academy' && courseStep;
  return {
    retry: true,
    extended: step && extendedAvailable,
    next: step && hasNext,
    courseEnd: step && !hasNext,
    back: isExercise,
    newText: !isExercise,
  };
}

/** Rótulo del botón que repite la partida terminada desde Resultados. */
export function retryLabel(origin) {
  return origin === 'free' ? 'Repetir texto' : 'Repetir ejercicio';
}

/**
 * Acciones de Resultados según el origen: práctica libre (Repetir texto, Nuevo
 * texto), Biblioteca (Repetir ejercicio, volver) o Academia (Repetir ejercicio,
 * volver y, solo en el paso actual del recorrido, Siguiente ejercicio).
 */
export function renderResultsActions(els, ce, { origin, courseStep, hasNext, extendedId = null }) {
  const actions = resultsActions({ origin, courseStep, hasNext, extendedAvailable: Boolean(extendedId) });
  els.retryButton.textContent = retryLabel(origin);
  els.newTextButton.hidden = !actions.newText;
  ce.extendedResultsButton.hidden = !actions.extended;
  ce.extendedResultsButton.dataset.exerciseId = actions.extended ? extendedId : '';
  ce.nextExerciseButton.hidden = !actions.next;
  ce.courseEnd.hidden = !actions.courseEnd;
  ce.backToOriginButton.hidden = !actions.back;
  ce.backToOriginButton.textContent = backToOriginLabel(origin);
  ce.resultsDetails.open = false;
}
