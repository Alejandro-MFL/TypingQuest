// Diagnóstico de escritura por carácter (T11). El análisis observa SOLO las
// transiciones que el motor acepta (applyInput devuelve un estado nuevo), así que
// los rechazos, renders o eventos repetidos no pueden contarse dos veces.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyInput, restartGame } from '../js/game.js';
import { splitIntoChunks } from '../js/chunks.js';
import {
  ANALYSIS_VERSION,
  MIN_OPPORTUNITIES,
  MAX_STORED_CHARS,
  MAX_STORED_CONFUSIONS,
  createTypingAnalysis,
  recordTransition,
  summarizeAnalysis,
  packAnalysis,
  unpackAnalysis,
  diagnose,
} from '../js/typing-analysis.js';

// Partida con su análisis; `input(value)` simula un evento input con el valor
// COMPLETO del textarea, como hace main.js.
function session(text, { mode = 'strict', words = 7 } = {}) {
  const chunks = splitIntoChunks(text, words);
  let state = createGame(text, { segmentEnds: chunks.map((c) => c.end), mode });
  let analysis = createTypingAnalysis(state.text);
  let now = 1000;
  const api = {
    input(value) {
      const next = applyInput(state, value, (now += 100));
      if (next !== state) analysis = recordTransition(analysis, state, next);
      state = next;
      return api;
    },
    type(chars) {
      for (const c of chars) api.input(state.typed + c);
      return api;
    },
    backspace(count = 1) {
      for (let i = 0; i < count; i++) api.input(state.typed.slice(0, -1));
      return api;
    },
    restart() {
      state = restartGame(state);
      analysis = createTypingAnalysis(state.text);
      return api;
    },
    get state() { return state; },
    get analysis() { return analysis; },
    summary: () => summarizeAnalysis(analysis, state.typed),
  };
  return api;
}

const entry = (summary, char) => summary.chars.find((c) => c.char === char);

describe('oportunidades y primer intento', () => {
  it('escritura correcta al primer intento: una oportunidad por posición y sin errores', () => {
    const s = session('ab ab').type('ab ab');
    const summary = s.summary();
    assert.equal(summary.version, ANALYSIS_VERSION);
    assert.deepEqual(entry(summary, 'a'), {
      char: 'a', opportunities: 2, firstTryErrors: 0, attempts: 2, errors: 0, corrected: 0,
    });
    assert.deepEqual(entry(summary, ' '), {
      char: ' ', opportunities: 1, firstTryErrors: 0, attempts: 1, errors: 0, corrected: 0,
    });
    assert.deepEqual(summary.confusions, []);
  });

  it('error seguido de corrección: un fallo al primer intento, corregido, y un reintento', () => {
    const s = session('ab').type('x').backspace().type('ab');
    assert.deepEqual(entry(s.summary(), 'a'), {
      char: 'a', opportunities: 1, firstTryErrors: 1, attempts: 2, errors: 1, corrected: 1,
    });
    assert.deepEqual(s.summary().confusions, [{ expected: 'a', typed: 'x', count: 1 }]);
  });

  it('varios errores antes de acertar: una sola oportunidad, varios errores', () => {
    const s = session('ab').type('x').backspace().type('s').backspace().type('ab');
    assert.deepEqual(entry(s.summary(), 'a'), {
      char: 'a', opportunities: 1, firstTryErrors: 1, attempts: 3, errors: 2, corrected: 1,
    });
  });

  it('borrar un carácter correcto y reescribirlo no es un fallo ni una oportunidad nueva', () => {
    const s = session('ab').type('a').backspace().type('ab');
    assert.deepEqual(entry(s.summary(), 'a'), {
      char: 'a', opportunities: 1, firstTryErrors: 0, attempts: 2, errors: 0, corrected: 0,
    });
  });

  it('el retroceso nunca cuenta como carácter incorrecto', () => {
    const s = session('abc').type('ab').backspace(2);
    const summary = s.summary();
    assert.equal(summary.chars.reduce((n, c) => n + c.errors, 0), 0);
    assert.equal(s.state.keystrokes.incorrect, 0);
  });
});

describe('modos libre y estricto', () => {
  it('libre: un error sin corregir es un fallo no corregido', () => {
    const s = session('ab cd', { mode: 'free' }).type('ax cd');
    assert.equal(s.state.status, 'finished');
    assert.deepEqual(entry(s.summary(), 'b'), {
      char: 'b', opportunities: 1, firstTryErrors: 1, attempts: 1, errors: 1, corrected: 0,
    });
  });

  it('estricto: el intento de avanzar con errores lo rechaza el motor y no se cuenta', () => {
    const s = session('ab cd', { mode: 'strict', words: 1 }).type('ax ');
    const before = s.summary();
    s.input(`${s.state.typed}c`); // fuera del fragmento activo con errores: rechazado
    assert.deepEqual(s.summary(), before);
    s.backspace(2).type('b c');
    assert.deepEqual(entry(s.summary(), 'b'), {
      char: 'b', opportunities: 1, firstTryErrors: 1, attempts: 2, errors: 1, corrected: 1,
    });
    assert.equal(entry(s.summary(), 'c').opportunities, 1);
  });

  it('cambio de fragmento: las posiciones del fragmento siguiente cuentan una sola vez', () => {
    const s = session('ab cd ef', { words: 1 }).type('ab cd ef');
    assert.equal(s.state.status, 'finished');
    const summary = s.summary();
    assert.equal(summary.chars.reduce((n, c) => n + c.opportunities, 0), 8);
    assert.equal(entry(summary, ' ').opportunities, 2);
  });
});

describe('entradas que el motor no acepta', () => {
  it('pegado rechazado (varios caracteres a la vez): no se registra nada', () => {
    const s = session('hola');
    const empty = s.summary();
    s.input('hol');
    assert.deepEqual(s.summary(), empty);
    assert.equal(s.state.keystrokes.total, 0);
  });

  it('eventos ignorados (mismo valor, partida terminada): sin dobles conteos', () => {
    const s = session('ab').type('a');
    const once = s.summary();
    s.input('a').input('a');
    assert.deepEqual(s.summary(), once);
    s.type('b');
    const done = s.summary();
    s.input('abx');
    assert.deepEqual(s.summary(), done);
  });

  it('un estado distinto con otro texto no se mezcla en el análisis', () => {
    const analysis = createTypingAnalysis('ab');
    const other = createGame('zz');
    const next = applyInput(other, 'z', 1);
    assert.equal(recordTransition(analysis, other, next), analysis);
  });

  it('no muta el análisis recibido', () => {
    const s = session('ab');
    const before = s.analysis;
    const snapshot = structuredClone(before);
    s.type('x');
    assert.deepEqual(before, snapshot);
  });
});

describe('reinicio, abandono y repetición', () => {
  it('reiniciar durante la partida empieza un análisis vacío (lo anterior se descarta)', () => {
    const s = session('ab').type('xx');
    s.restart().type('ab');
    assert.deepEqual(entry(s.summary(), 'a'), {
      char: 'a', opportunities: 1, firstTryErrors: 0, attempts: 1, errors: 0, corrected: 0,
    });
  });

  it('una partida abandonada solo contiene lo escrito (las posiciones no alcanzadas no cuentan)', () => {
    const s = session('abcd').type('ax');
    const summary = s.summary();
    assert.deepEqual(summary.chars.map((c) => c.char).sort(), ['a', 'b']);
  });

  it('repetir desde Resultados: la nueva partida solo cuenta sus propias transiciones', () => {
    const s = session('ab', { mode: 'free' }).type('xb');
    assert.equal(s.state.status, 'finished');
    s.restart().type('ab');
    assert.equal(entry(s.summary(), 'a').errors, 0);
  });
});

describe('Unicode: Ñ, mayúsculas, tildes y composición', () => {
  it('Ñ, mayúscula y tilde son caracteres distintos de n, minúscula y vocal sin tilde', () => {
    const s = session('Ña á').type('Na').backspace(2).type('Ña a').backspace().type('á');
    const summary = s.summary();
    assert.deepEqual(entry(summary, 'Ñ'), {
      char: 'Ñ', opportunities: 1, firstTryErrors: 1, attempts: 2, errors: 1, corrected: 1,
    });
    assert.deepEqual(entry(summary, 'á'), {
      char: 'á', opportunities: 1, firstTryErrors: 1, attempts: 2, errors: 1, corrected: 1,
    });
    assert.deepEqual(summary.confusions.find((c) => c.expected === 'Ñ'), { expected: 'Ñ', typed: 'N', count: 1 });
  });

  it('una vocal compuesta por tecla muerta (NFD) se normaliza y cuenta como un intento', () => {
    const s = session('á').input('á');
    assert.equal(s.state.status, 'finished');
    assert.deepEqual(entry(s.summary(), 'á'), {
      char: 'á', opportunities: 1, firstTryErrors: 0, attempts: 1, errors: 0, corrected: 0,
    });
  });

  it('una composición IME que entrega varios caracteres se rechaza y no se registra', () => {
    const s = session('日本');
    s.input('日本');
    assert.deepEqual(s.summary().chars, []);
  });
});

describe('coincidencia con las transiciones reales del motor', () => {
  // Secuencias deterministas de entradas válidas, rechazadas y borrados.
  function randomSession(seed, mode) {
    let x = seed;
    const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const s = session('el niño comió pan. ¿Qué tal? Ñandú', { mode, words: 3 });
    const alphabet = 'elniñocmópa.¿Qué?ÑndúxzE ';
    for (let i = 0; i < 400 && s.state.status !== 'finished'; i++) {
      const r = rand();
      const target = s.state.text[s.state.typed.length];
      if (r < 0.15) s.backspace();
      else if (r < 0.2) s.input(`${s.state.typed}zz`);
      else if (r < 0.55 && target !== undefined) s.type(target);
      else s.type(alphabet[Math.floor(rand() * alphabet.length)]);
    }
    return s;
  }

  for (const mode of ['free', 'strict']) {
    it(`modo ${mode}: Σ intentos = pulsaciones, Σ errores = incorrectas (métricas globales intactas)`, () => {
      for (const seed of [1, 7, 42, 1234, 99991]) {
        const s = randomSession(seed, mode);
        const chars = s.summary().chars;
        const sum = (key) => chars.reduce((n, c) => n + c[key], 0);
        assert.equal(sum('attempts'), s.state.keystrokes.total, `semilla ${seed}`);
        assert.equal(sum('errors'), s.state.keystrokes.incorrect, `semilla ${seed}`);
        assert.ok(chars.every((c) => c.firstTryErrors <= c.opportunities && c.opportunities <= c.attempts));
        assert.ok(chars.every((c) => c.corrected <= c.firstTryErrors && c.firstTryErrors <= c.errors));
      }
    });
  }
});

describe('diagnose: dificultades con muestra suficiente', () => {
  const summary = (chars, confusions = []) => ({ version: ANALYSIS_VERSION, chars, confusions });
  const c = (char, opportunities, firstTryErrors, extra = {}) => ({
    char, opportunities, firstTryErrors, attempts: opportunities + firstTryErrors,
    errors: firstTryErrors, corrected: firstTryErrors, ...extra,
  });

  it(`umbral de muestra: ${MIN_OPPORTUNITIES} oportunidades; 1 de 1 no supera a 15 de 100`, () => {
    const d = diagnose(summary([c('q', 1, 1), c('e', 100, 15)]));
    assert.equal(d.status, 'difficulties');
    assert.deepEqual(d.difficulties.map((x) => x.char), ['e']);
    assert.equal(d.difficulties[0].rate, 0.15);
    assert.deepEqual(d.insufficient.map((x) => x.char), ['q']);
  });

  it('ordena por tasa de fallos al primer intento, luego por número de fallos', () => {
    const d = diagnose(summary([c('a', 10, 2), c('b', 10, 5), c('c', 20, 4), c('d', 10, 0)]));
    assert.deepEqual(d.difficulties.map((x) => x.char), ['b', 'c', 'a']);
  });

  it('confusiones relevantes (repetidas) asociadas a cada dificultad', () => {
    const d = diagnose(summary([c('ñ', 8, 4)], [
      { expected: 'ñ', typed: 'l', count: 3 }, { expected: 'ñ', typed: 'n', count: 1 },
    ]));
    assert.deepEqual(d.difficulties[0].confusions, [{ typed: 'l', count: 3 }]);
  });

  it('sin errores con datos suficientes: «clean»; sin ningún carácter con muestra: «insufficient»', () => {
    assert.equal(diagnose(summary([c('a', 10, 0)])).status, 'clean');
    assert.equal(diagnose(summary([c('a', 2, 1)])).status, 'insufficient');
  });

  it('sin análisis (sesiones antiguas): «unavailable», nunca cero errores', () => {
    const d = diagnose(null);
    assert.equal(d.status, 'unavailable');
    assert.deepEqual(d.difficulties, []);
  });

  it('limita el número de dificultades mostradas', () => {
    const many = [...'abcdefgh'].map((ch) => c(ch, 10, 3));
    assert.ok(diagnose(summary(many)).difficulties.length <= 5);
  });
});

describe('packAnalysis / unpackAnalysis (formato guardado)', () => {
  const s = session('ñaña ñoño', { mode: 'free' }).type('ñala ñoño');

  it('ida y vuelta sin pérdida', () => {
    assert.deepEqual(unpackAnalysis(packAnalysis(s.summary())), s.summary());
  });

  it('privacidad: solo cadenas de un carácter y números; nunca el texto ni secuencias', () => {
    const custom = session('Mi clave secreta es pato42', { mode: 'free' }).type('Mi clabe secreta es pato42');
    const json = JSON.stringify(packAnalysis(custom.summary()));
    assert.equal(json.includes('secreta'), false);
    const strings = [];
    JSON.parse(json, (key, value) => { if (typeof value === 'string') strings.push(value); return value; });
    assert.ok(strings.every((v) => [...v].length === 1));
  });

  it('rechaza datos corruptos o fuera de límites', () => {
    const good = packAnalysis(s.summary());
    const broken = [
      null, 'x', [], { ...good, version: 2 }, { ...good, chars: 'x' },
      { ...good, chars: [['ab', 1, 0, 1, 0, 0]] },
      { ...good, chars: [['a', 0, 0, 0, 0, 0]] },
      { ...good, chars: [['a', 2, 3, 3, 3, 0]] },
      { ...good, chars: [['a', 2, 1, 1, 1, 0]] },
      { ...good, chars: [['a', 2, 1, 3, 1, 2]] },
      { ...good, chars: [['a', 2.5, 0, 3, 0, 0]] },
      { ...good, chars: [['a', 2, 0, 2, 0, 0], ['a', 2, 0, 2, 0, 0]] },
      { ...good, chars: [['a', 1e9, 0, 1e9, 0, 0]] },
      { ...good, confusions: [['a', 'a', 1]] },
      { ...good, confusions: [['a', 'b', 0]] },
      { ...good, chars: [['a', 2, 1, 3, 1, 1]], confusions: [['a', 'b', 5]] },
      { ...good, extra: 1 },
    ];
    for (const value of broken) assert.equal(unpackAnalysis(value), null, JSON.stringify(value));
  });

  it(`límites de tamaño: como mucho ${MAX_STORED_CHARS} caracteres y ${MAX_STORED_CONFUSIONS} confusiones`, () => {
    const pool = [...'abcdefghijklmnñopqrstuvwxyzABCDEFGHIJKLMNÑOPQRSTUVWXYZáéíóúÁÉÍÓÚüÜ0123456789.,;:¿?¡!'];
    const text = Array.from({ length: 2400 }, (_, i) => pool[(i * 7) % pool.length]).join('');
    const s2 = session(text, { mode: 'free', words: 1000 });
    for (let i = 0; i < text.length; i++) s2.type(i % 3 === 0 ? pool[(i * 11) % pool.length] : text[i]);
    const packed = packAnalysis(s2.summary());
    assert.ok(packed.chars.length <= MAX_STORED_CHARS);
    assert.ok(packed.confusions.length <= MAX_STORED_CONFUSIONS);
    assert.ok(JSON.stringify(packed).length < 2500, `${JSON.stringify(packed).length} bytes`);
    assert.notEqual(unpackAnalysis(packed), null);
  });
});
