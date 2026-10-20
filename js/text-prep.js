// Preparación y validación del texto. Módulo PURO: sin DOM.
//
// Cualquier fuente de texto (textarea, textos predefinidos, archivos…) debe pasar
// por sanitizeText y validateText antes de crear la partida.

// Reglas de sustitución, aplicadas en orden tras normalizar a NFC.
const REPLACEMENTS = [
  // Comillas dobles, angulares y doble prima → comilla recta.
  [/[“”„‟«»″]/g, '"'],
  // Comillas simples, angulares simples, apóstrofo y prima → apóstrofo recto.
  [/[‘’‚‛‹›′]/g, "'"],
  // Guiones tipográficos, rayas y signo menos → guion.
  [/[‐‑‒–—―−]/g, '-'],
  [/…/g, '...'],
  // NEL (fin de línea C1) no es \s en JavaScript: se trata como salto de línea.
  [/\u0085/g, ' '],
  // Invisibles: guion blando, ancho cero, unión de palabras y BOM.
  [/[­​-‍⁠﻿]/g, ''],
  // Controles C0/C1 que no son espacios en blanco.
  [/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, ''],
  // Saltos de línea, tabulaciones y espacios Unicode → un único espacio.
  [/\s+/g, ' '],
];

// Combinaciones base + marca que NFC no compone, y caracteres fuera del plano
// básico (emojis). El motor compara unidades UTF-16 y rechaza inserciones de más
// de una unidad, así que estos caracteres no se pueden escribir.
const UNSUPPORTED_PATTERN = /\P{M}\p{M}+|[\u{10000}-\u{10FFFF}]/gu;

/**
 * Deja el texto listo para jugar. No valida: ver validateText.
 * @param {unknown} raw texto de cualquier fuente
 * @returns {string} texto saneado ('' si la entrada no es un string)
 */
export function sanitizeText(raw) {
  if (typeof raw !== 'string') return '';
  const normalized = raw.normalize('NFC');
  return REPLACEMENTS
    .reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), normalized)
    .trim();
}

/**
 * Caracteres que el motor actual no puede procesar, sin repetir y en orden.
 * @param {string} text texto ya saneado
 * @returns {string[]}
 */
export function findUnsupportedChars(text) {
  return [...new Set(text.match(UNSUPPORTED_PATTERN) ?? [])];
}

/**
 * Comprueba en orden: texto vacío, longitud máxima y caracteres no soportados.
 * La longitud se cuenta en caracteres (puntos de código), no en unidades UTF-16.
 * @param {string} text texto ya saneado
 * @param {number} maxLength límite de caracteres (entero positivo)
 * @returns {{ ok: boolean, error: null | 'empty' | 'too-long' | 'unsupported-chars',
 *             length: number, maxLength?: number, chars?: string[] }}
 */
export function validateText(text, maxLength) {
  if (typeof text !== 'string') {
    throw new TypeError('El texto debe ser un string');
  }
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new TypeError('El límite debe ser un entero positivo');
  }
  const length = [...text].length;
  if (length === 0) return { ok: false, error: 'empty', length };
  if (length > maxLength) return { ok: false, error: 'too-long', length, maxLength };
  const chars = findUnsupportedChars(text);
  if (chars.length > 0) return { ok: false, error: 'unsupported-chars', length, chars };
  return { ok: true, error: null, length };
}

/**
 * Punto de entrada recomendado: sanea y después valida, de modo que el límite y
 * los caracteres no soportados se comprueban siempre sobre el texto final.
 * @param {unknown} raw texto de cualquier fuente
 * @param {number} maxLength límite de caracteres (entero positivo)
 * @returns {ReturnType<typeof validateText> & { text: string }} el resultado de
 *          validateText más el texto saneado
 */
export function prepareText(raw, maxLength) {
  const text = sanitizeText(raw);
  return { ...validateText(text, maxLength), text };
}
