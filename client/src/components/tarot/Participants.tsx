import { AnimatePresence, motion } from "framer-motion";

interface P {
  id: string;
  name: string;
  isHost: boolean;
  online: boolean;
  hasVoted: boolean;
}

// Live roster shown to both host and guests. Host gets a kick button per guest.
export default function Participants({
  participants,
  canKick = false,
  onKick,
}: {
  participants: P[];
  canKick?: boolean;
  onKick?: (id: string, name: string) => void;
}) {
  return (
    <div className="card">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Participants ({participants.length})
      </div>
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {participants.map((p) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${p.online ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                title={p.online ? "Online" : "Offline"}
              />
              <span className="truncate">{p.name}</span>
              {p.isHost && (
                <span className="chip bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                  Host
                </span>
              )}
              {!p.isHost && p.hasVoted && <span title="Voted">✅</span>}
              {canKick && !p.isHost && (
                <button
                  className="ml-auto text-xs text-red-500 hover:underline"
                  onClick={() => onKick?.(p.id, p.name)}
                  title="Kick participant"
                >
                  Kick
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
