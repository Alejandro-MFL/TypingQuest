// Efectos de sonido con la Web Audio API. Sin archivos ni librerías.
// Independiente de la lógica del juego: main.js decide cuándo sonar.
//
// Experimento 01: volumen continuo (0-100 %). Un único nodo de ganancia general por
// AudioContext aplica el volumen (curva cuadrática de volume.js) a TODOS los efectos;
// cada nota conserva su envolvente. El diseño de los sonidos no depende del volumen.
import { normalizeVolume, volumeGain, DEFAULT_VOLUME } from './volume.js';
import { DEFAULT_KEY_SOUND, keySoundGain, allowKeyVoice } from './key-sound.js';

// Experimento 01.1: un sonido por evento, generado con osciladores (sin archivos).
// Cada nota: frecuencia, inicio y duración (s) y pico de su envolvente al 100 %.
// El tono anterior (880 → 1320 Hz, pico 0,3) sonaba grave y poco «de victoria».
// `endFrequencyHz` (opcional): el tono baja hasta esa frecuencia durante la nota.
const note = (frequencyHz, startS, durationS, peakGain, type = 'triangle', endFrequencyHz = null) =>
  Object.freeze({ frequencyHz, startS, durationS, peakGain, type, endFrequencyHz });
// Exp. 02.5: golpe de ruido filtrado (paso banda centrado en `frequencyHz`, anchura `q`).
const noise = (startS, durationS, peakGain, frequencyHz, q) =>
  Object.freeze({ frequencyHz, startS, durationS, peakGain, type: 'noise', q, endFrequencyHz: null });

// Exp. 02.5: picos recalibrados (≈ 2,2 veces los de 01.1, +7 dB) para aprovechar la escala:
// antes, al 100 % el sonido más fuerte quedaba en −14 dBFS. Mismas notas y envolventes.
export const SOUNDS = Object.freeze({
  // Fragmento: confirmación muy breve y discreta (G6).
  chunk: Object.freeze([note(1567.98, 0, 0.07, 0.45, 'sine')]),
  // Ejercicio terminado: arpegio ascendente y brillante (C6 · E6 · G6).
  exercise: Object.freeze([
    note(1046.5, 0, 0.16, 0.28), note(1318.51, 0.07, 0.16, 0.28), note(1567.98, 0.14, 0.22, 0.28),
  ]),
  // Objetivo superado: el mismo arpegio hasta C7, con la última nota más larga.
  objective: Object.freeze([
    note(1046.5, 0, 0.16, 0.26), note(1318.51, 0.07, 0.16, 0.26), note(1567.98, 0.14, 0.16, 0.26),
    note(2093, 0.21, 0.42, 0.3),
  ]),
});

// Exp. 02.4: sonidos de teclado (síntesis sencilla, sin archivos). Muy breves, para
// cientos de pulsaciones seguidas: un cuerpo con el tono cayendo y, en las teclas, un
// transitorio agudo mínimo que da el «clic». Pasan por su propio volumen (relativo).
export const KEY_SOUNDS = Object.freeze({
  // Correcta: «thock» ligero y limpio (exp. 02.5: solo más ganancia).
  correct: Object.freeze([note(320, 0, 0.045, 0.34, 'sine', 160), note(2400, 0, 0.012, 0.08, 'triangle')]),
  // Incorrecta (exp. 02.5): tecla mecánica defectuosa, «clonk». Golpe de ruido filtrado, cuerpo
  // grave triangular que cae un poco y dos parciales INARMÓNICOS (× 2,76 y × 5,4, como una
  // barra metálica) que se apagan antes: seco, algo metálico y amortiguado, sin melodía.
  error: Object.freeze([
    noise(0, 0.014, 0.1, 2200, 1.2),
    note(190, 0, 0.26, 0.2, 'triangle', 165),
    note(524, 0, 0.14, 0.1, 'sine', 500),
    note(1026, 0, 0.07, 0.05, 'sine'),
  ]),
  // Retroceso: clic más grave y seco, algo más discreto que el acierto.
  backspace: Object.freeze([note(220, 0, 0.04, 0.26, 'sine', 120), note(1500, 0, 0.01, 0.06, 'triangle')]),
});
// Límite prudente de la suma de picos que pueden sonar a la vez (escala completa = 1). Exp.
// 02.5: 0,9 (antes 0,5) con el limitador de salida como protección ante solapes imprevistos.
export const MAX_COMBINED_PEAK = 0.9;
// Exp. 02.5: limitador SUAVE de salida (WaveShaper). Por debajo de LIMIT_THRESHOLD la señal
// pasa intacta; por encima se redondea hacia LIMIT_CEILING (nunca la escala completa). Se
// descartó DynamicsCompressorNode: medido en el navegador, atenuaba ~12 dB los efectos
// breves (45-70 ms) aunque no llegaran al umbral.
export const LIMIT_THRESHOLD = 0.8;
export const LIMIT_CEILING = 0.98;
const LIMIT_CURVE_POINTS = 4097;
const NOISE_SECONDS = 0.05;
const KEY_VOICE_WINDOW_S = 0.08;

/** Curva del limitador para entradas de −1 a 1: identidad hasta el umbral y tanh después. */
export function softLimitCurve(points = LIMIT_CURVE_POINTS) {
  const curve = new Float32Array(points);
  const room = LIMIT_CEILING - LIMIT_THRESHOLD;
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= LIMIT_THRESHOLD ? a : LIMIT_THRESHOLD + room * Math.tanh((a - LIMIT_THRESHOLD) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
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

// Exp. 02.5: limitador suave a la salida (después del volumen general), uno por contexto.
// Si el navegador no lo ofrece, null: el volumen general va directo a la salida.
function createLimiter(ctx) {
  if (typeof ctx.createWaveShaper !== 'function') return null;
  const limiter = ctx.createWaveShaper();
  limiter.curve = softLimitCurve();
  limiter.oversample = '2x';
  limiter.connect(ctx.destination);
  return limiter;
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
  keySound = DEFAULT_KEY_SOUND.typing,
} = {}) {
  let currentVolume = normalizeVolume(volume) ?? DEFAULT_VOLUME;
  let context = null;
  let master = null;
  // Exp. 02.4: bus del teclado (creado con la primera tecla) → volumen general.
  let keySetting = keySound;
  let keyBus = null;
  let keyVoiceEnds = [];
  let noiseBuffer = null;

  function ensureContext() {
    if (!AudioContextClass) return null;
    try {
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = volumeGain(currentVolume);
        master.connect(createLimiter(context) ?? context.destination);
      }
      if (context.state === 'suspended') context.resume()?.catch?.(() => {});
    } catch {
      context = null;
      master = null;
      keyBus = null;
      noiseBuffer = null;
    }
    return context;
  }

  // Exp. 02.5: ruido blanco determinista, creado UNA vez por contexto y reutilizado.
  function getNoiseBuffer(ctx) {
    if (!noiseBuffer) {
      const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < length; i++) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        data[i] = (seed / 1073741824) - 1;
      }
    }
    return noiseBuffer;
  }

  // Fuente de una nota: oscilador (con caída de tono opcional) o ruido filtrado.
  function createSource(ctx, n, start, end) {
    if (n.type === 'noise') {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      src.buffer = getNoiseBuffer(ctx);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(n.frequencyHz, start);
      filter.Q.setValueAtTime(n.q, start);
      src.connect(filter);
      return { source: src, output: filter };
    }
    const osc = ctx.createOscillator();
    osc.type = n.type;
    osc.frequency.setValueAtTime(n.frequencyHz, start);
    if (n.endFrequencyHz) osc.frequency.exponentialRampToValueAtTime(n.endFrequencyHz, end);
    return { source: osc, output: osc };
  }

  // Una nota con envolvente suave: ataque lineal desde 0 y caída exponencial (sin clics).
  function playNote(ctx, n, now, destination = master) {
    const start = now + n.startS;
    const end = start + n.durationS;
    const { source, output } = createSource(ctx, n, start, end);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(n.peakGain, start + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, end);
    output.connect(gain).connect(destination);
    source.start(start);
    source.stop(end);
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

  function ensureKeyBus(ctx) {
    if (!keyBus) {
      keyBus = ctx.createGain();
      keyBus.gain.value = keySoundGain(keySetting);
      keyBus.connect(master);
    }
    return keyBus;
  }

  // Tecla: silencio si el teclado o el volumen general están a 0 (sin crear el audio) y
  // como mucho MAX_KEY_VOICES a la vez, para que las ráfagas no se acumulen.
  function playKey(kind) {
    const notes = Object.hasOwn(KEY_SOUNDS, kind ?? '') ? KEY_SOUNDS[kind] : null;
    if (!notes || currentVolume === 0 || keySoundGain(keySetting) === 0) return;
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (!allowKeyVoice(keyVoiceEnds, now)) return;
      const bus = ensureKeyBus(ctx);
      for (const n of notes) playNote(ctx, n, now, bus);
      // Solo cuenta la parte fuerte: a los 80 ms la cola ya está casi apagada (< 10 %).
      const end = now + Math.min(KEY_VOICE_WINDOW_S, Math.max(...notes.map((n) => n.startS + n.durationS)));
      keyVoiceEnds = [...keyVoiceEnds.filter((t) => t > now), end];
    } catch {
      // El teclado sigue funcionando aunque el audio falle.
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
    /** Exp. 02.4: sonido de tecla ('correct', 'error', 'backspace'); null o desconocido = nada. */
    playKey,
    // Al cambiar el ajuste del teclado: una tecla correcta, para oír el nivel elegido.
    playKeyPreview: () => playKey('correct'),
    /** Exp. 02.5: botones «Probar» del panel (respetan ambos volúmenes y la casilla). */
    playTest(kind) {
      if (kind === 'finish') play(SOUNDS.objective);
      else playKey(kind);
    },
    /** Ajuste del teclado del contexto actual: { enabled, volume } (relativo al general). */
    setKeySound(setting) {
      keySetting = setting;
      try {
        keyBus?.gain.setTargetAtTime(keySoundGain(setting), context.currentTime, VOLUME_SMOOTHING_S);
      } catch {
        // Sin audio: se aplicará al crear el bus.
      }
    },
    // Al soltar el control de volumen: el sonido de fragmento, para oír el nivel elegido.
    playPreview: () => play(SOUNDS.chunk),
  };
}
