import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { useToast } from "../context/ToastContext";
import { NEXT_SPRINT_TICKETS } from "../graphql";
import { statusColor, priorityColor, issueTypeRank } from "../lib/helpers";

// Clairvoyance — read-only grooming view of the NEXT sprint's tickets,
// grouped by parent/story. Helps the Sprint Grooming session.
export default function Clairvoyance() {
  const { squadId } = useSquad();
  const toast = useToast();
  const [reloading, setReloading] = useState(false);
  const { data, loading, error, refetch } = useQuery(NEXT_SPRINT_TICKETS, {
    variables: { squadId, refresh: false },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
  });

  // Surface load failures as a toast (in addition to the inline banner).
  useEffect(() => {
    if (error) toast.error(`Could not load tickets: ${error.message}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const reload = async () => {
    setReloading(true);
    try {
      const res = await refetch({ squadId, refresh: true });
      const n = res.data?.nextSprintTickets?.length ?? 0;
      toast.success(n > 0 ? `Loaded ${n} ticket${n === 1 ? "" : "s"}.` : "No tickets in the next sprint.");
    } catch (e: any) {
      toast.error(e.message ?? "Reload failed");
    } finally {
      setReloading(false);
    }
  };

  const tickets = data?.nextSprintTickets ?? [];
  const sprint = data?.jiraNextSprint ?? null;
  const busy = loading || reloading;

  // Group by parent/story (default). Parentless tickets group under themselves.
  const groups = useMemo(() => {
    const rows = tickets
      .slice()
      .sort(
        (a: any, b: any) =>
          issueTypeRank(a.issueType) - issueTypeRank(b.issueType) || a.key.localeCompare(b.key),
      );
    const map = new Map<string, { key: string; label: string; rows: any[] }>();
    for (const t of rows) {
      const key = t.parentKey ?? t.key;
      const label = t.parentKey
        ? `${t.parentKey}${t.parentName ? ` · ${t.parentName}` : ""}`
        : `${t.key}${t.summary ? ` · ${t.summary}` : ""}`;
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [tickets]);

  if (!squadId) return null;

  const isEmpty = !loading && !error && tickets.length === 0;

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">👁️ Clairvoyance — Grooming</h1>
          <p className="text-sm text-gray-500">
            {sprint
              ? `Next sprint: ${sprint.name}`
              : "Tickets planned for the next sprint, live from JIRA."}
          </p>
        </div>
        <button className="btn-ghost" onClick={reload} disabled={busy}>
          {busy ? "Loading…" : "↻ Reload"}
        </button>
      </div>

      {error && (
        <div className="card text-sm text-red-600 dark:text-red-400">
          {error.message.includes("JIRA_NOT_CONFIGURED")
            ? "JIRA is not configured for this squad. Set it up in Settings."
            : `Could not load tickets: ${error.message}`}
        </div>
      )}

      {busy && tickets.length === 0 && !error && (
        <div className="card flex items-center gap-2 text-sm text-gray-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Loading next-sprint tickets…
        </div>
      )}

      {isEmpty && !busy && (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-4xl">🗒️</div>
          <p className="text-sm text-gray-500">
            No tickets in the next sprint yet, or the next sprint hasn't been created.
          </p>
          <button className="btn-primary" onClick={reload} disabled={busy}>
            {busy ? "Loading…" : "↻ Reload"}
          </button>
        </div>
      )}

      {!isEmpty && !error && (
        <div className="card overflow-x-auto">
          <div className="mb-2 text-sm text-gray-500">{tickets.length} tickets · grouped by parent/story</div>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
                <th className="p-2">Key</th>
                <th className="p-2">Type</th>
                <th className="p-2">Summary</th>
                <th className="p-2">Status</th>
                <th className="p-2">Priority</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((grp) => (
                <Fragment key={grp.key}>
                  <tr className="bg-gray-50 dark:bg-gray-800/60">
                    <td colSpan={5} className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      📄 {grp.label} <span className="font-normal text-gray-400">({grp.rows.length})</span>
                    </td>
                  </tr>
                  {grp.rows.map((t: any) => (
                    <tr key={t.key} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="p-2">
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono font-bold text-brand hover:underline"
                        >
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
                      <td className="p-2">{t.summary}</td>
                      <td className="p-2">
                        {t.status && <span className={`chip ${statusColor(t.status)}`}>{t.status}</span>}
                      </td>
                      <td className="p-2">
                        {t.priority && <span className={`chip ${priorityColor(t.priority)}`}>{t.priority}</span>}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
