// Experiencia pedagógica (T14): introducciones por lección, movimiento de los
// dedos y preferencias de las instrucciones. Con el catálogo y el teclado REALES.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalog } from '../js/catalog.js';
import { resolveCharacter, resolveBackspace } from '../js/keyboard.js';
import {
  keyName,
  fingerMoves,
  movementText,
  lessonIntro,
  createGuideState,
  markLessonSeen,
  markIntroSeen,
  shouldShowLessonIntro,
} from '../js/lesson-guide.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { catalog } = createCatalog(readJson('../data/exercises.json'), readJson('../data/course.json'), { maxTextLength: 5000 });
const text = (id) => lessonIntro(catalog, id).sentences.join(' ');
const sentenceCount = (sentences) => sentences.join(' ').split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;

describe('keyName', () => {
  it('nombra las teclas como en el teclado español', () => {
    assert.deepEqual(['KeyK', 'Semicolon', 'Quote', 'Comma', 'Slash', 'ShiftLeft', 'AltRight', 'Space', 'Digit1'].map(keyName),
      ['K', 'Ñ', '´', ',', '-', 'Mayús', 'AltGr', 'espacio', '1']);
  });
});

describe('fingerMoves y movementText (CP2)', () => {
  const moves = (c) => fingerMoves(resolveCharacter(c));

  it('U: el índice derecho sale de J, pulsa U y vuelve a J', () => {
    assert.deepEqual(moves('u'), [{ finger: 'right-index', from: 'KeyJ', to: 'KeyU' }]);
    assert.equal(movementText(resolveCharacter('u')), 'Movimiento: J → U → J');
  });

  it('teclas de reposo y espacio: sin movimiento artificial', () => {
    for (const c of ['j', 'k', 'a', 'ñ', ' ']) assert.deepEqual(moves(c), [], c);
    assert.equal(movementText(resolveCharacter('k')), '');
  });

  it('G y H: el índice se desplaza hacia el centro', () => {
    assert.equal(movementText(resolveCharacter('g')), 'Movimiento: F → G → F');
    assert.equal(movementText(resolveCharacter('h')), 'Movimiento: J → H → J');
  });

  it('mayúsculas: el meñique de la otra mano va a Mayús; la letra de reposo no se mueve', () => {
    assert.equal(movementText(resolveCharacter('A')), 'Movimiento: Ñ → Mayús → Ñ');
    assert.equal(movementText(resolveCharacter('P')), 'Movimiento: A → Mayús → A · Ñ → P → Ñ');
  });

  it('tildes (tecla muerta) y diéresis: pasos en orden', () => {
    assert.equal(movementText(resolveCharacter('á')), 'Movimiento: Ñ → ´ → Ñ');
    assert.equal(movementText(resolveCharacter('é')), 'Movimiento: Ñ → ´ → Ñ · D → E → D');
    assert.equal(movementText(resolveCharacter('ü')), 'Movimiento: A → Mayús → A · Ñ → ´ → Ñ · J → U → J');
  });

  it('números, signos, AltGr y Retroceso', () => {
    assert.equal(movementText(resolveCharacter('1')), 'Movimiento: A → 1 → A');
    assert.equal(movementText(resolveCharacter('¿')), 'Movimiento: A → Mayús → A · Ñ → ¡ → Ñ');
    assert.equal(movementText(resolveCharacter('@')), 'Movimiento: S → 2 → S');
    assert.equal(movementText(resolveBackspace()), 'Movimiento: Ñ → Retroceso → Ñ');
  });

  it('carácter desconocido: sin indicaciones inventadas', () => {
    assert.equal(movementText(resolveCharacter('日')), '');
  });
});

describe('lessonIntro (CP1)', () => {
  it('K: tecla, dedo, posición de reposo, teclas reforzadas y objetivo', () => {
    const intro = lessonIntro(catalog, 'a-der-jk');
    assert.equal(intro.skill, 'Tecla K');
    assert.equal(intro.sentences[0], 'Aprenderás a pulsar K con el corazón derecho: es su tecla de reposo, '
      + 'así que apoya el dedo sobre ella y no lo separes de la fila central.');
    assert.match(intro.sentences[1], /^También repasarás J\.$/);
    assert.match(intro.sentences.at(-1), /85 % de precisión/);
  });

  it('teclas fuera de la fila central: desde qué tecla de reposo se mueve el dedo', () => {
    assert.match(text('b-u'), /Aprenderás a pulsar U con el índice derecho: desde J, estira el dedo hacia arriba hasta U y vuelve a J/);
    assert.match(text('c-n'), /desde J, baja el dedo hasta N/);
    assert.match(text('a-g'), /desde F, desplaza el dedo hacia el centro hasta G/);
    assert.match(text('c-coma'), /la coma \(,\) con el corazón derecho: desde K, baja el dedo/);
  });

  it('postura inicial: F y J con relieve, reposo y pulgar', () => {
    assert.match(text('l1-postura-fj'), /F y J/);
    assert.match(text('l1-postura-fj'), /relieve/);
    assert.match(text('l1-postura-fj'), /pulgar/);
  });

  it('tildes, diéresis, Mayús, números, signos y AltGr: consejos propios', () => {
    assert.match(text('l4-tildes'), /tilde \(´\).*meñique derecho.*después pulsa la vocal/);
    assert.match(text('d-dieresis'), /Mayús.*meñique izquierdo.*u/);
    assert.match(text('d-mayus-izq'), /Mayús derecha con el meñique derecho/);
    assert.match(text('d-mayus-der'), /Mayús izquierda con el meñique izquierdo/);
    assert.match(text('d-numeros-izq'), /números 1, 2, 3, 4 y 5.*del 1 con el meñique izquierdo al 5 con el índice izquierdo/);
    assert.match(text('d-numeros-der'), /números 6, 7, 8, 9 y 0/);
    assert.match(text('d-interrogacion'), /¿ y \?.*Mayús/);
    assert.match(text('d-altgr'), /AltGr.*pulgar derecho.*@.*€/);
  });

  it('lecciones sin teclas nuevas: repaso concreto, no un texto genérico', () => {
    assert.match(text('a-der-consolidacion'), /Sin teclas nuevas: repasarás J, K, L y Ñ/);
    assert.match(text('a-der-j'), /J con el índice derecho/);
    assert.match(text('d-exclamacion'), /¡/);
  });

  it('cada introducción tiene como mucho tres frases, y las de teclas nuevas son distintas entre sí', () => {
    const lessons = catalog.levels.flatMap((l) => l.lessons);
    for (const lesson of lessons) {
      const { sentences } = lessonIntro(catalog, lesson.exerciseId);
      assert.ok(sentenceCount(sentences) >= 2 && sentenceCount(sentences) <= 3, `${lesson.exerciseId}: ${sentences.join(' | ')}`);
      assert.doesNotMatch(sentences.join(' '), /detect|sabemos qué dedo/i);
    }
    const withNewKeys = lessons.filter((l) => l.introduces.length > 0).map((l) => lessonIntro(catalog, l.exerciseId).sentences[0]);
    assert.equal(new Set(withNewKeys).size, withNewKeys.length);
  });

  it('la práctica ampliada usa la introducción de su lección; un ID desconocido, null', () => {
    assert.deepEqual(lessonIntro(catalog, 'a-der-jk-ampliada'), lessonIntro(catalog, 'a-der-jk'));
    assert.equal(lessonIntro(catalog, 'no-existe'), null);
  });
});

describe('preferencias de las instrucciones (CP1 y CP5)', () => {
  it('estado inicial: nada visto', () => {
    assert.deepEqual(createGuideState(), { introSeen: false, lessonsSeen: [] });
  });

  it('la introducción de una lección se muestra solo la primera vez (luego «Ver instrucciones»)', () => {
    const fresh = createGuideState();
    assert.equal(shouldShowLessonIntro(fresh, 'a-der-jk'), true);
    const seen = markLessonSeen(fresh, 'a-der-jk');
    assert.equal(shouldShowLessonIntro(seen, 'a-der-jk'), false);
    assert.equal(shouldShowLessonIntro(seen, 'a-der-jkl'), true);
    assert.equal(markLessonSeen(seen, 'a-der-jk'), seen, 'sin duplicados');
  });

  it('introducción inicial vista u omitida; no muta el estado recibido', () => {
    const fresh = Object.freeze(createGuideState());
    const seen = markIntroSeen(fresh);
    assert.equal(seen.introSeen, true);
    assert.equal(fresh.introSeen, false);
  });
});
