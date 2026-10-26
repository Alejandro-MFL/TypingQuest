// Interfaz de Inicio, Academia y Biblioteca, y de la información del ejercicio
// en la partida y los resultados. Solo pinta: no decide progreso ni recorrido.
// Los helpers del principio son puros y se prueban con Node.
import { EXERCISE_STATUS } from './progress.js';
import { DIFFICULTIES, CATEGORIES, difficultyLabel, categoryLabel, kindLabel } from './catalog.js';

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
    homeContinue: byId('home-continue'),
    academy: {
      error: byId('academy-error'),
      content: byId('academy-content'),
      position: byId('lesson-position'),
      levelSummary: byId('lesson-level-summary'),
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
    objectiveList: byId('objective-list'),
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

/** Marca el enlace de la sección actual con aria-current="page". */
export function renderNav(ce, route) {
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

// Estado y objetivos de la práctica ampliada opcional, y su botón.
function renderExtended(a, extended) {
  a.extended.hidden = !extended;
  a.extendedButton.hidden = !extended;
  if (!extended) return;
  a.extendedGoals.textContent = formatGoals(extended.exercise);
  a.extendedStatus.replaceChildren(statusBadge(extended.status));
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
  a.levelSummary.textContent = level.summary;
  a.title.textContent = exercise.title;
  a.description.textContent = exercise.description;
  a.goals.textContent = formatGoals(exercise);
  a.status.replaceChildren(statusBadge(view.status));
  a.startButton.dataset.exerciseId = exercise.id;
  a.startButton.classList.toggle('button-secondary', view.canAdvance);
  a.nextButton.hidden = !view.canAdvance;
  a.courseEnd.hidden = !(view.isLast && hasFinished(view.status));
  renderExtended(a, view.extended);
}

// Una práctica (base o ampliada) dentro de la tarjeta de su lección: tipo,
// estado, dificultad, objetivos y botón «Empezar». El botón lleva
// data-exercise-id; main.js escucha los clics por delegación.
function createPracticeRow(exercise, status, lessonTitle) {
  const kind = kindLabel(exercise.kind);
  const row = element('div', `lesson-practice ${statusInfo(status).className}`);
  const details = element('dd');
  const button = element('button', 'button button-small button-secondary', 'Empezar');
  button.type = 'button';
  button.dataset.exerciseId = exercise.id;
  button.setAttribute('aria-label', `Empezar ${kind.toLowerCase()} de «${lessonTitle}»`);
  details.append(
    statusBadge(status),
    element('span', 'lesson-goals', `${difficultyLabel(exercise.difficulty)} · ${formatGoals(exercise)}`),
    button
  );
  row.append(element('dt', null, exercise.kind === 'extended' ? `${kind} · Opcional` : kind), details);
  return row;
}

/** Tarjeta de una lección (libraryLessons): sus dos prácticas, cada una con su estado. */
function createLessonCard(lesson, statusOf) {
  const card = element('li', 'exercise-card library-lesson');
  const practices = element('dl', 'lesson-practices');
  for (const exercise of [lesson.base, lesson.extended].filter(Boolean)) {
    practices.append(createPracticeRow(exercise, statusOf(exercise.id), lesson.title));
  }
  card.append(
    element('h4', 'exercise-card-title', lesson.title),
    element('p', 'exercise-card-meta', `${blockLabel(lesson.level)} · ${categoryLabel(lesson.category)}`),
    element('p', 'exercise-card-description', lesson.description),
    practices
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
function createLibraryGroup({ level, lessons }, levelTitles, statusOf) {
  const group = element('section', 'library-group');
  const headingId = `library-group-${level}`;
  group.setAttribute('aria-labelledby', headingId);
  const heading = element('h3', 'library-group-title', levelTitles.get(level) ?? blockLabel(level));
  heading.id = headingId;
  const list = element('ul', 'exercise-list');
  list.append(...lessons.map((lesson) => createLessonCard(lesson, statusOf)));
  group.append(heading, list);
  return group;
}

/**
 * Biblioteca: una tarjeta por lección (filterLessons), agrupadas por bloque del
 * temario; `statusOf(id)` da el estado individual de cada práctica.
 */
export function renderLibrary(ce, lessons, statusOf, levelTitles = new Map()) {
  ce.library.list.replaceChildren(...groupLessonsByLevel(lessons)
    .map((group) => createLibraryGroup(group, levelTitles, statusOf)));
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

/** Rótulo del botón que repite la partida terminada desde Resultados. */
export function retryLabel(origin) {
  return origin === 'free' ? 'Repetir texto' : 'Repetir ejercicio';
}

/**
 * Acciones de Resultados según el origen: práctica libre (Repetir texto, Nuevo
 * texto), Biblioteca (Repetir ejercicio, volver) o Academia (Repetir ejercicio,
 * volver y, solo en el paso actual del recorrido, Siguiente ejercicio).
 */
export function renderResultsActions(els, ce, { origin, courseStep, hasNext }) {
  const isExercise = origin !== 'free';
  els.retryButton.textContent = retryLabel(origin);
  els.newTextButton.hidden = isExercise;
  ce.nextExerciseButton.hidden = !(courseStep && hasNext);
  ce.courseEnd.hidden = !(courseStep && !hasNext);
  ce.backToOriginButton.hidden = !isExercise;
  ce.backToOriginButton.textContent = backToOriginLabel(origin);
}
