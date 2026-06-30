import { useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import { SAVE_ENTRY, BLOCKERS, DASHBOARD, ACTIVITY_LOG } from "../graphql";
import { statusColor, priorityColor } from "../lib/helpers";
import Tooltip from "./Tooltip";
import Modal from "./Modal";

interface RowData {
  date: string;
  ticket?: {
    key: string;
    status?: string;
    assignee?: string;
    summary?: string;
    url?: string;
    priority?: string;
    issueType?: string;
    epicKey?: string;
    epicName?: string;
    parentKey?: string;
    parentName?: string;
    carryOverCount?: number;
    carryOverSprints?: string[];
  } | null;
  entry?: any;
}

export default function StandupRow({
  row,
  sprintId,
  squadId,
  date,
  carryOver,
  canEdit = true,
  leadKey,
}: {
  row: RowData;
  sprintId: string;
  squadId: string;
  date: string;
  carryOver?: boolean;
  canEdit?: boolean;
  leadKey?: string;
}) {
  const ticketKey = row.ticket?.key ?? row.entry?.ticketKey ?? "";
  const status = row.ticket?.status ?? row.entry?.ticketStatus;
  const summary = row.ticket?.summary ?? row.entry?.ticketSummary;
  const url = row.ticket?.url;
  const assignee = row.ticket?.assignee ?? row.entry?.ticketAssignee;
  const priority = row.ticket?.priority;
  const issueType = row.ticket?.issueType;

  const e = row.entry;
  const [fe, setFe] = useState(e?.feAssignee ?? "");
  const [be, setBe] = useState(e?.beAssignee ?? "");
  const [qa, setQa] = useState(e?.qaAssignee ?? "");
  const [update, setUpdate] = useState(e?.updateText ?? "");
  const [progress, setProgress] = useState<number>(e?.progress ?? 0);
  const [feProg, setFeProg] = useState<number>(e?.feProgress ?? 0);
  const [beProg, setBeProg] = useState<number>(e?.beProgress ?? 0);
  const [qaProg, setQaProg] = useState<number>(e?.qaProgress ?? 0);
  const [blocker, setBlocker] = useState(e?.blockerNote ?? "");
  const [saved, setSaved] = useState(false);
  const [expand, setExpand] = useState<null | "update" | "blocker">(null);

  const [save, { loading }] = useMutation(SAVE_ENTRY, {
    refetchQueries: [
      { query: BLOCKERS, variables: { squadId, includeResolved: false } },
      { query: DASHBOARD, variables: { sprintId, date } },
      { query: ACTIVITY_LOG, variables: { squadId, limit: 20, offset: 0, search: "" } },
    ],
  });

  // Reset local state when the underlying entry changes (e.g. date switch).
  useEffect(() => {
    setFe(e?.feAssignee ?? "");
    setBe(e?.beAssignee ?? "");
    setQa(e?.qaAssignee ?? "");
    setUpdate(e?.updateText ?? "");
    setProgress(e?.progress ?? 0);
    setFeProg(e?.feProgress ?? 0);
    setBeProg(e?.beProgress ?? 0);
    setQaProg(e?.qaProgress ?? 0);
    setBlocker(e?.blockerNote ?? "");
  }, [e?.id, ticketKey, date]);

  // Overall ticket % mirrors the average of filled assignee progresses;
  // falls back to the manual value when no assignee is set.
  const filledRoles = [
    { name: fe, val: feProg },
    { name: be, val: beProg },
    { name: qa, val: qaProg },
  ].filter((r) => r.name.trim());
  const hasAssignees = filledRoles.length > 0;
  const overallProgress = hasAssignees
    ? Math.round(filledRoles.reduce((s, r) => s + (Number(r.val) || 0), 0) / filledRoles.length)
    : Number(progress) || 0;

  const doSave = async () => {
    await save({
      variables: {
        input: {
          sprintId,
          date,
          ticketKey,
          ticketStatus: status,
          ticketSummary: summary,
          ticketAssignee: assignee,
          issueType: row.ticket?.issueType ?? null,
          epicKey: row.ticket?.epicKey ?? null,
          epicName: row.ticket?.epicName ?? null,
          parentKey: row.ticket?.parentKey ?? null,
          parentName: row.ticket?.parentName ?? null,
          carryOverCount: row.ticket?.carryOverCount ?? null,
          carryOverFrom: row.ticket?.carryOverSprints?.length
            ? row.ticket.carryOverSprints.join(", ")
            : null,
          feAssignee: fe || null,
          beAssignee: be || null,
          qaAssignee: qa || null,
          feProgress: Number(feProg) || 0,
          beProgress: Number(beProg) || 0,
          qaProgress: Number(qaProg) || 0,
          updateText: update,
          progress: overallProgress,
          blockerNote: blocker || null,
        },
        leadKey: leadKey ?? null,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const dirtyRef = useRef(false);
  const markDirty = () => (dirtyRef.current = true);
  const onBlur = () => {
    if (dirtyRef.current) {
      dirtyRef.current = false;
      doSave();
    }
  };

  return (
    <tr className="border-b border-gray-100 align-top dark:border-gray-800">
      {/* Ticket info */}
      <td className="p-2 align-top">
        {/* Line 1: type + ticket number + carry-over icon */}
        <div className="flex items-center gap-2">
          {issueType && (
            <span className="chip bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              {issueType}
            </span>
          )}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="font-mono text-sm font-bold text-brand hover:underline">
              {ticketKey}
            </a>
          ) : (
            <span className="font-mono text-sm font-bold">{ticketKey}</span>
          )}
          {carryOver && (
            <Tooltip
              content={
                row.ticket?.carryOverSprints?.length
                  ? `Carry-over ×${row.ticket.carryOverCount} — from: ${row.ticket.carryOverSprints.join(", ")}`
                  : "Carry-over — seen in an earlier sprint"
              }
            >
              <span className="cursor-help text-xs font-semibold text-purple-600 dark:text-purple-300">
                ↪{row.ticket?.carryOverCount ? `×${row.ticket.carryOverCount}` : ""}
              </span>
            </Tooltip>
          )}
        </div>
        {/* Line 2: priority + status */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {priority && <span className={`chip ${priorityColor(priority)}`}>{priority}</span>}
          {status && <span className={`chip ${statusColor(status)}`}>{status}</span>}
        </div>
        {summary && <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">{summary}</div>}
        {assignee && <div className="mt-0.5 text-xs text-gray-400">JIRA: {assignee}</div>}
      </td>

      {/* Assignee inputs */}
      <td className="p-2 align-top">
        <div className="space-y-1">
          <input list="jcb-fe" disabled={!canEdit} className="input py-1 text-xs disabled:opacity-60" placeholder="FE" value={fe}
            onChange={(e) => { setFe(e.target.value); markDirty(); }} onBlur={onBlur} />
          <input list="jcb-be" disabled={!canEdit} className="input py-1 text-xs disabled:opacity-60" placeholder="BE" value={be}
            onChange={(e) => { setBe(e.target.value); markDirty(); }} onBlur={onBlur} />
          <input list="jcb-qa" disabled={!canEdit} className="input py-1 text-xs disabled:opacity-60" placeholder="QA" value={qa}
            onChange={(e) => { setQa(e.target.value); markDirty(); }} onBlur={onBlur} />
        </div>
      </td>

      {/* Update */}
      <td className="p-2">
        <div className="relative">
          <textarea
            disabled={!canEdit}
            className="input min-h-[64px] pr-6 text-sm disabled:opacity-60"
            placeholder="Standup update…"
            value={update}
            onChange={(e) => { setUpdate(e.target.value); markDirty(); }}
            onBlur={onBlur}
          />
          <button
            type="button"
            className="absolute right-1 top-1 text-gray-400 hover:text-brand"
            title="Expand"
            onClick={() => setExpand("update")}
          >
            ⤢
          </button>
        </div>
      </td>

      {/* Progress */}
      <td className="p-2 align-top">
        {hasAssignees ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">{overallProgress}%</span>
            <span className="text-[10px] text-gray-400">avg of assignees</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="range" min={0} max={100} step={5} value={progress} disabled={!canEdit}
              onChange={(e) => { setProgress(Number(e.target.value)); markDirty(); }}
              onMouseUp={onBlur} onTouchEnd={onBlur}
              className="range-brand"
            />
            <div className="flex items-center gap-0.5">
              <input
                type="number" min={0} max={100} value={progress} disabled={!canEdit}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(100, Number(e.target.value)));
                  setProgress(Number.isNaN(n) ? 0 : n);
                  markDirty();
                }}
                onBlur={onBlur}
                className="input w-12 px-1 py-0.5 text-right text-xs"
              />
              <span className="text-xs font-semibold">%</span>
            </div>
          </div>
        )}
        <div className="mt-1 h-1.5 w-full rounded bg-gray-200 dark:bg-gray-800">
          <div className="h-1.5 rounded bg-brand" style={{ width: `${overallProgress}%` }} />
        </div>

        {/* Per-assignee progress — only for roles with a name filled in */}
        <div className="mt-2 space-y-1">
          {[
            { role: "FE", name: fe, val: feProg, set: setFeProg },
            { role: "BE", name: be, val: beProg, set: setBeProg },
            { role: "QA", name: qa, val: qaProg, set: setQaProg },
          ]
            .filter((r) => r.name.trim())
            .map((r) => (
              <div key={r.role} className="flex items-center gap-1">
                <span className="w-6 text-[10px] font-semibold text-gray-500">{r.role}</span>
                <div className="h-1 flex-1 rounded bg-gray-200 dark:bg-gray-800">
                  <div className="h-1 rounded bg-brand/70" style={{ width: `${r.val}%` }} />
                </div>
                <input
                  type="number" min={0} max={100} value={r.val} disabled={!canEdit}
                  onChange={(ev) => {
                    const n = Math.max(0, Math.min(100, Number(ev.target.value)));
                    r.set(Number.isNaN(n) ? 0 : n);
                    markDirty();
                  }}
                  onBlur={onBlur}
                  className="input w-10 px-1 py-0.5 text-right text-[10px]"
                />
              </div>
            ))}
        </div>
      </td>

      {/* Blocker note */}
      <td className="p-2 align-top">
        <div className="relative">
          <textarea
            disabled={!canEdit}
            className="input min-h-[64px] pr-6 text-sm disabled:opacity-60"
            placeholder="Blocker note (syncs to Blockers)…"
            value={blocker}
            onChange={(e) => { setBlocker(e.target.value); markDirty(); }}
            onBlur={onBlur}
          />
          <button
            type="button"
            className="absolute right-1 top-1 text-gray-400 hover:text-brand"
            title="Expand"
            onClick={() => setExpand("blocker")}
          >
            ⤢
          </button>
        </div>
      </td>

      <td className="p-2 text-center align-top">
        <button className="btn-ghost text-xs" onClick={doSave} disabled={loading || !canEdit}>
          {loading ? "…" : saved ? "✓" : "Save"}
        </button>
        {expand && (
          <Modal
            title={`${expand === "update" ? "Update" : "Blocker note"} — ${ticketKey}`}
            onClose={() => {
              setExpand(null);
              onBlur();
            }}
          >
            <textarea
              className="input min-h-[240px] text-sm"
              autoFocus
              placeholder={expand === "update" ? "Standup update…" : "Blocker note (syncs to Blockers)…"}
              value={expand === "update" ? update : blocker}
              onChange={(e) => {
                if (expand === "update") setUpdate(e.target.value);
                else setBlocker(e.target.value);
                markDirty();
              }}
            />
            <div className="mt-3 flex justify-end">
              <button
                className="btn-primary"
                onClick={() => {
                  setExpand(null);
                  onBlur();
                }}
              >
                Done
              </button>
            </div>
          </Modal>
        )}
      </td>
    </tr>
  );
}
