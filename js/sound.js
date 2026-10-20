// Efectos de sonido con la Web Audio API. Sin archivos ni librerías.
// Independiente de la lógica del juego: main.js decide cuándo sonar.

const TONE = Object.freeze({
  frequencyHz: 880,
  endFrequencyHz: 1320,
  attackS: 0.012,
  durationS: 0.11,
  peakGain: 0.06,
  silenceGain: 0.0001,
});

function defaultAudioContextClass() {
  return globalThis.AudioContext ?? globalThis.webkitAudioContext;
}

/**
 * Reproductor de efectos. El AudioContext se crea en unlock() o en la primera
 * reproducción, que deben ocurrir tras una interacción del usuario.
 * Si la API no existe o falla, todas las operaciones son silenciosas.
 */
export function createSoundPlayer({
  enabled = true,
  AudioContextClass = defaultAudioContextClass(),
} = {}) {
  let isOn = enabled;
  let context = null;

  function ensureContext() {
    if (!AudioContextClass) return null;
    try {
      context ??= new AudioContextClass();
      if (context.state === 'suspended') context.resume()?.catch?.(() => {});
    } catch {
      context = null;
    }
    return context;
  }

  function playTone(ctx) {
    const now = ctx.currentTime;
    const end = now + TONE.durationS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(TONE.frequencyHz, now);
    osc.frequency.exponentialRampToValueAtTime(TONE.endFrequencyHz, end);
    // Envolvente: subida corta desde 0 y caída exponencial para evitar clics.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(TONE.peakGain, now + TONE.attackS);
    gain.gain.exponentialRampToValueAtTime(TONE.silenceGain, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(end);
  }

  return {
    isEnabled: () => isOn,
    setEnabled(value) {
      isOn = Boolean(value);
    },
    toggle() {
      isOn = !isOn;
      return isOn;
    },
    unlock() {
      ensureContext();
    },
    playChunkComplete() {
      if (!isOn) return;
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        playTone(ctx);
      } catch {
        // El juego continúa aunque el audio falle.
      }
    },
  };
}
