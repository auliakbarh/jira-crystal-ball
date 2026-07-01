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
