// Guía visual de escritura: teclado español (HTML/CSS) y manos (SVG original),
// ambos generados desde el modelo de keyboard.js. Solo presentación: lee la
// resolución del siguiente carácter y nunca toca el motor ni las métricas.
// Sin innerHTML: todo se crea con createElement/createElementNS.
import { KEYBOARD_ROWS, keyLegend, guideHighlights } from './keyboard.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HANDS_WIDTH = 440;

// Silueta de la mano IZQUIERDA (la derecha es su reflejo): palma y cinco dedos
// como rectángulos redondeados. Dibujo propio, sencillo y proporcionado.
const PALM_PATH = 'M50 120 C50 101 62 93 80 93 H166 C182 93 192 103 192 120 ' +
  'L188 158 C186 181 168 193 142 193 H98 C72 193 54 181 52 158 Z';
const LEFT_FINGERS = Object.freeze([
  { id: 'pinky', x: 52, y: 58, width: 24, height: 60 },
  { id: 'ring', x: 81, y: 34, width: 26, height: 82 },
  { id: 'middle', x: 112, y: 22, width: 27, height: 94 },
  { id: 'index', x: 144, y: 36, width: 26, height: 80 },
  // El pulgar sale del borde interior de la palma, inclinado hacia el centro.
  { id: 'thumb', x: 176, y: 112, width: 26, height: 60, rotate: 40 },
]);

// --- Construcción -------------------------------------------------------------------

function createKey(k) {
  const el = document.createElement('div');
  el.className = `kb-key${k.home ? ' kb-home' : ''}${k.code === 'Space' ? ' kb-space' : ''}`;
  el.dataset.code = k.code;
  if (k.finger) el.dataset.finger = k.finger;
  el.style.setProperty('--w', String(k.width));
  const { top, bottom } = keyLegend(k);
  for (const [className, text] of [['kb-top', top], ['kb-bottom', bottom]]) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    el.append(span);
  }
  return el;
}

/** Dibuja el teclado ISO español en `container` y devuelve sus teclas por código. */
export function createKeyboard(container) {
  const keys = new Map();
  const rows = KEYBOARD_ROWS.map((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    for (const k of row) {
      const el = createKey(k);
      keys.set(k.code, el);
      rowEl.append(el);
    }
    return rowEl;
  });
  container.replaceChildren(...rows);
  return keys;
}

function svgElement(name, attributes) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [attr, value] of Object.entries(attributes)) el.setAttribute(attr, String(value));
  return el;
}

function createFinger(hand, { id, x, y, width, height, rotate }) {
  const group = svgElement('g', { class: 'finger', 'data-finger': `${hand}-${id}` });
  const attrs = { x, y, width, height, rx: width / 2 };
  if (rotate) attrs.transform = `rotate(${rotate} ${x + width / 2} ${y + height / 2})`;
  group.append(svgElement('rect', attrs));
  return group;
}

function createHand(hand) {
  // La mano derecha es el reflejo horizontal de la izquierda.
  const transform = hand === 'right' ? `translate(${HANDS_WIDTH} 0) scale(-1 1)` : '';
  const group = svgElement('g', { class: `hand hand-${hand}`, transform });
  group.append(svgElement('path', { class: 'palm', d: PALM_PATH }));
  for (const finger of LEFT_FINGERS) group.append(createFinger(hand, finger));
  return group;
}

/** Dibuja las dos manos en `container` y devuelve sus dedos por identificador. */
export function createHands(container) {
  const svg = svgElement('svg', {
    viewBox: `0 0 ${HANDS_WIDTH} 200`, class: 'hands-svg', 'aria-hidden': 'true', focusable: 'false',
  });
  svg.append(createHand('left'), createHand('right'));
  container.replaceChildren(svg);
  return new Map([...svg.querySelectorAll('[data-finger]')].map((g) => [g.dataset.finger, g]));
}

// --- Pintado -------------------------------------------------------------------------

const KEY_STATES = ['is-target', 'is-dead', 'is-modifier', 'is-error'];
const FINGER_STATES = ['is-primary', 'is-modifier'];

function clearStates(elements, states) {
  for (const el of elements.values()) el.classList.remove(...states);
}

function markKeys(keys, highlights, deadCodes, errorCode) {
  clearStates(keys, KEY_STATES);
  for (const code of highlights.targetCodes) keys.get(code)?.classList.add('is-target');
  for (const code of deadCodes) keys.get(code)?.classList.add('is-dead');
  for (const code of highlights.modifierCodes) keys.get(code)?.classList.add('is-modifier');
  if (errorCode) keys.get(errorCode)?.classList.add('is-error');
}

function markFingers(fingers, highlights) {
  clearStates(fingers, FINGER_STATES);
  for (const id of highlights.modifierFingers) fingers.get(id)?.classList.add('is-modifier');
  for (const id of highlights.primaryFingers) fingers.get(id)?.classList.add('is-primary');
}

/**
 * Pinta la guía. `mode`: 'full' (teclado y manos), 'keyboard' o 'none'.
 * `resolution` null oculta los resaltados (p. ej. al terminar). El texto de ayuda
 * solo se reescribe si cambia y no es una región viva: no se anuncia en cada tecla.
 */
export function renderGuide(guide, { mode, resolution, text, errorCode = null, showRest = false }) {
  guide.section.hidden = mode === 'none';
  guide.keyboard.hidden = mode === 'none';
  guide.hands.hidden = mode !== 'full';
  guide.rest.hidden = !showRest;
  const hint = text ?? '';
  if (guide.hint.textContent !== hint) guide.hint.textContent = hint;
  const empty = { targetCodes: [], modifierCodes: [], primaryFingers: [], modifierFingers: [] };
  const highlights = resolution ? guideHighlights(resolution) : empty;
  const deadCodes = resolution ? resolution.steps.filter((s) => s.dead).map((s) => s.code) : [];
  markKeys(guide.keys, highlights, deadCodes, errorCode);
  markFingers(guide.fingers, highlights);
}
