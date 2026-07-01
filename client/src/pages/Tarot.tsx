import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useSquad } from "../context/SquadContext";
import { useToast } from "../context/ToastContext";
import { CREATE_TAROT_ROOM, TAROT_ROOMS } from "../graphql";
import { getTarotUid } from "../lib/tarot";
import TipsCarousel, { TipCard } from "../components/TipsCarousel";

export default function Tarot() {
  const { t } = useTranslation();
  const TAROT_TIPS: TipCard[] = [
    { icon: "👤", title: t("tarot.tipGuest1Title"), body: t("tarot.tipGuest1Body") },
    { icon: "👤", title: t("tarot.tipGuest2Title"), body: t("tarot.tipGuest2Body") },
    { icon: "👤", title: t("tarot.tipGuest3Title"), body: t("tarot.tipGuest3Body") },
    { icon: "❓", title: t("tarot.tipGuest4Title"), body: t("tarot.tipGuest4Body") },
    { icon: "🎩", title: t("tarot.tipHost1Title"), body: t("tarot.tipHost1Body") },
    { icon: "🎩", title: t("tarot.tipHost2Title"), body: t("tarot.tipHost2Body") },
    { icon: "🎩", title: t("tarot.tipHost3Title"), body: t("tarot.tipHost3Body") },
    { icon: "🎩", title: t("tarot.tipHost4Title"), body: t("tarot.tipHost4Body") },
  ];
  const { squadId } = useSquad();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, refetch } = useQuery(TAROT_ROOMS, {
    variables: { squadId },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
    pollInterval: 5000,
  });
  const [createRoom, { loading: creating }] = useMutation(CREATE_TAROT_ROOM);

  useEffect(() => {
    if (error) toast.error(t("tarot.couldNotLoadRooms", { message: error.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  if (!squadId) return null;

  const rooms = data?.tarotRooms ?? [];
  const activeRoom = rooms.find((r: any) => r.status === "ACTIVE");

  const onCreate = async () => {
    try {
      const res = await createRoom({
        variables: { squadId, hostName: user?.name ?? "Host", hostKey: getTarotUid() },
      });
      const id = res.data?.createTarotRoom?.id;
      if (id) {
        toast.success(t("tarot.roomCreated"));
        navigate(`/tarot/${id}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? t("tarot.couldNotCreateRoom"));
      await refetch();
    }
  };

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{t("tarot.pageTitle")}</h1>
          <p className="text-sm text-gray-500">{t("tarot.pageSubtitle")}</p>
        </div>
        <button
          className="btn-primary"
          onClick={onCreate}
          disabled={creating || !!activeRoom}
          title={activeRoom ? t("tarot.activeRoomExistsTitle") : t("tarot.createRoomTitle")}
        >
          {creating ? t("tarot.creating") : t("tarot.createRoom")}
        </button>
      </div>

      {activeRoom && (
        <div className="card flex items-center justify-between bg-amber-50 text-sm dark:bg-amber-900/20">
          <span>
            {t("tarot.activeRoomBannerBefore")} <b>{activeRoom.hostName}</b> {t("tarot.activeRoomBannerAfter")}
          </span>
          <button className="btn-ghost" onClick={() => navigate(`/tarot/${activeRoom.id}`)}>
            {t("tarot.join")}
          </button>
        </div>
      )}

      {error && <div className="card text-sm text-red-600 dark:text-red-400">{error.message}</div>}

      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <TipsCarousel title={t("tarot.howToPlay")} cards={TAROT_TIPS} />
        <TarotDecor />
      </div>

      {loading && rooms.length === 0 ? (
        <div className="card flex items-center gap-2 text-sm text-gray-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {t("tarot.loadingRooms")}
        </div>
      ) : rooms.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-4xl">🪄</div>
          <p className="text-sm text-gray-500">{t("tarot.noRoomsYet")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r: any) => (
            <button
              key={r.id}
              onClick={() => navigate(`/tarot/${r.id}`)}
              className="card text-left transition hover:ring-2 hover:ring-brand/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{r.name}</span>
                <span
                  className={`chip shrink-0 ${
                    r.status === "ACTIVE"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                  }`}
                >
                  {r.status === "ACTIVE" ? t("tarot.statusActive") : t("tarot.statusEnded")}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {t("tarot.hostLabel", { name: r.hostName })} · {new Date(r.createdAt).toLocaleString()} · 👥 {r.participantCount}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Decorative fanned deck of poker-planning cards, shown beside the tips card to
// fill the empty space on the Tarot landing. Pure CSS + framer-motion (gentle float).
function TarotDecor() {
  const { t } = useTranslation();
  const deck = ["1", "2", "3", "5", "8", "❓", "☕"];
  const n = deck.length;
  const mid = (n - 1) / 2;
  return (
    <div className="relative hidden flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-200 dark:border-gray-700 md:flex">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-purple-500/10" />
      <div className="relative" style={{ height: 160, width: 300 }}>
        {deck.map((v, idx) => {
          const ang = (idx - mid) * 13;
          const tx = (idx - mid) * 36 - 28;
          const special = v === "❓" || v === "☕";
          return (
            <motion.div
              key={idx}
              className={`absolute left-1/2 top-1/2 flex h-20 w-14 items-center justify-center rounded-lg border shadow-lg ${
                special
                  ? "border-purple-200 bg-purple-50 text-xl dark:border-purple-900/60 dark:bg-purple-900/30"
                  : "border-gray-200 bg-white text-2xl font-bold text-brand dark:border-gray-700 dark:bg-gray-800"
              }`}
              style={{ transformOrigin: "center bottom", marginTop: -28 }}
              initial={{ opacity: 0, rotate: ang, x: tx, y: 8 }}
              animate={{ opacity: 1, rotate: ang, x: tx, y: [0, -8, 0] }}
              transition={{
                opacity: { duration: 0.4, delay: idx * 0.07 },
                y: { repeat: Infinity, duration: 3 + idx * 0.25, ease: "easeInOut" },
              }}
            >
              {v}
            </motion.div>
          );
        })}
      </div>
      <span className="pointer-events-none absolute bottom-3 text-xs text-gray-400">🃏 {t("tarot.pageSubtitle")}</span>
    </div>
  );
}
