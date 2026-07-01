import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return (
    <div className="card">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {t("tarot.participants", { count: participants.length })}
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
                title={p.online ? t("tarot.online") : t("tarot.offline")}
              />
              <span className="truncate">{p.name}</span>
              {p.isHost && (
                <span className="chip bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                  {t("tarot.hostBadge")}
                </span>
              )}
              {!p.isHost && p.hasVoted && <span title={t("tarot.voted")}>✅</span>}
              {canKick && !p.isHost && (
                <button
                  className="ml-auto text-xs text-red-500 hover:underline"
                  onClick={() => onKick?.(p.id, p.name)}
                  title={t("tarot.kickParticipantTitle")}
                >
                  {t("tarot.kick")}
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
