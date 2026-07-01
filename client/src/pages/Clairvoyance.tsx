import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { useToast } from "../context/ToastContext";
import { GROOMING_BUCKETS } from "../graphql";
import { statusColor, priorityColor, issueTypeRank } from "../lib/helpers";

// Clairvoyance — read-only grooming view. Pick a source (a future/not-yet-started
// sprint or the Backlog) from the dropdown; tickets are grouped by parent/story.
export default function Clairvoyance() {
  const { t } = useTranslation();
  const { squadId } = useSquad();
  const toast = useToast();
  const [reloading, setReloading] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const { data, loading, error, refetch } = useQuery(GROOMING_BUCKETS, {
    variables: { squadId, refresh: false },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    if (error) toast.error(t("clairvoyance.loadError", { message: error.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const buckets = data?.groomingBuckets ?? [];

  // Default to the first bucket (the next future sprint) once data arrives; fall
  // back to whatever's first if the previous selection is gone.
  const currentKey = buckets.some((b: any) => b.key === selected) ? selected : buckets[0]?.key ?? "";
  const bucket = buckets.find((b: any) => b.key === currentKey) ?? null;
  const tickets = bucket?.tickets ?? [];
  const busy = loading || reloading;

  const reload = async () => {
    setReloading(true);
    try {
      const res = await refetch({ squadId, refresh: true });
      const total = (res.data?.groomingBuckets ?? []).reduce((a: number, b: any) => a + b.tickets.length, 0);
      toast.success(total > 0 ? t("clairvoyance.loadedTickets", { count: total }) : t("clairvoyance.noTicketsFound"));
    } catch (e: any) {
      toast.error(e.message ?? t("clairvoyance.reloadFailed"));
    } finally {
      setReloading(false);
    }
  };

  // Group the selected bucket's tickets by parent/story.
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

  const isEmpty = !busy && !error && buckets.length === 0;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">{t("clairvoyance.heading")}</h1>
          <p className="text-sm text-gray-500">
            {t("clairvoyance.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {buckets.length > 0 && (
            <select
              className="input max-w-[240px]"
              value={currentKey}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              {buckets.map((b: any) => (
                <option key={b.key} value={b.key}>
                  {b.kind === "BACKLOG" ? "🗂 " : "🏁 "}
                  {b.label} ({b.tickets.length})
                </option>
              ))}
            </select>
          )}
          <button className="btn-ghost" onClick={reload} disabled={busy}>
            {busy ? t("clairvoyance.loading") : t("clairvoyance.reload")}
          </button>
        </div>
      </div>

      {error && (
        <div className="card text-sm text-red-600 dark:text-red-400">
          {error.message.includes("JIRA_NOT_CONFIGURED")
            ? t("clairvoyance.jiraNotConfigured")
            : t("clairvoyance.loadError", { message: error.message })}
        </div>
      )}

      {busy && buckets.length === 0 && !error && (
        <div className="card flex items-center gap-2 text-sm text-gray-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {t("clairvoyance.loadingTickets")}
        </div>
      )}

      {isEmpty && (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-4xl">🗒️</div>
          <p className="text-sm text-gray-500">
            {t("clairvoyance.emptyState")}
          </p>
          <button className="btn-primary" onClick={reload} disabled={busy}>
            {busy ? t("clairvoyance.loading") : t("clairvoyance.reload")}
          </button>
        </div>
      )}

      {!isEmpty && !error && bucket && (
        <div className="card overflow-x-auto">
          <div className="mb-2 text-sm text-gray-500">
            <b>{bucket.label}</b> · {t("clairvoyance.ticketsGrouped", { count: tickets.length })}
          </div>
          {tickets.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{t("clairvoyance.sourceNoTickets")}</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
                  <th className="p-2">{t("clairvoyance.colKey")}</th>
                  <th className="p-2">{t("clairvoyance.colType")}</th>
                  <th className="p-2">{t("clairvoyance.colSummary")}</th>
                  <th className="p-2">{t("clairvoyance.colStatus")}</th>
                  <th className="p-2">{t("clairvoyance.colPriority")}</th>
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
          )}
        </div>
      )}
    </div>
  );
}
