// Entrenamiento personalizado (T13). Módulo PURO: reglas locales y explicables
// que eligen prácticas EXISTENTES del catálogo para las dificultades de «Mi
// evolución» (typing-trends.js). No crea ejercicios ni toca el progreso.
//
// 1. Qué reforzar (selectTargets): reutiliza los criterios de T12, sin umbrales
//    propios. Candidatas: letras con muestra suficiente que son dificultad
//    recurrente o empeoran. Prioridad: empeora > recurrente sin mejorar >
//    recurrente que mejora; después tasa, oportunidades y carácter. Las de la
//    misma tecla física («d» y «D») cuentan como una. Como mucho 3.
// 2. Con qué practicar (exerciseMatches): el TEXTO real de cada práctica, no su
//    título. Se cuenta el carácter exacto; en las vocales con tilde o diéresis,
//    todas las que usan la misma tecla muerta (la dificultad es el acento); si el
//    carácter exacto casi no aparece (p. ej. «Ñ»), los de la misma tecla física.
//    Hacen falta ≥ MIN_TARGET_OCCURRENCES apariciones.
// 3. Nivel adecuado: solo lecciones hasta la más avanzada que el alumno ha
//    trabajado (posición del recorrido o prácticas terminadas) o, si es
//    posterior, hasta la que introduce las teclas del carácter (ya lo escribe).
//    Gana la lección donde el carácter es más denso; base, salvo que ya esté
//    superada y la ampliada también sirva. Alternativa más exigente: la mejor de
//    una lección posterior dentro del mismo nivel. Sin lecciones repetidas.
import { resolveCharacter, requiredInputs } from './keyboard.js';
import { getCurrentExerciseId, getExerciseProgress, EXERCISE_STATUS } from './progress.js';

export const MAX_RECOMMENDATIONS = 3;
export const MIN_TARGET_OCCURRENCES = 4;
const WORKED_STATUSES = new Set([EXERCISE_STATUS.COMPLETED, EXERCISE_STATUS.PASSED]);

function mainKey(char) {
  const resolution = resolveCharacter(char);
  return resolution.known ? resolution.steps.at(-1).code : null;
}

function priorityGroup(c) {
  if (c.evolution.status === 'worsening') return 0;
  return c.evolution.status === 'improving' ? 2 : 1;
}

/** Hasta MAX_RECOMMENDATIONS caracteres a reforzar, sin repetir tecla física. */
export function selectTargets(report) {
  const candidates = report.chars
    .filter((c) => c.sufficient && (c.recurrent || c.evolution.status === 'worsening'))
    .sort((a, b) => priorityGroup(a) - priorityGroup(b) || b.rate - a.rate
      || b.opportunities - a.opportunities || (a.char < b.char ? -1 : 1));
  const targets = [];
  for (const c of candidates) {
    const key = mainKey(c.char);
    if (key === null || targets.some((t) => t.key === key)) continue;
    targets.push({
      char: c.char, key, rate: c.rate, opportunities: c.opportunities, firstTryErrors: c.firstTryErrors,
      sessions: c.sessions, trend: c.evolution.status, early: c.evolution.early, recent: c.evolution.recent,
    });
    if (targets.length === MAX_RECOMMENDATIONS) break;
  }
  return targets;
}

const countWhere = (text, predicate) => [...text].filter(predicate).length;
const deadKindOf = (char) => resolveCharacter(char).steps?.find((s) => s.deadKind)?.deadKind ?? null;

/** Cuántas veces trabaja un ejercicio la dificultad: { match: 'exact'|'accent'|'key', count }. */
export function exerciseMatches(exercise, char) {
  const dead = deadKindOf(char);
  if (dead) return { match: 'accent', count: countWhere(exercise.text, (c) => deadKindOf(c) === dead) };
  const exact = countWhere(exercise.text, (c) => c === char);
  if (exact >= MIN_TARGET_OCCURRENCES) return { match: 'exact', count: exact };
  const key = mainKey(char);
  return { match: 'key', count: key === null ? 0 : countWhere(exercise.text, (c) => mainKey(c) === key) };
}

// Lecciones del curso en orden, con su índice.
function courseLessons(catalog) {
  return catalog.levels.flatMap((l) => l.lessons).map((lesson, index) => ({ ...lesson, index }));
}

// Lección más avanzada trabajada: posición del recorrido o práctica terminada.
function reachedIndex(lessons, catalog, progress) {
  const current = getCurrentExerciseId(progress, catalog.courseOrder);
  return lessons.reduce((max, l) => {
    const worked = [l.exerciseId, l.extendedId].some((id) => id && WORKED_STATUSES.has(getExerciseProgress(progress, id).status));
    return worked || l.exerciseId === current ? Math.max(max, l.index) : max;
  }, 0);
}

// Lección en la que ya están enseñadas todas las teclas del carácter (o -1).
function introductionIndex(lessons, char) {
  const tokens = requiredInputs(char) ?? [];
  let index = 0;
  for (const token of tokens) {
    const lesson = lessons.find((l) => l.introduces.includes(token));
    if (!lesson) return -1;
    index = Math.max(index, lesson.index);
  }
  return index;
}

// Prácticas de una lección que trabajan bien el carácter, con su densidad.
function lessonCandidate(lesson, catalog, char) {
  const practices = [lesson.exerciseId, lesson.extendedId].filter(Boolean).map((id) => {
    const exercise = catalog.byId.get(id);
    const { match, count } = exerciseMatches(exercise, char);
    return { exercise, match, count, density: count / exercise.text.length };
  }).filter((p) => p.count >= MIN_TARGET_OCCURRENCES);
  if (practices.length === 0) return null;
  return { lesson, practices, density: Math.max(...practices.map((p) => p.density)) };
}

function exerciseRef(exercise) {
  return { id: exercise.id, title: exercise.title, kind: exercise.kind };
}

// Base, salvo que ya esté superada y la ampliada también trabaje el carácter.
function choosePractice(candidate, progress) {
  const base = candidate.practices.find((p) => p.exercise.kind === 'base');
  const extended = candidate.practices.find((p) => p.exercise.kind === 'extended');
  const basePassed = getExerciseProgress(progress, candidate.lesson.exerciseId).status === EXERCISE_STATUS.PASSED;
  if (extended && (!base || basePassed)) return { practice: extended, upgraded: Boolean(base) };
  return { practice: base, upgraded: false };
}

function recommendFor(target, ctx, usedLessons) {
  const introduced = introductionIndex(ctx.lessons, target.char);
  if (introduced < 0) return null;
  const limit = Math.max(ctx.reached, introduced);
  const candidates = ctx.lessons
    .filter((l) => l.index <= limit && !usedLessons.has(l.index))
    .map((l) => lessonCandidate(l, ctx.catalog, target.char))
    .filter(Boolean)
    .sort((a, b) => b.density - a.density || a.lesson.index - b.lesson.index);
  if (candidates.length === 0) return null;
  const [main] = candidates;
  const { practice, upgraded } = choosePractice(main, ctx.progress);
  const harder = candidates.find((c) => c.lesson.index > main.lesson.index);
  return {
    target,
    lessonIndex: main.lesson.index,
    exercise: exerciseRef(practice.exercise),
    match: practice.match,
    count: practice.count,
    upgraded,
    alternative: harder ? exerciseRef(choosePractice(harder, ctx.progress).practice.exercise) : null,
  };
}

/**
 * Recomendaciones para «Practicar mis dificultades». status: 'empty' / 'insufficient'
 * (los de «Mi evolución»), 'none' (sin dificultades que reforzar) u 'ok'.
 */
export function recommendPractice({ report, catalog, progress }) {
  if (report.status === 'empty' || report.status === 'insufficient') return { status: report.status, items: [] };
  const lessons = courseLessons(catalog);
  const ctx = { catalog, progress, lessons, reached: reachedIndex(lessons, catalog, progress) };
  const used = new Set();
  const items = [];
  for (const target of selectTargets(report)) {
    const item = recommendFor(target, ctx, used);
    if (!item) continue;
    used.add(item.lessonIndex);
    const { lessonIndex, ...rest } = item;
    items.push(rest);
  }
  return { status: items.length > 0 ? 'ok' : 'none', items };
}

/**
 * «Siguiente recomendación» (T17) con la lista YA recalculada tras guardar la partida:
 * la que sigue a la practicada (como recomendación o como su alternativa). Si la
 * practicada ya no se recomienda, la primera vigente distinta de ella. null si no hay.
 */
export function nextRecommendation(items, currentId) {
  const index = items.findIndex((item) => item.exercise.id === currentId || item.alternative?.id === currentId);
  if (index !== -1) return items[index + 1]?.exercise.id ?? null;
  return items.find((item) => item.exercise.id !== currentId)?.exercise.id ?? null;
}
