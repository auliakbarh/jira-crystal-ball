import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { useToast } from "../../context/ToastContext";
import { CAST_TAROT_VOTE } from "../../graphql";
import { priorityColor } from "../../lib/helpers";
import { CARD_META, cardDisplay, isSpecialCard } from "../../lib/tarot";
import { playSound } from "../../lib/sound";
import Tooltip from "../Tooltip";
import PokerCard from "./PokerCard";
import Participants from "./Participants";
import RoundTimer from "./RoundTimer";
import { ResultsTable } from "./HostRoom";

export default function GuestRoom({ room, uid, refetchRoom }: any) {
  const navigate = useNavigate();
  const toast = useToast();
  const roomId = room.id;
  const round = room.currentRound;
  const [cast] = useMutation(CAST_TAROT_VOTE);
  const [casting, setCasting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  // Track whether this guest saw the room ACTIVE during this visit. The thank-you
  // screen only makes sense on a live active→ended transition; opening an already
  // ended room jumps straight to the results.
  const [sawActive, setSawActive] = useState(false);
  useEffect(() => {
    if (room.status === "ACTIVE") setSawActive(true);
  }, [room.status]);

  // Local vote state. On a round change (or reload) seed from the server's record
  // of this viewer's own vote so a refresh doesn't drop a confirmed selection.
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setSelected(room.viewerVote?.value ?? null);
    setConfirmed(!!room.viewerVote?.confirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  const onlineVoters = room.participants.filter((p: any) => !p.isHost && p.online);

  const pick = async (value: string) => {
    if (confirmed || casting) return;
    playSound("select");
    const isConfirm = selected === value; // second click on same card → confirm
    setSelected(value);
    if (isConfirm) setConfirmed(true);
    setCasting(true);
    try {
      await cast({ variables: { roomId, key: uid, value, confirmed: isConfirm } });
      if (isConfirm) toast.success("Card locked in.");
      await refetchRoom();
    } catch (e: any) {
      setConfirmed(false); // let them retry
      toast.error(e.message ?? "Could not submit your card");
    } finally {
      setCasting(false);
    }
  };

  // Session ended → thank-you, with the ability to review the results.
  if (room.status === "ENDED") {
    // Direct access to an already-ended room → results immediately (no thank-you).
    if (showResults || !sawActive) {
      return (
        <div className="space-y-4">
          <div className="card flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">🃏 {room.name}</h1>
              <p className="text-sm text-gray-500">Session ended · estimation results</p>
            </div>
            <button className="btn-ghost" onClick={() => navigate("/tarot")}>← Back to Tarot</button>
          </div>
          {room.results?.length ? (
            <ResultsTable results={room.results} />
          ) : (
            <div className="card text-sm text-gray-500">No estimated tickets in this session.</div>
          )}
          <Participants participants={room.participants} />
        </div>
      );
    }
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center">
        <div className="text-5xl">🙏</div>
        <h1 className="text-xl font-bold">Thanks for participating!</h1>
        <p className="text-sm text-gray-500">The planning session has ended.</p>
        <div className="mt-2 flex gap-2">
          <button className="btn-primary" onClick={() => setShowResults(true)}>📊 View results</button>
          <button className="btn-ghost" onClick={() => navigate("/tarot")}>← Back to Tarot</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">🃏 {room.name}</h1>
        <span className="shrink-0 text-xs text-gray-500">Host: {room.hostName}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {!round ? (
            <div className="card">
              <p className="mb-4 text-sm text-gray-500">Waiting for the host to start a session…</p>
              <div className="flex flex-wrap gap-3 opacity-60">
                {room.scaleValues.map((v: string, i: number) => (
                  <PokerCard key={i} faceUp={false} disabled />
                ))}
              </div>
            </div>
          ) : (
            <div className="card">
              {/* Ticket header */}
              <div className="mb-4 border-b border-gray-100 pb-3 dark:border-gray-800">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={round.ticketUrl} target="_blank" rel="noreferrer" className="font-mono font-bold text-brand hover:underline">
                    {round.ticketKey}
                  </a>
                  {round.ticketType && <span className="chip bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">{round.ticketType}</span>}
                  {round.ticketPriority && <span className={`chip ${priorityColor(round.ticketPriority)}`}>{round.ticketPriority}</span>}
                  {round.createdAt && !round.revealed && (
                    <span className="ml-auto text-xs text-gray-400"><RoundTimer startedAt={round.createdAt} /></span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{round.ticketSummary}</p>
              </div>

              {round.revealed ? (
                <>
                  <div className="flex flex-wrap gap-3">
                    {round.votes.map((v: any) => (
                      <PokerCard key={v.participantId} value={v.value} name={v.name} faceUp disabled />
                    ))}
                  </div>
                  <p className="mt-3 text-center text-sm font-semibold text-brand">{round.syncPercent}% team synchronization</p>
                </>
              ) : confirmed ? (
                <>
                  <p className="mb-3 text-sm text-gray-500">Card locked. Waiting for everyone else…</p>
                  <div className="flex flex-wrap gap-3">
                    {onlineVoters.map((p: any) => <PokerCard key={p.id} faceUp={false} disabled />)}
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-3 text-sm text-gray-500">Pick a card, then click it again to confirm.</p>
                  <div className="flex flex-wrap gap-3">
                    {room.scaleValues.map((v: string) => {
                      const card = (
                        <PokerCard
                          value={v}
                          faceUp
                          selected={selected === v}
                          onClick={() => pick(v)}
                        />
                      );
                      return isSpecialCard(v) ? (
                        <Tooltip key={v} content={<span className="block max-w-[220px] text-xs"><b>{CARD_META[v].title}.</b> {CARD_META[v].tip}</span>}>
                          {card}
                        </Tooltip>
                      ) : (
                        <span key={v}>{card}</span>
                      );
                    })}
                  </div>
                  {selected && (
                    <p className="mt-3 text-sm text-gray-500">
                      Selected <b>{cardDisplay(selected)}</b> — click it again to confirm.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <Participants participants={room.participants} />
      </div>
    </div>
  );
}
