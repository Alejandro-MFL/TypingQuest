import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusInfo,
  formatAccuracyFloor,
  formatGoals,
  formatObjectiveResults,
  formatLessonCount,
  blockLabel,
  groupLessonsByLevel,
  retryLabel,
  backToOriginLabel,
  overviewSummaryText,
  blockProgressText,
  blockPercent,
  blockShortText,
  homeProgressText,
  libraryLessonTitle,
  bestMarksText,
  resultsActions,
  speedNote,
} from '../js/course-ui.js';
import { EXERCISE_STATUS } from '../js/progress.js';
import { evaluateObjectives } from '../js/objectives.js';

describe('statusInfo', () => {
  it('cada estado tiene etiqueta e icono además del color (clase)', () => {
    const expected = {
      [EXERCISE_STATUS.NOT_STARTED]: 'No realizado',
      [EXERCISE_STATUS.SKIPPED]: 'Saltado',
      [EXERCISE_STATUS.COMPLETED]: 'Terminado',
      [EXERCISE_STATUS.PASSED]: 'Objetivo superado',
    };
    const icons = new Set();
    for (const [status, label] of Object.entries(expected)) {
      const info = statusInfo(status);
      assert.equal(info.label, label);
      assert.equal(info.className, `status-${status}`);
      assert.ok(info.icon.length > 0);
      icons.add(info.icon);
    }
    assert.equal(icons.size, 4, 'iconos distintos');
  });

  it('un estado desconocido se muestra como no realizado', () => {
    assert.equal(statusInfo('otro').label, 'No realizado');
  });
});

describe('formatAccuracyFloor', () => {
  it('trunca a un decimal para no redondear hacia el objetivo', () => {
    assert.equal(formatAccuracyFloor(94.96), '94,9 %');
    assert.equal(formatAccuracyFloor(90), '90 %');
    assert.equal(formatAccuracyFloor(100), '100 %');
  });
});

describe('formatGoals', () => {
  it('describe los dos objetivos', () => {
    assert.equal(formatGoals({ targetAccuracy: 92, targetWpm: 22 }), 'Objetivos: 92 % de precisión y 22 WPM');
  });

  it('indica cuándo la velocidad no se evalúa', () => {
    assert.equal(formatGoals({ targetAccuracy: 85, targetWpm: null }),
      'Objetivo: 85 % de precisión (la velocidad no se evalúa en esta práctica)');
  });
});

describe('formatObjectiveResults', () => {
  const goals = { targetAccuracy: 90, targetWpm: 20 };
  const results = (accuracy, wpm, elapsedMs = 30_000, g = goals) =>
    formatObjectiveResults(evaluateObjectives({ accuracy, wpm, elapsedMs }, g));
  const states = (r) => r.items.map((item) => item.state);

  it('ambos objetivos cumplidos', () => {
    const r = results(96.4, 25.8);
    assert.equal(r.passed, true);
    assert.equal(r.title, 'Objetivo superado');
    assert.deepEqual(states(r), ['met', 'met']);
    assert.deepEqual(r.items.map((i) => i.text), [
      'Precisión 96,4 % (mínimo 90 %): cumplido',
      'Velocidad 25 WPM (mínimo 20 WPM): cumplido',
    ]);
  });

  it('precisión cumplida y velocidad pendiente', () => {
    const r = results(95, 15.9);
    assert.equal(r.passed, false);
    assert.equal(r.title, 'Ejercicio terminado, objetivo pendiente');
    assert.deepEqual(states(r), ['met', 'pending']);
    assert.equal(r.items[1].text, 'Velocidad 15 WPM (mínimo 20 WPM): pendiente');
  });

  it('velocidad cumplida y precisión pendiente (sin redondear hacia el objetivo)', () => {
    const r = results(89.99, 30);
    assert.deepEqual(states(r), ['pending', 'met']);
    assert.equal(r.items[0].text, 'Precisión 89,9 % (mínimo 90 %): pendiente');
  });

  it('las WPM no se redondean hacia el objetivo', () => {
    assert.equal(results(95, 19.99).items[1].state, 'pending');
    assert.match(results(95, 19.99).items[1].text, /^Velocidad 19 WPM/);
  });

  it('velocidad no aplicable (sin objetivo de WPM)', () => {
    const r = results(95, 0, 500, { targetAccuracy: 85, targetWpm: null });
    assert.equal(r.passed, true);
    assert.deepEqual(states(r), ['met', 'not-applicable']);
    assert.equal(r.items[1].text, 'Velocidad: no se evalúa en esta práctica');
  });

  it('velocidad no fiable por un tiempo demasiado corto', () => {
    const r = results(100, 600, 300);
    assert.equal(r.passed, false);
    assert.deepEqual(states(r), ['met', 'unreliable']);
    assert.match(r.items[1].text, /demasiado corto/);
  });

  it('cada resultado tiene un icono, no solo color', () => {
    for (const item of results(95, 15.9).items) assert.ok(item.icon.length > 0);
  });
});

describe('formatLessonCount', () => {
  it('cuenta lecciones (tarjetas de la Biblioteca) en singular y plural', () => {
    assert.equal(formatLessonCount(13), '13 lecciones');
    assert.equal(formatLessonCount(1), '1 lección');
    assert.equal(formatLessonCount(0), 'Ninguna lección coincide con la búsqueda');
  });
});

describe('blockLabel', () => {
  it('cada nivel es un bloque del temario (A-E)', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(blockLabel), ['Bloque A', 'Bloque B', 'Bloque C', 'Bloque D', 'Bloque E']);
  });

  it('un nivel fuera de rango se muestra como nivel', () => {
    assert.equal(blockLabel(9), 'Nivel 9');
  });
});

describe('groupLessonsByLevel', () => {
  it('agrupa las lecciones por nivel conservando el orden', () => {
    const lessons = [{ id: 'a', level: 1 }, { id: 'b', level: 1 }, { id: 'c', level: 3 }];
    assert.deepEqual(groupLessonsByLevel(lessons).map((g) => [g.level, g.lessons.map((l) => l.id)]), [
      [1, ['a', 'b']], [3, ['c']],
    ]);
  });

  it('sin lecciones, sin grupos', () => {
    assert.deepEqual(groupLessonsByLevel([]), []);
  });
});

describe('retryLabel (Resultados)', () => {
  it('en ejercicios de la Academia y la Biblioteca: «Repetir ejercicio»', () => {
    assert.equal(retryLabel('academy'), 'Repetir ejercicio');
    assert.equal(retryLabel('library'), 'Repetir ejercicio');
  });

  it('en práctica libre: «Repetir texto» (el mismo texto personalizado)', () => {
    assert.equal(retryLabel('free'), 'Repetir texto');
  });
});

describe('backToOriginLabel (Resultados)', () => {
  it('cada origen vuelve a su sitio; las prácticas recomendadas, a «Mi evolución» (T13)', () => {
    assert.equal(backToOriginLabel('academy'), 'Volver a la Academia');
    assert.equal(backToOriginLabel('library'), 'Volver a la Biblioteca');
    assert.equal(backToOriginLabel('evolution'), 'Volver a Mi evolución');
    assert.equal(retryLabel('evolution'), 'Repetir ejercicio');
  });
});

describe('progreso del curso por bloques (T14)', () => {
  it('resumen: recorridas, restantes, terminadas y superadas, sin mezclarlas', () => {
    assert.equal(overviewSummaryText({ lessons: 67, traveled: 8, remaining: 59, finished: 10, passed: 7 }),
      'Has recorrido 8 de 67 lecciones y te quedan 59. Prácticas base terminadas: 10; con el objetivo superado: 7.');
    assert.equal(overviewSummaryText({ lessons: 67, traveled: 0, remaining: 67, finished: 0, passed: 0 }),
      'Has recorrido 0 de 67 lecciones y te quedan 67. Prácticas base terminadas: 0; con el objetivo superado: 0.');
  });

  it('cada bloque: recorridas, terminadas y superadas, y si es el actual', () => {
    assert.equal(blockProgressText({ total: 17, traveled: 8, finished: 6, passed: 4, current: true }),
      '8 de 17 recorridas · 6 terminadas · 4 superadas · bloque actual');
    assert.equal(blockProgressText({ total: 14, traveled: 0, finished: 0, passed: 0, current: false }),
      '0 de 14 recorridas · 0 terminadas · 0 superadas');
  });
});

describe('recorrido compacto e Inicio (T15.2)', () => {
  const block = (traveled, total = 17, extra = {}) => ({ title: 'Bloque A · Fila central', total, traveled, finished: 0, passed: 0, current: false, ...extra });

  it('porcentaje recorrido del bloque, redondeado', () => {
    assert.equal(blockPercent(block(8)), 47);
    assert.equal(blockPercent(block(0)), 0);
    assert.equal(blockPercent(block(17)), 100);
    assert.equal(blockPercent(block(0, 0)), 0);
  });

  it('bloques que no son el actual: texto breve; completado con su marca', () => {
    assert.equal(blockShortText(block(8)), '8 de 17 · 47 %');
    assert.equal(blockShortText(block(0, 14)), '0 de 14 · 0 %');
    assert.equal(blockShortText(block(17)), '✓ Completado · 17 de 17');
  });

  it('Inicio: bloque actual y lecciones recorridas, sin más estadísticas', () => {
    const overview = {
      blocks: [block(17), block(3, 14, { title: 'Bloque B · Fila superior', current: true })],
      totals: { lessons: 67, traveled: 20, remaining: 47, finished: 18, passed: 12 },
    };
    assert.equal(homeProgressText(overview), 'Bloque B · Fila superior · 20 de 67 lecciones recorridas');
    assert.equal(homeProgressText({ blocks: [block(0)], totals: { lessons: 67, traveled: 0 } }), '0 de 67 lecciones recorridas');
  });
});

describe('Biblioteca simplificada (T15.3)', () => {
  it('título numerado «A2. Mano derecha: J»; sin código, solo el título', () => {
    assert.equal(libraryLessonTitle({ code: 'A2', title: 'Mano derecha: J' }), 'A2. Mano derecha: J');
    assert.equal(libraryLessonTitle({ code: null, title: 'Suelto' }), 'Suelto');
  });

  it('mejores marcas a demanda, o un aviso si aún no hay resultados', () => {
    assert.equal(bestMarksText({ bestAccuracy: 97.14, bestWpm: 29.6 }), 'Mejor resultado: 97,1 % de precisión · 29 WPM');
    assert.equal(bestMarksText({ bestAccuracy: null, bestWpm: null }), 'Todavía sin resultados');
  });
});

describe('acciones de Resultados (T15.3 y T17): matriz por origen', () => {
  // courseLesson: práctica (base o ampliada) de la lección ACTUAL abierta desde la Academia.
  const base = { origin: 'academy', courseLesson: true, isExtended: false, hasNext: true, extendedAvailable: true };

  it('1-2. base de la Academia superada: Repetir, Práctica ampliada, Siguiente y volver', () => {
    assert.deepEqual(resultsActions(base), {
      retry: true, extended: true, next: true, nextLabel: 'Siguiente ejercicio',
      courseEnd: false, back: true, newText: false,
    });
  });

  it('1. base sin objetivo (ampliada bloqueada): no se ofrece; el avance sigue libre', () => {
    const actions = resultsActions({ ...base, extendedAvailable: false });
    assert.deepEqual([actions.extended, actions.next, actions.back], [false, true, true]);
  });

  it('3. ampliada de la lección actual: Siguiente sí (T17), nunca otra vez la ampliada', () => {
    const actions = resultsActions({ ...base, isExtended: true });
    assert.deepEqual([actions.extended, actions.next, actions.courseEnd, actions.back], [false, true, false, true]);
  });

  it('10. última lección: sin Siguiente y con aviso de final (base y ampliada)', () => {
    for (const isExtended of [false, true]) {
      const actions = resultsActions({ ...base, isExtended, hasNext: false });
      assert.deepEqual([actions.next, actions.courseEnd, actions.back], [false, true, true]);
    }
  });

  it('Academia fuera de la lección actual: sin acciones del recorrido', () => {
    const actions = resultsActions({ ...base, courseLesson: false });
    assert.deepEqual([actions.extended, actions.next, actions.courseEnd], [false, false, false]);
  });

  it('4-5. Biblioteca: Siguiente ejercicio de la Biblioteca si hay uno visible después', () => {
    const actions = resultsActions({ origin: 'library', nextId: 'b', hasNext: true, extendedAvailable: true });
    assert.deepEqual([actions.extended, actions.next, actions.courseEnd, actions.back], [false, true, false, true]);
    assert.equal(actions.nextLabel, 'Siguiente ejercicio de la Biblioteca');
  });

  it('6. último ejercicio visible de la Biblioteca: sin Siguiente ni aviso de final', () => {
    const actions = resultsActions({ origin: 'library', nextId: null });
    assert.deepEqual([actions.next, actions.courseEnd, actions.back], [false, false, true]);
  });

  it('7-8. Mi evolución: Siguiente recomendación solo si hay una válida', () => {
    const withNext = resultsActions({ origin: 'evolution', nextId: 'x' });
    assert.deepEqual([withNext.next, withNext.nextLabel, withNext.back], [true, 'Siguiente recomendación', true]);
    assert.equal(resultsActions({ origin: 'evolution', nextId: null }).next, false);
  });

  it('9. práctica libre: Repetir y Nuevo texto, sin acciones de ejercicios', () => {
    const actions = resultsActions({ origin: 'free', nextId: 'x', hasNext: true, extendedAvailable: true });
    assert.deepEqual([actions.newText, actions.back, actions.extended, actions.next], [true, false, false, false]);
  });
});

describe('velocidad sin objetivo (T15.3)', () => {
  it('se informa pero no se evalúa cuando el ejercicio no tiene objetivo de WPM', () => {
    assert.equal(speedNote({ targetWpm: null }), 'La velocidad se informa, pero no se evalúa en esta práctica.');
    assert.equal(speedNote({ targetWpm: 12 }), '');
    assert.equal(speedNote(null), '');
  });
});
