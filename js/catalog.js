// Catálogo de ejercicios y organización del curso. Módulo PURO: recibe los datos
// ya leídos de data/exercises.json y data/course.json (main.js los descarga con
// fetch; los tests los leen del disco) y los valida antes de usarlos.
//
// El catálogo describe cada ejercicio (una sola definición, compartida por la
// Academia y la Biblioteca); el curso solo los organiza en niveles y lecciones.
// Cada lección tiene una práctica base (forma parte del recorrido) y, opcional,
// una práctica ampliada (más larga; nunca hace avanzar el recorrido).
// Un ejercicio puede existir en el catálogo sin formar parte del curso.
//
// Versionado: `schemaVersion` cambia con la FORMA de los datos; `contentVersion`
// con cualquier cambio del contenido; la `version` de un ejercicio sube cuando
// cambian su texto o sus condiciones de superación (objetivos).
//
// Lecciones retiradas (`course.retired`): IDs que ya no existen pero pueden estar
// en el historial o en el progreso guardado. Conservan un título para mostrarlos
// y, si eran prácticas base, `continueAt`: la lección a la que se traslada una
// posición guardada en ellas (ver progress.resolveRetiredPosition).
import { prepareText } from './text-prep.js';
import { isWpmGoalAllowed } from './objectives.js';
import { requiredInputs, isValidInputToken } from './keyboard.js';

const EXERCISES_SCHEMA_VERSION = 2;
const COURSE_SCHEMA_VERSION = 4;
// Veces que la práctica base debe usar cada entrada que su lección introduce.
const MIN_NEW_INPUT_USES = 2;
const RETIRED_FIELDS = new Set(['exercise', 'title', 'continueAt']);
const CUSTOM_TEXT_ID = 'custom-text';
const MIN_LEVEL = 1;
const MAX_LEVEL = 5;
const MIN_TARGET_ACCURACY = 50;
const MAX_TARGET_WPM = 300;
// IDs estables: minúsculas ASCII y dígitos separados por guiones (p. ej. "l2-asdf").
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXERCISE_FIELDS = new Set([
  'id', 'version', 'kind', 'title', 'description', 'level', 'difficulty', 'category',
  'targetAccuracy', 'targetWpm', 'text',
]);
const LESSON_FIELDS = new Set(['exercise', 'extended', 'introduces']);

// Objetivos orientativos (provisionales) de cada nivel: precisión mínima y WPM
// mínimas. Las WPM solo se exigen en textos de al menos MIN_WPM_TEXT_LENGTH.
export const LEVEL_GOALS = Object.freeze({
  1: Object.freeze({ accuracy: 85, wpm: 8 }),
  2: Object.freeze({ accuracy: 90, wpm: 12 }),
  3: Object.freeze({ accuracy: 90, wpm: 18 }),
  4: Object.freeze({ accuracy: 92, wpm: 22 }),
  5: Object.freeze({ accuracy: 95, wpm: 30 }),
});

export const KINDS = Object.freeze([
  Object.freeze({ id: 'base', label: 'Práctica base' }),
  Object.freeze({ id: 'extended', label: 'Práctica ampliada' }),
]);

export const DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'basic', label: 'Básica' }),
  Object.freeze({ id: 'intermediate', label: 'Media' }),
  Object.freeze({ id: 'advanced', label: 'Avanzada' }),
]);

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'teclas-guia', label: 'Postura y teclas guía' }),
  Object.freeze({ id: 'fila-central', label: 'Fila central' }),
  Object.freeze({ id: 'fila-superior', label: 'Fila superior' }),
  Object.freeze({ id: 'fila-inferior', label: 'Fila inferior' }),
  Object.freeze({ id: 'tres-filas', label: 'Tres filas' }),
  Object.freeze({ id: 'tildes', label: 'Tildes' }),
  Object.freeze({ id: 'palabras', label: 'Palabras y espacios' }),
  Object.freeze({ id: 'mayusculas', label: 'Mayúsculas' }),
  Object.freeze({ id: 'puntuacion', label: 'Puntuación' }),
  Object.freeze({ id: 'signos', label: '¿? y ¡!' }),
  Object.freeze({ id: 'numeros', label: 'Números' }),
  Object.freeze({ id: 'simbolos', label: 'Símbolos' }),
  Object.freeze({ id: 'frases', label: 'Frases' }),
  Object.freeze({ id: 'textos', label: 'Textos' }),
  Object.freeze({ id: 'precision', label: 'Precisión' }),
  Object.freeze({ id: 'velocidad', label: 'Ritmo y velocidad' }),
]);

const KIND_IDS = new Set(KINDS.map((k) => k.id));
const DIFFICULTY_IDS = new Set(DIFFICULTIES.map((d) => d.id));
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isLevel(value) {
  return Number.isInteger(value) && value >= MIN_LEVEL && value <= MAX_LEVEL;
}

export function isValidExerciseId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

// Errores del texto: debe ser escribible y ya estar en la forma de prepareText.
function textErrors(label, text, maxTextLength) {
  if (typeof text !== 'string') return [`${label}: falta el texto`];
  const prepared = prepareText(text, maxTextLength);
  if (prepared.error) return [`${label}: texto no válido (${prepared.error})`];
  if (prepared.text !== text) return [`${label}: prepareText modificaría el texto; guárdalo ya saneado`];
  return [];
}

function fieldErrors(label, e) {
  const errors = [];
  for (const key of Object.keys(e)) {
    if (!EXERCISE_FIELDS.has(key)) errors.push(`${label}: campo desconocido «${key}»`);
  }
  if (!Number.isInteger(e.version) || e.version < 1) errors.push(`${label}: version debe ser un entero ≥ 1`);
  if (!KIND_IDS.has(e.kind)) errors.push(`${label}: kind debe ser «base» o «extended»`);
  if (!isNonEmptyString(e.title)) errors.push(`${label}: falta el título`);
  if (!isNonEmptyString(e.description)) errors.push(`${label}: falta la descripción`);
  if (!isLevel(e.level)) errors.push(`${label}: level debe ser un entero entre ${MIN_LEVEL} y ${MAX_LEVEL}`);
  if (!DIFFICULTY_IDS.has(e.difficulty)) errors.push(`${label}: dificultad desconocida`);
  if (!CATEGORY_IDS.has(e.category)) errors.push(`${label}: categoría desconocida`);
  const target = e.targetAccuracy;
  if (!Number.isInteger(target) || target < MIN_TARGET_ACCURACY || target > 100) {
    errors.push(`${label}: targetAccuracy debe ser un entero entre ${MIN_TARGET_ACCURACY} y 100`);
  }
  return [...errors, ...wpmGoalErrors(label, e)];
}

// targetWpm: null (no aplicable) o un entero; prohibido en textos demasiado breves.
function wpmGoalErrors(label, e) {
  if (e.targetWpm === null) return [];
  if (!Number.isInteger(e.targetWpm) || e.targetWpm < 1 || e.targetWpm > MAX_TARGET_WPM) {
    return [`${label}: targetWpm debe ser null o un entero entre 1 y ${MAX_TARGET_WPM}`];
  }
  if (typeof e.text === 'string' && !isWpmGoalAllowed(e.text)) {
    return [`${label}: el texto es demasiado breve para un objetivo de WPM fiable (targetWpm: null)`];
  }
  return [];
}

function exerciseErrors(e, index, maxTextLength) {
  if (!isObject(e)) return [`Ejercicio ${index}: no es un objeto`];
  if (!isValidExerciseId(e.id)) return [`Ejercicio ${index}: id no válido (${JSON.stringify(e.id)})`];
  const label = `Ejercicio «${e.id}»`;
  return [...fieldErrors(label, e), ...textErrors(label, e.text, maxTextLength)];
}

function headerErrors(data, name, schemaVersion) {
  if (!isObject(data)) return [`${name}: no es un objeto`];
  const errors = [];
  if (data.schemaVersion !== schemaVersion) errors.push(`${name}: schemaVersion debe ser ${schemaVersion}`);
  if (!isNonEmptyString(data.contentVersion)) errors.push(`${name}: falta contentVersion`);
  return errors;
}

function exercisesErrors(data, maxTextLength) {
  const errors = headerErrors(data, 'Catálogo', EXERCISES_SCHEMA_VERSION);
  if (!isObject(data)) return errors;
  if (!Array.isArray(data.exercises) || data.exercises.length === 0) {
    return [...errors, 'Catálogo: exercises debe ser una lista no vacía'];
  }
  const seen = new Set();
  data.exercises.forEach((e, i) => {
    errors.push(...exerciseErrors(e, i, maxTextLength));
    if (isObject(e) && seen.has(e.id)) errors.push(`Ejercicio «${e.id}»: id duplicado`);
    if (isObject(e)) seen.add(e.id);
  });
  return errors;
}

// Errores de una referencia del curso: existe, es del tipo y nivel esperados y no se repite.
function referenceErrors(label, id, expectedKind, level, byId, placed) {
  const errors = [];
  const exercise = byId.get(id);
  if (!exercise) errors.push(`${label}: referencia a un ejercicio inexistente «${id}»`);
  else if (exercise.level !== level) errors.push(`${label}: «${id}» es de nivel ${exercise.level}`);
  else if (exercise.kind !== expectedKind) {
    const kindName = expectedKind === 'base' ? 'una práctica base' : 'una práctica ampliada';
    errors.push(`${label}: «${id}» debe ser ${kindName}`);
  }
  if (placed.has(id)) errors.push(`${label}: ejercicio repetido en el curso «${id}»`);
  placed.add(id);
  return errors;
}

function lessonErrors(label, lesson, level, byId, placed) {
  if (!isObject(lesson)) return [`${label}: lección no válida`];
  const errors = Object.keys(lesson).filter((key) => !LESSON_FIELDS.has(key))
    .map((key) => `${label}: campo desconocido «${key}» en una lección`);
  errors.push(...referenceErrors(label, lesson.exercise, 'base', level, byId, placed));
  if (lesson.extended !== undefined) {
    errors.push(...referenceErrors(label, lesson.extended, 'extended', level, byId, placed));
    errors.push(...extendedPairErrors(label, byId.get(lesson.exercise), byId.get(lesson.extended)));
  }
  return errors;
}

// La ampliada refuerza la misma habilidad que su base con un texto más extenso.
function extendedPairErrors(label, base, extended) {
  if (!base || !extended || typeof base.text !== 'string' || typeof extended.text !== 'string') return [];
  const errors = [];
  if ([...extended.text].length <= [...base.text].length) {
    errors.push(`${label}: «${extended.id}» debe ser más larga que su práctica base «${base.id}»`);
  }
  if (extended.category !== base.category) {
    errors.push(`${label}: «${extended.id}» debe tener la misma categoría que «${base.id}»`);
  }
  return errors;
}

function levelErrors(level, index, previous, byId, placed) {
  const label = `Curso, nivel ${JSON.stringify(level?.level)}`;
  if (!isObject(level) || !isLevel(level.level)) return [`Curso: nivel ${index} no válido`];
  const errors = [];
  if (previous !== null && level.level <= previous) errors.push(`${label}: niveles fuera de orden o duplicados`);
  if (!isNonEmptyString(level.title)) errors.push(`${label}: falta el título`);
  if (!isNonEmptyString(level.summary)) errors.push(`${label}: falta el resumen`);
  if (!Array.isArray(level.lessons) || level.lessons.length === 0) {
    return [...errors, `${label}: lessons debe ser una lista no vacía`];
  }
  for (const lesson of level.lessons) errors.push(...lessonErrors(label, lesson, level.level, byId, placed));
  return errors;
}

function courseErrors(course, byId) {
  const errors = headerErrors(course, 'Curso', COURSE_SCHEMA_VERSION);
  if (!isObject(course)) return errors;
  if (!isValidExerciseId(course.id)) errors.push('Curso: id no válido');
  if (!isNonEmptyString(course.title)) errors.push('Curso: falta el título');
  if (!Array.isArray(course.levels) || course.levels.length === 0) {
    return [...errors, 'Curso: levels debe ser una lista no vacía'];
  }
  const placed = new Set();
  course.levels.forEach((level, i) => {
    const previous = i > 0 && isObject(course.levels[i - 1]) ? course.levels[i - 1].level : null;
    errors.push(...levelErrors(level, i, previous, byId, placed));
  });
  return [
    ...errors,
    ...introductionErrors(course, byId),
    ...retiredErrors(course.retired, byId, courseBaseIds(course)),
  ];
}

// --- Teclas introducidas (T10) ------------------------------------------------------
//
// Cada lección declara en `introduces` las entradas físicas que enseña: códigos de
// tecla (`KeyJ`, `ShiftLeft`, `AltRight`…) o habilidades de tecla muerta (`acute`,
// `diaeresis`). Recorriendo el curso en orden, cada texto solo puede exigir entradas
// ya introducidas (keyboard.requiredInputs), y la base practica lo que se introduce.

function inputUses(text) {
  const uses = new Map();
  for (const char of text) {
    for (const token of requiredInputs(char) ?? []) uses.set(token, (uses.get(token) ?? 0) + 1);
  }
  return uses;
}

function introducesErrors(label, introduces, known) {
  if (!Array.isArray(introduces)) return [`${label}: introduces debe ser una lista de teclas`];
  const errors = [];
  const seen = new Set();
  for (const token of introduces) {
    if (!isValidInputToken(token)) errors.push(`${label}: «${token}» no es una tecla del modelo`);
    else if (known.has(token) || seen.has(token)) errors.push(`${label}: «${token}» ya se introdujo antes`);
    seen.add(token);
  }
  return errors;
}

function textInputErrors(label, exercise, known) {
  if (!exercise || typeof exercise.text !== 'string') return [];
  const errors = [];
  for (const char of new Set(exercise.text)) {
    const tokens = requiredInputs(char);
    if (tokens === null) {
      errors.push(`${label}: «${exercise.id}» usa «${char}», sin posición en el teclado español`);
      continue;
    }
    for (const token of tokens) {
      if (!known.has(token)) errors.push(`${label}: «${exercise.id}» usa ${token} («${char}») antes de enseñarse`);
    }
  }
  return errors;
}

function practiceErrors(label, introduces, base) {
  if (!base || typeof base.text !== 'string' || !Array.isArray(introduces)) return [];
  const uses = inputUses(base.text);
  return introduces.filter((token) => (uses.get(token) ?? 0) < MIN_NEW_INPUT_USES)
    .map((token) => `${label}: la práctica base no practica ${token}, que la lección introduce`);
}

function introductionErrors(course, byId) {
  const errors = [];
  const known = new Set();
  for (const level of course.levels.filter(isObject)) {
    for (const lesson of (Array.isArray(level.lessons) ? level.lessons : []).filter(isObject)) {
      const label = `Curso, lección «${lesson.exercise}»`;
      errors.push(...introducesErrors(label, lesson.introduces, known));
      if (Array.isArray(lesson.introduces)) lesson.introduces.filter(isValidInputToken).forEach((t) => known.add(t));
      errors.push(...practiceErrors(label, lesson.introduces, byId.get(lesson.exercise)));
      for (const id of [lesson.exercise, lesson.extended]) errors.push(...textInputErrors(label, byId.get(id), known));
    }
  }
  return errors;
}

function courseBaseIds(course) {
  return new Set(course.levels.filter(isObject).flatMap((l) =>
    (Array.isArray(l.lessons) ? l.lessons : []).filter(isObject).map((lesson) => lesson.exercise)));
}

function retiredEntryErrors(entry, byId, baseIds) {
  if (!isObject(entry) || !isValidExerciseId(entry.exercise)) return ['Curso: lección retirada no válida'];
  const label = `Curso, retirado «${entry.exercise}»`;
  const errors = Object.keys(entry).filter((key) => !RETIRED_FIELDS.has(key))
    .map((key) => `${label}: campo desconocido «${key}»`);
  if (byId.has(entry.exercise)) errors.push(`${label}: un ejercicio retirado no puede seguir en el catálogo`);
  if (!isNonEmptyString(entry.title)) errors.push(`${label}: falta el título`);
  if (entry.continueAt !== undefined && !baseIds.has(entry.continueAt)) {
    errors.push(`${label}: continueAt debe ser una práctica base del curso`);
  }
  return errors;
}

// `retired` es opcional; si existe, una lista sin IDs repetidos.
function retiredErrors(retired, byId, baseIds) {
  if (retired === undefined) return [];
  if (!Array.isArray(retired)) return ['Curso: retired debe ser una lista'];
  const errors = [];
  const seen = new Set();
  for (const entry of retired) {
    errors.push(...retiredEntryErrors(entry, byId, baseIds));
    if (isObject(entry) && seen.has(entry.exercise)) errors.push(`Curso: retirado repetido «${entry.exercise}»`);
    if (isObject(entry)) seen.add(entry.exercise);
  }
  return errors;
}

function indexExercises(data) {
  const list = isObject(data) && Array.isArray(data.exercises) ? data.exercises : [];
  return new Map(list.filter((e) => isObject(e) && isValidExerciseId(e.id)).map((e) => [e.id, e]));
}

/**
 * Valida catálogo y curso juntos. Nunca lanza con datos malformados.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCatalog(exercisesData, courseData, { maxTextLength }) {
  const errors = [
    ...exercisesErrors(exercisesData, maxTextLength),
    ...courseErrors(courseData, indexExercises(exercisesData)),
  ];
  return { ok: errors.length === 0, errors };
}

/**
 * Catálogo listo para la interfaz, o los errores de validación.
 * @returns {{ ok: true, catalog: { exercises, byId, levels, courseOrder, course } }
 *          | { ok: false, errors: string[] }}
 */
export function createCatalog(exercisesData, courseData, options) {
  const { ok, errors } = validateCatalog(exercisesData, courseData, options);
  if (!ok) return { ok, errors };
  const exercises = Object.freeze(exercisesData.exercises.map((e) => Object.freeze({ ...e })));
  const levels = Object.freeze(courseData.levels.map((l) => Object.freeze({
    level: l.level,
    title: l.title,
    summary: l.summary,
    lessons: Object.freeze(l.lessons.map((lesson) => Object.freeze({
      exerciseId: lesson.exercise, extendedId: lesson.extended ?? null,
      introduces: Object.freeze([...lesson.introduces]),
    }))),
  })));
  return {
    ok,
    catalog: Object.freeze({
      exercises,
      byId: new Map(exercises.map((e) => [e.id, e])),
      levels,
      // El recorrido de la Academia: solo las prácticas base, en orden.
      courseOrder: Object.freeze(levels.flatMap((l) => l.lessons.map((lesson) => lesson.exerciseId))),
      course: Object.freeze({ id: courseData.id, title: courseData.title }),
      retired: new Map((courseData.retired ?? []).map((r) => [
        r.exercise, Object.freeze({ title: r.title, continueAt: r.continueAt ?? null }),
      ])),
    }),
  };
}

/** Nombre visible de un ID del historial: activo, retirado o práctica libre. */
export function exerciseTitle(catalog, id) {
  if (id === CUSTOM_TEXT_ID) return 'Texto personalizado';
  if (!catalog) return id;
  const exercise = catalog.byId.get(id);
  if (exercise) return exercise.title;
  const retired = catalog.retired.get(id);
  return retired ? `${retired.title} · ejercicio retirado` : id;
}

// Minúsculas y sin marcas diacríticas, para buscar «numeros» y encontrar «Números».
function normalizeForSearch(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Ejercicios que cumplen todos los filtros indicados; los vacíos no restringen. */
export function filterExercises(exercises, { query = '', level = null, difficulty = '', category = '' }) {
  const needle = normalizeForSearch(query.trim());
  return exercises.filter((e) =>
    (!needle || normalizeForSearch(`${e.title} ${e.description}`).includes(needle)) &&
    (level === null || level === undefined || e.level === level) &&
    (!difficulty || e.difficulty === difficulty) &&
    (!category || e.category === category));
}

export function difficultyLabel(id) {
  return DIFFICULTIES.find((d) => d.id === id)?.label ?? id;
}

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function kindLabel(id) {
  return KINDS.find((k) => k.id === id)?.label ?? id;
}

/**
 * Lecciones para la Biblioteca, en el orden del curso: cada una agrupa su
 * práctica base y su ampliada (los MISMOS objetos del catálogo, sin copiarlos).
 * Título, descripción, nivel y categoría son los de la práctica base. Un
 * ejercicio que no esté en ninguna lección aparece al final como lección propia.
 */
export function libraryLessons(catalog) {
  const lessons = catalog.levels.flatMap((level, levelIndex) => level.lessons.map((lesson, index) =>
    toLibraryLesson(catalog.byId.get(lesson.exerciseId), catalog.byId.get(lesson.extendedId) ?? null,
      lessonCode(levelIndex + 1, index + 1))));
  const placed = new Set(lessons.flatMap((l) => [l.base.id, l.extended?.id]));
  const loose = catalog.exercises.filter((e) => !placed.has(e.id)).map((e) => toLibraryLesson(e, null, null));
  return [...lessons, ...loose];
}

/** Código de una lección (T15.3): letra del bloque (1 → A) y posición dentro de él. «A2». */
export function lessonCode(blockNumber, position) {
  return `${String.fromCharCode(64 + blockNumber)}${position}`;
}

function toLibraryLesson(base, extended, code) {
  return {
    id: base.id,
    code,
    title: base.title,
    description: base.description,
    level: base.level,
    category: base.category,
    base,
    extended,
  };
}

/** Lecciones con al menos una práctica que cumpla todos los filtros (filterExercises). */
export function filterLessons(lessons, filters) {
  return lessons.filter((lesson) =>
    filterExercises([lesson.base, lesson.extended].filter(Boolean), filters).length > 0);
}
