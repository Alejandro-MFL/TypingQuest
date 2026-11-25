// Control del campo de escritura (textarea oculto): escritura SECUENCIAL, compartido
// por la partida (main.js) y Música (experimento 02). Ver «Entrada de teclado» en
// CLAUDE.md: solo se inserta al final y se borra hacia atrás; las teclas muertas e IME
// se esperan hasta compositionend; pegar, soltar, Intro, deshacer y flechas se bloquean.

const ALLOWED_INPUT_TYPES = new Set([
  'insertText',
  'insertCompositionText',
  'deleteContentBackward',
  'deleteWordBackward',
  'deleteSoftLineBackward',
  'deleteHardLineBackward',
]);
// Teclas que moverían el cursor fuera del final del texto.
const NAVIGATION_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown',
]);
// Atajos con Ctrl/Cmd: seleccionar todo, deshacer y rehacer.
const BLOCKED_SHORTCUTS = new Set(['a', 'z', 'y']);

export function isAllowedInputType(inputType) {
  return ALLOWED_INPUT_TYPES.has(inputType);
}

/** true si la tecla movería el cursor o es un atajo bloqueado (no se escribe con ella). */
export function isBlockedKey({ key, ctrlKey = false, metaKey = false }) {
  const shortcut = (ctrlKey || metaKey) && BLOCKED_SHORTCUTS.has(key?.toLowerCase());
  return NAVIGATION_KEYS.has(key) || shortcut;
}

function isCaretAtEnd(input) {
  const end = input.value.length;
  return input.selectionStart === end && input.selectionEnd === end;
}

export function moveCaretToEnd(input) {
  const end = input.value.length;
  if (input.selectionStart !== end || input.selectionEnd !== end) input.setSelectionRange(end, end);
}

/**
 * Conecta las reglas al campo. `onValue()` se llama con cada valor nuevo fuera de una
 * composición; `onKeyDown(event)`, con cada tecla (después de bloquear las prohibidas).
 * @returns {{ isComposing: () => boolean, reset: () => void }}
 */
export function attachSequentialInput(input, { onValue, onKeyDown = () => {} }) {
  let composing = false;
  input.addEventListener('beforeinput', (event) => {
    if (!isAllowedInputType(event.inputType)) {
      event.preventDefault();
      return;
    }
    // La composición no es cancelable; fuera de ella, solo se edita desde el final.
    if (!event.isComposing && event.inputType !== 'insertCompositionText' && !isCaretAtEnd(input)) {
      event.preventDefault();
      moveCaretToEnd(input);
    }
  });
  input.addEventListener('input', (event) => {
    if (!composing && !event.isComposing) onValue();
  });
  input.addEventListener('keydown', (event) => {
    if (isBlockedKey(event)) event.preventDefault();
    onKeyDown(event);
  });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => {
    composing = false;
    onValue();
  });
  for (const type of ['select', 'focus']) input.addEventListener(type, () => { if (!composing) moveCaretToEnd(input); });
  for (const type of ['paste', 'drop', 'cut']) input.addEventListener(type, (event) => event.preventDefault());
  return { isComposing: () => composing, reset: () => { composing = false; } };
}
