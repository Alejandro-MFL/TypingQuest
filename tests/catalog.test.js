import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIFFICULTIES,
  CATEGORIES,
  KINDS,
  LEVEL_GOALS,
  validateCatalog,
  createCatalog,
  filterExercises,
  exerciseTitle,
  libraryLessons,
  filterLessons,
} from '../js/catalog.js';
import { isWpmGoalAllowed } from '../js/objectives.js';
import { prepareText } from '../js/text-prep.js';

const MAX = 5000;
const LONG_TEXT = 'sala falda hada gala sala falda hada gala sala';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const REAL_EXERCISES = readJson('../data/exercises.json');
const REAL_COURSE = readJson('../data/course.json');

function exercise(overrides = {}) {
  return {
    id: 'l1-a',
    version: 1,
    kind: 'base',
    title: 'A',
    description: 'Descripción',
    level: 1,
    difficulty: 'basic',
    category: 'teclas-guia',
    targetAccuracy: 90,
    targetWpm: null,
    text: 'fff jjj',
    ...overrides,
  };
}

function lessonsOf(exercises) {
  return exercises.filter((e) => e.kind === 'base').map((e) => ({ exercise: e.id }));
}

function data(exercises, levels) {
  return {
    exercises: { schemaVersion: 2, contentVersion: 'v1', exercises },
    course: {
      schemaVersion: 3,
      id: 'curso',
      contentVersion: 'v1',
      title: 'Curso',
      levels: levels ?? [{ level: 1, title: 'N1', summary: 'Resumen', lessons: lessonsOf(exercises) }],
    },
  };
}

function errorsOf(exercises, levels) {
  const d = data(exercises, levels);
  return validateCatalog(d.exercises, d.course, { maxTextLength: MAX }).errors;
}

const level1 = (lessons) => [{ level: 1, title: 'N1', summary: 'R', lessons }];

describe('catálogo real (data/*.json)', () => {
  const result = validateCatalog(REAL_EXERCISES, REAL_COURSE, { maxTextLength: MAX });

  it('es válido', () => {
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  });

  it('tiene exactamente dos prácticas por lección (sin catálogo masivo)', () => {
    const lessons = REAL_COURSE.levels.flatMap((l) => l.lessons);
    assert.equal(REAL_EXERCISES.exercises.length, lessons.length * 2);
  });

  it('tiene 13 lecciones con 13 prácticas base y 13 ampliadas', () => {
    assert.equal(REAL_COURSE.levels.flatMap((l) => l.lessons).length, 13);
    const kinds = REAL_EXERCISES.exercises.map((e) => e.kind);
    assert.equal(kinds.filter((k) => k === 'base').length, 13);
    assert.equal(kinds.filter((k) => k === 'extended').length, 13);
  });

  it('«Postura y teclas guía» es la primera lección y «Alternar F y J» ya no existe', () => {
    assert.equal(REAL_COURSE.levels[0].lessons[0].exercise, 'l1-postura-fj');
    const active = JSON.stringify([REAL_EXERCISES.exercises, REAL_COURSE.levels]);
    assert.equal(active.includes('l1-alternar-fj'), false);
  });

  it('la lección retirada lleva a la siguiente lección del curso', () => {
    assert.deepEqual(REAL_COURSE.retired, [
      { exercise: 'l1-alternar-fj', title: 'Alternar F y J', continueAt: 'l2-asdf' },
      { exercise: 'l1-alternar-fj-ampliada', title: 'Alternar F y J (ampliada)' },
    ]);
  });

  it('las ampliadas tienen la longitud acordada para su nivel', () => {
    const ranges = { 1: [100, 140], 2: [120, 180], 3: [160, 240], 4: [220, 320], 5: [300, 450] };
    for (const e of REAL_EXERCISES.exercises.filter((x) => x.kind === 'extended')) {
      const length = [...e.text].length;
      const [min, max] = ranges[e.level];
      assert.ok(length >= min && length <= max, `${e.id}: ${length} fuera de ${min}-${max}`);
    }
  });

  it('cubre los niveles 1 a 5 en orden', () => {
    assert.deepEqual(REAL_COURSE.levels.map((l) => l.level), [1, 2, 3, 4, 5]);
  });

  it('el nivel 2 incluye la Ñ y el nivel 4 tildes, mayúsculas, ¿, ¡ y números', () => {
    const textOfLevel = (level) => REAL_EXERCISES.exercises
      .filter((e) => e.level === level).map((e) => e.text).join(' ');
    assert.match(textOfLevel(2), /ñ/);
    const level4 = textOfLevel(4);
    for (const pattern of [/[áéíóú]/, /[A-ZÁÉÍÓÚÑ]/, /¿/, /¡/, /\d/, /[,.;:]/]) {
      assert.match(level4, pattern);
    }
  });

  it('los textos ya están en la forma que produce prepareText', () => {
    for (const { id, text } of REAL_EXERCISES.exercises) {
      const prepared = prepareText(text, MAX);
      assert.equal(prepared.error, null, id);
      assert.equal(prepared.text, text, id);
    }
  });

  it('los objetivos siguen la tabla por nivel; WPM solo en textos suficientemente largos', () => {
    for (const e of REAL_EXERCISES.exercises) {
      const goals = LEVEL_GOALS[e.level];
      assert.equal(e.targetAccuracy, goals.accuracy, e.id);
      const expectedWpm = isWpmGoalAllowed(e.text) ? goals.wpm : null;
      assert.equal(e.targetWpm, expectedWpm, e.id);
    }
  });

  it('cada lección tiene exactamente una práctica base y una ampliada existentes', () => {
    const byId = new Map(REAL_EXERCISES.exercises.map((e) => [e.id, e]));
    for (const lesson of REAL_COURSE.levels.flatMap((l) => l.lessons)) {
      assert.deepEqual(Object.keys(lesson).sort(), ['exercise', 'extended'], JSON.stringify(lesson));
      assert.equal(byId.get(lesson.exercise)?.kind, 'base', lesson.exercise);
      assert.equal(byId.get(lesson.extended)?.kind, 'extended', lesson.extended);
    }
  });

  it('todas las prácticas ampliadas están referenciadas por una lección', () => {
    const referenced = new Set(REAL_COURSE.levels.flatMap((l) => l.lessons.map((lesson) => lesson.extended)));
    for (const e of REAL_EXERCISES.exercises.filter((x) => x.kind === 'extended')) {
      assert.ok(referenced.has(e.id), e.id);
    }
  });

  it('no hay IDs duplicados', () => {
    const ids = REAL_EXERCISES.exercises.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('cada ampliada es claramente más larga que su base y del mismo nivel y categoría', () => {
    const byId = new Map(REAL_EXERCISES.exercises.map((e) => [e.id, e]));
    for (const { exercise, extended } of REAL_COURSE.levels.flatMap((l) => l.lessons)) {
      const base = byId.get(exercise);
      const ext = byId.get(extended);
      assert.ok([...ext.text].length >= [...base.text].length * 1.5, `${extended} frente a ${exercise}`);
      assert.equal(ext.level, base.level, extended);
      assert.equal(ext.category, base.category, extended);
    }
  });

  it('las ampliadas son lo bastante largas para tener objetivo de WPM', () => {
    for (const e of REAL_EXERCISES.exercises.filter((x) => x.kind === 'extended')) {
      assert.equal(isWpmGoalAllowed(e.text), true, e.id);
      assert.notEqual(e.targetWpm, null, e.id);
    }
  });

  it('las ampliadas no repiten mecánicamente un mismo bloque', () => {
    for (const e of REAL_EXERCISES.exercises.filter((x) => x.kind === 'extended')) {
      const words = e.text.split(' ');
      // Ninguna palabra o secuencia supone más de un tercio del texto.
      const counts = new Map();
      for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
      const top = Math.max(...counts.values());
      assert.ok(top / words.length <= 1 / 3, `${e.id}: «${[...counts].find(([, c]) => c === top)[0]}»`);
      assert.ok(counts.size >= 6, `${e.id}: poca variedad`);
    }
  });
});

describe('LEVEL_GOALS', () => {
  it('son los valores orientativos de cada nivel', () => {
    assert.deepEqual(LEVEL_GOALS, {
      1: { accuracy: 85, wpm: 8 },
      2: { accuracy: 90, wpm: 12 },
      3: { accuracy: 90, wpm: 18 },
      4: { accuracy: 92, wpm: 22 },
      5: { accuracy: 95, wpm: 30 },
    });
  });
});

describe('validateCatalog: identificadores y referencias', () => {
  it('detecta IDs duplicados', () => {
    const errors = errorsOf([exercise(), exercise({ title: 'Otro' })], level1([{ exercise: 'l1-a' }]));
    assert.ok(errors.some((e) => /duplicado/.test(e) && e.includes('l1-a')), errors.join('\n'));
  });

  it('detecta IDs con formato no válido', () => {
    for (const id of ['', 'L1 A', 'l1_a', '-a', 'a-', 'á', 7]) {
      assert.ok(errorsOf([exercise({ id })]).length > 0, String(id));
    }
  });

  it('detecta referencias del curso a ejercicios inexistentes', () => {
    const errors = errorsOf([exercise()], level1([{ exercise: 'l1-a' }, { exercise: 'no-existe' }]));
    assert.ok(errors.some((e) => e.includes('no-existe')), errors.join('\n'));
  });

  it('detecta un ejercicio repetido en el curso', () => {
    const errors = errorsOf([exercise()], level1([{ exercise: 'l1-a' }, { exercise: 'l1-a' }]));
    assert.ok(errors.some((e) => /repetido/.test(e)), errors.join('\n'));
  });

  it('detecta un ejercicio colocado en un nivel distinto del suyo', () => {
    const errors = errorsOf([exercise({ level: 2 })]);
    assert.ok(errors.some((e) => /nivel/.test(e)), errors.join('\n'));
  });

  it('detecta niveles duplicados o desordenados', () => {
    const a = exercise();
    const b = exercise({ id: 'l2-b', level: 2 });
    const errors = errorsOf([a, b], [
      { level: 2, title: 'N2', summary: 'R', lessons: [{ exercise: 'l2-b' }] },
      { level: 1, title: 'N1', summary: 'R', lessons: [{ exercise: 'l1-a' }] },
    ]);
    assert.ok(errors.some((e) => /orden/.test(e)), errors.join('\n'));
  });
});

describe('validateCatalog: práctica base y ampliada', () => {
  const base = exercise();
  const extended = exercise({ id: 'l1-a-ampliada', kind: 'extended', text: LONG_TEXT, targetWpm: 8 });

  it('acepta una lección con práctica base y ampliada', () => {
    assert.deepEqual(errorsOf([base, extended], level1([{ exercise: 'l1-a', extended: 'l1-a-ampliada' }])), []);
  });

  it('la práctica principal de una lección debe ser de tipo base', () => {
    const errors = errorsOf([base, extended], level1([{ exercise: 'l1-a-ampliada' }]));
    assert.ok(errors.some((e) => /base/.test(e)), errors.join('\n'));
  });

  it('la práctica ampliada debe ser de tipo ampliada y existir', () => {
    assert.ok(errorsOf([base], level1([{ exercise: 'l1-a', extended: 'no-existe' }])).length > 0);
    const twoBases = [base, exercise({ id: 'l1-b' })];
    const errors = errorsOf(twoBases, level1([{ exercise: 'l1-a', extended: 'l1-b' }]));
    assert.ok(errors.some((e) => /ampliada/.test(e)), errors.join('\n'));
  });

  it('una práctica no puede aparecer dos veces en el curso', () => {
    const errors = errorsOf([base, extended], level1([
      { exercise: 'l1-a', extended: 'l1-a-ampliada' },
      { exercise: 'l1-a' },
    ]));
    assert.ok(errors.some((e) => /repetido/.test(e)), errors.join('\n'));
  });

  it('la práctica ampliada debe ser más larga que su base', () => {
    const shortExtended = exercise({ id: 'l1-a-ampliada', kind: 'extended', text: 'fff' });
    const errors = errorsOf([base, shortExtended], level1([{ exercise: 'l1-a', extended: 'l1-a-ampliada' }]));
    assert.ok(errors.some((e) => /más larga/.test(e)), errors.join('\n'));
    const sameLength = exercise({ id: 'l1-a-ampliada', kind: 'extended', text: 'jjj fff' });
    assert.ok(errorsOf([base, sameLength], level1([{ exercise: 'l1-a', extended: 'l1-a-ampliada' }]))
      .some((e) => /más larga/.test(e)));
  });

  it('la práctica ampliada refuerza la misma categoría que su base', () => {
    const other = { ...extended, category: 'fila-central' };
    const errors = errorsOf([base, other], level1([{ exercise: 'l1-a', extended: 'l1-a-ampliada' }]));
    assert.ok(errors.some((e) => /categoría/.test(e)), errors.join('\n'));
  });

  it('rechaza lecciones con campos desconocidos', () => {
    const errors = errorsOf([base], level1([{ exercise: 'l1-a', extra: 1 }]));
    assert.ok(errors.some((e) => e.includes('extra')), errors.join('\n'));
  });
});

describe('validateCatalog: lecciones retiradas', () => {
  const retiredData = (retired, extra = []) => {
    const d = data([exercise(), ...extra]);
    return validateCatalog(d.exercises, { ...d.course, retired }, { maxTextLength: MAX });
  };

  it('acepta lecciones retiradas con continuación válida o sin ella', () => {
    const result = retiredData([
      { exercise: 'l1-viejo', title: 'Viejo', continueAt: 'l1-a' },
      { exercise: 'l1-viejo-ampliada', title: 'Viejo (ampliada)' },
    ]);
    assert.deepEqual(result.errors, []);
  });

  it('un ejercicio retirado no puede seguir en el catálogo', () => {
    const errors = retiredData([{ exercise: 'l1-a', title: 'A' }]).errors;
    assert.ok(errors.some((e) => /retirad/.test(e)), errors.join('\n'));
  });

  it('la continuación debe ser una práctica base del recorrido', () => {
    assert.equal(retiredData([{ exercise: 'l1-viejo', title: 'V', continueAt: 'no-existe' }]).ok, false);
  });

  it('valida formato, campos y duplicados', () => {
    for (const retired of [
      'x', [null], [{ exercise: 'L1 Viejo', title: 'V' }], [{ exercise: 'l1-viejo', title: '' }],
      [{ exercise: 'l1-viejo', title: 'V', extra: 1 }],
      [{ exercise: 'l1-viejo', title: 'V' }, { exercise: 'l1-viejo', title: 'V' }],
    ]) {
      assert.equal(retiredData(retired).ok, false, JSON.stringify(retired));
    }
  });

  it('el curso exige schemaVersion 3', () => {
    const d = data([exercise()]);
    assert.equal(validateCatalog(d.exercises, { ...d.course, schemaVersion: 2 }, { maxTextLength: MAX }).ok, false);
  });
});

describe('validateCatalog: datos requeridos', () => {
  it('detecta campos que faltan o tienen el tipo incorrecto', () => {
    const cases = [
      { title: '' }, { description: 3 }, { version: 0 }, { version: 1.5 }, { kind: 'otro' },
      { level: 0 }, { level: 6 }, { difficulty: 'facil' }, { category: 'otra' },
    ];
    for (const overrides of cases) {
      assert.ok(errorsOf([exercise(overrides)]).length > 0, JSON.stringify(overrides));
    }
  });

  it('detecta campos desconocidos (p. ej. erratas)', () => {
    const errors = errorsOf([exercise({ targetAcuracy: 90 })]);
    assert.ok(errors.some((e) => e.includes('targetAcuracy')), errors.join('\n'));
  });

  it('detecta objetivos de precisión no válidos', () => {
    for (const targetAccuracy of [undefined, 49, 101, 90.5, '90', NaN]) {
      assert.ok(errorsOf([exercise({ targetAccuracy })]).length > 0, String(targetAccuracy));
    }
  });

  it('detecta objetivos de WPM no válidos', () => {
    for (const targetWpm of [undefined, 0, -5, 12.5, '12', 301]) {
      assert.ok(errorsOf([exercise({ text: LONG_TEXT, targetWpm })]).length > 0, String(targetWpm));
    }
  });

  it('un texto demasiado breve no puede tener objetivo de WPM', () => {
    const errors = errorsOf([exercise({ text: 'fff jjj', targetWpm: 8 })]);
    assert.ok(errors.some((e) => /WPM/.test(e)), errors.join('\n'));
    assert.deepEqual(errorsOf([exercise({ text: LONG_TEXT, targetWpm: 8 })]), []);
  });

  it('exige versión de esquema y versión del contenido', () => {
    const d = data([exercise()]);
    assert.equal(validateCatalog({ ...d.exercises, schemaVersion: 1 }, d.course, { maxTextLength: MAX }).ok, false);
    assert.equal(validateCatalog({ ...d.exercises, contentVersion: '' }, d.course, { maxTextLength: MAX }).ok, false);
    assert.equal(validateCatalog(d.exercises, { ...d.course, levels: [] }, { maxTextLength: MAX }).ok, false);
    assert.equal(validateCatalog(null, d.course, { maxTextLength: MAX }).ok, false);
  });
});

describe('validateCatalog: contenido del texto', () => {
  it('rechaza textos vacíos, demasiado largos o con caracteres no soportados', () => {
    for (const text of ['', '   ', 'hola 😀', 'a'.repeat(MAX + 1)]) {
      assert.ok(errorsOf([exercise({ text })]).length > 0, text.slice(0, 20));
    }
  });

  it('rechaza textos que prepareText modificaría (no escribibles tal cual)', () => {
    for (const text of ['dos  espacios', ' inicio', 'final ', 'salto\nde línea', '“comillas”', 'tab\tx']) {
      const errors = errorsOf([exercise({ text })]);
      assert.ok(errors.some((e) => /prepareText/.test(e)), text);
    }
  });
});

describe('createCatalog', () => {
  const result = createCatalog(REAL_EXERCISES, REAL_COURSE, { maxTextLength: MAX });

  it('devuelve el catálogo con los ejercicios por ID, compartido por Academia y Biblioteca', () => {
    assert.equal(result.ok, true);
    assert.equal(result.catalog.byId.get('l2-jkl-enie').title, 'Mano derecha: J K L Ñ');
    assert.equal(result.catalog.exercises.length, REAL_EXERCISES.exercises.length);
  });

  it('el recorrido sigue el orden de las prácticas base de cada lección', () => {
    const expected = REAL_COURSE.levels.flatMap((l) => l.lessons.map((lesson) => lesson.exercise));
    assert.deepEqual(result.catalog.courseOrder, expected);
    assert.equal(result.catalog.courseOrder[0], 'l1-postura-fj');
  });

  it('las prácticas ampliadas no forman parte del recorrido', () => {
    const extended = result.catalog.exercises.filter((e) => e.kind === 'extended').map((e) => e.id);
    assert.ok(extended.length > 0);
    for (const id of extended) assert.equal(result.catalog.courseOrder.includes(id), false, id);
  });

  it('cada nivel expone sus lecciones con la práctica ampliada opcional', () => {
    const lessons = result.catalog.levels.flatMap((l) => l.lessons);
    assert.ok(lessons.every((l) => typeof l.exerciseId === 'string' && 'extendedId' in l));
    assert.ok(lessons.some((l) => l.extendedId !== null));
  });

  it('con datos no válidos devuelve los errores y ningún catálogo', () => {
    const bad = createCatalog({ ...REAL_EXERCISES, exercises: [] }, REAL_COURSE, { maxTextLength: MAX });
    assert.equal(bad.ok, false);
    assert.equal(bad.catalog, undefined);
    assert.ok(bad.errors.length > 0);
  });

  it('el catálogo está congelado', () => {
    assert.ok(Object.isFrozen(result.catalog.exercises));
    assert.ok(Object.isFrozen(result.catalog.exercises[0]));
  });

  it('expone las lecciones retiradas y su continuación', () => {
    assert.equal(result.catalog.retired.get('l1-alternar-fj').continueAt, 'l2-asdf');
    assert.equal(result.catalog.retired.get('l1-alternar-fj-ampliada').continueAt, null);
    assert.equal(result.catalog.byId.has('l1-alternar-fj'), false);
  });

  it('exerciseTitle nombra ejercicios activos, retirados y la práctica libre', () => {
    assert.equal(exerciseTitle(result.catalog, 'l2-asdf'), 'Mano izquierda: A S D F');
    assert.equal(exerciseTitle(result.catalog, 'l1-alternar-fj'), 'Alternar F y J · ejercicio retirado');
    assert.equal(exerciseTitle(result.catalog, 'l1-alternar-fj-ampliada'), 'Alternar F y J (ampliada) · ejercicio retirado');
    assert.equal(exerciseTitle(result.catalog, 'custom-text'), 'Texto personalizado');
    assert.equal(exerciseTitle(result.catalog, 'desconocido-1'), 'desconocido-1');
    assert.equal(exerciseTitle(null, 'l2-asdf'), 'l2-asdf');
  });

  it('expone las listas de tipos, dificultades y categorías', () => {
    assert.deepEqual(KINDS.map((k) => k.id), ['base', 'extended']);
    assert.deepEqual(DIFFICULTIES.map((d) => d.id), ['basic', 'intermediate', 'advanced']);
    assert.ok(CATEGORIES.some((c) => c.id === 'fila-central'));
  });
});

describe('filterExercises', () => {
  const { exercises } = createCatalog(REAL_EXERCISES, REAL_COURSE, { maxTextLength: MAX }).catalog;

  it('sin filtros devuelve todos, incluidas las prácticas ampliadas', () => {
    assert.equal(filterExercises(exercises, {}).length, exercises.length);
  });

  it('busca en título y descripción sin distinguir mayúsculas ni tildes', () => {
    const ids = (query) => filterExercises(exercises, { query }).map((e) => e.id);
    assert.deepEqual(ids('NUMEROS'), ['l4-numeros', 'l4-numeros-ampliada']);
    assert.ok(ids('tilde').includes('l4-tildes'));
    assert.deepEqual(ids('zzz'), []);
  });

  it('filtra por nivel, dificultad y categoría combinados', () => {
    const result = filterExercises(exercises, { level: 4, difficulty: 'intermediate', category: 'numeros' });
    assert.deepEqual(result.map((e) => e.id), ['l4-numeros']);
    const advanced = filterExercises(exercises, { level: 4, difficulty: 'advanced', category: 'numeros' });
    assert.deepEqual(advanced.map((e) => e.id), ['l4-numeros-ampliada']);
    assert.ok(filterExercises(exercises, { level: 2 }).every((e) => e.level === 2));
    assert.ok(filterExercises(exercises, { difficulty: 'advanced' }).every((e) => e.difficulty === 'advanced'));
  });

  it('los filtros vacíos no restringen', () => {
    assert.equal(filterExercises(exercises, { query: '  ', level: null, difficulty: '', category: '' }).length,
      exercises.length);
  });
});

// --- Biblioteca agrupada por lecciones -----------------------------------------------

describe('libraryLessons', () => {
  const { catalog } = createCatalog(REAL_EXERCISES, REAL_COURSE, { maxTextLength: MAX });
  const lessons = libraryLessons(catalog);

  it('devuelve una entrada por lección (13) en el orden del curso', () => {
    assert.equal(lessons.length, 13);
    assert.deepEqual(lessons.map((l) => l.base.id), catalog.courseOrder);
  });

  it('cada lección contiene su práctica base y su ampliada, sin duplicar ejercicios', () => {
    for (const lesson of lessons) {
      assert.equal(lesson.base.kind, 'base');
      assert.equal(lesson.extended.kind, 'extended');
      assert.equal(lesson.extended.id, `${lesson.base.id}-ampliada`);
      // Mismos objetos del catálogo: no se copian ni se redefinen.
      assert.equal(lesson.base, catalog.byId.get(lesson.base.id));
      assert.equal(lesson.extended, catalog.byId.get(lesson.extended.id));
    }
    const ids = lessons.flatMap((l) => [l.base.id, l.extended.id]);
    assert.equal(new Set(ids).size, 26);
  });

  it('título, descripción, nivel y categoría de la lección son los de su práctica base', () => {
    const first = lessons[0];
    assert.deepEqual(
      [first.id, first.title, first.description, first.level, first.category],
      [first.base.id, first.base.title, first.base.description, first.base.level, first.base.category]
    );
  });

  it('un ejercicio que no está en ninguna lección tiene su propia tarjeta', () => {
    const extra = Object.freeze({ ...catalog.byId.get('l2-asdf'), id: 'suelto' });
    const withExtra = { ...catalog, exercises: [...catalog.exercises, extra] };
    const result = libraryLessons(withExtra);
    assert.equal(result.length, 14);
    assert.deepEqual([result.at(-1).base.id, result.at(-1).extended], ['suelto', null]);
  });
});

describe('filterLessons', () => {
  const { catalog } = createCatalog(REAL_EXERCISES, REAL_COURSE, { maxTextLength: MAX });
  const lessons = libraryLessons(catalog);
  const ids = (filters) => filterLessons(lessons, filters).map((l) => l.id);

  it('sin filtros devuelve las 13 lecciones', () => {
    assert.equal(filterLessons(lessons, {}).length, 13);
  });

  it('una búsqueda que solo coincide con la ampliada muestra la lección', () => {
    // «frase larga» solo aparece en la descripción de la ampliada de «Las tres filas».
    const onlyExtended = catalog.byId.get('l3-tres-filas-ampliada').description;
    assert.ok(!catalog.byId.get('l3-tres-filas').description.includes('larga'));
    assert.match(onlyExtended, /larga/);
    assert.ok(ids({ query: 'frase larga' }).includes('l3-tres-filas'));
  });

  it('una búsqueda que coincide con la base también muestra la lección', () => {
    assert.deepEqual(ids({ query: 'NUMEROS' }), ['l4-numeros']);
  });

  it('el filtro de dificultad encuentra lecciones por cualquiera de sus prácticas', () => {
    // Las bases de nivel 1 son «básica» y su ampliada «media».
    assert.ok(ids({ difficulty: 'intermediate' }).includes('l1-postura-fj'));
    assert.ok(ids({ difficulty: 'basic' }).includes('l1-postura-fj'));
    assert.equal(ids({ difficulty: 'advanced' }).includes('l1-postura-fj'), false);
  });

  it('filtra por nivel y categoría combinados con la búsqueda', () => {
    assert.deepEqual(ids({ level: 2 }), ['l2-asdf', 'l2-jkl-enie', 'l2-palabras']);
    assert.deepEqual(ids({ category: 'tildes' }), ['l4-tildes']);
    assert.deepEqual(ids({ level: 4, query: 'exclamaciones' }), ['l4-interrogacion-exclamacion']);
    assert.deepEqual(ids({ level: 1, category: 'tildes' }), []);
  });
});
