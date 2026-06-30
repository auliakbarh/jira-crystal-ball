import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useSubscription } from "@apollo/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  JOIN_TAROT_ROOM,
  LEAVE_TAROT_ROOM,
  TAROT_HEARTBEAT,
  TAROT_ROOM,
  TAROT_ROOM_CHANGED,
} from "../graphql";
import { getTarotUid } from "../lib/tarot";
import { playSound } from "../lib/sound";
import HostRoom from "../components/tarot/HostRoom";
import GuestRoom from "../components/tarot/GuestRoom";

export default function TarotRoom() {
  const { roomId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = getTarotUid();
  const toast = useToast();
  const [joinError, setJoinError] = useState<string | null>(null);
  // Bumped on every room event so child views can refresh derived data.
  const [tick, setTick] = useState(0);

  const [joinRoom] = useMutation(JOIN_TAROT_ROOM);
  const [leaveRoom] = useMutation(LEAVE_TAROT_ROOM);
  const [heartbeat] = useMutation(TAROT_HEARTBEAT);

  const { data, refetch } = useQuery(TAROT_ROOM, {
    variables: { id: roomId, key: uid },
    skip: !roomId,
    fetchPolicy: "cache-and-network",
    pollInterval: 8000, // fallback if a WS event is missed
  });

  // Join on mount; leave on unmount.
  useEffect(() => {
    if (!roomId) return;
    joinRoom({ variables: { roomId, name: user?.name ?? "Guest", key: uid } })
      .then(() => refetch())
      .catch((e) => {
        const msg = e.message ?? "Could not join room";
        // An ended room can't be joined, but we still want to view its results —
        // the room query loads it and the ended view renders. Don't block on that.
        if (/ended/i.test(msg)) {
          void refetch();
          return;
        }
        setJoinError(msg);
        toast.error(msg);
      });
    return () => {
      void leaveRoom({ variables: { roomId, key: uid } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Heartbeat keeps this participant "online".
  useEffect(() => {
    if (!roomId) return;
    const t = setInterval(() => void heartbeat({ variables: { roomId, key: uid } }), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Live events → refetch + sound.
  const lastReveal = useRef(0);
  useSubscription(TAROT_ROOM_CHANGED, {
    variables: { roomId },
    skip: !roomId,
    onData: ({ data: d }) => {
      const ev = d.data?.tarotRoomChanged;
      if (!ev) return;
      void refetch();
      setTick((n) => n + 1);
      if (ev.kind === "join") playSound("join");
      if (ev.kind === "reveal") {
        const now = Date.now();
        if (now - lastReveal.current > 800) {
          lastReveal.current = now;
          playSound("reveal");
        }
      }
    },
  });

  const room = data?.tarotRoom;

  // Kicked → bounce back to the Tarot landing.
  useEffect(() => {
    if (room?.viewerKicked) {
      toast.info("You were removed from the room by the host.");
      navigate("/tarot", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.viewerKicked, navigate]);

  if (joinError) {
    return (
      <div className="card text-sm">
        <p className="text-red-600 dark:text-red-400">{joinError}</p>
        <button className="btn-ghost mt-2" onClick={() => navigate("/tarot")}>
          ← Back to rooms
        </button>
      </div>
    );
  }

  if (!room) return <div className="card text-sm text-gray-500">Loading room…</div>;

  // Host always gets the host view. An admin who isn't the host gets it too for
  // an ENDED room (history) so they can review + sync/undo/delete; on an active
  // room a non-host admin stays an observer (guest) to avoid clashing with the host.
  const asHost = room.isHost || (room.status === "ENDED" && !!user?.isAdmin);

  return asHost ? (
    <HostRoom room={room} uid={uid} tick={tick} refetchRoom={refetch} />
  ) : (
    <GuestRoom room={room} uid={uid} refetchRoom={refetch} />
  );
}
