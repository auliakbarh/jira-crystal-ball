import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export type TipCard = { title: string; icon?: string; body: ReactNode };

const AUTO_MS = 10_000;

// Shuffleable info cards rendered as a physical stack of flashcards: the top card
// sits in front, the next few peek behind it, and advancing flings the top card
// away while the stack slides forward. Auto-advances every 10s (pauses on hover /
// when hidden) and can be hidden/shown.
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

  useEffect(() => {
    if (hidden || paused || n <= 1) return;
    const id = setInterval(() => {
      setDir(1);
      setI((p) => (p + 1) % n);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [hidden, paused, n, i]);

  if (n === 0) return null;

  // Cyclic offset of a card relative to the current top (-1..+2 are rendered):
  // -1 = leaving (flings away), 0 = front, 1/2 = stacked behind.
  const offsetOf = (idx: number) => {
    let o = idx - i;
    if (o > n / 2) o -= n;
    if (o < -n / 2) o += n;
    return o;
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{title ?? "Tips"}</h2>
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
            {/* Card stack (compact) */}
            <div
              className="relative mt-2"
              style={{ height: 104, perspective: 1000 }}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              {cards.map((card, idx) => {
                const o = offsetOf(idx);
                if (o < -1 || o > 2) return null;
                const leaving = o < 0;
                return (
                  <motion.div
                    key={idx}
                    className="absolute inset-x-0 top-0 rounded-lg border border-gray-200 bg-white p-2.5 shadow-md dark:border-gray-700 dark:bg-gray-800"
                    style={{ transformOrigin: "center bottom" }}
                    initial={false}
                    animate={
                      leaving
                        ? { y: -56, x: dir * 28, rotate: dir * -5, scale: 0.94, opacity: 0, zIndex: 30 }
                        : {
                            y: o * 8,
                            scale: 1 - o * 0.04,
                            opacity: o === 0 ? 1 : 0.5 - (o - 1) * 0.15,
                            zIndex: 20 - o,
                            rotate: 0,
                            x: 0,
                          }
                    }
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  >
                    <div className="flex items-start gap-2">
                      {card.icon && <div className="shrink-0 text-lg">{card.icon}</div>}
                      <div>
                        <h3 className="text-xs font-semibold">{card.title}</h3>
                        <div className="mt-0.5 text-[11px] leading-snug text-gray-600 dark:text-gray-300">{card.body}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between">
              <button className="text-xs text-gray-500 hover:text-brand" onClick={() => go(-1)} aria-label="Previous tip">
                ←
              </button>
              <div className="flex gap-1">
                {cards.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => jump(idx)}
                    aria-label={`Tip ${idx + 1}`}
                    className={`h-1.5 w-1.5 rounded-full transition ${
                      idx === i ? "bg-brand" : "bg-gray-300 hover:bg-gray-400 dark:bg-gray-600"
                    }`}
                  />
                ))}
              </div>
              <button className="text-xs text-gray-500 hover:text-brand" onClick={() => go(1)} aria-label="Next tip">
                →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
