// Control del campo de escritura compartido por la partida y Música (experimento 02).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedInputType, isBlockedKey, attachSequentialInput } from '../js/typing-input.js';

describe('reglas de la escritura secuencial', () => {
  it('solo se admite insertar texto, componer y borrar hacia atrás', () => {
    for (const type of ['insertText', 'insertCompositionText', 'deleteContentBackward', 'deleteWordBackward']) {
      assert.equal(isAllowedInputType(type), true, type);
    }
    for (const type of ['insertFromPaste', 'insertFromDrop', 'insertLineBreak', 'historyUndo', 'deleteContentForward']) {
      assert.equal(isAllowedInputType(type), false, type);
    }
  });

  it('bloquea las teclas que moverían el cursor y los atajos de seleccionar, deshacer y rehacer', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
      assert.equal(isBlockedKey({ key }), true, key);
    }
    assert.equal(isBlockedKey({ key: 'a', ctrlKey: true }), true);
    assert.equal(isBlockedKey({ key: 'Z', metaKey: true }), true);
    assert.equal(isBlockedKey({ key: 'y', ctrlKey: true }), true);
    for (const event of [{ key: 'a' }, { key: 'ñ' }, { key: 'Dead' }, { key: 'Backspace' }, { key: 'c', ctrlKey: true }]) {
      assert.equal(isBlockedKey(event), false, JSON.stringify(event));
    }
  });
});

// Campo de texto falso con lo mínimo que usa attachSequentialInput.
class FakeInput extends EventTarget {
  constructor() {
    super();
    this.value = '';
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }
  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

function fire(target, type, props = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}

describe('attachSequentialInput', () => {
  it('avisa de cada valor nuevo, pero espera al final de una composición (teclas muertas)', () => {
    const input = new FakeInput();
    const values = [];
    attachSequentialInput(input, { onValue: () => values.push(input.value) });
    input.value = 'a';
    fire(input, 'input');
    fire(input, 'compositionstart');
    input.value = 'a´';
    fire(input, 'input', { isComposing: true });
    input.value = 'aá';
    fire(input, 'compositionend');
    assert.deepEqual(values, ['a', 'aá']);
  });

  it('cancela pegar, soltar, Intro y deshacer; deja escribir y borrar', () => {
    const input = new FakeInput();
    attachSequentialInput(input, { onValue() {} });
    assert.equal(fire(input, 'beforeinput', { inputType: 'insertFromPaste' }).defaultPrevented, true);
    assert.equal(fire(input, 'beforeinput', { inputType: 'insertLineBreak' }).defaultPrevented, true);
    assert.equal(fire(input, 'beforeinput', { inputType: 'insertText' }).defaultPrevented, false);
    assert.equal(fire(input, 'paste').defaultPrevented, true);
    assert.equal(fire(input, 'drop').defaultPrevented, true);
  });

  it('no deja editar con el cursor fuera del final y lo devuelve al final', () => {
    const input = new FakeInput();
    attachSequentialInput(input, { onValue() {} });
    input.value = 'hola';
    input.setSelectionRange(1, 1);
    assert.equal(fire(input, 'beforeinput', { inputType: 'insertText' }).defaultPrevented, true);
    assert.deepEqual([input.selectionStart, input.selectionEnd], [4, 4]);
  });

  it('bloquea las flechas y avisa de cada tecla', () => {
    const input = new FakeInput();
    const keys = [];
    attachSequentialInput(input, { onValue() {}, onKeyDown: (event) => keys.push(event.key) });
    assert.equal(fire(input, 'keydown', { key: 'ArrowLeft' }).defaultPrevented, true);
    assert.equal(fire(input, 'keydown', { key: 'b' }).defaultPrevented, false);
    assert.deepEqual(keys, ['ArrowLeft', 'b']);
  });

  it('reset() olvida una composición interrumpida', () => {
    const input = new FakeInput();
    const values = [];
    const control = attachSequentialInput(input, { onValue: () => values.push(input.value) });
    fire(input, 'compositionstart');
    assert.equal(control.isComposing(), true);
    control.reset();
    input.value = 'x';
    fire(input, 'input');
    assert.deepEqual(values, ['x']);
  });
});
