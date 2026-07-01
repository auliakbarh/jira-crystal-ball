import { motion } from "framer-motion";

// Lightweight ambient decoration: a few emoji drifting gently over a soft
// gradient. Purely cosmetic (pointer-events-none) — use to fill empty space.
// Caller controls placement/size via className (e.g. "absolute inset-0" for a
// background, or "hidden flex-1 md:block min-h-[160px]" beside a card).
export default function FloatingDecor({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-purple-500/10" />
      {items.map((it, idx) => {
        const left = 8 + ((idx * 73) % 82);
        const top = 10 + ((idx * 47) % 70);
        return (
          <motion.span
            key={idx}
            className="absolute select-none text-3xl opacity-70"
            style={{ left: `${left}%`, top: `${top}%` }}
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: [0, -10, 0], opacity: 0.7 }}
            transition={{
              y: { repeat: Infinity, duration: 3 + idx * 0.4, ease: "easeInOut" },
              opacity: { duration: 0.6, delay: idx * 0.1 },
            }}
          >
            {it}
          </motion.span>
        );
      })}
    </div>
  );
}
