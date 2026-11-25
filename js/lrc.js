// Analizador de letras LRC (Música, experimento 02). Módulo PURO: sin DOM ni red.
//
// Formato: «[mm:ss.xx]texto» por línea (también [mm:ss], [mm:ss.x], [mm:ss.xxx] y la
// variante [mm:ss:xx]); varias marcas en una línea repiten el texto; «[ti:…]», «[ar:…]»,
// «[al:…]», «[length:…]» y «[offset:±ms]» son metadatos. Una marca sin texto es una
// pausa (instrumental). El texto pasa por sanitizeText: siempre es texto, nunca HTML.
import { sanitizeText } from './text-prep.js';

export const MAX_LRC_LENGTH = 200_000;
const TIMESTAMP = /^(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?$/;
const LEADING_TAG = /^\[([^\]]*)\]/;
const META_TAG = /^\[([a-z#]+)\s*:([^\]]*)\]$/i;
// Marcas de palabra del formato LRC «mejorado»: <mm:ss.xx>.
const WORD_TAG = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;
const META_KEYS = Object.freeze({ ti: 'title', ar: 'artist', al: 'album' });

/** Milisegundos de una marca «mm:ss(.xx)», o null si está mal formada. */
export function parseTimestamp(text) {
  const match = TIMESTAMP.exec(text);
  if (!match) return null;
  const [, minutes, seconds, fraction = ''] = match;
  const ms = fraction === '' ? 0 : Math.round(Number(`0.${fraction}`) * 1000);
  return (Number(minutes) * 60 + Number(seconds)) * 1000 + ms;
}

function emptyMeta() {
  return { title: null, artist: null, album: null, lengthMs: null, offsetMs: 0 };
}

function applyMeta(meta, key, rawValue) {
  const value = sanitizeText(rawValue);
  const name = META_KEYS[key.toLowerCase()];
  if (name) meta[name] = value || null;
  else if (key.toLowerCase() === 'length') meta.lengthMs = parseTimestamp(value);
  else if (key.toLowerCase() === 'offset' && /^[+-]?\d{1,6}$/.test(value)) meta.offsetMs = Number(value);
}

// Marcas de tiempo al principio de la línea y el texto que las sigue, o null.
function splitTimedLine(line) {
  const timesMs = [];
  let rest = line;
  let match = LEADING_TAG.exec(rest);
  while (match) {
    const timeMs = parseTimestamp(match[1].trim());
    if (timeMs === null) return null;
    timesMs.push(timeMs);
    rest = rest.slice(match[0].length);
    match = LEADING_TAG.exec(rest);
  }
  return timesMs.length > 0 ? { timesMs, text: sanitizeText(rest.replace(WORD_TAG, '')) } : null;
}

// Una frase con texto gana a una pausa del mismo tiempo; dos frases: se queda la primera.
function addLine(byTime, timeMs, text, counters) {
  const existing = byTime.get(timeMs);
  if (!existing || (existing.text === '' && text !== '')) {
    if (!existing) byTime.set(timeMs, { timeMs, text, order: byTime.size });
    else existing.text = text;
  } else if (text !== '') counters.duplicates++;
}

function collectLines(rawLines) {
  const meta = emptyMeta();
  const byTime = new Map();
  const counters = { duplicates: 0, malformed: 0 };
  for (const raw of rawLines) {
    const line = raw.trim();
    if (line === '') continue;
    const timed = splitTimedLine(line);
    const metaMatch = timed ? null : META_TAG.exec(line);
    if (timed) for (const timeMs of timed.timesMs) addLine(byTime, timeMs, timed.text, counters);
    else if (metaMatch) applyMeta(meta, metaMatch[1], metaMatch[2]);
    else counters.malformed++;
  }
  return { meta, lines: [...byTime.values()], ...counters };
}

/**
 * Analiza un texto LRC.
 * @param {unknown} text contenido del archivo o `syncedLyrics` de LRCLIB
 * @returns {{ ok: true, lines: { timeMs: number, text: string }[], meta: object,
 *   duplicates: number, malformed: number } | { ok: false, error: 'empty' | 'too-large' | 'not-synced' | 'no-text' }}
 */
export function parseLrc(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'empty' };
  if (text.length > MAX_LRC_LENGTH) return { ok: false, error: 'too-large' };
  const { meta, lines, duplicates, malformed } = collectLines(text.replace(/^﻿/, '').split(/\r\n|\r|\n/));
  if (lines.length === 0) return { ok: false, error: 'not-synced' };
  if (lines.every((l) => l.text === '')) return { ok: false, error: 'no-text' };
  const sorted = lines.sort((a, b) => a.timeMs - b.timeMs || a.order - b.order).map(({ timeMs, text: t }) => ({ timeMs, text: t }));
  return { ok: true, lines: sorted, meta, duplicates, malformed };
}
