import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { ACTIVE_SPRINT_TICKETS } from "../graphql";
import { statusColor, priorityColor, issueTypeRank, hiddenByDefaultStatus as hiddenByDefault } from "../lib/helpers";

export default function Board() {
  const { squadId } = useSquad();
  const { data, loading, error, refetch } = useQuery(ACTIVE_SPRINT_TICKETS, {
    variables: { squadId, refresh: false },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
  });

  // overrides[status] = explicit show(true)/hide(false); undefined = use default.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const tickets = data?.activeSprintTickets ?? [];

  const statuses = useMemo<string[]>(
    () => Array.from(new Set<string>(tickets.map((t: any) => (t.status ?? "No status") as string))).sort(),
    [tickets],
  );

  const isShown = (status: string) => overrides[status] ?? !hiddenByDefault(status);
  const toggle = (status: string) =>
    setOverrides((o) => ({ ...o, [status]: !(o[status] ?? !hiddenByDefault(status)) }));

  const [carryOnly, setCarryOnly] = useState(false);
  const filtered = tickets
    .filter((t: any) => isShown(t.status ?? "No status"))
    .filter((t: any) => !carryOnly || t.carryOver)
    .slice()
    .sort((a: any, b: any) => issueTypeRank(a.issueType) - issueTypeRank(b.issueType) || a.key.localeCompare(b.key));

  // Grouping by epic / parent story.
  const [groupBy, setGroupBy] = useState<"none" | "epic" | "story">("story");
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all", label: "", rows: filtered }];
    const map = new Map<string, { key: string; label: string; rows: any[] }>();
    for (const t of filtered) {
      let key: string, label: string;
      if (groupBy === "epic") {
        key = t.epicKey ?? t.key;
        label = t.epicKey
          ? `${t.epicKey}${t.epicName ? ` · ${t.epicName}` : ""}`
          : `${t.key}${t.summary ? ` · ${t.summary}` : ""}`;
      } else {
        key = t.parentKey ?? t.key;
        label = t.parentKey
          ? `${t.parentKey}${t.parentName ? ` · ${t.parentName}` : ""}`
          : `${t.key}${t.summary ? ` · ${t.summary}` : ""}`;
      }
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [groupBy, filtered]);

  if (!squadId) return null;

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Board — Active Sprint Tickets</h1>
          <p className="text-sm text-gray-500">All tickets in the board's currently active sprint, live from JIRA.</p>
        </div>
        <button className="btn-ghost" onClick={() => refetch({ squadId, refresh: true })} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="card text-sm text-red-600 dark:text-red-400">
          {error.message.includes("JIRA_NOT_CONFIGURED")
            ? "JIRA is not configured for this squad. Set it up in Settings."
            : `Could not load tickets: ${error.message}`}
        </div>
      )}

      {/* Status filter */}
      {statuses.length > 0 && (
        <div className="card">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Filter by status
          </div>
          <div className="flex flex-wrap gap-2">
            {statuses.map((s: string) => {
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
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-400">Done / Archived are hidden by default. Click a status to toggle.</p>
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
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm text-gray-500">
            {filtered.length} shown / {tickets.length} total
          </span>
          <div className="flex items-center gap-2">
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
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
              <th className="p-2">Key</th>
              <th className="p-2">Type</th>
              <th className="p-2">Status</th>
              <th className="p-2">Priority</th>
              <th className="p-2">SP</th>
              <th className="p-2">Summary</th>
              <th className="p-2">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  No tickets match the current filter.
                </td>
              </tr>
            )}
            {groups.map((grp) => (
              <Fragment key={grp.key}>
                {groupBy !== "none" && (
                  <tr className="bg-gray-50 dark:bg-gray-800/60">
                    <td colSpan={7} className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {groupBy === "epic" ? "🗂 " : "📄 "}
                      {grp.label} <span className="font-normal text-gray-400">({grp.rows.length})</span>
                    </td>
                  </tr>
                )}
                {grp.rows.map((t: any) => (
                  <tr key={t.key} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">
                      <a href={t.url} target="_blank" rel="noreferrer" className="font-mono font-bold text-brand hover:underline">
                        {t.key}
                      </a>
                    </td>
                    <td className="p-2">
                      {t.issueType && (
                        <span className="chip bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                          {t.issueType}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {t.status && <span className={`chip ${statusColor(t.status)}`}>{t.status}</span>}
                    </td>
                    <td className="p-2">
                      {t.priority && <span className={`chip ${priorityColor(t.priority)}`}>{t.priority}</span>}
                    </td>
                    <td className="p-2 font-mono text-xs">{t.storyPoints ?? "—"}</td>
                    <td className="p-2">{t.summary}</td>
                    <td className="p-2">{t.assignee ?? <span className="text-gray-400">Unassigned</span>}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
