// Entrenamiento personalizado (T13): recomendaciones a partir de «Mi evolución»
// (T12) y del catálogo REAL. Reglas locales y explicables, sin IA.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalog } from '../js/catalog.js';
import { createProgress, recordCompletion, advanceCourse } from '../js/progress.js';
import { analyzeTrends } from '../js/typing-trends.js';
import {
  MAX_RECOMMENDATIONS,
  MIN_TARGET_OCCURRENCES,
  selectTargets,
  exerciseMatches,
  recommendPractice,
  nextRecommendation,
} from '../js/recommendations.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { catalog } = createCatalog(readJson('../data/exercises.json'), readJson('../data/course.json'), { maxTextLength: 5000 });

let counter = 0;
function session(day, chars) {
  counter++;
  return {
    id: `r${counter}`, finishedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    wpm: 20, accuracy: 90, elapsedMs: 60000, errors: 0, mode: 'free', exercise: 'l2-asdf',
    analysis: { version: 1, chars: Object.entries(chars).map(([c, [o, f]]) => [c, o, f, o + f, f, f]), confusions: [] },
  };
}
// Historial en el que cada carácter de `hard` falla con la tasa indicada en tres
// sesiones; «a», muy practicada y sin fallos, mantiene la media realista.
function history(hard) {
  return [1, 2, 3].map((day) => session(day, {
    a: [80, 0],
    ...Object.fromEntries(Object.entries(hard).map(([c, rate]) => [c, [10, Math.round(10 * rate)]])),
  }));
}
const report = (sessions) => analyzeTrends(sessions);
const START = createProgress();
const lessonIndex = new Map(catalog.levels.flatMap((l) => l.lessons).flatMap((l, i) => [[l.exerciseId, i], [l.extendedId, i]]));
const recommend = (sessions, progress = START) => recommendPractice({ report: report(sessions), catalog, progress });
const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };

describe('sin datos suficientes: nunca recomendaciones inventadas', () => {
  it('sin sesiones', () => {
    assert.deepEqual(recommend([]), { status: 'empty', items: [] });
  });

  it('solo sesiones antiguas (T7-T10, sin diagnóstico)', () => {
    const old = { id: 'old', finishedAt: '2026-10-01T10:00:00.000Z', wpm: 12, accuracy: 85, elapsedMs: 1, errors: 6, mode: 'free', exercise: 'a-der-j' };
    assert.deepEqual(recommend([old, { ...old, id: 'old2' }]), { status: 'empty', items: [] });
  });

  it('pocas sesiones con diagnóstico: datos insuficientes', () => {
    assert.deepEqual(recommend(history({ ñ: 0.5 }).slice(0, 2)), { status: 'insufficient', items: [] });
  });

  it('con datos pero sin dificultades destacables: «none» (no es un error)', () => {
    assert.deepEqual(recommend(history({ s: 0 })), { status: 'none', items: [] });
  });
});

describe('selectTargets: qué reforzar (reutiliza los criterios de T12)', () => {
  it('una dificultad recurrente', () => {
    assert.deepEqual(selectTargets(report(history({ ñ: 0.5 }))).map((t) => t.char), ['ñ']);
  });

  it(`varias dificultades: como mucho ${MAX_RECOMMENDATIONS}, por tasa`, () => {
    const targets = selectTargets(report(history({ ñ: 0.3, d: 0.5, k: 0.4, l: 0.6 })));
    assert.deepEqual(targets.map((t) => t.char), ['l', 'd', 'k']);
  });

  it('muchos errores absolutos con tasa baja no bastan', () => {
    const busy = [1, 2, 3].map((day) => session(day, { a: [80, 0], e: [400, 20] }));
    assert.deepEqual(selectTargets(report(busy)), []);
  });

  it('las que empeoran van primero; las que mejoran, después de las estables', () => {
    const sessions = [
      session(1, { a: [60, 0], ñ: [15, 6], d: [15, 1], k: [20, 6] }), session(2, { a: [60, 0], ñ: [15, 6], d: [15, 1], k: [20, 6] }),
      session(3, { a: [60, 0], ñ: [20, 2], d: [20, 7], k: [20, 6] }), session(4, { a: [60, 0], ñ: [15, 2], d: [15, 6], k: [20, 6] }),
    ];
    const targets = selectTargets(report(sessions));
    assert.deepEqual(targets.map((t) => [t.char, t.trend]), [['d', 'worsening'], ['k', 'stable'], ['ñ', 'improving']]);
  });

  it('dificultades equivalentes (misma tecla: «d» y «D») no se duplican', () => {
    const targets = selectTargets(report(history({ d: 0.5, D: 0.6 })));
    assert.deepEqual(targets.map((t) => t.char), ['D']);
  });
});

describe('exerciseMatches: contenido real, no el título', () => {
  it('cuenta el carácter exacto en el texto', () => {
    assert.equal(exerciseMatches(catalog.byId.get('l2-jkl-enie'), 'ñ').count, 14);
  });

  it('tildes: cuenta todas las vocales con la misma tecla muerta', () => {
    const tildes = exerciseMatches(catalog.byId.get('l4-tildes'), 'á');
    assert.equal(tildes.match, 'accent');
    assert.ok(tildes.count >= MIN_TARGET_OCCURRENCES);
  });

  it('mayúsculas sin presencia suficiente: misma tecla física (Ñ → ñ)', () => {
    const m = exerciseMatches(catalog.byId.get('l2-jkl-enie'), 'Ñ');
    assert.deepEqual([m.match, m.count], ['key', 14]);
  });
});

describe('recommendPractice: ejercicios adecuados', () => {
  it('Ñ → la práctica de la fila central derecha que la introduce, no un párrafo con una sola ñ', () => {
    const { status, items } = recommend(history({ ñ: 0.5 }));
    assert.equal(status, 'ok');
    assert.equal(items[0].exercise.id, 'l2-jkl-enie');
    assert.equal(items[0].exercise.kind, 'base');
    assert.ok(items[0].count >= MIN_TARGET_OCCURRENCES);
  });

  it('nunca recomienda algo más avanzado que lo trabajado (salvo la lección de la propia tecla)', () => {
    const { items } = recommend(history({ d: 0.5 }));
    assert.equal(items[0].exercise.id, 'a-izq-fd');
    assert.equal(items[0].alternative, null, 'al principio del curso no hay alternativa más avanzada');
    for (const item of items) assert.ok(lessonIndex.get(item.exercise.id) <= lessonIndex.get('a-izq-fd'));
  });

  it('más avanzado en el curso: alternativa más exigente de una lección posterior', () => {
    let progress = START;
    while (progress.currentExerciseId !== 'b-u') progress = advanceCourse(progress, catalog.courseOrder);
    const [item] = recommend(history({ ñ: 0.5 }), progress).items;
    assert.equal(item.exercise.id, 'l2-jkl-enie');
    assert.ok(item.alternative);
    assert.ok(lessonIndex.get(item.alternative.id) > lessonIndex.get('l2-jkl-enie'));
    assert.ok(lessonIndex.get(item.alternative.id) <= lessonIndex.get('b-u'));
  });

  it('base ya superada: se propone la ampliada de la misma lección', () => {
    const progress = recordCompletion(START, 'l2-jkl-enie', { accuracy: 99, wpm: 30, passed: true });
    const [item] = recommend(history({ ñ: 0.5 }), progress).items;
    assert.equal(item.exercise.id, 'l2-jkl-enie-ampliada');
    assert.equal(item.exercise.kind, 'extended');
    assert.equal(item.upgraded, true);
  });

  it('tildes: una práctica de tildes; mayúsculas: la tecla física', () => {
    const accent = recommend(history({ á: 0.5 })).items[0];
    assert.equal(accent.match, 'accent');
    assert.ok(['l4-tildes', 'l4-tildes-ampliada'].includes(accent.exercise.id));
    const upper = recommend(history({ Ñ: 0.5 })).items[0];
    assert.equal(upper.match, 'key');
    assert.equal(upper.exercise.id, 'l2-jkl-enie');
  });

  it('varias dificultades: lecciones distintas (sin tres prácticas casi idénticas)', () => {
    const { items } = recommend(history({ ñ: 0.4, k: 0.5, l: 0.6 }));
    const lessons = items.map((i) => lessonIndex.get(i.exercise.id));
    assert.equal(items.length, 3);
    assert.equal(new Set(lessons).size, 3);
  });

  it('orden determinista: el orden del Historial no cambia el resultado', () => {
    const sessions = history({ ñ: 0.4, d: 0.5 });
    assert.deepEqual(recommend([...sessions].reverse()), recommend(sessions));
  });

  it('no modifica el progreso académico', () => {
    const progress = deepFreeze(recordCompletion(START, 'a-der-j', { accuracy: 90, wpm: 20, passed: true }));
    const snapshot = structuredClone(progress);
    recommend(history({ ñ: 0.5 }), progress);
    assert.deepEqual(progress, snapshot);
  });
});

describe('las recomendaciones cambian con la evidencia', () => {
  it('tras prácticas sin fallos, la dificultad deja de cumplir los criterios y desaparece', () => {
    const sessions = history({ ñ: 0.5 });
    assert.equal(recommend(sessions).items[0].target.char, 'ñ');
    const better = [...sessions, ...[4, 5, 6, 7].map((day) => session(day, { a: [80, 0], ñ: [40, 0] }))];
    assert.deepEqual(recommend(better).items.map((i) => i.target.char), []);
  });

  it('un ejercicio ya terminado sigue siendo elegible si la dificultad continúa', () => {
    const progress = recordCompletion(START, 'a-izq-fd', { accuracy: 80, wpm: 10, passed: false });
    assert.equal(recommend(history({ d: 0.5 }), progress).items[0].exercise.id, 'a-izq-fd');
  });

  it('compatibilidad: mezcla de registros T7-T10 y diagnósticos de T11-T12', () => {
    const old = { id: 'old', finishedAt: '2026-09-01T10:00:00.000Z', wpm: 12, accuracy: 85, elapsedMs: 1, errors: 6, mode: 'free', exercise: 'custom-text' };
    assert.equal(recommend([old, ...history({ ñ: 0.5 })]).items[0].exercise.id, 'l2-jkl-enie');
  });
});

describe('upgraded: solo cuando la base ya está superada', () => {
  it('si la ampliada se elige porque la base apenas contiene el carácter, no se dice «ya superaste la base»', () => {
    const progress = recordCompletion(START, 'l4-tildes', { accuracy: 99, wpm: 30, passed: true });
    const passed = recommend(history({ á: 0.5 }), progress).items[0];
    assert.equal(passed.upgraded, passed.exercise.kind === 'extended');
    const fresh = recommend(history({ á: 0.5 })).items[0];
    assert.equal(fresh.upgraded, false);
  });
});

describe('nextRecommendation (T17): «Siguiente recomendación» con la lista recalculada', () => {
  const item = (id, alternative = null) => ({ exercise: { id }, alternative: alternative ? { id: alternative } : null });
  const items = [item('x', 'x2'), item('y'), item('z')];

  it('la siguiente de la lista actual', () => {
    assert.equal(nextRecommendation(items, 'x'), 'y');
    assert.equal(nextRecommendation(items, 'y'), 'z');
  });

  it('desde la alternativa de una recomendación, también la siguiente', () => {
    assert.equal(nextRecommendation(items, 'x2'), 'y');
  });

  it('la última no tiene siguiente', () => {
    assert.equal(nextRecommendation(items, 'z'), null);
  });

  it('si la practicada ya no se recomienda (dificultad resuelta), la primera vigente', () => {
    assert.equal(nextRecommendation(items, 'w'), 'x');
    assert.equal(nextRecommendation([item('w')], 'w'), null);
  });

  it('sin recomendaciones válidas: null', () => {
    assert.equal(nextRecommendation([], 'x'), null);
  });
});
