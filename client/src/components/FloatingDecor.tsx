import { useRef, useState } from "react";
import { motion } from "framer-motion";

// Ambient decoration: a soft gradient + a dotted pattern, with emoji drifting
// over it. Objects react to the pointer — the whole field parallax-shifts toward
// the cursor, and each object pops (scale/rotate) on hover. Cosmetic only
// (pointer-events pass through except on the objects themselves).
// Caller controls placement/size via className (e.g. "absolute inset-0").
export default function FloatingDecor({ items, className = "" }: { items: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Normalized pointer offset from center (-0.5..0.5); null when not hovering.
  const [p, setP] = useState<{ x: number; y: number } | null>(null);

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setP({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });
  };

  return (
    <div
      ref={ref}
      className={`overflow-hidden ${className}`}
      aria-hidden
      onMouseMove={onMove}
      onMouseLeave={() => setP(null)}
    >
      {/* soft gradient wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-purple-500/10" />
      {/* dotted pattern */}
      <div
        className="pointer-events-none absolute inset-0 text-brand/25"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1.4px)",
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(ellipse at center, black 55%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 55%, transparent 100%)",
        }}
      />
      {items.map((it, idx) => {
        const left = 8 + ((idx * 73) % 82);
        const top = 10 + ((idx * 47) % 70);
        const depth = 12 + (idx % 3) * 10; // parallax strength per item
        return (
          // Outer: parallax shift toward the pointer. Inner: idle float + hover pop.
          <motion.div
            key={idx}
            className="absolute"
            style={{ left: `${left}%`, top: `${top}%` }}
            animate={{ x: p ? p.x * depth : 0, y: p ? p.y * depth : 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 15 }}
          >
            <motion.span
              className="inline-block cursor-pointer select-none text-3xl"
              animate={{ y: [0, -10, 0] }}
              transition={{ y: { repeat: Infinity, duration: 3 + idx * 0.4, ease: "easeInOut" } }}
              whileHover={{ scale: 1.6, rotate: 18, transition: { type: "spring", stiffness: 300, damping: 12 } }}
            >
              {it}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
}
