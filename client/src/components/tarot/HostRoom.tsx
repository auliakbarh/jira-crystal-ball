import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import {
  DECIDE_TAROT_POINT,
  DELETE_TAROT_ROOM,
  END_TAROT_ROOM,
  KICK_TAROT_PARTICIPANT,
  NEXT_TAROT_CYCLE,
  RESET_TAROT_POINTS,
  RESET_TAROT_SYNC,
  SET_TAROT_SCALE,
  START_TAROT_ROUND,
  SYNC_TAROT_TO_JIRA,
  TAROT_TICKETS,
  JIRA_ENV,
  FORCE_REVEAL_TAROT_ROUND,
} from "../../graphql";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { statusColor, priorityColor, issueTypeRank } from "../../lib/helpers";
import { cardDisplay } from "../../lib/tarot";
import { setSoundMuted, soundMuted } from "../../lib/sound";
import PokerCard from "./PokerCard";
import Participants from "./Participants";
import RoundTimer from "./RoundTimer";

export default function HostRoom({ room, uid, tick, refetchRoom }: any) {
  const { t: tr } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canSync = !user?.isGuest; // guests can't write to the Jira board
  const roomId = room.id;
  const ended = room.status === "ENDED";

  const { data: tData, refetch: refetchTickets } = useQuery(TAROT_TICKETS, {
    variables: { roomId, refresh: false },
    fetchPolicy: "cache-and-network",
  });

  const [startRound] = useMutation(START_TAROT_ROUND);
  const [nextCycle] = useMutation(NEXT_TAROT_CYCLE);
  const [decide] = useMutation(DECIDE_TAROT_POINT);
  const [resetPoints] = useMutation(RESET_TAROT_POINTS);
  const [endRoom] = useMutation(END_TAROT_ROOM);
  const [deleteRoom] = useMutation(DELETE_TAROT_ROOM);
  const [syncJira] = useMutation(SYNC_TAROT_TO_JIRA);
  const [resetSync] = useMutation(RESET_TAROT_SYNC);
  const [setScale] = useMutation(SET_TAROT_SCALE);
  const [kick] = useMutation(KICK_TAROT_PARTICIPANT);
  const [forceReveal] = useMutation(FORCE_REVEAL_TAROT_ROUND);

  const [muted, setMuted] = useState(soundMuted());
  const [modal, setModal] = useState<null | "decide" | "sync" | "scale" | "reset" | "delete" | "resetJira">(null);
  const [busy, setBusy] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(null);

  // Refresh ticket list (decided points / sync status) on room events.
  useEffect(() => {
    void refetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const tickets = tData?.tarotTickets ?? [];
  const round = room.currentRound;
  const voters = room.participants.filter((p: any) => !p.isHost);
  const onlineVoters = voters.filter((p: any) => p.online);

  const allPointed = tickets.length > 0 && tickets.every((t: any) => t.result);
  const hasSynced = (room.results ?? []).some((r: any) => r.syncedAt);

  // Run a mutation with a busy guard + toast feedback. Refreshes are best-effort
  // (a JIRA hiccup here must not look like the action failed); the subscription/
  // poll reconciles anyway.
  const call = async (fn: () => Promise<any>, opts: { success?: string; after?: () => void } = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e.message ?? tr("tarot.actionFailed"));
      setBusy(false);
      return;
    }
    if (opts.success) toast.success(opts.success);
    opts.after?.();
    void refetchRoom().catch(() => undefined);
    void refetchTickets().catch(() => undefined);
    setBusy(false);
  };

  const groups = useMemo(() => {
    const rows = [...tickets].sort(
      (a: any, b: any) => issueTypeRank(a.issueType) - issueTypeRank(b.issueType) || a.key.localeCompare(b.key),
    );
    const map = new Map<string, { key: string; label: string; rows: any[] }>();
    for (const t of rows) {
      const key = t.parentKey ?? t.key;
      const label = t.parentKey ? `${t.parentKey} · ${t.parentName ?? ""}` : `${t.key} · ${t.summary ?? ""}`;
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(t);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [tickets]);

  if (ended) {
    return <EndedHost room={room} uid={uid} refetchRoom={refetchRoom} />;
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">🃏 {room.name}</h1>
          <p className="text-sm text-gray-500">{tr("tarot.hostHeaderMeta", { sprint: room.sprintName ?? tr("tarot.nextSprint"), scale: room.scaleType })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => { const m = !muted; setMuted(m); setSoundMuted(m); }} title={tr("tarot.toggleSound")}>
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="btn-ghost" onClick={() => setModal("scale")}>{tr("tarot.scaleBtn")}</button>
          <button className="btn-ghost text-amber-600" onClick={() => setModal("reset")}>{tr("tarot.resetPoints")}</button>
          {allPointed && canSync && <button className="btn-ghost text-blue-600" disabled={busy} onClick={() => setModal("sync")}>{tr("tarot.syncJira")}</button>}
          {hasSynced && canSync && (
            <button className="btn-ghost text-amber-600" disabled={busy} onClick={() => setModal("resetJira")}>
              {busy ? tr("tarot.resetting") : tr("tarot.resetJiraBtn")}
            </button>
          )}
          {allPointed && !canSync && (
            <span className="text-xs text-gray-400" title={tr("tarot.guestNoSyncHint")}>ℹ️ {tr("tarot.guestNoSync")}</span>
          )}
          <button className="btn-ghost text-green-600" disabled={busy} onClick={() => call(() => endRoom({ variables: { roomId, key: uid } }), { success: tr("tarot.sessionEndedToast") })}>{tr("tarot.endRoom")}</button>
          <button className="btn-ghost text-red-600" disabled={busy} onClick={() => setModal("delete")}>{tr("tarot.delete")}</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {/* Active round table */}
          {round && (
            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <a href={round.ticketUrl} target="_blank" rel="noreferrer" className="font-mono font-bold text-brand hover:underline">
                    {round.ticketKey}
                  </a>
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">{round.ticketSummary}</span>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                    <span>{tr("tarot.cycleVoted", { cycle: round.cycle, voted: round.voteCount, total: onlineVoters.length })}</span>
                    {round.createdAt && <RoundTimer startedAt={round.createdAt} />}
                  </div>
                </div>
                {round.revealed && (
                  <div className="text-right text-sm">
                    <div className="font-bold text-brand">{tr("tarot.syncPercent", { percent: round.syncPercent })}</div>
                    <div className="text-xs text-gray-500">{tr("tarot.suggestionLabel", { value: round.suggestion ? cardDisplay(round.suggestion) : tr("tarot.suggestionDraw") })}</div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {round.revealed
                  ? round.votes.map((v: any) => (
                      <PokerCard key={v.participantId} value={v.value} name={v.name} faceUp disabled />
                    ))
                  : onlineVoters.map((p: any) => <PokerCard key={p.id} faceUp={false} disabled />)}
                {!round.revealed && onlineVoters.length === 0 && (
                  <p className="text-sm text-gray-400">{tr("tarot.waitingForGuests")}</p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button className="btn-ghost" disabled={busy} onClick={() => call(() => nextCycle({ variables: { roomId, key: uid } }), { success: tr("tarot.newCycleToast") })}>
                  {tr("tarot.nextCycle")}
                </button>
                {!round.revealed && (
                  <button
                    className="btn-ghost text-blue-600"
                    disabled={busy || round.voteCount === 0}
                    title={round.voteCount === 0 ? tr("tarot.noConfirmedVotes") : tr("tarot.revealCardsNowTitle")}
                    onClick={() => call(() => forceReveal({ variables: { roomId, key: uid } }), { success: tr("tarot.cardsRevealedToast") })}
                  >
                    {tr("tarot.revealNow")}
                  </button>
                )}
                <button className="btn-primary" disabled={!round.revealed || busy} onClick={() => setModal("decide")}>
                  {tr("tarot.setStoryPoint")}
                </button>
              </div>
            </div>
          )}

          {/* Ticket list */}
          <div className="card overflow-x-auto">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">{tr("tarot.ticketsCount", { count: tickets.length })} {allPointed && tr("tarot.allTicketsEstimated")}</span>
              <button className="btn-ghost text-xs" onClick={() => refetchTickets({ roomId, refresh: true } as any)}>{tr("tarot.reload")}</button>
            </div>
            {tickets.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">{tr("tarot.noTicketsNextSprint")}</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
                    <th className="p-2">{tr("tarot.thKey")}</th><th className="p-2">{tr("tarot.thType")}</th><th className="p-2">{tr("tarot.thSummary")}</th>
                    <th className="p-2">{tr("tarot.thPriority")}</th><th className="p-2">{tr("tarot.thPoints")}</th><th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="bg-gray-50 dark:bg-gray-800/60">
                        <td colSpan={6} className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">📄 {g.label}</td>
                      </tr>
                      {g.rows.map((t: any) => (
                        <tr key={t.key} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="p-2">
                            <a href={t.url} target="_blank" rel="noreferrer" className="font-mono font-bold text-brand hover:underline">{t.key}</a>
                          </td>
                          <td className="p-2">{t.issueType && <span className="chip bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">{t.issueType}</span>}</td>
                          <td className="p-2">{t.summary}</td>
                          <td className="p-2">{t.priority && <span className={`chip ${priorityColor(t.priority)}`}>{t.priority}</span>}</td>
                          <td className="p-2 font-mono text-xs">
                            {t.result ? (
                              <span title={tr("tarot.effortRoleTitle")}>
                                {t.result.effort}
                                <span className="text-gray-400"> · {t.result.pointFE ?? "–"}/{t.result.pointBE ?? "–"}/{t.result.pointQA ?? "–"}</span>
                                {t.result.syncedAt && <span title={tr("tarot.syncedToJira")}> ⇅</span>}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <button
                              className="btn-ghost text-xs"
                              disabled={busy}
                              onClick={() => call(() => startRound({ variables: { roomId, key: uid, ticketKey: t.key } }), { success: tr("tarot.sessionStartedFor", { key: t.key }) })}
                            >
                              {t.result ? tr("tarot.reEstimate") : round?.ticketKey === t.key ? tr("tarot.restart") : tr("tarot.start")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <Participants
          participants={room.participants}
          canKick
          onKick={(id, name) => setKickTarget({ id, name })}
        />
      </div>

      {modal === "decide" && round && (
        <DecideModal
          round={round}
          onClose={() => setModal(null)}
          onSubmit={(vals: any) =>
            call(() => decide({ variables: { roomId, key: uid, ...vals } }), { success: tr("tarot.storyPointSaved"), after: () => setModal(null) })
          }
        />
      )}
      {modal === "scale" && (
        <ScaleModal
          room={room}
          onClose={() => setModal(null)}
          onSubmit={(vars: any) => call(() => setScale({ variables: { roomId, key: uid, ...vars } }), { success: tr("tarot.scaleUpdated"), after: () => setModal(null) })}
        />
      )}
      {modal === "sync" && (
        <SyncModal
          busy={busy}
          onClose={() => setModal(null)}
          onSync={(fields: string[]) =>
            call(
              () => syncJira({ variables: { roomId, key: uid, fields } }).then((r) => {
                const res = r.data?.syncTarotToJira;
                const n = res?.updated ?? 0;
                const f = res?.failed?.length ?? 0;
                if (f) toast.error(tr("tarot.syncedWithFailures", { n, f, tickets: res.failed.slice(0, 5).join(", ") }));
                else toast.success(tr("tarot.syncedToJiraToast", { count: n }));
              }),
              { after: () => setModal(null) },
            )
          }
          onReset={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: tr("tarot.jiraValuesRestored"), after: () => setModal(null) })}
        />
      )}
      {kickTarget && (
        <ConfirmModal
          title={tr("tarot.kickParticipantTitle")}
          desc={tr("tarot.kickConfirmDesc", { name: kickTarget.name })}
          confirmLabel={tr("tarot.kick")}
          busy={busy}
          onClose={() => setKickTarget(null)}
          onConfirm={() =>
            call(() => kick({ variables: { roomId, key: uid, participantId: kickTarget.id } }), {
              success: tr("tarot.participantRemoved", { name: kickTarget.name }),
              after: () => setKickTarget(null),
            })
          }
        />
      )}
      {modal === "resetJira" && (
        <ConfirmModal
          title={tr("tarot.resetJiraSyncTitle")}
          desc={tr("tarot.resetJiraSyncDesc")}
          confirmLabel={tr("tarot.resetJiraConfirm")}
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: tr("tarot.jiraValuesRestored"), after: () => setModal(null) })}
        />
      )}
      {modal === "reset" && (
        <ConfirmTextModal
          word="RESET"
          title={tr("tarot.resetAllPointsTitle")}
          desc={tr("tarot.resetAllPointsDesc")}
          onClose={() => setModal(null)}
          onConfirm={() => call(() => resetPoints({ variables: { roomId, key: uid } }), { success: tr("tarot.allPointsResetToast"), after: () => setModal(null) })}
        />
      )}
      {modal === "delete" && (
        <ConfirmTextModal
          word="DELETE"
          title={tr("tarot.deleteRoomTitle")}
          desc={tr("tarot.deleteRoomDesc")}
          onClose={() => setModal(null)}
          onConfirm={() => call(() => deleteRoom({ variables: { roomId, key: uid } }), { success: tr("tarot.roomDeletedToast"), after: () => navigate("/tarot") })}
        />
      )}
    </div>
  );
}

function EndedHost({ room, uid, refetchRoom }: any) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canSync = !user?.isGuest;
  const roomId = room.id;
  const [syncJira] = useMutation(SYNC_TAROT_TO_JIRA);
  const [resetSync] = useMutation(RESET_TAROT_SYNC);
  const [deleteRoom] = useMutation(DELETE_TAROT_ROOM);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "sync" | "resetJira" | "delete">(null);
  const hasResults = (room.results ?? []).length > 0;
  const hasSynced = (room.results ?? []).some((r: any) => r.syncedAt);

  const call = async (fn: () => Promise<any>, opts: { success?: string; after?: () => void } = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e.message ?? t("tarot.actionFailed"));
      setBusy(false);
      return;
    }
    if (opts.success) toast.success(opts.success);
    opts.after?.();
    void refetchRoom().catch(() => undefined);
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">🃏 {room.name}</h1>
          <p className="text-sm text-gray-500">{t("tarot.endedHistoryNote")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasResults && canSync && <button className="btn-ghost text-blue-600" disabled={busy} onClick={() => setModal("sync")}>{t("tarot.syncJira")}</button>}
          {hasSynced && canSync && (
            <button className="btn-ghost text-amber-600" disabled={busy} onClick={() => setModal("resetJira")}>
              {busy ? t("tarot.resetting") : t("tarot.resetJiraBtn")}
            </button>
          )}
          {hasResults && !canSync && (
            <span className="text-xs text-gray-400" title={t("tarot.guestNoSyncHint")}>ℹ️ {t("tarot.guestNoSync")}</span>
          )}
          <button className="btn-ghost" onClick={() => navigate("/tarot")}>{t("tarot.roomsNav")}</button>
          <button className="btn-ghost text-red-600" disabled={busy} onClick={() => setModal("delete")}>{t("tarot.deleteAdmin")}</button>
        </div>
      </div>
      <ResultsTable results={room.results} />
      <Participants participants={room.participants} />

      {modal === "sync" && (
        <SyncModal
          busy={busy}
          onClose={() => setModal(null)}
          onSync={(fields: string[]) =>
            call(
              () => syncJira({ variables: { roomId, key: uid, fields } }).then((r) => {
                const res = r.data?.syncTarotToJira;
                const n = res?.updated ?? 0;
                const f = res?.failed?.length ?? 0;
                if (f) toast.error(t("tarot.syncedWithFailures", { n, f, tickets: res.failed.slice(0, 5).join(", ") }));
                else toast.success(t("tarot.syncedToJiraToast", { count: n }));
              }),
              { after: () => setModal(null) },
            )
          }
          onReset={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: t("tarot.jiraValuesRestored"), after: () => setModal(null) })}
        />
      )}
      {modal === "resetJira" && (
        <ConfirmModal
          title={t("tarot.resetJiraSyncTitle")}
          desc={t("tarot.resetJiraSyncDesc")}
          confirmLabel={t("tarot.resetJiraConfirm")}
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: t("tarot.jiraValuesRestored"), after: () => setModal(null) })}
        />
      )}
      {modal === "delete" && (
        <ConfirmTextModal
          word="DELETE"
          title={t("tarot.deleteRoomTitle")}
          desc={t("tarot.deleteRoomDesc")}
          onClose={() => setModal(null)}
          onConfirm={() => call(() => deleteRoom({ variables: { roomId, key: uid } }), { success: t("tarot.roomDeletedToast"), after: () => navigate("/tarot") })}
        />
      )}
    </div>
  );
}

export function ResultsTable({ results }: { results: any[] }) {
  const { t } = useTranslation();
  const { data } = useQuery(JIRA_ENV);
  const base = (data?.jiraEnv?.baseUrl ?? "").replace(/\/+$/, "");

  // Group decided points by parent/story (parentless rows group under themselves).
  const groups = useMemo(() => {
    const rows = [...(results ?? [])].sort((a, b) => a.ticketKey.localeCompare(b.ticketKey));
    const map = new Map<string, { key: string; label: string; rows: any[] }>();
    for (const r of rows) {
      const key = r.parentKey ?? r.ticketKey;
      const label = r.parentKey
        ? `${r.parentKey}${r.parentName ? ` · ${r.parentName}` : ""}`
        : `${r.ticketKey}${r.ticketSummary ? ` · ${r.ticketSummary}` : ""}`;
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [results]);

  if (!results?.length) return null;

  const link = (k: string) =>
    base ? (
      <a href={`${base}/browse/${k}`} target="_blank" rel="noreferrer" className="font-mono font-bold text-brand hover:underline">
        {k}
      </a>
    ) : (
      <span className="font-mono font-bold">{k}</span>
    );

  return (
    <div className="card overflow-x-auto">
      <div className="mb-2 text-sm text-gray-500">{t("tarot.decidedPoints", { count: results.length })}</div>
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
            <th className="p-2">{t("tarot.thTicket")}</th><th className="p-2">{t("tarot.thSummary")}</th><th className="p-2">{t("tarot.thEffort")}</th><th className="p-2">{t("tarot.thFE")}</th><th className="p-2">{t("tarot.thBE")}</th><th className="p-2">{t("tarot.thQA")}</th><th className="p-2">{t("tarot.thJira")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                <td colSpan={7} className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">📄 {g.label}</td>
              </tr>
              {g.rows.map((r: any) => (
                <tr key={r.ticketKey} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2">{link(r.ticketKey)}</td>
                  <td className="p-2">{r.ticketSummary ?? <span className="text-gray-400">—</span>}</td>
                  <td className="p-2 font-mono">{r.effort}</td>
                  <td className="p-2 font-mono">{r.pointFE ?? "–"}</td>
                  <td className="p-2 font-mono">{r.pointBE ?? "–"}</td>
                  <td className="p-2 font-mono">{r.pointQA ?? "–"}</td>
                  <td className="p-2">
                    {r.syncedAt ? (
                      <span className="chip bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" title={t("tarot.syncedAt", { date: new Date(r.syncedAt).toLocaleString() })}>
                        {t("tarot.syncedChip")}
                      </span>
                    ) : (
                      <span className="chip bg-gray-100 text-gray-500 dark:bg-gray-800">{t("tarot.notSyncedChip")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function DecideModal({ round, onClose, onSubmit }: any) {
  const { t } = useTranslation();
  const init = round.suggestion && !isNaN(Number(round.suggestion)) ? round.suggestion : "";
  const [effort, setEffort] = useState(init);
  const [fe, setFe] = useState("");
  const [be, setBe] = useState("");
  const [qa, setQa] = useState("");
  const e = Number(effort);
  const valid = effort !== "" && Number.isFinite(e) && e >= 0;
  const within = (v: string) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= e);
  const ok = valid && within(fe) && within(be) && within(qa);

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-base font-bold">{t("tarot.setStoryPointModalTitle", { key: round.ticketKey })}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("tarot.perRoleHint")}</p>
      <label className="mb-2 block text-sm">{t("tarot.effortLabel")}
        <input className="input mt-1" type="number" step="any" min={0} value={effort} onChange={(e) => setEffort(e.target.value)} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {[["FE", fe, setFe], ["BE", be, setBe], ["QA", qa, setQa]].map(([label, val, set]: any) => (
          <label key={label} className="block text-sm">{label}
            <input className="input mt-1" type="number" step="any" min={0} max={valid ? e : undefined} value={val} onChange={(ev) => set(ev.target.value)} />
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t("tarot.cancel")}</button>
        <button
          className="btn-primary"
          disabled={!ok}
          onClick={() =>
            onSubmit({
              effort: e,
              pointFE: fe === "" ? null : Number(fe),
              pointBE: be === "" ? null : Number(be),
              pointQA: qa === "" ? null : Number(qa),
            })
          }
        >
          {t("tarot.done")}
        </button>
      </div>
    </Modal>
  );
}

function ScaleModal({ room, onClose, onSubmit }: any) {
  const { t: tr } = useTranslation();
  const [type, setType] = useState(room.scaleType);
  const [custom, setCustom] = useState(room.scaleValues.filter((v: string) => !isNaN(Number(v))).join(", "));
  const [asDefault, setAsDefault] = useState(false);
  const submit = () => {
    const vars: any = { scaleType: type, setDefault: asDefault };
    if (type === "CUSTOM") {
      const nums = custom.split(/[,\s]+/).map(Number).filter((n: number) => Number.isFinite(n));
      vars.scaleValues = nums;
    }
    onSubmit(vars);
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-base font-bold">{tr("tarot.storyPointScale")}</h2>
      <div className="space-y-2">
        {["FIBONACCI", "SCRUM", "CUSTOM"].map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={type === t} onChange={() => setType(t)} /> {t}
          </label>
        ))}
        {type === "CUSTOM" && (
          <input className="input" placeholder={tr("tarot.customScalePlaceholder")} value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} /> {tr("tarot.setAsSquadDefault")}
        </label>
        <p className="text-xs text-gray-400">{tr("tarot.specialCardsNote")}</p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{tr("tarot.cancel")}</button>
        <button className="btn-primary" onClick={submit}>{tr("tarot.save")}</button>
      </div>
    </Modal>
  );
}

function SyncModal({ onClose, onSync, onReset, busy }: any) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<Record<string, boolean>>({ point: true, fe: false, be: false, qa: false });
  const [acting, setActing] = useState<null | "sync" | "reset">(null);
  const fields = Object.keys(sel).filter((k) => sel[k]);
  return (
    <Modal onClose={busy ? () => undefined : onClose}>
      <h2 className="mb-1 text-base font-bold">{t("tarot.syncToJiraTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("tarot.syncFieldsHint")}</p>
      <div className="space-y-2">
        {[["point", t("tarot.fieldEffortStoryPoints")], ["fe", t("tarot.fieldFEPoint")], ["be", t("tarot.fieldBEPoint")], ["qa", t("tarot.fieldQAPoint")]].map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={busy} checked={!!sel[k]} onChange={(e) => setSel((s) => ({ ...s, [k]: e.target.checked }))} /> {label}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <button
          className="btn-ghost text-amber-600"
          disabled={busy}
          onClick={() => { setActing("reset"); onReset(); }}
          title={t("tarot.restoreJiraValuesTitle")}
        >
          {busy && acting === "reset" ? t("tarot.resetting") : t("tarot.resetJiraBtn")}
        </button>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>{t("tarot.close")}</button>
          <button className="btn-primary" disabled={busy || fields.length === 0} onClick={() => { setActing("sync"); onSync(fields); }}>
            {busy && acting === "sync" ? t("tarot.syncing") : t("tarot.sync")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, desc, confirmLabel, onClose, onConfirm, busy }: any) {
  const { t } = useTranslation();
  return (
    <Modal onClose={busy ? () => undefined : onClose}>
      <h2 className="mb-1 text-base font-bold">{title}</h2>
      <p className="mb-3 text-xs text-gray-500">{desc}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" disabled={busy} onClick={onClose}>{t("tarot.cancel")}</button>
        <button className="btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? t("tarot.working") : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmTextModal({ word, title, desc, onClose, onConfirm }: any) {
  const { t } = useTranslation();
  const [txt, setTxt] = useState("");
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-base font-bold">{title}</h2>
      <p className="mb-3 text-xs text-gray-500">{desc}</p>
      <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={t("tarot.typeWord", { word })} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t("tarot.cancel")}</button>
        <button className="btn-primary" disabled={txt !== word} onClick={onConfirm}>{word}</button>
      </div>
    </Modal>
  );
}
