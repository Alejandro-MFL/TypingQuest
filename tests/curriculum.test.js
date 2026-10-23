// Validación pedagógica del currículo real (T10): orden de incorporación de las
// teclas, cobertura, consolidación por mano y coherencia con la guía de T9.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalog } from '../js/catalog.js';
import { requiredInputs, getKey, FINGERS } from '../js/keyboard.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const COURSE = readJson('../data/course.json');
const { catalog } = createCatalog(readJson('../data/exercises.json'), COURSE, { maxTextLength: 5000 });

const lessons = COURSE.levels.flatMap((level) => level.lessons.map((lesson) => ({ ...lesson, level: level.level })));
const textOf = (id) => catalog.byId.get(id).text;
const inputsOf = (text) => new Set([...text].flatMap((c) => requiredInputs(c) ?? []));
const LETTER_CODES = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `Key${c}`).concat('Semicolon'));
const handOf = (code) => FINGERS.find((f) => f.id === getKey(code).finger)?.hand;
// Manos que usan las LETRAS de un texto (el espacio y los signos no cuentan).
const lettersHands = (text) => new Set([...inputsOf(text)].filter((t) => LETTER_CODES.has(t)).map(handOf));

describe('estructura del currículo', () => {
  it('67 lecciones en cinco bloques (A-E) con dos prácticas cada una: 134 ejercicios', () => {
    assert.deepEqual(COURSE.levels.map((l) => [l.level, l.lessons.length]), [[1, 17], [2, 14], [3, 16], [4, 12], [5, 8]]);
    assert.equal(catalog.exercises.length, 134);
  });

  it('IDs únicos y estables (minúsculas, dígitos y guiones)', () => {
    const ids = catalog.exercises.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('cada lección: una práctica base y su ampliada «<base>-ampliada»', () => {
    for (const lesson of lessons) {
      assert.equal(catalog.byId.get(lesson.exercise).kind, 'base', lesson.exercise);
      assert.equal(lesson.extended, `${lesson.exercise}-ampliada`);
      assert.equal(catalog.byId.get(lesson.extended).kind, 'extended', lesson.extended);
    }
  });

  it('sin textos vacíos ni duplicados', () => {
    const texts = catalog.exercises.map((e) => e.text);
    for (const t of texts) assert.ok(t.trim().length > 0);
    assert.equal(new Set(texts).size, texts.length);
  });
});

describe('orden de incorporación de teclas', () => {
  const order = lessons.flatMap((l) => l.introduces);

  it('sigue el temario aprobado: reposo, mano derecha, mano izquierda, G/H, fila superior, inferior y español', () => {
    assert.deepEqual(order, [
      // A: postura (F, J y espacio), mano derecha, mano izquierda y los índices hacia el centro.
      'KeyF', 'KeyJ', 'Space', 'KeyK', 'KeyL', 'Semicolon', 'KeyD', 'KeyS', 'KeyA', 'KeyG', 'KeyH',
      // B: fila superior, derecha (U I O P Y) e izquierda (R E W Q T).
      'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyY', 'KeyR', 'KeyE', 'KeyW', 'KeyQ', 'KeyT',
      // C: fila inferior, derecha (N M , . -) e izquierda (V B C X Z).
      'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'KeyV', 'KeyB', 'KeyC', 'KeyX', 'KeyZ',
      // D: Mayús (izquierda y derecha), tilde, diéresis, números, ¿? y AltGr.
      'ShiftRight', 'ShiftLeft', 'Quote', 'acute', 'diaeresis',
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
      'Minus', 'Equal', 'AltRight',
    ]);
  });

  it('en los bloques A-C se introduce como mucho una tecla nueva por lección (salvo la postura inicial)', () => {
    for (const lesson of lessons.filter((l) => l.level <= 3).slice(1)) {
      assert.ok(lesson.introduces.length <= 1, lesson.exercise);
    }
  });

  it('cada tecla nueva se presenta en la práctica base de su lección', () => {
    for (const lesson of lessons) {
      const used = inputsOf(textOf(lesson.exercise));
      for (const token of lesson.introduces) assert.ok(used.has(token), `${lesson.exercise}: ${token}`);
    }
  });

  it('ningún texto usa teclas o combinaciones aún no enseñadas', () => {
    const known = new Set();
    for (const lesson of lessons) {
      lesson.introduces.forEach((t) => known.add(t));
      for (const id of [lesson.exercise, lesson.extended]) {
        for (const token of inputsOf(textOf(id))) assert.ok(known.has(token), `${id}: ${token}`);
      }
    }
  });
});

describe('cobertura', () => {
  it('se enseñan las 27 letras del alfabeto español, incluida la Ñ', () => {
    const introduced = new Set(lessons.flatMap((l) => l.introduces));
    for (const code of LETTER_CODES) assert.ok(introduced.has(code), code);
    const allText = catalog.exercises.map((e) => e.text).join('');
    for (const letter of 'abcdefghijklmnñopqrstuvwxyz') assert.ok(allText.includes(letter), letter);
  });

  it('el bloque D practica mayúsculas, tildes, diéresis, puntuación, ¿ ¡, números y símbolos', () => {
    const blockD = catalog.exercises.filter((e) => e.level === 4).map((e) => e.text).join(' ');
    for (const pattern of [/[A-ZÑ]/, /[áéíóú]/, /ü/, /[;:]/, /¿/, /¡/, /\d/, /[()"%/@€]/]) {
      assert.match(blockD, pattern);
    }
  });
});

describe('consolidación por mano y con ambas manos', () => {
  it('en cada bloque A-C hay consolidación de la mano derecha, de la izquierda y de ambas', () => {
    for (const level of [1, 2, 3]) {
      const consolidations = lessons.filter((l) => l.level === level && l.introduces.length === 0);
      const hands = consolidations.map((l) => [...lettersHands(textOf(l.exercise))].sort().join('+'));
      assert.ok(hands.includes('right'), `nivel ${level}: falta la mano derecha`);
      assert.ok(hands.includes('left'), `nivel ${level}: falta la mano izquierda`);
      assert.ok(hands.includes('left+right'), `nivel ${level}: falta ambas manos`);
    }
  });

  it('cada bloque termina con una lección que combina ambas manos', () => {
    for (const level of COURSE.levels) {
      const last = level.lessons.at(-1);
      assert.deepEqual([...lettersHands(textOf(last.exercise))].sort(), ['left', 'right'], last.exercise);
    }
  });
});

describe('coherencia con la guía visual de T9', () => {
  it('la descripción de cada lección que introduce una letra nombra el dedo del modelo', () => {
    for (const lesson of lessons) {
      const letters = lesson.introduces.filter((t) => LETTER_CODES.has(t) || ['Comma', 'Period', 'Slash'].includes(t));
      if (letters.length !== 1) continue;
      const finger = FINGERS.find((f) => f.id === getKey(letters[0]).finger).name;
      const exercise = catalog.byId.get(lesson.exercise);
      assert.match(`${exercise.title} ${exercise.description}`, new RegExp(finger), lesson.exercise);
    }
  });

  it('todos los caracteres tienen tecla, dedo y mano en el modelo (sin indicaciones genéricas)', () => {
    for (const e of catalog.exercises) {
      for (const c of new Set(e.text)) assert.notEqual(requiredInputs(c), null, `${e.id}: ${c}`);
    }
  });
});
