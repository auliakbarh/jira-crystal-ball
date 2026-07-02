import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { playTheme } from "../lib/sound";

type Theme = "light" | "dark";
interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>(null as any);

interface Reveal { x: number; y: number; r: number; dark: boolean; id: number }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("jcb_theme") as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // Last pointer position (the theme button click) = circle origin.
  const pt = useRef({ x: window.innerWidth - 40, y: 20 });

  useEffect(() => {
    const onPointer = (e: PointerEvent) => { pt.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("jcb_theme", theme);
  }, [theme]);

  const toggle = () =>
    setTheme((cur) => {
      const next: Theme = cur === "dark" ? "light" : "dark";
      const { x, y } = pt.current;
      // Radius must reach the farthest screen corner from the origin.
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      setReveal({ x, y, r, dark: next === "dark", id: Date.now() });
      playTheme(next === "dark");
      // Briefly enable app-wide color transitions so bg/text cross-fade smoothly
      // (kept temporary so it doesn't lag normal hover/state color changes).
      const root = document.documentElement;
      root.classList.add("theme-anim");
      window.setTimeout(() => root.classList.remove("theme-anim"), 600);
      window.setTimeout(() => setReveal(null), 700);
      return next;
    });

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      {children}

      {/* Circular reveal (Telegram-style) as a translucent ring wave expanding
          from the toggle point — the app underneath stays fully visible; the theme
          has already switched, the ring is just a flourish following the boundary. */}
      <AnimatePresence>
        {reveal && (
          <motion.div
            key={reveal.id}
            className="pointer-events-none fixed inset-0 z-[200] overflow-hidden"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="absolute rounded-full"
              style={{
                left: reveal.x,
                top: reveal.y,
                width: 40,
                height: 40,
                marginLeft: -20,
                marginTop: -20,
                border: `3px solid ${reveal.dark ? "rgba(129,140,248,0.9)" : "rgba(251,191,36,0.95)"}`,
                boxShadow: reveal.dark
                  ? "0 0 24px 6px rgba(129,140,248,0.5), inset 0 0 24px rgba(129,140,248,0.3)"
                  : "0 0 24px 6px rgba(251,191,36,0.5), inset 0 0 24px rgba(251,191,36,0.3)",
              }}
              initial={{ scale: 0, opacity: 0.9 }}
              animate={{ scale: (reveal.r * 2) / 40 + 0.2, opacity: [0.9, 0.6, 0] }}
              transition={{ duration: 0.6, ease: "easeOut", times: [0, 0.5, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
