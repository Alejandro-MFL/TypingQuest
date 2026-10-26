// Experiencia pedagógica (T14). Módulo PURO: sin DOM ni almacenamiento.
//
// - lessonIntro: dos o tres frases antes de una lección de la Academia (qué tecla
//   o habilidad, con qué dedo, desde qué tecla de reposo, qué se repasa y qué
//   intentar), a partir de `introduces`, del texto real y del modelo de T9.
// - fingerMoves / movementText: el recorrido recomendado del dedo para el
//   siguiente carácter («J → U → J»). Es una recomendación: el navegador no sabe
//   qué dedo se usa realmente. Las teclas de reposo y el espacio no se mueven.
// - Estado de las instrucciones vistas (introducción inicial y por lección).
import { FINGERS, HOME_KEYS, KEYBOARD_ROWS, getKey, keyLegend, resolveCharacter } from './keyboard.js';

const FINGER_NAMES = new Map(FINGERS.map((f) => [f.id, f.name]));
const ROW_OF = new Map(KEYBOARD_ROWS.flatMap((row, i) => row.map((k) => [k.code, i])));
const HOME_ROW = ROW_OF.get('KeyA');

/** Nombre de una tecla como aparece en el teclado español (o su nombre). */
export function keyName(code) {
  if (code === 'Space') return 'espacio';
  const key = getKey(code);
  if (!key) return code;
  return keyLegend(key).bottom || key.label || code;
}

// Movimiento de un dedo hasta `code` desde su tecla de reposo, o null si no se mueve.
function moveTo(finger, code) {
  const home = HOME_KEYS[finger];
  return home && home !== code ? { finger, from: home, to: code } : null;
}

/** Recorridos recomendados para una resolución: modificador y después cada tecla. */
export function fingerMoves(resolution) {
  if (!resolution?.known) return [];
  return resolution.steps.flatMap((s) => [
    ...s.modifiers.map((m) => (m.fingers.length === 1 ? moveTo(m.fingers[0], m.code) : null)),
    s.fingers.length === 1 ? moveTo(s.fingers[0], s.code) : null,
  ]).filter(Boolean);
}

/** «Movimiento: J → U → J», o '' si no hay que mover ningún dedo. */
export function movementText(resolution) {
  const moves = fingerMoves(resolution);
  if (moves.length === 0) return '';
  return `Movimiento: ${moves.map((m) => `${keyName(m.from)} → ${keyName(m.to)} → ${keyName(m.from)}`).join(' · ')}`;
}

// --- Introducciones por lección (CP1) -----------------------------------------------

const PUNCTUATION_NAMES = { Comma: ['la coma (,)', 'la coma'], Period: ['el punto (.)', 'el punto'], Slash: ['el guion (-)', 'el guion'] };

// «A, B y C»; con `more`, «A, B, C y otras…».
function joinList(items, more = '') {
  if (more) return `${items.join(', ')} y ${more}`;
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

function direction(finger, code) {
  const rows = ROW_OF.get(code) - HOME_ROW;
  if (rows === -2) return 'sube el dedo dos filas';
  if (rows === -1) return 'estira el dedo hacia arriba';
  if (rows === 1) return 'baja el dedo';
  return finger.endsWith('index') ? 'desplaza el dedo hacia el centro' : 'desplaza el dedo hacia fuera';
}

function keySentence(code, verb) {
  const finger = getKey(code).finger;
  const [name, shortName] = PUNCTUATION_NAMES[code] ?? [keyName(code), keyName(code)];
  const fingerName = FINGER_NAMES.get(finger);
  const home = HOME_KEYS[finger];
  if (home === code) {
    return `${verb} ${name} con el ${fingerName}: es su tecla de reposo, así que apoya el dedo sobre ella `
      + 'y no lo separes de la fila central.';
  }
  return `${verb} ${name} con el ${fingerName}: desde ${keyName(home)}, ${direction(finger, code)} hasta `
    + `${shortName} y vuelve a ${keyName(home)} tras cada pulsación.`;
}

function numbersSentence(tokens) {
  const digits = tokens.filter((t) => t.startsWith('Digit'));
  const names = digits.map(keyName);
  const first = FINGER_NAMES.get(getKey(digits[0]).finger);
  const last = FINGER_NAMES.get(getKey(digits.at(-1)).finger);
  return `Aprenderás los números ${joinList(names)}: cada uno lo pulsa el dedo de su columna (del ${names[0]} `
    + `con el ${first} al ${names.at(-1)} con el ${last}), subiendo dos filas desde la fila central y volviendo a ella.`;
}

const SKILL_SENTENCES = {
  posture: 'Aprenderás la posición de reposo: índices sobre F y J (tienen un pequeño relieve para encontrarlas '
    + 'sin mirar), los demás dedos sobre A S D y K L Ñ, y el espacio con el pulgar.',
  acute: 'Aprenderás a poner tildes: pulsa la tecla de la tilde (´), a la derecha de la Ñ, con el meñique derecho; '
    + 'suéltala y después pulsa la vocal.',
  diaeresis: 'Aprenderás la diéresis (ü): mantén Mayús con el meñique izquierdo, pulsa la tecla de la tilde con el '
    + 'meñique derecho, suelta ambas y pulsa la u.',
  ShiftRight: 'Aprenderás las mayúsculas de la mano izquierda: mantén la Mayús derecha con el meñique derecho '
    + 'mientras pulsas la letra con la otra mano.',
  ShiftLeft: 'Aprenderás las mayúsculas de la mano derecha: mantén la Mayús izquierda con el meñique izquierdo '
    + 'mientras pulsas la letra con la otra mano.',
  signs: 'Aprenderás los signos ¿ y ?: están en las dos teclas a la derecha del 0, se pulsan con el meñique derecho '
    + 'y se escriben manteniendo la Mayús izquierda (sin Mayús, la segunda escribe ¡).',
  AltRight: 'Aprenderás AltGr, a la derecha del espacio, con el pulgar derecho: mantenlo para escribir '
    + '@ (AltGr + 2) y € (AltGr + E).',
};

const SKILL_LABELS = {
  posture: 'Posición de reposo', acute: 'Tildes', diaeresis: 'Diéresis', ShiftRight: 'Mayúsculas',
  ShiftLeft: 'Mayúsculas', signs: 'Signos ¿ ?', AltRight: 'AltGr',
};

// Habilidad principal de una lección a partir de sus entradas nuevas.
function skillOf(tokens) {
  if (['KeyF', 'KeyJ', 'Space'].every((t) => tokens.includes(t))) return 'posture';
  for (const skill of ['acute', 'diaeresis', 'ShiftRight', 'ShiftLeft', 'AltRight']) if (tokens.includes(skill)) return skill;
  if (tokens.some((t) => t.startsWith('Digit'))) return 'digits';
  if (tokens.includes('Minus') || tokens.includes('Equal')) return 'signs';
  return tokens.length === 1 ? 'key' : 'review';
}

const LETTER_CODE = /^Key[A-Z]$|^Semicolon$/;

// Teclas de letra del texto, en orden de aparición.
function letterKeys(text) {
  const codes = [];
  for (const char of new Set(text.toLowerCase())) {
    const code = resolveCharacter(char).steps?.at(-1)?.code;
    if (code && LETTER_CODE.test(code) && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

// Signos sueltos y, agrupadas, las mayúsculas, las tildes y la diéresis del texto.
function specialsOf(text) {
  const chars = [...new Set(text)];
  const signs = chars.filter((c) => !/[a-zñáéíóúüA-ZÑÁÉÍÓÚÜ ]/.test(c)).slice(0, 6).map((c) => `«${c}»`);
  const groups = [[/[A-ZÑÁÉÍÓÚÜ]/, 'las mayúsculas'], [/[áéíóúÁÉÍÓÚ]/, 'las tildes'], [/[üÜ]/, 'la diéresis']]
    .filter(([pattern]) => chars.some((c) => pattern.test(c))).map(([, name]) => name);
  return [...signs, ...groups];
}

function reviewSentence(text) {
  const specials = specialsOf(text);
  if (specials.length > 0) {
    return `Sin teclas nuevas: repasarás ${joinList(specials)} junto con las letras que ya conoces; `
      + 'mira la guía si dudas de qué dedo usar.';
  }
  const letters = letterKeys(text);
  if (letters.length === 1) return keySentence(letters[0], 'Practicarás');
  const more = letters.length > 8 ? 'otras' : '';
  return `Sin teclas nuevas: repasarás ${joinList(letters.slice(0, 8).map(keyName), more)}; vuelve a la posición `
    + 'de reposo tras cada pulsación.';
}

function mainSentence(skill, tokens, text) {
  if (skill === 'digits') return numbersSentence(tokens);
  if (skill === 'key') return keySentence(tokens[0], 'Aprenderás a pulsar');
  if (skill === 'review') return reviewSentence(text);
  return SKILL_SENTENCES[skill];
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function skillLabel(skill, tokens, text) {
  if (skill === 'digits') {
    const digits = tokens.filter((t) => t.startsWith('Digit')).map(keyName);
    return `Números ${digits[0]}–${digits.at(-1)}`;
  }
  if (skill === 'key') return capitalize(PUNCTUATION_NAMES[tokens[0]]?.[1] ?? `Tecla ${keyName(tokens[0])}`);
  const letters = letterKeys(text);
  if (skill === 'review' && specialsOf(text).length === 0 && letters.length === 1) return `Tecla ${keyName(letters[0])}`;
  return SKILL_LABELS[skill] ?? 'Repaso';
}

function goalSentence(exercise) {
  const wpm = exercise.targetWpm === null ? '' : ` y ${exercise.targetWpm} WPM`;
  return `Objetivo: ${exercise.targetAccuracy} % de precisión${wpm}; prioriza no fallar, la velocidad llega `
    + 'con la práctica.';
}

/**
 * Introducción de la lección de `exerciseId` (base o ampliada): { lessonId,
 * skill, sentences } con dos o tres frases, o null si no está en el curso.
 */
export function lessonIntro(catalog, exerciseId) {
  const lesson = catalog.levels.flatMap((l) => l.lessons)
    .find((l) => l.exerciseId === exerciseId || l.extendedId === exerciseId);
  if (!lesson) return null;
  const base = catalog.byId.get(lesson.exerciseId);
  const tokens = lesson.introduces;
  const skill = skillOf(tokens);
  const sentences = [mainSentence(skill, tokens, base.text)];
  const reviewed = tokens.length > 0 ? letterKeys(base.text).filter((c) => !tokens.includes(c)) : [];
  if (reviewed.length > 0 && skill !== 'review') {
    const more = reviewed.length > 6 ? 'otras teclas que ya conoces' : '';
    sentences.push(`También repasarás ${joinList(reviewed.slice(0, 6).map(keyName), more)}.`);
  }
  sentences.push(goalSentence(base));
  return { lessonId: lesson.exerciseId, skill: skillLabel(skill, tokens, base.text), sentences };
}

// --- Instrucciones vistas (CP1 y CP5) ------------------------------------------------

export function createGuideState() {
  return { introSeen: false, lessonsSeen: [] };
}

export function markIntroSeen(state) {
  return state.introSeen ? state : { ...state, introSeen: true };
}

export function markLessonSeen(state, lessonId) {
  return state.lessonsSeen.includes(lessonId) ? state : { ...state, lessonsSeen: [...state.lessonsSeen, lessonId] };
}

/** La introducción de una lección se despliega sola solo la primera vez. */
export function shouldShowLessonIntro(state, lessonId) {
  return !state.lessonsSeen.includes(lessonId);
}
