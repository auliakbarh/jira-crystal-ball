import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useSquad } from "../context/SquadContext";
import { useToast } from "../context/ToastContext";
import { CREATE_TAROT_ROOM, TAROT_ROOMS } from "../graphql";
import { getTarotUid } from "../lib/tarot";

export default function Tarot() {
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
    if (error) toast.error(`Could not load rooms: ${error.message}`);
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
        toast.success("Room created.");
        navigate(`/tarot/${id}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not create room");
      await refetch();
    }
  };

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">🃏 Tarot — Planning Poker</h1>
          <p className="text-sm text-gray-500">Estimate next-sprint tickets together. Helps Sprint Planning.</p>
        </div>
        <button
          className="btn-primary"
          onClick={onCreate}
          disabled={creating || !!activeRoom}
          title={activeRoom ? "An active room already exists for this squad" : "Create a room"}
        >
          {creating ? "Creating…" : "+ Create room"}
        </button>
      </div>

      {activeRoom && (
        <div className="card flex items-center justify-between bg-amber-50 text-sm dark:bg-amber-900/20">
          <span>
            A room hosted by <b>{activeRoom.hostName}</b> is currently active. Join it instead of creating a new one.
          </span>
          <button className="btn-ghost" onClick={() => navigate(`/tarot/${activeRoom.id}`)}>
            Join →
          </button>
        </div>
      )}

      {error && <div className="card text-sm text-red-600 dark:text-red-400">{error.message}</div>}

      {loading && rooms.length === 0 ? (
        <div className="card flex items-center gap-2 text-sm text-gray-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Loading rooms…
        </div>
      ) : rooms.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-4xl">🪄</div>
          <p className="text-sm text-gray-500">No rooms yet. Create one to start estimating.</p>
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
                  {r.status === "ACTIVE" ? "Active" : "Ended"}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Host: {r.hostName} · {new Date(r.createdAt).toLocaleString()} · 👥 {r.participantCount}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
