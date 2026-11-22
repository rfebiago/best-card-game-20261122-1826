// Emberfall — procedural sound. No audio files, no network: every sound is
// an oscillator or a filtered noise burst through WebAudio. The context is
// created at boot but only resumed on the first click or keypress, so the
// browser's autoplay rule is honoured. A mute toggle sits on every screen.
let context = null;
let muted = false;
try {
  muted = window.localStorage.getItem('emberfall-muted') === '1';
} catch {
  muted = false;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    window.localStorage.setItem('emberfall-muted', value ? '1' : '0');
  } catch {
    // Storage can be off: the mute then lasts this visit only.
  }
}

// Resume (or create) the context on a user gesture. Call from every click
// and key handler; it is a no-op once running.
export function unlockAudio() {
  try {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context = new AudioContext();
    }
    if (context.state === 'suspended') void context.resume();
  } catch {
    // No audio on this machine: the game plays silent and says nothing.
  }
}

function tone(frequency, seconds, type, gainValue, when = 0) {
  if (!context || muted) return;
  try {
    const start = context.currentTime + when;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  } catch {
    // A failed tone never stops the game.
  }
}

function noiseBurst(seconds, gainValue, lowpass) {
  if (!context || muted) return;
  try {
    const start = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(start);
  } catch {
    // Silence is always an acceptable fallback.
  }
}

export const sounds = {
  hover() {
    tone(880, 0.05, 'sine', 0.04);
  },
  select() {
    tone(520, 0.08, 'triangle', 0.12);
    tone(780, 0.08, 'triangle', 0.08, 0.03);
  },
  deal() {
    noiseBurst(0.09, 0.18, 900);
  },
  flip() {
    noiseBurst(0.06, 0.12, 2400);
    tone(660, 0.06, 'sine', 0.06);
  },
  trick() {
    tone(990, 0.1, 'sine', 0.1);
    tone(1320, 0.12, 'sine', 0.08, 0.05);
  },
  damage() {
    tone(196, 0.22, 'sawtooth', 0.14);
    noiseBurst(0.12, 0.16, 500);
  },
  win() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      tone(frequency, 0.28, 'triangle', 0.14, index * 0.11);
    });
  },
  lose() {
    [392, 330, 262, 196].forEach((frequency, index) => {
      tone(frequency, 0.32, 'sine', 0.12, index * 0.14);
    });
  },
  denied() {
    tone(160, 0.12, 'square', 0.08);
  },
};

// Quiet the audio when the tab is hidden, so a paused game never drones on.
export function watchVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && context) void context.suspend();
    else if (!document.hidden && context && !muted) void context.resume();
  });
}
