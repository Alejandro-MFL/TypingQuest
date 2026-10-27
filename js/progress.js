// Progreso académico. Módulo PURO, separado del historial de sesiones.
//
// Guarda dos cosas independientes:
// - El estado de cada ejercicio (no realizado < saltado < completado < superado).
//   Solo puede mejorar: el mejor logro se conserva aunque una repetición sea peor.
//   Si un intento supera el objetivo lo decide objectives.js (`passed`).
// - La posición del alumno en el recorrido de la Academia (`currentExerciseId`).
//   Solo cambia con advanceCourse/skipCurrent, siempre EXACTAMENTE un paso desde la
//   posición actual (nunca desde el ejercicio jugado). Completar ejercicios, desde
//   la Academia o la Biblioteca, no la mueve.
//
// Las funciones no mutan el progreso recibido: devuelven uno nuevo.

export const EXERCISE_STATUS = Object.freeze({
  NOT_STARTED: 'not-started',
  SKIPPED: 'skipped',
  COMPLETED: 'completed',
  PASSED: 'passed',
});

// Orden de los estados: uno mayor nunca se sustituye por uno menor.
const STATUS_RANK = Object.freeze({ 'not-started': 0, skipped: 1, completed: 2, passed: 3 });
// Estados con los que el ejercicio actual se da por terminado en la Academia.
const FINISHED_STATUSES = new Set([EXERCISE_STATUS.COMPLETED, EXERCISE_STATUS.PASSED]);

export function createProgress() {
  return { currentExerciseId: null, exercises: [] };
}

function emptyEntry(id) {
  return { id, status: EXERCISE_STATUS.NOT_STARTED, bestAccuracy: null, bestWpm: null };
}

/** Progreso de un ejercicio; los que no tienen registro están «no realizados». */
export function getExerciseProgress(progress, id) {
  return progress.exercises.find((entry) => entry.id === id) ?? emptyEntry(id);
}

function higherStatus(a, b) {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function maxOrValue(current, value) {
  return current === null ? round2(value) : Math.max(current, round2(value));
}

function withEntry(progress, entry) {
  const others = progress.exercises.filter((e) => e.id !== entry.id);
  return { ...progress, exercises: [...others, entry] };
}

/**
 * Registra una práctica terminada del ejercicio. `passed` indica si se
 * alcanzaron sus objetivos (evaluateObjectives). No mueve la posición del curso.
 */
export function recordCompletion(progress, id, { accuracy, wpm, passed }) {
  const current = getExerciseProgress(progress, id);
  const reached = passed ? EXERCISE_STATUS.PASSED : EXERCISE_STATUS.COMPLETED;
  return withEntry(progress, {
    id,
    status: higherStatus(current.status, reached),
    bestAccuracy: maxOrValue(current.bestAccuracy, accuracy),
    bestWpm: maxOrValue(current.bestWpm, wpm),
  });
}

/** Marca el ejercicio como saltado, salvo que ya tuviera un logro superior. */
export function recordSkip(progress, id) {
  const current = getExerciseProgress(progress, id);
  if (current.status !== EXERCISE_STATUS.NOT_STARTED) return progress;
  return withEntry(progress, { ...current, status: EXERCISE_STATUS.SKIPPED });
}

/** Ejercicio actual del recorrido: el guardado si sigue en el curso, o el primero. */
export function getCurrentExerciseId(progress, courseOrder) {
  const saved = progress.currentExerciseId;
  return saved !== null && courseOrder.includes(saved) ? saved : courseOrder[0] ?? null;
}

/**
 * Si la posición guardada apunta a una lección retirada del curso, la traslada a
 * su continuación (`retired`: Map id → { continueAt }, del catálogo). Determinista
 * e idempotente; no toca el estado de los ejercicios. En cualquier otro caso
 * devuelve el mismo progreso.
 */
export function resolveRetiredPosition(progress, courseOrder, retired) {
  const saved = progress.currentExerciseId;
  if (saved === null || courseOrder.includes(saved)) return progress;
  const continueAt = retired.get(saved)?.continueAt ?? null;
  if (continueAt === null || !courseOrder.includes(continueAt)) return progress;
  return { ...progress, currentExerciseId: continueAt };
}

export function nextInCourse(courseOrder, id) {
  const index = courseOrder.indexOf(id);
  return index === -1 || index === courseOrder.length - 1 ? null : courseOrder[index + 1];
}

/**
 * «Siguiente ejercicio»: la posición avanza exactamente un elemento desde la
 * actual. En el último devuelve el mismo progreso.
 */
export function advanceCourse(progress, courseOrder) {
  const next = nextInCourse(courseOrder, getCurrentExerciseId(progress, courseOrder));
  return next === null ? progress : { ...progress, currentExerciseId: next };
}

/** «Saltar ejercicio»: marca el actual como saltado (si procede) y avanza uno. */
export function skipCurrent(progress, courseOrder) {
  const currentId = getCurrentExerciseId(progress, courseOrder);
  if (currentId === null) return progress;
  return advanceCourse(recordSkip(progress, currentId), courseOrder);
}

/**
 * «Reiniciar Academia»: la posición vuelve a la primera lección del curso. Es un
 * reinicio del recorrido, no un borrado: estados y mejores marcas se conservan.
 */
export function restartCourse(progress, courseOrder) {
  return { ...progress, currentExerciseId: courseOrder[0] ?? null };
}

function findLesson(catalog, exerciseId) {
  for (const level of catalog.levels) {
    const lesson = level.lessons.find((l) => l.exerciseId === exerciseId);
    if (lesson) return { level, lesson };
  }
  return null;
}

/**
 * Lo que muestra la Academia: SOLO la lección actual del recorrido, con su
 * nivel, posición, estado y práctica ampliada opcional. `canAdvance` permite
 * pasar al siguiente sin repetir un ejercicio ya terminado.
 */
/**
 * Práctica ampliada de la Academia (T15.3): disponible cuando la base tiene el
 * objetivo superado. Se deriva de los estados guardados (no se guarda nada nuevo),
 * así que «Reiniciar Academia» la conserva; una ampliada ya terminada o superada
 * (logro anterior) tampoco se vuelve a bloquear. La Biblioteca no aplica esta regla.
 */
export function isExtendedUnlocked(progress, baseId, extendedId) {
  if (!extendedId) return false;
  if (getExerciseProgress(progress, baseId).status === EXERCISE_STATUS.PASSED) return true;
  return FINISHED_STATUSES.has(getExerciseProgress(progress, extendedId).status);
}

export function academyView(catalog, progress) {
  const id = getCurrentExerciseId(progress, catalog.courseOrder);
  const found = id === null ? null : findLesson(catalog, id);
  if (!found) return null;
  const { level, lesson } = found;
  const status = getExerciseProgress(progress, id).status;
  const isLast = nextInCourse(catalog.courseOrder, id) === null;
  const extendedId = lesson.extendedId;
  return {
    exercise: catalog.byId.get(id),
    level: { level: level.level, title: level.title, summary: level.summary },
    position: catalog.courseOrder.indexOf(id) + 1,
    total: catalog.courseOrder.length,
    status,
    isLast,
    canAdvance: FINISHED_STATUSES.has(status) && !isLast,
    extended: extendedId
      ? {
        exercise: catalog.byId.get(extendedId),
        status: getExerciseProgress(progress, extendedId).status,
        unlocked: isExtendedUnlocked(progress, id, extendedId),
      }
      : null,
  };
}

// --- Progreso por bloques (T14) -------------------------------------------------------

const FINISHED = new Set([EXERCISE_STATUS.COMPLETED, EXERCISE_STATUS.PASSED]);

/**
 * Resumen del recorrido por bloques para la Academia. Tres medidas distintas:
 * recorridas (lecciones por delante de las que ya ha pasado la posición actual),
 * terminadas (práctica base terminada o superada) y superadas (base superada).
 * Las ampliadas son opcionales y no cuentan. Reiniciar la Academia pone el
 * recorrido a cero, pero los terminados y superados se conservan.
 */
export function courseOverview(catalog, progress) {
  const position = catalog.courseOrder.indexOf(getCurrentExerciseId(progress, catalog.courseOrder));
  let offset = 0;
  const blocks = catalog.levels.map((level) => {
    const ids = level.lessons.map((l) => l.exerciseId);
    const status = (id) => getExerciseProgress(progress, id).status;
    const block = {
      level: level.level,
      title: level.title,
      total: ids.length,
      traveled: Math.min(ids.length, Math.max(0, position - offset)),
      finished: ids.filter((id) => FINISHED.has(status(id))).length,
      passed: ids.filter((id) => status(id) === EXERCISE_STATUS.PASSED).length,
      current: position >= offset && position < offset + ids.length,
    };
    offset += ids.length;
    return block;
  });
  const sum = (key) => blocks.reduce((n, b) => n + b[key], 0);
  const lessons = sum('total');
  const traveled = sum('traveled');
  return { blocks, totals: { lessons, traveled, remaining: lessons - traveled, finished: sum('finished'), passed: sum('passed') } };
}
