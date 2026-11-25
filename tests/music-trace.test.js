// Diagnóstico de desarrollo de Música (02.3): registro limitado de eventos, detector de
// divergencias entre campo, motor y marcador, y evidencia congelada.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrace, traceEvent, findDivergences, recordCheck, recordLostKey, exportTrace, charClass,
  TRACE_CAPACITY, TRACE_WINDOW, MAX_FROZEN,
} from '../js/music-trace.js';

// Estado coherente: el campo coincide con el motor y el marcador está en su índice.
const ok = (extra = {}) => ({
  composing: false, valueMatchesEngine: true, engineTypedLen: 3, markerIndex: 3, phraseIndex: 0, phraseLen: 10,
  gameId: 1, shown: true, status: 'active', transition: null, ...extra,
});

describe('registro de eventos', () => {
  it('numera los eventos y no crece indefinidamente', () => {
    let trace = createTrace();
    for (let i = 0; i < TRACE_CAPACITY + 50; i++) trace = traceEvent(trace, { type: 'input', t: i });
    assert.equal(trace.entries.length, TRACE_CAPACITY);
    assert.equal(trace.entries[0].seq, 51);
    assert.equal(trace.entries.at(-1).seq, TRACE_CAPACITY + 50);
  });

  it('representa los caracteres por su clase, sin guardar el texto', () => {
    assert.equal(charClass('a'), 'letra');
    assert.equal(charClass('Ñ'), 'mayúscula');
    assert.equal(charClass('á'), 'acentuada');
    assert.equal(charClass(' '), 'espacio');
    assert.equal(charClass(','), 'puntuación');
    assert.equal(charClass('7'), 'número');
    assert.equal(charClass(null), null);
  });
});

describe('findDivergences', () => {
  it('estado coherente: ninguna divergencia', () => {
    assert.deepEqual(findDivergences(ok(), ok({ engineTypedLen: 2, markerIndex: 2 }), { deletion: false }), []);
  });

  it('el campo no coincide con el motor (fuera de una composición)', () => {
    assert.deepEqual(findDivergences(ok({ valueMatchesEngine: false }), null, {}).map((d) => d.element), ['campo']);
    assert.deepEqual(findDivergences(ok({ valueMatchesEngine: false, composing: true }), null, {}), []);
  });

  it('el marcador no está en el índice del motor', () => {
    assert.deepEqual(findDivergences(ok({ markerIndex: 1 }), null, {}).map((d) => d.element), ['marcador']);
    assert.deepEqual(findDivergences(ok({ engineTypedLen: 10, markerIndex: -1 }), null, {}), [], 'frase completa: sin marcador');
    assert.deepEqual(findDivergences(ok({ shown: false, markerIndex: -1 }), null, {}), [], 'frase aún oculta');
  });

  it('el motor retrocede en la misma frase sin un borrado', () => {
    const before = ok({ engineTypedLen: 5, markerIndex: 5 });
    assert.deepEqual(findDivergences(ok(), before, { deletion: false }).map((d) => d.element), ['motor']);
    assert.deepEqual(findDivergences(ok(), before, { deletion: true }), []);
  });

  it('la frase cambia sin un motivo registrado', () => {
    const before = ok();
    assert.deepEqual(findDivergences(ok({ phraseIndex: 1, gameId: 2, engineTypedLen: 0, markerIndex: 0 }), before, {})
      .map((d) => d.element), ['frase']);
    assert.deepEqual(findDivergences(ok({ phraseIndex: 1, gameId: 2, engineTypedLen: 0, markerIndex: 0, transition: 'completada' }), before, {}), []);
  });

  it('el motor se reinicia en la misma frase sin motivo', () => {
    const before = ok({ engineTypedLen: 5, markerIndex: 5 });
    assert.deepEqual(findDivergences(ok({ gameId: 2, engineTypedLen: 0, markerIndex: 0 }), before, {}).map((d) => d.element), ['motor']);
  });
});

describe('evidencia congelada', () => {
  it('guarda el evento anterior, una ventana de eventos y el estado posterior, sin sobrescribirla', () => {
    let trace = createTrace();
    for (let i = 0; i < 40; i++) trace = traceEvent(trace, { type: 'tick', t: i });
    trace = recordCheck(trace, ok({ markerIndex: 0 }), null, { cause: 'input' });
    assert.equal(trace.frozen.length, 1);
    const [first] = trace.frozen;
    assert.equal(first.window.length, TRACE_WINDOW);
    assert.equal(first.window.at(-1).t, 39, 'el evento que la precedió');
    assert.equal(first.after.markerIndex, 0);
    assert.deepEqual(first.divergences.map((d) => d.element), ['marcador']);
    assert.equal(first.cause, 'input');
    // Los eventos nuevos no cambian la evidencia ya guardada.
    trace = traceEvent(trace, { type: 'input', t: 99 });
    assert.equal(trace.frozen[0].window.at(-1).t, 39);
  });

  it('como máximo unas pocas divergencias; las coherentes no se guardan', () => {
    let trace = createTrace();
    for (let i = 0; i < MAX_FROZEN + 3; i++) trace = recordCheck(trace, ok({ markerIndex: 9 }), null, {});
    assert.equal(trace.frozen.length, MAX_FROZEN);
    assert.equal(recordCheck(createTrace(), ok(), null, {}).frozen.length, 0);
  });

  it('exportTrace da un JSON con versión y sin funciones', () => {
    const trace = traceEvent(createTrace(), { type: 'input', t: 1 });
    const exported = JSON.parse(JSON.stringify(exportTrace(trace, { userAgent: 'x' })));
    assert.equal(exported.version, 1);
    assert.equal(exported.entries.length, 1);
    assert.deepEqual(exported.frozen, []);
    assert.equal(exported.context.userAgent, 'x');
  });
});

describe('teclas que no llegan al campo (02.3)', () => {
  it('una tecla pulsada fuera del campo durante la práctica congela la evidencia', () => {
    let trace = traceEvent(createTrace(), { type: 'blur', focus: 'body', t: 1 });
    trace = recordLostKey(trace, { key: 'letra', code: 'KeyM', focus: 'body', t: 2 }, ok());
    assert.equal(trace.frozen.length, 1);
    assert.deepEqual(trace.frozen[0].divergences.map((d) => d.element), ['foco']);
    assert.equal(trace.frozen[0].window.at(-1).type, 'tecla-fuera-del-campo');
    assert.equal(trace.frozen[0].window.at(-2).type, 'blur');
  });

  it('las siguientes teclas perdidas se registran pero no repiten la evidencia', () => {
    let trace = recordLostKey(createTrace(), { key: 'letra', focus: 'body', t: 1 }, ok());
    trace = recordLostKey(trace, { key: 'letra', focus: 'body', t: 2 }, ok());
    assert.equal(trace.frozen.length, 1);
    assert.equal(trace.entries.length, 2);
  });
});
