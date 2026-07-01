import { createContext, useContext, useState, ReactNode } from "react";
import { setUiMuted, uiMuted } from "../lib/sound";

interface MuteCtx {
  muted: boolean;
  toggle: () => void;
}

const Ctx = createContext<MuteCtx>(null as any);

// Global UI-sound mute (button clicks + toast notifications). Persisted in
// localStorage via lib/sound so the audio layer can read it without React.
export function MuteProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState<boolean>(() => uiMuted());
  const toggle = () =>
    setMuted((m) => {
      const next = !m;
      setUiMuted(next);
      return next;
    });
  return <Ctx.Provider value={{ muted, toggle }}>{children}</Ctx.Provider>;
}

export const useMute = () => useContext(Ctx);
