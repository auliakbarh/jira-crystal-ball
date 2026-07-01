// Tiny sound player for Tarot events. Files live in /public/sounds.
// Muting is persisted in localStorage so a user can silence the room.
type SoundName = "join" | "select" | "reveal";

const cache: Partial<Record<SoundName, HTMLAudioElement>> = {};

export function soundMuted(): boolean {
  return localStorage.getItem("jcb_tarot_muted") === "1";
}

export function setSoundMuted(muted: boolean) {
  localStorage.setItem("jcb_tarot_muted", muted ? "1" : "0");
}

// ── UI sound effects (synthesized via WebAudio — no asset files) ──
// Global mute shared by clicks + toast notifications, persisted separately from
// the tarot room mute so silencing the app doesn't silence a running room only.
export function uiMuted(): boolean {
  return localStorage.getItem("jcb_muted") === "1";
}
export function setUiMuted(muted: boolean) {
  localStorage.setItem("jcb_muted", muted ? "1" : "0");
}

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

// Play a short sequence of tones. Each note: [frequency Hz, startOffset s, duration s].
function tones(seq: [number, number, number][], type: OscillatorType, peak: number) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;
  for (const [freq, at, dur] of seq) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0 + at);
    gain.gain.linearRampToValueAtTime(peak, t0 + at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
}

// A short filtered white-noise burst — used for percussive/typewriter clicks.
function noiseBurst(dur: number, filterHz: number, peak: number, type: BiquadFilterType = "highpass") {
  const c = getCtx();
  if (!c) return;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = filterHz;
  const g = c.createGain();
  const t0 = c.currentTime;
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export type UiSound = "click" | "success" | "error" | "type";
export function playUi(name: UiSound) {
  if (uiMuted()) return;
  try {
    if (name === "click") {
      tones([[520, 0, 0.07]], "sine", 0.025); // soft, gentle tap
    } else if (name === "type") {
      // Typewriter keystroke: a crisp noise click + a low "thock".
      noiseBurst(0.028, 2600, 0.16, "highpass");
      tones([[170, 0.004, 0.045]], "triangle", 0.05);
    } else if (name === "success") {
      tones([[523.25, 0, 0.09], [783.99, 0.09, 0.14]], "sine", 0.07);
    } else {
      tones([[349.23, 0, 0.1], [220, 0.11, 0.2]], "sawtooth", 0.06); // error: descending
    }
  } catch {
    /* no-op */
  }
}

// Distinct theme-switch chime: bright rising triad for light, mellow falling for dark.
export function playTheme(dark: boolean) {
  if (uiMuted()) return;
  try {
    if (dark) tones([[659.25, 0, 0.1], [493.88, 0.09, 0.14], [349.23, 0.19, 0.22]], "triangle", 0.06);
    else tones([[392, 0, 0.09], [587.33, 0.08, 0.12], [880, 0.17, 0.2]], "triangle", 0.06);
  } catch {
    /* no-op */
  }
}

export function playSound(name: SoundName) {
  if (soundMuted()) return;
  try {
    let a = cache[name];
    if (!a) {
      a = new Audio(`/sounds/${name}.wav`);
      a.volume = 0.5;
      cache[name] = a;
    }
    a.currentTime = 0;
    void a.play().catch(() => undefined); // ignore autoplay-block errors
  } catch {
    /* no-op */
  }
}
