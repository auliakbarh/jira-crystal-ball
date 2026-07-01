import { ReactNode, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type TipCard = { title: string; icon?: string; body: ReactNode };

// A small shuffleable info card: next/prev with a slide+fade animation and dots.
export default function TipsCarousel({ cards, title }: { cards: TipCard[]; title?: string }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const n = cards.length;
  if (n === 0) return null;

  const jump = (to: number) => {
    setDir(to > i ? 1 : -1);
    setI(((to % n) + n) % n);
  };
  const go = (d: number) => {
    setDir(d);
    setI((p) => (p + d + n) % n);
  };
  const c = cards[i];

  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold">{title ?? "Tips"}</h2>
        <span className="text-xs text-gray-400">
          {i + 1}/{n}
        </span>
      </div>

      <div className="relative overflow-hidden" style={{ minHeight: 132 }}>
        <AnimatePresence initial={false} mode="wait" custom={dir}>
          <motion.div
            key={i}
            custom={dir}
            initial={{ x: dir * 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir * -48, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
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
    </section>
  );
}
