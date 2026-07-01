import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export type TipCard = { title: string; icon?: string; body: ReactNode };

const AUTO_MS = 10_000;

// Shuffleable info cards: auto-advances every 10s, hide/show toggle, and a
// flashcard-style 3D flip between cards. Auto-advance pauses on hover / when hidden.
export default function TipsCarousel({ cards, title }: { cards: TipCard[]; title?: string }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const n = cards.length;

  const go = (d: number) => {
    setDir(d);
    setI((p) => (p + d + n) % n);
  };
  const jump = (to: number) => {
    setDir(to > i ? 1 : -1);
    setI(((to % n) + n) % n);
  };

  // Auto-advance; reset on manual nav (i in deps), pause on hover / hidden.
  useEffect(() => {
    if (hidden || paused || n <= 1) return;
    const id = setInterval(() => {
      setDir(1);
      setI((p) => (p + 1) % n);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [hidden, paused, n, i]);

  if (n === 0) return null;
  const c = cards[i];

  const variants = {
    enter: (d: number) => ({ rotateY: d > 0 ? 90 : -90, opacity: 0 }),
    center: { rotateY: 0, opacity: 1 },
    exit: (d: number) => ({ rotateY: d > 0 ? -90 : 90, opacity: 0 }),
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">{title ?? "Tips"}</h2>
        <div className="flex items-center gap-2">
          {!hidden && (
            <span className="text-xs text-gray-400">
              {i + 1}/{n}
            </span>
          )}
          <button
            className="text-xs text-gray-500 hover:text-brand"
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? t("common.show") : t("common.hide")}
          >
            {hidden ? `▸ ${t("common.show")}` : `▾ ${t("common.hide")}`}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!hidden && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="relative mt-2"
              style={{ perspective: 1200 }}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <div style={{ minHeight: 132 }}>
                <AnimatePresence mode="wait" custom={dir}>
                  <motion.div
                    key={i}
                    custom={dir}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    style={{ transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
                  >
                    <div className="flex items-start gap-3">
                      {c.icon && <div className="shrink-0 text-3xl">{c.icon}</div>}
                      <div>
                        <h3 className="font-semibold">{c.title}</h3>
                        <div className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{c.body}</div>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button className="btn-ghost text-sm" onClick={() => go(-1)} aria-label="Previous tip">
                ← Prev
              </button>
              <div className="flex gap-1.5">
                {cards.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => jump(idx)}
                    aria-label={`Tip ${idx + 1}`}
                    className={`h-2 w-2 rounded-full transition ${
                      idx === i ? "bg-brand" : "bg-gray-300 hover:bg-gray-400 dark:bg-gray-600"
                    }`}
                  />
                ))}
              </div>
              <button className="btn-ghost text-sm" onClick={() => go(1)} aria-label="Next tip">
                Next →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
