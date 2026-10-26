// «Análisis de escritura» (T11) en Resultados e Historial. Exporta helpers PUROS
// (textos, testeados con Node) y el pintado en el DOM, siempre con textContent.
// Solo presenta el diagnóstico de typing-analysis.js: no recomienda prácticas
// (T12) ni toca la guía de teclado de la partida.
import { MIN_OPPORTUNITIES } from './typing-analysis.js';
import { resolveCharacter, describeResolution } from './keyboard.js';
import { createKeyboard } from './keyboard-ui.js';

export const DIAGNOSIS_EXPLANATION =
  'Cómo se calcula: cada vez que el texto pedía un carácter es una oportunidad; se mide si '
  + 'salió bien al primer intento (borrar y repetir no crea oportunidades nuevas). Solo se '
  + `valoran los caracteres con al menos ${MIN_OPPORTUNITIES} oportunidades en la sesión. La `
  + 'tecla y el dedo son los recomendados por la guía, no los que se usaron.';

const MAX_INSUFFICIENT_SHOWN = 6;

export function charName(char) {
  return char === ' ' ? 'espacio' : `«${char}»`;
}

export function formatRate(rate) {
  return `${Math.round(rate * 100)} %`;
}

const STATUS_MESSAGES = {
  unavailable: 'Diagnóstico no disponible para esta sesión.',
  insufficient: `Texto demasiado breve para un diagnóstico: ningún carácter llegó a ${MIN_OPPORTUNITIES} oportunidades.`,
  clean: 'Sin dificultades destacables: los caracteres con datos suficientes salieron bien al primer intento.',
  difficulties: 'Caracteres con más fallos al primer intento:',
};

export function statusMessage(diagnosis) {
  return STATUS_MESSAGES[diagnosis.status];
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function confusionsText(confusions) {
  if (confusions.length === 0) return '';
  const parts = confusions.map(({ typed, count }) => `${charName(typed)} (${count} veces)`);
  return `Se confundió con ${parts.join(' y ')}.`;
}

/** Textos de una dificultad: carácter, tasa con su denominador, tecla y confusiones. */
export function describeDifficulty(difficulty) {
  const { char, opportunities, firstTryErrors, rate, corrected, confusions } = difficulty;
  return {
    title: charName(char),
    rate: `Falló al primer intento ${firstTryErrors} de ${opportunities} veces (${formatRate(rate)}); `
      + `corregidos: ${corrected}.`,
    key: `Recomendado: ${lowerFirst(describeResolution(resolveCharacter(char)))}`,
    confusions: confusionsText(confusions),
  };
}

export function insufficientMessage(diagnosis) {
  if (diagnosis.insufficient.length === 0) return '';
  const parts = diagnosis.insufficient.slice(0, MAX_INSUFFICIENT_SHOWN)
    .map((c) => `${charName(c.char)} (${c.firstTryErrors} de ${c.opportunities})`);
  return `Con menos de ${MIN_OPPORTUNITIES} oportunidades no se valoran (datos insuficientes): ${parts.join(', ')}.`;
}

/** Tecla principal de cada dificultad con su puesto (sin repetir teclas). */
export function difficultKeys(diagnosis) {
  const keys = [];
  diagnosis.difficulties.forEach((d, i) => {
    const resolution = resolveCharacter(d.char);
    const code = resolution.known ? resolution.steps.at(-1).code : null;
    if (code !== null && !keys.some((k) => k.code === code)) keys.push({ code, rank: i + 1 });
  });
  return keys;
}

// --- DOM --------------------------------------------------------------------------------

export function getDiagnosisElements(doc = document) {
  const byId = (id) => doc.getElementById(id);
  return {
    resultsBody: byId('results-diagnosis-body'),
    history: {
      panel: byId('history-diagnosis'),
      title: byId('history-diagnosis-title'),
      session: byId('history-diagnosis-session'),
      body: byId('history-diagnosis-body'),
      closeButton: byId('history-diagnosis-close'),
    },
  };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createDifficultyItem(difficulty) {
  const text = describeDifficulty(difficulty);
  const item = element('li', 'diagnosis-item');
  item.append(element('strong', 'diagnosis-char', text.title), element('span', 'diagnosis-rate', ` ${text.rate}`));
  for (const line of [text.confusions, text.key]) {
    if (line) item.append(element('span', 'diagnosis-detail', line));
  }
  return item;
}

// Teclado de T9 (decorativo) con las teclas difíciles numeradas por su puesto en
// la lista: el número acompaña al color, que nunca va solo.
function createDiagnosisKeyboard(diagnosis) {
  const container = element('div', 'keyboard diagnosis-keyboard');
  container.setAttribute('aria-hidden', 'true');
  const keys = createKeyboard(container);
  for (const { code, rank } of difficultKeys(diagnosis)) {
    const key = keys.get(code);
    if (!key) continue;
    key.classList.add('is-difficult');
    key.dataset.rank = String(rank);
  }
  return container;
}

/** Pinta el diagnóstico (resultado de diagnose) dentro de `container`. */
export function renderDiagnosis(container, diagnosis) {
  const nodes = [element('p', 'diagnosis-status', statusMessage(diagnosis))];
  if (diagnosis.status === 'difficulties') {
    const list = element('ol', 'diagnosis-list');
    list.append(...diagnosis.difficulties.map(createDifficultyItem));
    nodes.push(list, createDiagnosisKeyboard(diagnosis));
  }
  const insufficient = insufficientMessage(diagnosis);
  if (insufficient) nodes.push(element('p', 'diagnosis-insufficient', insufficient));
  if (diagnosis.status !== 'unavailable') nodes.push(element('p', 'diagnosis-note', DIAGNOSIS_EXPLANATION));
  container.replaceChildren(...nodes);
}
