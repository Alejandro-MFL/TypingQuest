// Efectos de sonido con la Web Audio API. Sin archivos ni librerías.
// Independiente de la lógica del juego: main.js decide cuándo sonar.
//
// Experimento 01: volumen continuo (0-100 %). Un único nodo de ganancia general por
// AudioContext aplica el volumen (curva cuadrática de volume.js) a TODOS los efectos;
// cada nota conserva su envolvente. El diseño de los sonidos no depende del volumen.
import { normalizeVolume, volumeGain, DEFAULT_VOLUME } from './volume.js';

// Experimento 01.1: un sonido por evento, generado con osciladores (sin archivos).
// Cada nota: frecuencia, inicio y duración (s) y pico de su envolvente al 100 %.
// El tono anterior (880 → 1320 Hz, pico 0,3) sonaba grave y poco «de victoria».
const note = (frequencyHz, startS, durationS, peakGain, type = 'triangle') =>
  Object.freeze({ frequencyHz, startS, durationS, peakGain, type });

export const SOUNDS = Object.freeze({
  // Fragmento: confirmación muy breve y discreta (G6).
  chunk: Object.freeze([note(1567.98, 0, 0.07, 0.2, 'sine')]),
  // Ejercicio terminado: arpegio ascendente y brillante (C6 · E6 · G6).
  exercise: Object.freeze([
    note(1046.5, 0, 0.16, 0.15), note(1318.51, 0.07, 0.16, 0.15), note(1567.98, 0.14, 0.22, 0.15),
  ]),
  // Objetivo superado: el mismo arpegio hasta C7, con la última nota más larga.
  objective: Object.freeze([
    note(1046.5, 0, 0.16, 0.14), note(1318.51, 0.07, 0.16, 0.14), note(1567.98, 0.14, 0.16, 0.14),
    note(2093, 0.21, 0.42, 0.16),
  ]),
});
// Límite prudente de la suma de picos que pueden sonar a la vez (escala completa = 1).
export const MAX_COMBINED_PEAK = 0.5;
const ATTACK_S = 0.008;
const SILENCE_GAIN = 0.0001;

/** Suma máxima de picos de las notas que coinciden en el tiempo (cota del clipping). */
export function peakSum(notes) {
  const sumAt = (t) => notes
    .filter((n) => n.startS <= t && t < n.startS + n.durationS)
    .reduce((sum, n) => sum + n.peakGain, 0);
  const total = Math.max(0, ...notes.map((n) => sumAt(n.startS)));
  return Math.round(total * 1e9) / 1e9;
}

/** Sonido al terminar: recompensa si se superó el objetivo; si no (o práctica libre), ejercicio. */
export function finishSoundKind(evaluation) {
  return evaluation?.passed ? 'objective' : 'exercise';
}

// Constante de tiempo del cambio de volumen: rápido pero sin clics.
const VOLUME_SMOOTHING_S = 0.015;

function defaultAudioContextClass() {
  return globalThis.AudioContext ?? globalThis.webkitAudioContext;
}

/**
 * Reproductor de efectos. El AudioContext se crea en unlock() o en la primera
 * reproducción, que deben ocurrir tras una interacción del usuario, y nunca con
 * volumen 0. Si la API no existe o falla, todas las operaciones son silenciosas.
 */
export function createSoundPlayer({
  volume = DEFAULT_VOLUME,
  AudioContextClass = defaultAudioContextClass(),
} = {}) {
  let currentVolume = normalizeVolume(volume) ?? DEFAULT_VOLUME;
  let context = null;
  let master = null;

  function ensureContext() {
    if (!AudioContextClass) return null;
    try {
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = volumeGain(currentVolume);
        master.connect(context.destination);
      }
      if (context.state === 'suspended') context.resume()?.catch?.(() => {});
    } catch {
      context = null;
      master = null;
    }
    return context;
  }

  // Una nota con envolvente suave: ataque lineal desde 0 y caída exponencial (sin clics).
  function playNote(ctx, n, now) {
    const start = now + n.startS;
    const end = start + n.durationS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type;
    osc.frequency.setValueAtTime(n.frequencyHz, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(n.peakGain, start + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, end);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(end);
  }

  function play(notes) {
    if (currentVolume === 0) return;
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      for (const n of notes) playNote(ctx, n, ctx.currentTime);
    } catch {
      // El juego continúa aunque el audio falle.
    }
  }

  return {
    getVolume: () => currentVolume,
    isEnabled: () => currentVolume > 0,
    /** Cambia el volumen (los valores no válidos se ignoran) y devuelve el vigente. */
    setVolume(value) {
      const next = normalizeVolume(value);
      if (next === null) return currentVolume;
      currentVolume = next;
      try {
        master?.gain.setTargetAtTime(volumeGain(next), context.currentTime, VOLUME_SMOOTHING_S);
      } catch {
        // Sin audio: el volumen se aplicará al crear el contexto.
      }
      return currentVolume;
    },
    unlock() {
      // Silenciado: no se crea ni reanuda el audio hasta que se suba el volumen.
      if (currentVolume > 0) ensureContext();
    },
    playChunkComplete: () => play(SOUNDS.chunk),
    playExerciseComplete: () => play(SOUNDS.exercise),
    playObjectivePassed: () => play(SOUNDS.objective),
    /** Sonido final según finishSoundKind (un solo sonido al terminar). */
    playFinish(kind) {
      play(kind === 'objective' ? SOUNDS.objective : SOUNDS.exercise);
    },
    // Al soltar el control de volumen: el sonido de fragmento, para oír el nivel elegido.
    playPreview: () => play(SOUNDS.chunk),
  };
}
