import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { DASHBOARD, SQUAD } from "../graphql";
import { hiddenByDefaultStatus, statusColor, issueTypeRank } from "../lib/helpers";
import StandupRow from "./StandupRow";
import { SkeletonTableRows } from "./Skeleton";

const rowStatus = (r: any): string => r.ticket?.status ?? r.entry?.ticketStatus ?? "No status";

export default function StandupTable({
  squadId,
  sprintId,
  date,
  canEdit = true,
  leadKey,
}: {
  squadId: string;
  sprintId: string;
  date: string;
  canEdit?: boolean;
  leadKey?: string;
}) {
  const { data, loading, error } = useQuery(DASHBOARD, {
    variables: { sprintId, date },
    fetchPolicy: "cache-and-network",
  });

  const rows = data?.dashboard ?? [];

  // Team members for assignee suggestions (datalists below), grouped by role.
  const { data: squadData } = useQuery(SQUAD, { variables: { id: squadId } });
  const members = squadData?.squad?.members ?? [];
  const namesFor = (positions: string[]) =>
    members.filter((m: any) => positions.includes(m.position)).map((m: any) => m.name);
  const feNames = namesFor(["FE", "FULLSTACK", "ALL"]);
  const beNames = namesFor(["BE", "FULLSTACK", "ALL"]);
  const qaNames = namesFor(["QA", "ALL"]);
  const allNames = members.map((m: any) => m.name);

  // Status filter — Done/Archived hidden by default.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const statuses = useMemo<string[]>(
    () => Array.from(new Set<string>(rows.map((r: any) => rowStatus(r)))).sort(),
    [rows],
  );
  const isShown = (status: string) => overrides[status] ?? !hiddenByDefaultStatus(status);
  const toggle = (status: string) =>
    setOverrides((o) => ({ ...o, [status]: !(o[status] ?? !hiddenByDefaultStatus(status)) }));

  const [carryOnly, setCarryOnly] = useState(false);
  const rowType = (r: any) => r.ticket?.issueType ?? r.entry?.issueType;
  const filtered = rows
    .filter((r: any) => isShown(rowStatus(r)))
    .filter((r: any) => !carryOnly || r.ticket?.carryOver)
    .slice()
    .sort((a: any, b: any) => {
      const d = issueTypeRank(rowType(a)) - issueTypeRank(rowType(b));
      const ka = a.ticket?.key ?? a.entry?.ticketKey ?? "";
      const kb = b.ticket?.key ?? b.entry?.ticketKey ?? "";
      return d || ka.localeCompare(kb);
    });

  // Grouping by epic / parent story.
  const [groupBy, setGroupBy] = useState<"none" | "epic" | "story">("story");
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all", label: "", rows: filtered }];
    const map = new Map<string, { key: string; label: string; rows: any[] }>();
    for (const r of filtered) {
      const t = r.ticket ?? {};
      const ownKey = r.ticket?.key ?? r.entry?.ticketKey ?? "?";
      const ownSummary = r.ticket?.summary ?? r.entry?.ticketSummary;
      let key: string, label: string;
      if (groupBy === "epic") {
        // No epic → the ticket is its own group.
        key = t.epicKey ?? ownKey;
        label = t.epicKey
          ? `${t.epicKey}${t.epicName ? ` · ${t.epicName}` : ""}`
          : `${ownKey}${ownSummary ? ` · ${ownSummary}` : ""}`;
      } else {
        key = t.parentKey ?? ownKey;
        label = t.parentKey
          ? `${t.parentKey}${t.parentName ? ` · ${t.parentName}` : ""}`
          : `${ownKey}${ownSummary ? ` · ${ownSummary}` : ""}`;
      }
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [groupBy, filtered]);

  // Keyboard navigation between cells of the same column across rows:
  // Enter (or Cmd/Ctrl+Enter in textareas) → next row; Alt+↑/↓ → prev/next row.
  const onKeyNav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const col = el.dataset.col;
    const row = Number(el.dataset.row);
    if (!col || Number.isNaN(row)) return;
    const isTextarea = el.tagName === "TEXTAREA";
    let dir = 0;
    if (e.key === "Enter" && !e.shiftKey && (!isTextarea || e.metaKey || e.ctrlKey)) dir = 1;
    else if (e.altKey && e.key === "ArrowDown") dir = 1;
    else if (e.altKey && e.key === "ArrowUp") dir = -1;
    else return;
    const next = document.querySelector<HTMLElement>(`[data-col="${col}"][data-row="${row + dir}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
      (next as HTMLInputElement).select?.();
    }
  };

  // Sequential row index across all groups (for keyboard navigation).
  let rowSeq = -1;

  // Datalists for assignee autocomplete (free text still allowed).
  const datalist = (id: string, names: string[]) => (
    <datalist id={id}>
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );

  return (
    <div className="card overflow-x-auto overscroll-x-contain" onKeyDown={onKeyNav}>
      {datalist("jcb-fe", feNames.length ? feNames : allNames)}
      {datalist("jcb-be", beNames.length ? beNames : allNames)}
      {datalist("jcb-qa", qaNames.length ? qaNames : allNames)}
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Tickets — {date}</h2>
        <div className="flex items-center gap-2">
          {loading && <span className="text-xs text-gray-400">refreshing…</span>}
          <label className="text-xs text-gray-500">Group:</label>
          <select
            className="input max-w-[140px] py-1 text-xs"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
          >
            <option value="none">None</option>
            <option value="epic">By Epic</option>
            <option value="story">By Parent/Story</option>
          </select>
        </div>
      </div>
      {error && (
        <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Could not load board tickets: {error.message}
        </div>
      )}

      {/* Status filter */}
      {statuses.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status:</span>
          {statuses.map((s) => {
            const on = isShown(s);
            return (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={`chip border ${
                  on
                    ? `${statusColor(s)} border-transparent`
                    : "border-gray-300 bg-transparent text-gray-400 line-through dark:border-gray-700"
                }`}
                title={on ? "Click to hide" : "Click to show"}
              >
                {s}
              </button>
            );
          })}
          <button
            onClick={() => setCarryOnly((v) => !v)}
            className={`chip border ${
              carryOnly
                ? "border-transparent bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                : "border-gray-300 bg-transparent text-gray-400 dark:border-gray-700"
            }`}
            title="Show only carry-over tickets"
          >
            ↪ carry-over only
          </button>
          <span className="text-xs text-gray-400">
            ({filtered.length}/{rows.length}) · Done/Archived hidden by default · Enter / Alt+↑↓ to move between rows
          </span>
        </div>
      )}

      {/* Horizontal scroll on small screens so the wide table never breaks the layout. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
        <colgroup>
          <col style={{ width: "24%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "5%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
            <th className="p-2">JIRA Ticket</th>
            <th className="p-2">Assignees (FE/BE/QA)</th>
            <th className="p-2">Update</th>
            <th className="p-2">Progress</th>
            <th className="p-2">Blocker Note</th>
            <th className="w-24 p-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && loading && <SkeletonTableRows rows={6} />}
          {filtered.length === 0 && !loading && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-sm text-gray-500">
                {rows.length === 0
                  ? "No tickets. Check JIRA config in Settings, or board may be empty."
                  : "No tickets match the current status filter."}
              </td>
            </tr>
          )}
          {groups.map((grp) => (
            <Fragment key={grp.key}>
              {groupBy !== "none" && (
                <tr className="bg-gray-50 dark:bg-gray-800/60">
                  <td colSpan={6} className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {groupBy === "epic" ? "🗂 " : "📄 "}
                    {grp.label} <span className="font-normal text-gray-400">({grp.rows.length})</span>
                  </td>
                </tr>
              )}
              {grp.rows.map((r: any) => {
                const k = r.ticket?.key ?? r.entry?.ticketKey;
                rowSeq += 1;
                return (
                  <StandupRow
                    key={k}
                    row={r}
                    sprintId={sprintId}
                    squadId={squadId}
                    date={date}
                    carryOver={!!r.ticket?.carryOver}
                    canEdit={canEdit}
                    leadKey={leadKey}
                    rowIndex={rowSeq}
                  />
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
