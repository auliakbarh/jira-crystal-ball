import { motion } from "framer-motion";
import { cardDisplay } from "../../lib/tarot";

// A single planning-poker card. Flips between a face-down back and a face that
// shows either a deck value (for picking) or a revealed name+value.
export default function PokerCard({
  value,
  faceUp,
  selected = false,
  disabled = false,
  name,
  onClick,
  size = "md",
}: {
  value?: string | null; // deck value or chosen value (undefined = blank back)
  faceUp: boolean;
  selected?: boolean;
  disabled?: boolean;
  name?: string | null; // shown above value when revealing a participant's pick
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "lg"
      ? "h-28 w-20 text-2xl"
      : size === "sm"
        ? "h-16 w-12 text-base"
        : "h-24 w-16 text-xl";

  return (
    <motion.button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      whileHover={!disabled && onClick ? { y: -6 } : undefined}
      whileTap={!disabled && onClick ? { scale: 0.95 } : undefined}
      animate={selected ? { y: -10 } : { y: 0 }}
      className={`relative ${dims} shrink-0 [transform-style:preserve-3d] disabled:cursor-default`}
    >
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: 0.4 }}
      >
        {/* Face */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 font-bold [backface-visibility:hidden] ${
            selected
              ? "border-brand bg-brand/10 text-brand shadow-lg"
              : "border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          }`}
        >
          {name && <span className="max-w-full truncate px-1 text-[10px] font-medium text-gray-500">{name}</span>}
          <span>{value != null ? cardDisplay(value) : ""}</span>
        </div>
        {/* Back — brown with a gold crosshatch motif, inner frame and emblem */}
        <div className="absolute inset-0 overflow-hidden rounded-xl border-2 border-amber-700 bg-gradient-to-br from-amber-700 to-amber-950 text-amber-100 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {/* crosshatch pattern */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(252,211,77,0.16) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(252,211,77,0.16) 0 1px, transparent 1px 9px)",
            }}
          />
          {/* inner frame */}
          <div className="absolute inset-1.5 rounded-lg border border-amber-300/40" />
          {/* center emblem */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/50 bg-amber-900/30 text-sm text-amber-200">
              ✦
            </span>
          </div>
        </div>
      </motion.div>
    </motion.button>
  );
}
