// Migración del currículo de T8/T9 (13 lecciones, 26 ejercicios) al de T10.
// Comprueba con los datos reales que no se pierde información de versiones
// anteriores y que la posición guardada se traslada de forma determinista.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalog, exerciseTitle } from '../js/catalog.js';
import {
  resolveRetiredPosition, getCurrentExerciseId, getExerciseProgress, EXERCISE_STATUS,
} from '../js/progress.js';
import { parseHistory, parseProgress } from '../js/storage.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { catalog } = createCatalog(readJson('../data/exercises.json'), readJson('../data/course.json'), {
  maxTextLength: 5000,
});

// Lecciones del recorrido de T8/T9, en su orden, y la retirada en T8.
const T8_COURSE = [
  'l1-postura-fj', 'l2-asdf', 'l2-jkl-enie', 'l2-palabras', 'l3-fila-superior', 'l3-fila-inferior',
  'l3-tres-filas', 'l4-tildes', 'l4-mayusculas-puntuacion', 'l4-interrogacion-exclamacion', 'l4-numeros',
  'l5-frases', 'l5-texto-breve',
];
const T8_RETIRED = ['l1-alternar-fj'];
const ALL_OLD_IDS = [...T8_COURSE, ...T8_RETIRED].flatMap((id) => [id, `${id}-ampliada`]);

// Posición guardada en T8/T9 → posición en T10. Los IDs equivalentes se conservan;
// los retirados continúan en la primera lección nueva que enseña lo mismo.
const EXPECTED_POSITION = {
  'l1-postura-fj': 'l1-postura-fj',
  'l1-alternar-fj': 'a-der-j',
  'l2-asdf': 'l2-asdf',
  'l2-jkl-enie': 'l2-jkl-enie',
  'l2-palabras': 'l2-palabras',
  'l3-fila-superior': 'l3-fila-superior',
  'l3-fila-inferior': 'l3-fila-inferior',
  'l3-tres-filas': 'l3-tres-filas',
  'l4-tildes': 'l4-tildes',
  'l4-mayusculas-puntuacion': 'd-mayus-izq',
  'l4-interrogacion-exclamacion': 'd-interrogacion',
  'l4-numeros': 'd-numeros-izq',
  'l5-frases': 'l5-frases',
  'l5-texto-breve': 'l5-texto-breve',
};

function migrate(progress) {
  return resolveRetiredPosition(progress, catalog.courseOrder, catalog.retired);
}

describe('migración T8/T9 → T10: no se pierde ningún ID', () => {
  it('cada ejercicio que existió sigue activo o figura como retirado', () => {
    for (const id of ALL_OLD_IDS) {
      assert.ok(catalog.byId.has(id) || catalog.retired.has(id), id);
    }
  });

  it('ningún ID está activo y retirado a la vez', () => {
    for (const id of catalog.retired.keys()) assert.equal(catalog.byId.has(id), false, id);
  });

  it('los ejercicios conservados mantienen su ID y su pareja ampliada', () => {
    for (const [oldId, newId] of Object.entries(EXPECTED_POSITION)) {
      if (oldId !== newId) continue;
      assert.ok(catalog.courseOrder.includes(oldId), oldId);
      assert.ok(catalog.byId.has(`${oldId}-ampliada`), `${oldId}-ampliada`);
    }
  });

  it('las prácticas base retiradas indican su continuación; las ampliadas, no', () => {
    for (const [id, entry] of catalog.retired) {
      assert.ok(entry.title.length > 0, id);
      if (id.endsWith('-ampliada')) assert.equal(entry.continueAt, null, id);
      else assert.ok(catalog.courseOrder.includes(entry.continueAt), id);
    }
  });
});

describe('migración de la posición académica', () => {
  const progressAt = (id, exercises = []) => ({ currentExerciseId: id, exercises });

  it('cada posición antigua se traslada a la lección esperada', () => {
    for (const [oldId, expected] of Object.entries(EXPECTED_POSITION)) {
      const migrated = migrate(progressAt(oldId));
      assert.equal(getCurrentExerciseId(migrated, catalog.courseOrder), expected, oldId);
    }
  });

  it('ningún alumno con progreso vuelve al principio (salvo si estaba en la primera lección)', () => {
    const first = catalog.courseOrder[0];
    for (const oldId of Object.keys(EXPECTED_POSITION)) {
      if (oldId === first) continue;
      const position = getCurrentExerciseId(migrate(progressAt(oldId)), catalog.courseOrder);
      assert.notEqual(position, first, oldId);
    }
  });

  it('las lecciones avanzadas siguen en el bloque correspondiente (no retroceden de bloque)', () => {
    const level = (id) => catalog.byId.get(id).level;
    assert.equal(level(getCurrentExerciseId(migrate(progressAt('l4-numeros')), catalog.courseOrder)), 4);
    assert.equal(level(getCurrentExerciseId(migrate(progressAt('l5-texto-breve')), catalog.courseOrder)), 5);
    assert.equal(level(getCurrentExerciseId(migrate(progressAt('l3-tres-filas')), catalog.courseOrder)), 3);
  });

  it('es determinista e idempotente', () => {
    for (const oldId of Object.keys(EXPECTED_POSITION)) {
      const once = migrate(progressAt(oldId));
      assert.deepEqual(migrate(progressAt(oldId)), once, oldId);
      assert.equal(migrate(once), once, oldId);
    }
  });
});

describe('migración de logros y estados', () => {
  const T8_PROGRESS = {
    currentExerciseId: 'l4-numeros',
    exercises: [
      { id: 'l1-postura-fj', status: 'passed', bestAccuracy: 100, bestWpm: 30 },
      { id: 'l2-asdf-ampliada', status: 'completed', bestAccuracy: 80, bestWpm: 20 },
      { id: 'l4-numeros', status: 'skipped', bestAccuracy: null, bestWpm: null },
      { id: 'l4-mayusculas-puntuacion', status: 'passed', bestAccuracy: 96, bestWpm: 35 },
      { id: 'l1-alternar-fj-ampliada', status: 'passed', bestAccuracy: 99, bestWpm: 60 },
    ],
  };

  it('el progreso guardado en T8/T9 se lee completo (también el de ejercicios retirados)', () => {
    const { progress, status, discarded } = parseProgress(JSON.stringify({ version: 1, ...T8_PROGRESS }));
    assert.equal(status, 'ok');
    assert.equal(discarded, 0);
    assert.deepEqual(progress, T8_PROGRESS);
  });

  it('la migración solo cambia la posición: conserva todos los estados y mejores marcas', () => {
    const migrated = migrate(T8_PROGRESS);
    assert.deepEqual(migrated.exercises, T8_PROGRESS.exercises);
    assert.equal(migrated.currentExerciseId, 'd-numeros-izq');
  });

  it('los logros de ejercicios conservados siguen visibles con el mismo ID', () => {
    const migrated = migrate(T8_PROGRESS);
    assert.equal(getExerciseProgress(migrated, 'l1-postura-fj').status, EXERCISE_STATUS.PASSED);
    assert.equal(getExerciseProgress(migrated, 'l2-asdf-ampliada').status, EXERCISE_STATUS.COMPLETED);
  });

  it('ninguna lección nueva aparece superada sin haberla realizado', () => {
    const migrated = migrate(T8_PROGRESS);
    const newIds = catalog.exercises.map((e) => e.id).filter((id) => !ALL_OLD_IDS.includes(id));
    assert.ok(newIds.length > 0);
    for (const id of newIds) {
      assert.equal(getExerciseProgress(migrated, id).status, EXERCISE_STATUS.NOT_STARTED, id);
    }
  });
});

describe('historial de T7, T8 y T9', () => {
  const record = (id, exercise) => ({
    id, finishedAt: '2026-10-21T10:00:00.000Z', wpm: 30, accuracy: 95, elapsedMs: 40000, errors: 2, mode: 'free', exercise,
  });

  it('todos los registros antiguos siguen siendo válidos', () => {
    const sessions = [record('t7', 'custom-text'), ...ALL_OLD_IDS.map((id, i) => record(`t8-${i}`, id))];
    const result = parseHistory(JSON.stringify({ version: 1, sessions }));
    assert.equal(result.status, 'ok');
    assert.equal(result.discarded, 0);
    assert.equal(result.sessions.length, sessions.length);
  });

  it('cada ID antiguo tiene un nombre legible en el Historial', () => {
    for (const id of ALL_OLD_IDS) {
      const title = exerciseTitle(catalog, id);
      assert.notEqual(title, id, id);
    }
    assert.equal(exerciseTitle(catalog, 'custom-text'), 'Texto personalizado');
  });
});
