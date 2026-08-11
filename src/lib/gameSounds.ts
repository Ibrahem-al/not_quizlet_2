// ============================================================
// Tiny WebAudio sound effects for game modes — no audio assets,
// everything is synthesized. Muted state persists per device.
// ============================================================

export type GameSound =
  | 'correct'
  | 'wrong'
  | 'click'
  | 'flip'
  | 'match'
  | 'move'
  | 'spin'
  | 'land'
  | 'win'
  | 'lose';

const MUTE_KEY = 'sf_game_sound_muted';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage unavailable — mute state just won't persist
  }
}

interface Tone {
  freq: number;
  /** seconds after the sound starts */
  at?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  /** glide to this frequency over the tone's duration */
  glideTo?: number;
}

function playTones(tones: Tone[]): void {
  const audio = getContext();
  if (!audio) return;

  const now = audio.currentTime;
  for (const t of tones) {
    const start = now + (t.at ?? 0);
    const duration = t.duration ?? 0.12;
    const peak = t.gain ?? 0.08;

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.glideTo) osc.frequency.exponentialRampToValueAtTime(t.glideTo, start + duration);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

const SOUNDS: Record<GameSound, Tone[]> = {
  correct: [
    { freq: 523.25, duration: 0.09 },
    { freq: 783.99, at: 0.08, duration: 0.14, gain: 0.07 },
  ],
  wrong: [
    { freq: 220, type: 'triangle', duration: 0.16, glideTo: 155, gain: 0.09 },
  ],
  click: [{ freq: 660, type: 'triangle', duration: 0.05, gain: 0.045 }],
  flip: [{ freq: 440, type: 'triangle', duration: 0.07, glideTo: 560, gain: 0.05 }],
  match: [
    { freq: 587.33, duration: 0.08 },
    { freq: 880, at: 0.07, duration: 0.16, gain: 0.07 },
  ],
  move: [{ freq: 330, type: 'square', duration: 0.05, gain: 0.03 }],
  spin: [{ freq: 200, type: 'sawtooth', duration: 0.35, glideTo: 600, gain: 0.04 }],
  land: [{ freq: 392, type: 'triangle', duration: 0.18, glideTo: 330, gain: 0.07 }],
  win: [
    { freq: 523.25, duration: 0.12 },
    { freq: 659.25, at: 0.11, duration: 0.12 },
    { freq: 783.99, at: 0.22, duration: 0.12 },
    { freq: 1046.5, at: 0.33, duration: 0.28, gain: 0.09 },
  ],
  lose: [
    { freq: 392, type: 'triangle', duration: 0.16 },
    { freq: 311.13, at: 0.15, duration: 0.16 },
    { freq: 233.08, at: 0.3, duration: 0.32, gain: 0.09 },
  ],
};

/** Play a synthesized game sound. No-op when muted or WebAudio is missing. */
export function playSound(name: GameSound): void {
  if (isSoundMuted()) return;
  try {
    playTones(SOUNDS[name]);
  } catch {
    // audio failures must never break gameplay
  }
}
