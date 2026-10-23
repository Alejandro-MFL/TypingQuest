// Modelo del teclado español de España (QWERTY ISO) y de la posición de los
// dedos. Módulo PURO: sin DOM.
//
// Distingue cinco cosas para cada carácter que hay que escribir:
//   1. el carácter objetivo (lo que espera el motor),
//   2. la tecla física (`KeyboardEvent.code`, independiente de la distribución),
//   3. los modificadores necesarios (Mayús, AltGr) o una tecla muerta previa,
//   4. el dedo recomendado y 5. su mano.
// `code` identifica posiciones físicas, pero NO resuelve por sí solo los acentos
// ni las combinaciones: eso lo hace resolveCharacter con este modelo. Si un
// carácter no se puede resolver con fiabilidad se devuelve `known: false` para
// mostrar una indicación genérica en lugar de una posición incorrecta.

export const FINGERS = Object.freeze([
  Object.freeze({ id: 'left-pinky', hand: 'left', name: 'meñique izquierdo' }),
  Object.freeze({ id: 'left-ring', hand: 'left', name: 'anular izquierdo' }),
  Object.freeze({ id: 'left-middle', hand: 'left', name: 'corazón izquierdo' }),
  Object.freeze({ id: 'left-index', hand: 'left', name: 'índice izquierdo' }),
  Object.freeze({ id: 'left-thumb', hand: 'left', name: 'pulgar izquierdo' }),
  Object.freeze({ id: 'right-thumb', hand: 'right', name: 'pulgar derecho' }),
  Object.freeze({ id: 'right-index', hand: 'right', name: 'índice derecho' }),
  Object.freeze({ id: 'right-middle', hand: 'right', name: 'corazón derecho' }),
  Object.freeze({ id: 'right-ring', hand: 'right', name: 'anular derecho' }),
  Object.freeze({ id: 'right-pinky', hand: 'right', name: 'meñique derecho' }),
]);

const FINGER_BY_ID = new Map(FINGERS.map((f) => [f.id, f]));

// Teclas de reposo: cada dedo (salvo los pulgares) sobre la fila central.
export const HOME_KEYS = Object.freeze({
  'left-pinky': 'KeyA', 'left-ring': 'KeyS', 'left-middle': 'KeyD', 'left-index': 'KeyF',
  'right-index': 'KeyJ', 'right-middle': 'KeyK', 'right-ring': 'KeyL', 'right-pinky': 'Semicolon',
});
const HOME_CODES = new Set(Object.values(HOME_KEYS));

// Marcas combinantes de las teclas muertas.
const ACUTE = '́';
const GRAVE = '̀';
const DIAERESIS = '̈';
const CIRCUMFLEX = '̂';
// Glifo y nombre de cada tecla muerta para las indicaciones.
const DEAD_NAMES = Object.freeze({
  [ACUTE]: 'la tilde (´)',
  [DIAERESIS]: 'la diéresis (¨)',
  [GRAVE]: 'el acento grave (`)',
  [CIRCUMFLEX]: 'el acento circunflejo (^)',
});
// Habilidad de cada tecla muerta, para validar qué se ha enseñado en el currículo.
const DEAD_KINDS = Object.freeze({ [ACUTE]: 'acute', [DIAERESIS]: 'diaeresis', [GRAVE]: 'grave', [CIRCUMFLEX]: 'circumflex' });
// Vocales que las teclas muertas del español combinan de forma fiable.
const DEAD_COMBINABLE = new Set([...'aeiouAEIOU']);

const P = { lp: ['left-pinky'], lr: ['left-ring'], lm: ['left-middle'], li: ['left-index'],
  ri: ['right-index'], rm: ['right-middle'], rr: ['right-ring'], rp: ['right-pinky'], rt: ['right-thumb'] };

// Tecla: código físico, ancho en unidades, dedos y, si escribe algo, sus caracteres
// (base, con Mayús y con AltGr) o la marca de su tecla muerta.
function key(code, width, fingers, chars = {}) {
  return Object.freeze({
    code,
    width,
    fingers: Object.freeze([...(fingers ?? [])]),
    finger: fingers && fingers.length === 1 ? fingers[0] : null,
    home: HOME_CODES.has(code),
    base: chars.base ?? null,
    shift: chars.shift ?? null,
    altGr: chars.altGr ?? null,
    dead: chars.dead ? Object.freeze({ ...chars.dead }) : null,
    label: chars.label ?? null,
  });
}

function letter(char, fingers, altGr) {
  return key(`Key${char}`, 1, fingers, { base: char.toLowerCase(), shift: char, altGr });
}

/** Filas del teclado ISO español, de la numérica a la de control (15 unidades cada una). */
export const KEYBOARD_ROWS = Object.freeze([
  Object.freeze([
    key('Backquote', 1, P.lp, { base: 'º', shift: 'ª', altGr: '\\' }),
    key('Digit1', 1, P.lp, { base: '1', shift: '!', altGr: '|' }),
    key('Digit2', 1, P.lr, { base: '2', shift: '"', altGr: '@' }),
    key('Digit3', 1, P.lm, { base: '3', shift: '·', altGr: '#' }),
    key('Digit4', 1, P.li, { base: '4', shift: '$', altGr: '~' }),
    key('Digit5', 1, P.li, { base: '5', shift: '%' }),
    key('Digit6', 1, P.ri, { base: '6', shift: '&', altGr: '¬' }),
    key('Digit7', 1, P.ri, { base: '7', shift: '/' }),
    key('Digit8', 1, P.rm, { base: '8', shift: '(' }),
    key('Digit9', 1, P.rr, { base: '9', shift: ')' }),
    key('Digit0', 1, P.rp, { base: '0', shift: '=' }),
    key('Minus', 1, P.rp, { base: "'", shift: '?' }),
    key('Equal', 1, P.rp, { base: '¡', shift: '¿' }),
    key('Backspace', 2, P.rp, { label: 'Retroceso' }),
  ]),
  Object.freeze([
    key('Tab', 1.5, P.lp, { label: 'Tab' }),
    letter('Q', P.lp), letter('W', P.lr), letter('E', P.lm, '€'), letter('R', P.li), letter('T', P.li),
    letter('Y', P.ri), letter('U', P.ri), letter('I', P.rm), letter('O', P.rr), letter('P', P.rp),
    key('BracketLeft', 1, P.rp, { dead: { base: GRAVE, shift: CIRCUMFLEX }, altGr: '[' }),
    key('BracketRight', 1, P.rp, { base: '+', shift: '*', altGr: ']' }),
    key('Enter', 1.5, P.rp, { label: 'Intro' }),
  ]),
  Object.freeze([
    key('CapsLock', 1.75, P.lp, { label: 'Bloq' }),
    letter('A', P.lp), letter('S', P.lr), letter('D', P.lm), letter('F', P.li), letter('G', P.li),
    letter('H', P.ri), letter('J', P.ri), letter('K', P.rm), letter('L', P.rr),
    key('Semicolon', 1, P.rp, { base: 'ñ', shift: 'Ñ' }),
    key('Quote', 1, P.rp, { dead: { base: ACUTE, shift: DIAERESIS }, altGr: '{' }),
    key('Backslash', 1, P.rp, { base: 'ç', shift: 'Ç', altGr: '}' }),
    // Parte inferior de la tecla Intro ISO (solo visual: no es un código real).
    key('EnterContinuation', 1.25, P.rp, {}),
  ]),
  Object.freeze([
    key('ShiftLeft', 1.25, P.lp, { label: 'Mayús' }),
    key('IntlBackslash', 1, P.lp, { base: '<', shift: '>' }),
    letter('Z', P.lp), letter('X', P.lr), letter('C', P.lm), letter('V', P.li), letter('B', P.li),
    letter('N', P.ri), letter('M', P.ri),
    key('Comma', 1, P.rm, { base: ',', shift: ';' }),
    key('Period', 1, P.rr, { base: '.', shift: ':' }),
    key('Slash', 1, P.rp, { base: '-', shift: '_' }),
    key('ShiftRight', 2.75, P.rp, { label: 'Mayús' }),
  ]),
  Object.freeze([
    key('ControlLeft', 1.25, null, { label: 'Ctrl' }),
    key('MetaLeft', 1.25, null, { label: 'Win' }),
    key('AltLeft', 1.25, null, { label: 'Alt' }),
    key('Space', 6.25, ['left-thumb', 'right-thumb'], { base: ' ', label: 'Espacio' }),
    key('AltRight', 1.25, P.rt, { label: 'AltGr' }),
    key('MetaRight', 1.25, null, { label: 'Win' }),
    key('ContextMenu', 1.25, null, { label: 'Menú' }),
    key('ControlRight', 1.25, null, { label: 'Ctrl' }),
  ]),
]);

const KEY_BY_CODE = new Map(KEYBOARD_ROWS.flat().map((k) => [k.code, k]));

/** Tecla del modelo para un `KeyboardEvent.code`, o null. */
export function getKey(code) {
  return KEY_BY_CODE.get(code) ?? null;
}

// Carácter → { code, shift, altGr } para todo lo que se escribe con una sola tecla.
const CHAR_TO_KEY = (() => {
  const map = new Map();
  for (const k of KEY_BY_CODE.values()) {
    if (k.base !== null) map.set(k.base, { code: k.code, shift: false, altGr: false });
    if (k.shift !== null) map.set(k.shift, { code: k.code, shift: true, altGr: false });
    if (k.altGr !== null) map.set(k.altGr, { code: k.code, shift: false, altGr: true });
  }
  return map;
})();

// Marca combinante → tecla muerta que la produce.
const DEAD_TO_KEY = (() => {
  const map = new Map();
  for (const k of KEY_BY_CODE.values()) {
    if (!k.dead) continue;
    map.set(k.dead.base, { code: k.code, shift: false, altGr: false });
    map.set(k.dead.shift, { code: k.code, shift: true, altGr: false });
  }
  return map;
})();

function handOf(fingers) {
  return FINGER_BY_ID.get(fingers[0])?.hand ?? null;
}

// Mayús de la mano contraria a la que pulsa la tecla; AltGr con el pulgar derecho.
function modifiersFor({ code, shift, altGr }) {
  const fingers = getKey(code).fingers;
  const modifiers = [];
  if (shift) {
    const shiftCode = handOf(fingers) === 'left' ? 'ShiftRight' : 'ShiftLeft';
    modifiers.push({ code: shiftCode, fingers: [...getKey(shiftCode).fingers] });
  }
  if (altGr) modifiers.push({ code: 'AltRight', fingers: [...getKey('AltRight').fingers] });
  return modifiers;
}

// Paso: una tecla física con sus modificadores. `label` es lo que se nombra en la ayuda.
function step(keyRef, { dead = false, deadKind = null, label }) {
  return {
    code: keyRef.code, fingers: [...getKey(keyRef.code).fingers], modifiers: modifiersFor(keyRef), dead, deadKind, label,
  };
}

function charLabel(char) {
  return char === ' ' ? 'espacio' : char.toUpperCase();
}

function unknown(char) {
  return { char: typeof char === 'string' ? char : '', known: false, steps: [] };
}

// Vocal con tilde, diéresis, grave o circunflejo: tecla muerta y después la vocal.
function resolveDeadKey(char) {
  const [baseChar, mark, ...rest] = [...char.normalize('NFD')];
  const dead = DEAD_TO_KEY.get(mark);
  const base = CHAR_TO_KEY.get(baseChar);
  if (rest.length > 0 || !dead || !base || !DEAD_COMBINABLE.has(baseChar)) return unknown(char);
  return {
    char,
    known: true,
    steps: [
      step(dead, { dead: true, deadKind: DEAD_KINDS[mark], label: DEAD_NAMES[mark] }),
      step(base, { label: charLabel(baseChar) }),
    ],
  };
}

/**
 * Cómo escribir un carácter en el teclado español: pasos con tecla física,
 * modificadores, dedos y si la tecla es muerta. Nunca lanza.
 * @returns {{ char: string, known: boolean, steps: { code: string, fingers: string[],
 *   modifiers: { code: string, fingers: string[] }[], dead: boolean, label: string }[] }}
 */
export function resolveCharacter(char) {
  if (typeof char !== 'string') return unknown(char);
  const normalized = char.normalize('NFC');
  if ([...normalized].length !== 1) return unknown(normalized);
  const direct = CHAR_TO_KEY.get(normalized);
  if (direct) {
    const label = direct.shift || direct.altGr ? normalized : charLabel(normalized);
    return { char: normalized, known: true, steps: [step(direct, { label })] };
  }
  return resolveDeadKey(normalized);
}

/** Resolución para corregir con la tecla Retroceso (modo estricto bloqueado). */
export function resolveBackspace() {
  return {
    char: '\b',
    known: true,
    backspace: true,
    steps: [{
      code: 'Backspace', fingers: [...getKey('Backspace').fingers], modifiers: [], dead: false, deadKind: null, label: 'Retroceso',
    }],
  };
}

/** Dedos que pulsan teclas (primary) y dedos que mantienen modificadores (modifier). */
export function involvedFingers(resolution) {
  const primary = [];
  const modifier = [];
  for (const s of resolution.steps) {
    for (const f of s.fingers) if (!primary.includes(f)) primary.push(f);
    for (const m of s.modifiers) for (const f of m.fingers) if (!modifier.includes(f)) modifier.push(f);
  }
  return { primary, modifier };
}

function fingerName(fingers) {
  return fingers.length > 1 ? 'pulgar' : FINGER_BY_ID.get(fingers[0]).name;
}

const MODIFIER_NAMES = Object.freeze({ ShiftLeft: 'Mayús', ShiftRight: 'Mayús', AltRight: 'AltGr' });

function pressPhrase(s, verb = 'pulsa ') {
  const press = `${verb}${s.label} con el ${fingerName(s.fingers)}`;
  if (s.modifiers.length === 0) return press;
  const held = s.modifiers.map((m) => `${MODIFIER_NAMES[m.code]} con el ${fingerName(m.fingers)}`).join(' y ');
  return `mantén ${held} y pulsa ${s.label} con el ${fingerName(s.fingers)}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Indicación breve en español, p. ej. «Pulsa Ñ con el meñique derecho.». */
export function describeResolution(resolution) {
  if (resolution.backspace) return 'Corrige los errores: pulsa Retroceso con el meñique derecho.';
  if (!resolution.known) return `Busca «${resolution.char}» en tu teclado.`;
  const [first, second] = resolution.steps;
  if (!second) return `${capitalize(pressPhrase(first))}.`;
  // Tras un primer paso sin modificadores basta con nombrar la tecla («y después A con…»).
  const then = first.modifiers.length > 0 ? '; después ' : ' y después ';
  const secondVerb = first.modifiers.length > 0 ? 'pulsa ' : '';
  return `${capitalize(pressPhrase(first))}${then}${pressPhrase(second, secondVerb)}.`;
}

/**
 * Qué debe pulsar ahora el alumno, a partir del estado del motor (sin mutarlo):
 * el siguiente carácter esperado, Retroceso si el fragmento está bloqueado por
 * errores (modo estricto) o null si la partida ha terminado.
 */
export function guideTarget(state, { blocked }) {
  if (state.status === 'finished') return null;
  if (blocked) return { kind: 'backspace' };
  const char = state.text[state.typed.length];
  return char === undefined ? null : { kind: 'char', char };
}

// Glifos visibles de las teclas muertas en el teclado dibujado.
const DEAD_GLYPHS = Object.freeze({ [ACUTE]: '´', [DIAERESIS]: '¨', [GRAVE]: '`', [CIRCUMFLEX]: '^' });

/**
 * Rótulos de una tecla del teclado visual: arriba lo que escribe con Mayús (si
 * difiere de la letra) y abajo lo que escribe sin modificadores o su nombre.
 */
export function keyLegend(k) {
  if (k.dead) return { top: DEAD_GLYPHS[k.dead.shift], bottom: DEAD_GLYPHS[k.dead.base] };
  if (k.code === 'Space') return { top: '', bottom: '' };
  if (k.base === null) return { top: '', bottom: k.label ?? '' };
  const isLetter = k.shift === k.base.toUpperCase() && k.base !== k.shift;
  return isLetter ? { top: '', bottom: k.shift } : { top: k.shift ?? '', bottom: k.base };
}

/** Teclas y dedos que el teclado y las manos deben resaltar para una resolución. */
export function guideHighlights(resolution) {
  const { primary, modifier } = involvedFingers(resolution);
  return {
    targetCodes: resolution.steps.map((s) => s.code),
    modifierCodes: [...new Set(resolution.steps.flatMap((s) => s.modifiers.map((m) => m.code)))],
    primaryFingers: primary,
    modifierFingers: modifier,
  };
}

/** true si la entrada aceptada añadió un carácter que no coincide con el objetivo. */
export function isWrongInsertion(previous, next) {
  const index = next.typed.length - 1;
  return next.typed.length > previous.typed.length && next.typed[index] !== next.text[index];
}

// --- Ayudas visuales -----------------------------------------------------------------

/** 'full' = teclado y manos, 'keyboard' = solo teclado, 'none' = sin ayudas. */
export const HELP_MODES = Object.freeze(['full', 'keyboard', 'none']);
// Por defecto: ayudas completas en ejercicios (Academia y Biblioteca); ocultas en
// la práctica libre, donde el alumno puede activarlas.
export const DEFAULT_HELP_MODES = Object.freeze({ exercise: 'full', free: 'none' });

/** Contexto de la preferencia de ayudas: 'exercise' (catálogo) o 'free' (práctica libre). */
export function helpContext({ origin, screen = null }) {
  if (origin) return origin === 'free' ? 'free' : 'exercise';
  return screen === 'setup' ? 'free' : 'exercise';
}

/** Recordar la posición de reposo solo en las lecciones introductorias. */
export function showsRestReminder(exercise) {
  return exercise !== null && exercise !== undefined && exercise.level <= 2;
}

// --- Entradas físicas por carácter (validación del currículo, T10) -------------------

const INPUT_SKILLS = new Set(Object.values(DEAD_KINDS));

/**
 * Entradas que exige escribir un carácter: códigos de las teclas físicas (también
 * Mayús y AltGr) y, en los acentos, la habilidad de la tecla muerta ('acute',
 * 'diaeresis'…). No confunde el carácter visible con las teclas que lo producen.
 * null si el carácter no tiene una posición conocida.
 */
export function requiredInputs(char) {
  const resolution = resolveCharacter(char);
  if (!resolution.known) return null;
  return resolution.steps.flatMap((s) => [
    s.code, ...s.modifiers.map((m) => m.code), ...(s.deadKind ? [s.deadKind] : []),
  ]);
}

/** true si el token es un código de tecla real del modelo o una habilidad de tecla muerta. */
export function isValidInputToken(token) {
  if (INPUT_SKILLS.has(token)) return true;
  return typeof token === 'string' && token !== 'EnterContinuation' && getKey(token) !== null;
}
