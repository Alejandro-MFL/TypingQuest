import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_STATUS,
  createProgress,
  getExerciseProgress,
  recordCompletion,
  recordSkip,
  getCurrentExerciseId,
  nextInCourse,
  advanceCourse,
  skipCurrent,
  academyView,
  resolveRetiredPosition,
  restartCourse,
} from '../js/progress.js';

const { NOT_STARTED, SKIPPED, COMPLETED, PASSED } = EXERCISE_STATUS;
const ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];

function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(obj);
}

const status = (progress, id) => getExerciseProgress(progress, id).status;
const current = (progress) => getCurrentExerciseId(progress, ORDER);
const complete = (progress, id, passed, { accuracy = passed ? 95 : 70, wpm = 30 } = {}) =>
  recordCompletion(progress, id, { accuracy, wpm, passed });
// Progreso con la posición en el ejercicio `id` (avanzando paso a paso).
function at(id) {
  let p = createProgress();
  while (current(p) !== id) p = advanceCourse(p, ORDER);
  return p;
}

describe('estados de un ejercicio', () => {
  it('los cuatro estados tienen identificadores estables', () => {
    assert.deepEqual(EXERCISE_STATUS, {
      NOT_STARTED: 'not-started', SKIPPED: 'skipped', COMPLETED: 'completed', PASSED: 'passed',
    });
  });

  it('gris: un ejercicio sin registro no está realizado', () => {
    assert.deepEqual(getExerciseProgress(createProgress(), 'a'), {
      id: 'a', status: NOT_STARTED, bestAccuracy: null, bestWpm: null,
    });
  });

  it('blanco: saltado', () => {
    assert.equal(status(recordSkip(createProgress(), 'a'), 'a'), SKIPPED);
  });

  it('naranja: terminado sin alcanzar el objetivo', () => {
    assert.equal(status(complete(createProgress(), 'a', false), 'a'), COMPLETED);
  });

  it('verde: objetivo alcanzado (lo decide la evaluación de objetivos)', () => {
    assert.equal(status(complete(createProgress(), 'a', true), 'a'), PASSED);
  });
});

describe('mejor logro', () => {
  it('se conserva aunque una repetición posterior sea peor', () => {
    let p = complete(createProgress(), 'a', true, { accuracy: 95, wpm: 40 });
    p = complete(p, 'a', false, { accuracy: 70, wpm: 20 });
    assert.deepEqual(getExerciseProgress(p, 'a'), { id: 'a', status: PASSED, bestAccuracy: 95, bestWpm: 40 });
  });

  it('mejora al repetir mejor', () => {
    let p = complete(createProgress(), 'a', false, { accuracy: 80, wpm: 20 });
    p = complete(p, 'a', true, { accuracy: 92, wpm: 35 });
    assert.deepEqual(getExerciseProgress(p, 'a'), { id: 'a', status: PASSED, bestAccuracy: 92, bestWpm: 35 });
  });

  it('las mejores marcas se guardan redondeadas a 2 decimales', () => {
    const p = complete(createProgress(), 'a', false, { accuracy: 88.571428, wpm: 17.86956 });
    assert.deepEqual(getExerciseProgress(p, 'a'), { id: 'a', status: COMPLETED, bestAccuracy: 88.57, bestWpm: 17.87 });
  });
});

describe('saltar', () => {
  it('un saltado deja de estarlo al completarse', () => {
    assert.equal(status(complete(recordSkip(createProgress(), 'a'), 'a', false), 'a'), COMPLETED);
  });

  it('saltar un ejercicio superado no elimina su logro', () => {
    const p = recordSkip(complete(createProgress(), 'a', true, { accuracy: 95, wpm: 40 }), 'a');
    assert.deepEqual(getExerciseProgress(p, 'a'), { id: 'a', status: PASSED, bestAccuracy: 95, bestWpm: 40 });
  });

  it('saltar un ejercicio terminado sin objetivo lo mantiene naranja', () => {
    assert.equal(status(recordSkip(complete(createProgress(), 'a', false), 'a'), 'a'), COMPLETED);
  });
});

describe('recorrido: posición actual', () => {
  it('empieza en el primer ejercicio del curso', () => {
    assert.equal(current(createProgress()), 'a');
  });

  it('una posición guardada que ya no existe en el curso vuelve al principio', () => {
    assert.equal(current({ ...createProgress(), currentExerciseId: 'zzz' }), 'a');
  });

  it('nextInCourse devuelve el siguiente o null al final', () => {
    assert.equal(nextInCourse(ORDER, 'a'), 'b');
    assert.equal(nextInCourse(ORDER, 'f'), null);
    assert.equal(nextInCourse(ORDER, 'zzz'), null);
  });
});

// Regresión T8: el avance se calculaba desde el ejercicio JUGADO (`fromId`), no
// desde la posición actual, y saltaba varios ejercicios o abría otros fuera de orden.
describe('recorrido: avance exacto (regresión de saltos inesperados)', () => {
  it('terminar el ejercicio actual y salir no avanza', () => {
    const p = complete(at('b'), 'b', true);
    assert.equal(current(p), 'b');
  });

  it('«Siguiente» avanza exactamente un elemento desde la posición actual', () => {
    assert.equal(current(advanceCourse(at('b'), ORDER)), 'c');
  });

  it('«Siguiente» desde un ejercicio terminado sin objetivo también avanza uno', () => {
    assert.equal(current(advanceCourse(complete(at('b'), 'b', false), ORDER)), 'c');
  });

  it('«Saltar» marca el actual como saltado y avanza exactamente uno', () => {
    const p = skipCurrent(at('b'), ORDER);
    assert.equal(current(p), 'c');
    assert.equal(status(p, 'b'), SKIPPED);
    assert.equal(status(p, 'c'), NOT_STARTED);
  });

  it('«Saltar» un actual ya superado conserva su logro y avanza uno', () => {
    const p = skipCurrent(complete(at('b'), 'b', true), ORDER);
    assert.equal(status(p, 'b'), PASSED);
    assert.equal(current(p), 'c');
  });

  it('completar un ejercicio posterior (Biblioteca) no mueve la posición', () => {
    let p = complete(at('b'), 'e', true);
    p = recordSkip(p, 'd');
    assert.equal(current(p), 'b');
    assert.equal(current(advanceCourse(p, ORDER)), 'c', 'el siguiente avance sigue siendo de uno');
  });

  it('repetir ejercicios anteriores no hace retroceder ni saltar', () => {
    let p = complete(at('d'), 'a', false);
    p = complete(p, 'b', true);
    assert.equal(current(p), 'd');
    assert.equal(current(advanceCourse(p, ORDER)), 'e');
  });

  it('en el último ejercicio avanzar o saltar no cambia la posición', () => {
    const last = at('f');
    assert.equal(advanceCourse(last, ORDER), last);
    const skipped = skipCurrent(last, ORDER);
    assert.equal(current(skipped), 'f');
    assert.equal(status(skipped, 'f'), SKIPPED);
  });

  it('dos avances seguidos recorren dos elementos, nunca más', () => {
    assert.equal(current(advanceCourse(advanceCourse(at('a'), ORDER), ORDER)), 'c');
  });

  it('es compatible con el progreso guardado por la versión anterior', () => {
    const saved = { currentExerciseId: 'c', exercises: [{ id: 'a', status: 'passed', bestAccuracy: 90, bestWpm: 20 }] };
    assert.equal(current(saved), 'c');
    assert.equal(current(advanceCourse(saved, ORDER)), 'd');
    assert.equal(status(saved, 'a'), PASSED);
  });
});

describe('inmutabilidad', () => {
  it('ninguna operación muta el progreso recibido', () => {
    const before = deepFreeze(complete(at('b'), 'a', false));
    const snapshot = structuredClone(before);
    complete(before, 'a', true);
    recordSkip(before, 'c');
    advanceCourse(before, ORDER);
    skipCurrent(before, ORDER);
    assert.deepEqual(before, snapshot);
  });
});

describe('academyView', () => {
  const exercise = (id, extra = {}) => ({ id, title: id.toUpperCase(), ...extra });
  const catalog = {
    byId: new Map([...ORDER.map((id) => [id, exercise(id)]), ['b-plus', exercise('b-plus', { kind: 'extended' })]]),
    levels: [
      { level: 1, title: 'N1', summary: 'R1', lessons: [{ exerciseId: 'a', extendedId: null }, { exerciseId: 'b', extendedId: 'b-plus' }] },
      { level: 2, title: 'N2', summary: 'R2', lessons: ['c', 'd', 'e', 'f'].map((id) => ({ exerciseId: id, extendedId: null })) },
    ],
    courseOrder: ORDER,
  };

  it('describe solo el ejercicio actual: nivel, posición, estado y práctica ampliada', () => {
    const view = academyView(catalog, complete(at('b'), 'b-plus', false));
    assert.equal(view.exercise.id, 'b');
    assert.deepEqual(view.level, { level: 1, title: 'N1', summary: 'R1' });
    assert.deepEqual([view.position, view.total], [2, 6]);
    assert.equal(view.status, NOT_STARTED);
    assert.equal(view.extended.exercise.id, 'b-plus');
    assert.equal(view.extended.status, COMPLETED);
    assert.equal(view.canAdvance, false, 'sin terminar, se avanza saltando dentro del ejercicio');
  });

  it('un ejercicio actual terminado (aunque sin objetivo) permite pasar al siguiente', () => {
    assert.equal(academyView(catalog, complete(at('b'), 'b', false)).canAdvance, true);
    assert.equal(academyView(catalog, complete(at('b'), 'b', true)).canAdvance, true);
  });

  it('sin práctica ampliada, extended es null', () => {
    assert.equal(academyView(catalog, at('c')).extended, null);
  });

  it('en el último ejercicio terminado no se puede avanzar y se indica el final', () => {
    const view = academyView(catalog, complete(at('f'), 'f', true));
    assert.equal(view.isLast, true);
    assert.equal(view.canAdvance, false);
  });
});

describe('resolveRetiredPosition (lecciones retiradas del curso)', () => {
  const retired = new Map([['x', { continueAt: 'c' }], ['x-ampliada', { continueAt: null }]]);
  const saved = (currentExerciseId, exercises = []) => ({ currentExerciseId, exercises });

  it('una posición en una lección retirada pasa a su continuación', () => {
    const progress = saved('x', [{ id: 'x', status: 'passed', bestAccuracy: 90, bestWpm: 20 }]);
    const resolved = resolveRetiredPosition(progress, ORDER, retired);
    assert.equal(resolved.currentExerciseId, 'c');
    assert.deepEqual(resolved.exercises, progress.exercises, 'el estado de los ejercicios no se toca');
  });

  it('es determinista e idempotente', () => {
    const once = resolveRetiredPosition(saved('x'), ORDER, retired);
    assert.deepEqual(resolveRetiredPosition(saved('x'), ORDER, retired), once);
    assert.equal(resolveRetiredPosition(once, ORDER, retired), once);
  });

  it('no cambia una posición válida ni la ausencia de posición', () => {
    const valid = saved('b');
    assert.equal(resolveRetiredPosition(valid, ORDER, retired), valid);
    const none = saved(null);
    assert.equal(resolveRetiredPosition(none, ORDER, retired), none);
  });

  it('sin continuación o con un ID desconocido, se deja en manos de getCurrentExerciseId', () => {
    const extended = saved('x-ampliada');
    assert.equal(resolveRetiredPosition(extended, ORDER, retired), extended);
    const unknown = saved('zzz');
    assert.equal(resolveRetiredPosition(unknown, ORDER, retired), unknown);
    assert.equal(current(unknown), 'a');
  });

  it('una continuación que tampoco está en el curso no se aplica', () => {
    const broken = new Map([['x', { continueAt: 'no-esta' }]]);
    const progress = saved('x');
    assert.equal(resolveRetiredPosition(progress, ORDER, broken), progress);
  });
});

describe('restartCourse («Reiniciar Academia»)', () => {
  // Posición avanzada con logros de todo tipo: superado, terminado y saltado.
  const advanced = () => {
    let p = complete(createProgress(), 'a', true, { accuracy: 97.5, wpm: 41 });
    p = advanceCourse(p, ORDER);
    p = complete(p, 'b', false, { accuracy: 70, wpm: 12 });
    p = skipCurrent(advanceCourse(p, ORDER), ORDER);
    return complete(p, 'z-ampliada', true);
  };

  it('devuelve la posición a la primera lección del curso', () => {
    const p = restartCourse(advanced(), ORDER);
    assert.equal(p.currentExerciseId, 'a');
    assert.equal(current(p), 'a');
  });

  it('conserva estados y mejores marcas (superado, terminado, saltado y ampliadas)', () => {
    const before = advanced();
    const after = restartCourse(before, ORDER);
    assert.deepEqual(after.exercises, before.exercises);
    assert.equal(status(after, 'a'), PASSED);
    assert.equal(status(after, 'b'), COMPLETED);
    assert.equal(status(after, 'c'), SKIPPED);
    assert.equal(getExerciseProgress(after, 'a').bestAccuracy, 97.5);
    assert.equal(getExerciseProgress(after, 'a').bestWpm, 41);
  });

  it('no muta el progreso recibido', () => {
    const before = deepFreeze(advanced());
    const snapshot = structuredClone(before);
    restartCourse(before, ORDER);
    assert.deepEqual(before, snapshot);
  });

  it('desde el inicio y con un curso vacío no cambia nada', () => {
    const fresh = createProgress();
    assert.equal(current(restartCourse(fresh, ORDER)), 'a');
    const empty = restartCourse(at('c'), []);
    assert.equal(empty.currentExerciseId, null);
  });

  it('después se avanza de nuevo de uno en uno desde la primera', () => {
    const p = advanceCourse(restartCourse(at('e'), ORDER), ORDER);
    assert.equal(current(p), 'b');
  });
});
