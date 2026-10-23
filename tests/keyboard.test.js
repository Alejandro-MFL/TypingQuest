import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINGERS,
  KEYBOARD_ROWS,
  HOME_KEYS,
  getKey,
  resolveCharacter,
  resolveBackspace,
  involvedFingers,
  describeResolution,
  guideTarget,
  keyLegend,
  guideHighlights,
  isWrongInsertion,
  HELP_MODES,
  DEFAULT_HELP_MODES,
  helpContext,
  showsRestReminder,
  requiredInputs,
  isValidInputToken,
} from '../js/keyboard.js';

function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(obj);
}

const codesOf = (row) => KEYBOARD_ROWS[row].map((k) => k.code);
const letters = (s) => [...s].map((c) => `Key${c}`);
// Resumen compacto de una resolución: [código, dedos, modificadores, muerta] por paso.
const steps = (char) => resolveCharacter(char).steps.map((s) => [
  s.code, s.fingers.join('+'), s.modifiers.map((m) => `${m.code}:${m.fingers.join('+')}`).join(','), s.dead,
]);

describe('FINGERS', () => {
  it('diez dedos con mano y nombre en español', () => {
    assert.deepEqual(FINGERS.map((f) => f.id), [
      'left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-thumb',
      'right-thumb', 'right-index', 'right-middle', 'right-ring', 'right-pinky',
    ]);
    assert.deepEqual(FINGERS.find((f) => f.id === 'right-pinky'), { id: 'right-pinky', hand: 'right', name: 'meñique derecho' });
    assert.equal(FINGERS.find((f) => f.id === 'left-index').name, 'índice izquierdo');
  });
});

describe('KEYBOARD_ROWS: distribución española de España (ISO)', () => {
  it('fila numérica con º, ¡ y la tecla del apóstrofo', () => {
    assert.deepEqual(codesOf(0), [
      'Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
      'Digit0', 'Minus', 'Equal', 'Backspace',
    ]);
    assert.deepEqual([getKey('Backquote').base, getKey('Minus').base, getKey('Equal').base], ['º', "'", '¡']);
  });

  it('fila superior con Q W E R T Y U I O P y las teclas del acento grave y +', () => {
    assert.deepEqual(codesOf(1), ['Tab', ...letters('QWERTYUIOP'), 'BracketLeft', 'BracketRight', 'Enter']);
  });

  it('fila central con A S D F G H J K L Ñ, la tecla del acento agudo y Ç', () => {
    assert.deepEqual(codesOf(2), ['CapsLock', ...letters('ASDFGHJKL'), 'Semicolon', 'Quote', 'Backslash', 'EnterContinuation']);
    assert.deepEqual([getKey('Semicolon').base, getKey('Semicolon').shift], ['ñ', 'Ñ']);
    assert.equal(getKey('Backslash').base, 'ç');
  });

  it('fila inferior ISO con la tecla < > junto a la Mayús izquierda', () => {
    assert.deepEqual(codesOf(3), ['ShiftLeft', 'IntlBackslash', ...letters('ZXCVBNM'), 'Comma', 'Period', 'Slash', 'ShiftRight']);
    assert.deepEqual([getKey('Slash').base, getKey('Slash').shift], ['-', '_']);
  });

  it('fila inferior de control con barra espaciadora y AltGr', () => {
    assert.deepEqual(codesOf(4), [
      'ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight',
    ]);
    assert.equal(getKey('AltRight').label, 'AltGr');
  });

  it('todas las filas miden lo mismo (15 unidades) y los códigos no se repiten', () => {
    for (const row of KEYBOARD_ROWS) {
      assert.equal(row.reduce((sum, k) => sum + k.width, 0), 15);
    }
    const codes = KEYBOARD_ROWS.flat().map((k) => k.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it('las teclas muertas del español son ´ ¨ y ` ^', () => {
    assert.deepEqual(getKey('Quote').dead, { base: '́', shift: '̈' });
    assert.deepEqual(getKey('BracketLeft').dead, { base: '̀', shift: '̂' });
  });

  it('getKey devuelve null con códigos desconocidos', () => {
    assert.equal(getKey('KeyÑ'), null);
  });

  it('el modelo está congelado', () => {
    assert.ok(Object.isFrozen(KEYBOARD_ROWS));
    assert.ok(Object.isFrozen(KEYBOARD_ROWS[0][0]));
  });
});

describe('dedos: teclas de referencia y filas', () => {
  it('posición de reposo: A S D F con la mano izquierda y J K L Ñ con la derecha', () => {
    assert.deepEqual(HOME_KEYS, {
      'left-pinky': 'KeyA', 'left-ring': 'KeyS', 'left-middle': 'KeyD', 'left-index': 'KeyF',
      'right-index': 'KeyJ', 'right-middle': 'KeyK', 'right-ring': 'KeyL', 'right-pinky': 'Semicolon',
    });
    for (const [finger, code] of Object.entries(HOME_KEYS)) {
      assert.equal(getKey(code).finger, finger, code);
      assert.equal(getKey(code).home, true, code);
    }
  });

  it('índices sobre F y J (G y H también con los índices)', () => {
    assert.equal(getKey('KeyF').finger, 'left-index');
    assert.equal(getKey('KeyG').finger, 'left-index');
    assert.equal(getKey('KeyH').finger, 'right-index');
    assert.equal(getKey('KeyJ').finger, 'right-index');
  });

  it('las columnas de la fila superior e inferior siguen al dedo de la fila central', () => {
    const expected = {
      'left-pinky': ['KeyQ', 'KeyZ', 'IntlBackslash', 'Digit1'],
      'left-ring': ['KeyW', 'KeyX', 'Digit2'],
      'left-middle': ['KeyE', 'KeyC', 'Digit3'],
      'left-index': ['KeyR', 'KeyT', 'KeyV', 'KeyB', 'Digit4', 'Digit5'],
      'right-index': ['KeyY', 'KeyU', 'KeyN', 'KeyM', 'Digit6', 'Digit7'],
      'right-middle': ['KeyI', 'Comma', 'Digit8'],
      'right-ring': ['KeyO', 'Period', 'Digit9'],
      'right-pinky': ['KeyP', 'BracketLeft', 'BracketRight', 'Quote', 'Backslash', 'Slash', 'Digit0', 'Minus', 'Equal'],
    };
    for (const [finger, codes] of Object.entries(expected)) {
      for (const code of codes) assert.equal(getKey(code).finger, finger, code);
    }
  });

  it('barra espaciadora con los pulgares', () => {
    assert.deepEqual(getKey('Space').fingers, ['left-thumb', 'right-thumb']);
  });
});

describe('resolveCharacter: teclas simples', () => {
  it('letras de la fila central con su dedo de reposo', () => {
    assert.deepEqual(steps('a'), [['KeyA', 'left-pinky', '', false]]);
    assert.deepEqual(steps('f'), [['KeyF', 'left-index', '', false]]);
    assert.deepEqual(steps('j'), [['KeyJ', 'right-index', '', false]]);
    assert.deepEqual(steps('ñ'), [['Semicolon', 'right-pinky', '', false]]);
  });

  it('espacio con los pulgares', () => {
    assert.deepEqual(steps(' '), [['Space', 'left-thumb+right-thumb', '', false]]);
  });

  it('números y signos sin modificador', () => {
    assert.deepEqual(steps('5'), [['Digit5', 'left-index', '', false]]);
    assert.deepEqual(steps(','), [['Comma', 'right-middle', '', false]]);
    assert.deepEqual(steps('.'), [['Period', 'right-ring', '', false]]);
    assert.deepEqual(steps('-'), [['Slash', 'right-pinky', '', false]]);
    assert.deepEqual(steps('¡'), [['Equal', 'right-pinky', '', false]]);
  });
});

describe('resolveCharacter: Mayúsculas (Shift de la mano contraria)', () => {
  it('letra de la mano izquierda: Mayús derecha', () => {
    assert.deepEqual(steps('A'), [['KeyA', 'left-pinky', 'ShiftRight:right-pinky', false]]);
  });

  it('letra de la mano derecha: Mayús izquierda', () => {
    assert.deepEqual(steps('Ñ'), [['Semicolon', 'right-pinky', 'ShiftLeft:left-pinky', false]]);
    assert.deepEqual(steps('M'), [['KeyM', 'right-index', 'ShiftLeft:left-pinky', false]]);
  });

  it('signos con Mayús: ¿ ? ! ; : _', () => {
    assert.deepEqual(steps('¿'), [['Equal', 'right-pinky', 'ShiftLeft:left-pinky', false]]);
    assert.deepEqual(steps('?'), [['Minus', 'right-pinky', 'ShiftLeft:left-pinky', false]]);
    assert.deepEqual(steps('!'), [['Digit1', 'left-pinky', 'ShiftRight:right-pinky', false]]);
    assert.deepEqual(steps(';'), [['Comma', 'right-middle', 'ShiftLeft:left-pinky', false]]);
    assert.deepEqual(steps(':'), [['Period', 'right-ring', 'ShiftLeft:left-pinky', false]]);
  });

  it('AltGr con el pulgar derecho: @ y €', () => {
    assert.deepEqual(steps('@'), [['Digit2', 'left-ring', 'AltRight:right-thumb', false]]);
    assert.deepEqual(steps('€'), [['KeyE', 'left-middle', 'AltRight:right-thumb', false]]);
  });
});

describe('resolveCharacter: acentos con teclas muertas', () => {
  it('á: tecla muerta del acento agudo y después A', () => {
    assert.deepEqual(steps('á'), [['Quote', 'right-pinky', '', true], ['KeyA', 'left-pinky', '', false]]);
  });

  it('todas las vocales con tilde, en minúscula y en mayúscula', () => {
    for (const [char, code] of [['é', 'KeyE'], ['í', 'KeyI'], ['ó', 'KeyO'], ['ú', 'KeyU']]) {
      assert.deepEqual(steps(char).map((s) => s[0]), ['Quote', code], char);
    }
    assert.deepEqual(steps('É'), [['Quote', 'right-pinky', '', true], ['KeyE', 'left-middle', 'ShiftRight:right-pinky', false]]);
  });

  it('ü: diéresis con Mayús y después U', () => {
    assert.deepEqual(steps('ü'), [['Quote', 'right-pinky', 'ShiftLeft:left-pinky', true], ['KeyU', 'right-index', '', false]]);
  });

  it('à y â con la tecla del acento grave', () => {
    assert.deepEqual(steps('à').map((s) => [s[0], s[3]]), [['BracketLeft', true], ['KeyA', false]]);
    assert.deepEqual(steps('â')[0], ['BracketLeft', 'right-pinky', 'ShiftLeft:left-pinky', true]);
  });

  it('acepta la forma descompuesta (NFD) igual que la compuesta', () => {
    assert.deepEqual(resolveCharacter('á').steps, resolveCharacter('á').steps);
  });

  it('ñ y ç son teclas propias, no combinaciones con tecla muerta', () => {
    assert.equal(resolveCharacter('ñ').steps.length, 1);
    assert.equal(resolveCharacter('ç').steps.length, 1);
  });
});

describe('resolveCharacter: combinaciones no fiables', () => {
  it('caracteres sin posición conocida devuelven una indicación genérica', () => {
    for (const char of ['ń', 'ß', '😀', 'ž', '\t']) {
      const result = resolveCharacter(char);
      assert.equal(result.known, false, char);
      assert.deepEqual(result.steps, [], char);
    }
  });

  it('entradas no válidas no lanzan', () => {
    for (const value of ['', 'ab', null, undefined, 7]) {
      assert.equal(resolveCharacter(value).known, false, String(value));
    }
  });
});

describe('involvedFingers', () => {
  it('separa el dedo principal de los dedos de los modificadores', () => {
    assert.deepEqual(involvedFingers(resolveCharacter('A')), { primary: ['left-pinky'], modifier: ['right-pinky'] });
    assert.deepEqual(involvedFingers(resolveCharacter('a')), { primary: ['left-pinky'], modifier: [] });
  });

  it('con teclas muertas incluye los dedos de todos los pasos', () => {
    assert.deepEqual(involvedFingers(resolveCharacter('á')), { primary: ['right-pinky', 'left-pinky'], modifier: [] });
  });

  it('sin resolución, ningún dedo', () => {
    assert.deepEqual(involvedFingers(resolveCharacter('ń')), { primary: [], modifier: [] });
  });
});

describe('describeResolution', () => {
  const describe1 = (char) => describeResolution(resolveCharacter(char));

  it('tecla simple', () => {
    assert.equal(describe1('ñ'), 'Pulsa Ñ con el meñique derecho.');
    assert.equal(describe1('f'), 'Pulsa F con el índice izquierdo.');
    assert.equal(describe1(','), 'Pulsa , con el corazón derecho.');
  });

  it('espacio', () => {
    assert.equal(describe1(' '), 'Pulsa espacio con el pulgar.');
  });

  it('Mayúsculas y AltGr', () => {
    assert.equal(describe1('A'), 'Mantén Mayús con el meñique derecho y pulsa A con el meñique izquierdo.');
    assert.equal(describe1('¿'), 'Mantén Mayús con el meñique izquierdo y pulsa ¿ con el meñique derecho.');
    assert.equal(describe1('@'), 'Mantén AltGr con el pulgar derecho y pulsa @ con el anular izquierdo.');
  });

  it('tecla muerta en dos pasos', () => {
    assert.equal(describe1('á'),
      'Pulsa la tilde (´) con el meñique derecho y después A con el meñique izquierdo.');
    assert.equal(describe1('É'),
      'Pulsa la tilde (´) con el meñique derecho y después mantén Mayús con el meñique derecho y pulsa E con el corazón izquierdo.');
    assert.equal(describe1('ü'),
      'Mantén Mayús con el meñique izquierdo y pulsa la diéresis (¨) con el meñique derecho; después pulsa U con el índice derecho.');
  });

  it('indicación genérica cuando no se conoce la posición', () => {
    assert.equal(describe1('ń'), 'Busca «ń» en tu teclado.');
  });

  it('retroceso para corregir', () => {
    assert.equal(describeResolution(resolveBackspace()), 'Corrige los errores: pulsa Retroceso con el meñique derecho.');
    assert.deepEqual(resolveBackspace().steps.map((s) => s.code), ['Backspace']);
  });
});

describe('guideTarget', () => {
  const state = (typed, extra = {}) => ({ text: 'ab cd', typed, status: typed ? 'running' : 'idle', ...extra });

  it('el objetivo es el siguiente carácter esperado según el estado del motor', () => {
    assert.deepEqual(guideTarget(state(''), { blocked: false }), { kind: 'char', char: 'a' });
    assert.deepEqual(guideTarget(state('ab'), { blocked: false }), { kind: 'char', char: ' ' });
  });

  it('cambia con el retroceso', () => {
    assert.deepEqual(guideTarget(state('abx'), { blocked: false }), { kind: 'char', char: 'c' });
    assert.deepEqual(guideTarget(state('ab'), { blocked: false }), { kind: 'char', char: ' ' });
  });

  it('con el fragmento bloqueado por errores (estricto) indica Retroceso', () => {
    assert.deepEqual(guideTarget(state('ax '), { blocked: true }), { kind: 'backspace' });
  });

  it('al terminar no hay objetivo', () => {
    assert.equal(guideTarget(state('ab cd', { status: 'finished' }), { blocked: false }), null);
  });

  it('no modifica el estado recibido', () => {
    const frozen = deepFreeze(state('ab'));
    const snapshot = structuredClone(frozen);
    guideTarget(frozen, { blocked: false });
    assert.deepEqual(frozen, snapshot);
  });
});

describe('catálogo real', () => {
  it('todos los caracteres de los ejercicios tienen una posición conocida en el teclado español', async () => {
    const { readFileSync } = await import('node:fs');
    const { exercises } = JSON.parse(readFileSync(new URL('../data/exercises.json', import.meta.url), 'utf8'));
    const chars = new Set(exercises.flatMap((e) => [...e.text]));
    const unknown = [...chars].filter((c) => !resolveCharacter(c).known);
    assert.deepEqual(unknown, []);
  });
});

describe('keyLegend', () => {
  it('letras en mayúscula y Ñ como tecla propia', () => {
    assert.deepEqual(keyLegend(getKey('KeyA')), { top: '', bottom: 'A' });
    assert.deepEqual(keyLegend(getKey('Semicolon')), { top: '', bottom: 'Ñ' });
  });

  it('signos con Mayús arriba y carácter base abajo', () => {
    assert.deepEqual(keyLegend(getKey('Digit1')), { top: '!', bottom: '1' });
    assert.deepEqual(keyLegend(getKey('Equal')), { top: '¿', bottom: '¡' });
    assert.deepEqual(keyLegend(getKey('Comma')), { top: ';', bottom: ',' });
  });

  it('teclas muertas con sus acentos visibles', () => {
    assert.deepEqual(keyLegend(getKey('Quote')), { top: '¨', bottom: '´' });
    assert.deepEqual(keyLegend(getKey('BracketLeft')), { top: '^', bottom: '`' });
  });

  it('teclas especiales con su nombre y la barra sin rótulo', () => {
    assert.deepEqual(keyLegend(getKey('ShiftLeft')), { top: '', bottom: 'Mayús' });
    assert.deepEqual(keyLegend(getKey('Space')), { top: '', bottom: '' });
    assert.deepEqual(keyLegend(getKey('EnterContinuation')), { top: '', bottom: '' });
  });
});

describe('guideHighlights', () => {
  it('tecla objetivo y dedo principal', () => {
    assert.deepEqual(guideHighlights(resolveCharacter('ñ')), {
      targetCodes: ['Semicolon'], modifierCodes: [], primaryFingers: ['right-pinky'], modifierFingers: [],
    });
  });

  it('con Mayús resalta también la tecla y el dedo del modificador', () => {
    assert.deepEqual(guideHighlights(resolveCharacter('A')), {
      targetCodes: ['KeyA'], modifierCodes: ['ShiftRight'], primaryFingers: ['left-pinky'], modifierFingers: ['right-pinky'],
    });
  });

  it('con tecla muerta resalta ambas teclas en orden', () => {
    assert.deepEqual(guideHighlights(resolveCharacter('á')).targetCodes, ['Quote', 'KeyA']);
  });

  it('espacio: barra y los dos pulgares', () => {
    assert.deepEqual(guideHighlights(resolveCharacter(' ')).primaryFingers, ['left-thumb', 'right-thumb']);
  });

  it('sin resolución no resalta nada (indicación genérica)', () => {
    assert.deepEqual(guideHighlights(resolveCharacter('ń')), {
      targetCodes: [], modifierCodes: [], primaryFingers: [], modifierFingers: [],
    });
  });
});

describe('isWrongInsertion', () => {
  const s = (typed) => ({ text: 'ab cd', typed });

  it('detecta un carácter incorrecto recién insertado', () => {
    assert.equal(isWrongInsertion(s('a'), s('ax')), true);
  });

  it('un carácter correcto, un retroceso o una entrada rechazada no son error', () => {
    assert.equal(isWrongInsertion(s('a'), s('ab')), false);
    assert.equal(isWrongInsertion(s('ax'), s('a')), false);
    const same = s('a');
    assert.equal(isWrongInsertion(same, same), false);
  });
});

describe('ayudas visuales: modos y valores por defecto', () => {
  it('tres modos: teclado y manos, solo teclado y sin ayudas', () => {
    assert.deepEqual(HELP_MODES, ['full', 'keyboard', 'none']);
  });

  it('por defecto: teclado y manos en ejercicios; ocultas en práctica libre', () => {
    assert.deepEqual(DEFAULT_HELP_MODES, { exercise: 'full', free: 'none' });
  });

  it('Academia y Biblioteca comparten el contexto de ejercicios', () => {
    assert.equal(helpContext({ origin: 'academy' }), 'exercise');
    assert.equal(helpContext({ origin: 'library' }), 'exercise');
    assert.equal(helpContext({ origin: 'free' }), 'free');
  });

  it('sin partida: la preparación de la práctica libre usa su contexto; el resto, el de ejercicios', () => {
    assert.equal(helpContext({ origin: null, screen: 'setup' }), 'free');
    assert.equal(helpContext({ origin: null, screen: 'academy' }), 'exercise');
  });

  it('recuerda la posición de reposo solo en las lecciones introductorias (niveles 1 y 2)', () => {
    assert.equal(showsRestReminder({ level: 1 }), true);
    assert.equal(showsRestReminder({ level: 2 }), true);
    assert.equal(showsRestReminder({ level: 3 }), false);
    assert.equal(showsRestReminder(null), false);
  });
});

// --- T10: entradas físicas que exige cada carácter (validación del currículo) ---------

describe('requiredInputs', () => {
  it('una letra exige solo su tecla física', () => {
    assert.deepEqual(requiredInputs('a'), ['KeyA']);
    assert.deepEqual(requiredInputs('ñ'), ['Semicolon']);
    assert.deepEqual(requiredInputs(' '), ['Space']);
  });

  it('las mayúsculas exigen además la Mayús de la mano contraria', () => {
    assert.deepEqual(requiredInputs('A'), ['KeyA', 'ShiftRight']);
    assert.deepEqual(requiredInputs('Ñ'), ['Semicolon', 'ShiftLeft']);
  });

  it('los acentos exigen la tecla muerta y la habilidad correspondiente, no solo el carácter visible', () => {
    assert.deepEqual(requiredInputs('á'), ['Quote', 'acute', 'KeyA']);
    assert.deepEqual(requiredInputs('Á'), ['Quote', 'acute', 'KeyA', 'ShiftRight']);
    assert.deepEqual(requiredInputs('ü'), ['Quote', 'ShiftLeft', 'diaeresis', 'KeyU']);
  });

  it('AltGr y signos con Mayús', () => {
    assert.deepEqual(requiredInputs('@'), ['Digit2', 'AltRight']);
    assert.deepEqual(requiredInputs('¿'), ['Equal', 'ShiftLeft']);
    assert.deepEqual(requiredInputs('!'), ['Digit1', 'ShiftRight']);
  });

  it('un carácter sin posición conocida devuelve null', () => {
    assert.equal(requiredInputs('ń'), null);
    assert.equal(requiredInputs(''), null);
  });
});

describe('isValidInputToken', () => {
  it('acepta códigos de teclas reales y habilidades de tecla muerta', () => {
    for (const token of ['KeyA', 'Space', 'Semicolon', 'ShiftLeft', 'AltRight', 'Digit0', 'acute', 'diaeresis']) {
      assert.equal(isValidInputToken(token), true, token);
    }
  });

  it('rechaza caracteres visibles, códigos inexistentes y la parte visual del Intro', () => {
    for (const token of ['a', 'ñ', 'KeyÑ', 'EnterContinuation', '', null, 'tilde']) {
      assert.equal(isValidInputToken(token), false, String(token));
    }
  });
});
