import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
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
} from "../../graphql";
import { useToast } from "../../context/ToastContext";
import { statusColor, priorityColor, issueTypeRank } from "../../lib/helpers";
import { cardDisplay } from "../../lib/tarot";
import { setSoundMuted, soundMuted } from "../../lib/sound";
import PokerCard from "./PokerCard";
import Participants from "./Participants";

export default function HostRoom({ room, uid, tick, refetchRoom }: any) {
  const navigate = useNavigate();
  const toast = useToast();
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
      toast.error(e.message ?? "Action failed");
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
          <p className="text-sm text-gray-500">Host · {room.sprintName ?? "Next sprint"} · scale: {room.scaleType}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => { const m = !muted; setMuted(m); setSoundMuted(m); }} title="Toggle sound">
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="btn-ghost" onClick={() => setModal("scale")}>⚙ Scale</button>
          <button className="btn-ghost text-amber-600" onClick={() => setModal("reset")}>Reset points</button>
          {allPointed && <button className="btn-ghost text-blue-600" disabled={busy} onClick={() => setModal("sync")}>⇅ Sync Jira</button>}
          {hasSynced && (
            <button className="btn-ghost text-amber-600" disabled={busy} onClick={() => setModal("resetJira")}>
              {busy ? "Resetting…" : "↺ Reset Jira"}
            </button>
          )}
          <button className="btn-ghost text-green-600" disabled={busy} onClick={() => call(() => endRoom({ variables: { roomId, key: uid } }), { success: "Session ended." })}>End room</button>
          <button className="btn-ghost text-red-600" disabled={busy} onClick={() => setModal("delete")}>Delete</button>
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
                  <div className="mt-0.5 text-xs text-gray-400">Cycle #{round.cycle} · {round.voteCount}/{onlineVoters.length} voted</div>
                </div>
                {round.revealed && (
                  <div className="text-right text-sm">
                    <div className="font-bold text-brand">{round.syncPercent}% sync</div>
                    <div className="text-xs text-gray-500">suggestion: {round.suggestion ? cardDisplay(round.suggestion) : "— (draw)"}</div>
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
                  <p className="text-sm text-gray-400">Waiting for guests to join…</p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button className="btn-ghost" disabled={busy} onClick={() => call(() => nextCycle({ variables: { roomId, key: uid } }), { success: "New voting cycle started." })}>
                  ↻ Next cycle
                </button>
                <button className="btn-primary" disabled={!round.revealed || busy} onClick={() => setModal("decide")}>
                  ✓ Set story point
                </button>
              </div>
            </div>
          )}

          {/* Ticket list */}
          <div className="card overflow-x-auto">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">{tickets.length} tickets {allPointed && "· all tickets estimated ✅"}</span>
              <button className="btn-ghost text-xs" onClick={() => refetchTickets({ roomId, refresh: true } as any)}>↻ Reload</button>
            </div>
            {tickets.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No tickets in the next sprint.</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
                    <th className="p-2">Key</th><th className="p-2">Type</th><th className="p-2">Summary</th>
                    <th className="p-2">Priority</th><th className="p-2">Points</th><th className="p-2"></th>
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
                              <span title="effort · FE/BE/QA">
                                {t.result.effort}
                                <span className="text-gray-400"> · {t.result.pointFE ?? "–"}/{t.result.pointBE ?? "–"}/{t.result.pointQA ?? "–"}</span>
                                {t.result.syncedAt && <span title="Synced to Jira"> ⇅</span>}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <button
                              className="btn-ghost text-xs"
                              disabled={busy}
                              onClick={() => call(() => startRound({ variables: { roomId, key: uid, ticketKey: t.key } }), { success: `Session started for ${t.key}.` })}
                            >
                              {t.result ? "Re-estimate" : round?.ticketKey === t.key ? "Restart" : "Start"}
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
            call(() => decide({ variables: { roomId, key: uid, ...vals } }), { success: "Story point saved.", after: () => setModal(null) })
          }
        />
      )}
      {modal === "scale" && (
        <ScaleModal
          room={room}
          onClose={() => setModal(null)}
          onSubmit={(vars: any) => call(() => setScale({ variables: { roomId, key: uid, ...vars } }), { success: "Scale updated.", after: () => setModal(null) })}
        />
      )}
      {modal === "sync" && (
        <SyncModal
          busy={busy}
          onClose={() => setModal(null)}
          onSync={(fields: string[]) =>
            call(
              () => syncJira({ variables: { roomId, key: uid, fields } }).then((r) => {
                const n = r.data?.syncTarotToJira?.updated ?? 0;
                toast.success(`Synced ${n} ticket${n === 1 ? "" : "s"} to Jira.`);
              }),
              { after: () => setModal(null) },
            )
          }
          onReset={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: "Jira values restored (sync undone).", after: () => setModal(null) })}
        />
      )}
      {kickTarget && (
        <ConfirmModal
          title="Kick participant"
          desc={`Remove ${kickTarget.name} from the room? They can rejoin unless you end the session.`}
          confirmLabel="Kick"
          busy={busy}
          onClose={() => setKickTarget(null)}
          onConfirm={() =>
            call(() => kick({ variables: { roomId, key: uid, participantId: kickTarget.id } }), {
              success: `${kickTarget.name} removed.`,
              after: () => setKickTarget(null),
            })
          }
        />
      )}
      {modal === "resetJira" && (
        <ConfirmModal
          title="Reset Jira sync"
          desc="Restore each ticket's Jira fields to the values captured before the last sync. This writes to the Jira board."
          confirmLabel="Reset Jira"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: "Jira values restored (sync undone).", after: () => setModal(null) })}
        />
      )}
      {modal === "reset" && (
        <ConfirmTextModal
          word="RESET"
          title="Reset all story points"
          desc="This clears every decided point in this room. Type RESET to confirm."
          onClose={() => setModal(null)}
          onConfirm={() => call(() => resetPoints({ variables: { roomId, key: uid } }), { success: "All story points reset.", after: () => setModal(null) })}
        />
      )}
      {modal === "delete" && (
        <ConfirmTextModal
          word="DELETE"
          title="Delete this room"
          desc="This permanently deletes the room and its history. Type DELETE to confirm."
          onClose={() => setModal(null)}
          onConfirm={() => call(() => deleteRoom({ variables: { roomId, key: uid } }), { success: "Room deleted.", after: () => navigate("/tarot") })}
        />
      )}
    </div>
  );
}

function EndedHost({ room, uid, refetchRoom }: any) {
  const navigate = useNavigate();
  const toast = useToast();
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
      toast.error(e.message ?? "Action failed");
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
          <p className="text-sm text-gray-500">Session ended · history. Ended rooms can only be deleted by an admin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasResults && <button className="btn-ghost text-blue-600" disabled={busy} onClick={() => setModal("sync")}>⇅ Sync Jira</button>}
          {hasSynced && (
            <button className="btn-ghost text-amber-600" disabled={busy} onClick={() => setModal("resetJira")}>
              {busy ? "Resetting…" : "↺ Reset Jira"}
            </button>
          )}
          <button className="btn-ghost" onClick={() => navigate("/tarot")}>← Rooms</button>
          <button className="btn-ghost text-red-600" disabled={busy} onClick={() => setModal("delete")}>Delete (admin)</button>
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
                const n = r.data?.syncTarotToJira?.updated ?? 0;
                toast.success(`Synced ${n} ticket${n === 1 ? "" : "s"} to Jira.`);
              }),
              { after: () => setModal(null) },
            )
          }
          onReset={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: "Jira values restored (sync undone).", after: () => setModal(null) })}
        />
      )}
      {modal === "resetJira" && (
        <ConfirmModal
          title="Reset Jira sync"
          desc="Restore each ticket's Jira fields to the values captured before the last sync. This writes to the Jira board."
          confirmLabel="Reset Jira"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => call(() => resetSync({ variables: { roomId, key: uid } }), { success: "Jira values restored (sync undone).", after: () => setModal(null) })}
        />
      )}
      {modal === "delete" && (
        <ConfirmTextModal
          word="DELETE"
          title="Delete this room"
          desc="This permanently deletes the room and its history. Type DELETE to confirm."
          onClose={() => setModal(null)}
          onConfirm={() => call(() => deleteRoom({ variables: { roomId, key: uid } }), { success: "Room deleted.", after: () => navigate("/tarot") })}
        />
      )}
    </div>
  );
}

export function ResultsTable({ results }: { results: any[] }) {
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
      <div className="mb-2 text-sm text-gray-500">Decided points ({results.length}) · grouped by parent/story</div>
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
            <th className="p-2">Ticket</th><th className="p-2">Summary</th><th className="p-2">Effort</th><th className="p-2">FE</th><th className="p-2">BE</th><th className="p-2">QA</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                <td colSpan={6} className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">📄 {g.label}</td>
              </tr>
              {g.rows.map((r: any) => (
                <tr key={r.ticketKey} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2">{link(r.ticketKey)}</td>
                  <td className="p-2">{r.ticketSummary ?? <span className="text-gray-400">—</span>}</td>
                  <td className="p-2 font-mono">{r.effort}</td>
                  <td className="p-2 font-mono">{r.pointFE ?? "–"}</td>
                  <td className="p-2 font-mono">{r.pointBE ?? "–"}</td>
                  <td className="p-2 font-mono">{r.pointQA ?? "–"}</td>
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
      <h2 className="mb-1 text-base font-bold">Set story point — {round.ticketKey}</h2>
      <p className="mb-3 text-xs text-gray-500">Per-role points cannot exceed the ticket effort.</p>
      <label className="mb-2 block text-sm">Effort (story point)
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
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
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
          Done
        </button>
      </div>
    </Modal>
  );
}

function ScaleModal({ room, onClose, onSubmit }: any) {
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
      <h2 className="mb-3 text-base font-bold">Story point scale</h2>
      <div className="space-y-2">
        {["FIBONACCI", "SCRUM", "CUSTOM"].map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={type === t} onChange={() => setType(t)} /> {t}
          </label>
        ))}
        {type === "CUSTOM" && (
          <input className="input" placeholder="e.g. 1, 2, 3, 5, 8" value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} /> Set as squad default
        </label>
        <p className="text-xs text-gray-400">Cards ? and ☕ are always available.</p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}

function SyncModal({ onClose, onSync, onReset, busy }: any) {
  const [sel, setSel] = useState<Record<string, boolean>>({ point: true, fe: false, be: false, qa: false });
  const [acting, setActing] = useState<null | "sync" | "reset">(null);
  const fields = Object.keys(sel).filter((k) => sel[k]);
  return (
    <Modal onClose={busy ? () => undefined : onClose}>
      <h2 className="mb-1 text-base font-bold">Sync to Jira board</h2>
      <p className="mb-3 text-xs text-gray-500">Pick which point fields to write to Jira (mapped to this squad's configured fields). At least one required.</p>
      <div className="space-y-2">
        {[["point", "Effort → Story Points"], ["fe", "FE point"], ["be", "BE point"], ["qa", "QA point"]].map(([k, label]) => (
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
          title="Restore Jira values from before the last sync"
        >
          {busy && acting === "reset" ? "Resetting…" : "↺ Reset Jira"}
        </button>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>Close</button>
          <button className="btn-primary" disabled={busy || fields.length === 0} onClick={() => { setActing("sync"); onSync(fields); }}>
            {busy && acting === "sync" ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, desc, confirmLabel, onClose, onConfirm, busy }: any) {
  return (
    <Modal onClose={busy ? () => undefined : onClose}>
      <h2 className="mb-1 text-base font-bold">{title}</h2>
      <p className="mb-3 text-xs text-gray-500">{desc}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmTextModal({ word, title, desc, onClose, onConfirm }: any) {
  const [txt, setTxt] = useState("");
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-base font-bold">{title}</h2>
      <p className="mb-3 text-xs text-gray-500">{desc}</p>
      <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={`Type ${word}`} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={txt !== word} onClick={onConfirm}>{word}</button>
      </div>
    </Modal>
  );
}
