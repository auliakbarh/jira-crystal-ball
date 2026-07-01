import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { useToast } from "../context/ToastContext";
import { CURRENT_SPRINT, STANDUP_ENTRIES, SQUAD, JIRA_ENV, BLOCKERS, EXPORT_CONFLUENCE, EXPORT_HISTORY, ACTIVE_SPRINT_TICKETS } from "../graphql";
import { statusColor, statusBucket, dayBreakdown, issueTypeRank, LEAVE_LABELS, type StatusBucket } from "../lib/helpers";
import Tooltip from "../components/Tooltip";

interface Entry {
  id: string;
  date: string;
  ticketKey: string;
  ticketStatus?: string;
  ticketSummary?: string;
  issueType?: string;
  storyPoints?: number;
  epicKey?: string;
  epicName?: string;
  parentKey?: string;
  parentName?: string;
  carryOverCount?: number;
  carryOverFrom?: string;
  feAssignee?: string;
  beAssignee?: string;
  qaAssignee?: string;
  updateText?: string;
  progress: number;
  blockerNote?: string;
}

interface Ticket {
  key: string;
  summary?: string;
  status?: string;
  issueType?: string;
  storyPoints?: number;
  spFE?: number | null;
  spBE?: number | null;
  spQA?: number | null;
  epicKey?: string;
  epicName?: string;
  parentKey?: string;
  parentName?: string;
  carryOverCount?: number;
  carryOverFrom?: string;
  fe?: string;
  be?: string;
  qa?: string;
  entries: Entry[];
}

export default function PreviousSprints() {
  const { t } = useTranslation();
  const { squadId } = useSquad();
  const { data: sData } = useQuery(CURRENT_SPRINT, { variables: { squadId }, skip: !squadId });
  const [sprintId, setSprintId] = useState<string>("");
  const [groupBy, setGroupBy] = useState<"none" | "epic" | "story">("story");
  const sprints = sData?.sprints ?? [];
  const selected = sprints.find((s: any) => s.id === sprintId) ?? sprints[0];
  const effSprintId = selected?.id ?? "";

  const { data } = useQuery(STANDUP_ENTRIES, {
    variables: { sprintId: effSprintId },
    skip: !effSprintId,
    fetchPolicy: "cache-and-network",
  });
  const entries: Entry[] = data?.standupEntries ?? [];

  const { data: squadData } = useQuery(SQUAD, { variables: { id: squadId }, skip: !squadId });
  const holidays: { date: string }[] = squadData?.squad?.holidays ?? [];

  // Live board status (active sprint) to sync ticket statuses, which may be stale
  // in the saved standup entries.
  const { data: boardData } = useQuery(ACTIVE_SPRINT_TICKETS, {
    variables: { squadId, refresh: false },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
  });
  const liveStatus = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of boardData?.activeSprintTickets ?? []) if (t.status) m.set(t.key, t.status);
    return m;
  }, [boardData]);
  const liveSP = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of boardData?.activeSprintTickets ?? []) m.set(t.key, t);
    return m;
  }, [boardData]);

  const { data: envData } = useQuery(JIRA_ENV);
  const jiraBase = (envData?.jiraEnv?.baseUrl ?? "").replace(/\/+$/, "");
  const ticketUrl = (key: string) => (jiraBase ? `${jiraBase}/browse/${key}` : null);

  const toast = useToast();
  const alreadyExported = !!selected?.confluenceExportedAt;
  const { data: histData } = useQuery(EXPORT_HISTORY, {
    variables: { sprintId: effSprintId },
    skip: !effSprintId,
    fetchPolicy: "cache-and-network",
  });
  const history = histData?.exportHistory ?? [];

  const [exportConfluence, { loading: exporting }] = useMutation(EXPORT_CONFLUENCE, {
    refetchQueries: [
      { query: CURRENT_SPRINT, variables: { squadId } },
      { query: EXPORT_HISTORY, variables: { sprintId: effSprintId } },
    ],
  });
  const doExportConfluence = async () => {
    try {
      const res = await exportConfluence({ variables: { sprintId: effSprintId } });
      const url = res.data?.exportSprintToConfluence?.url;
      toast.success(alreadyExported ? t("previous.confluencePageUpdated") : t("previous.exportedToConfluence"));
      if (url) window.open(url, "_blank");
    } catch (e: any) {
      toast.error(
        e.message?.includes("CONFLUENCE_NOT_CONFIGURED")
          ? t("previous.confluenceNotConfigured")
          : t("previous.exportFailed", { message: e.message }),
      );
    }
  };

  // Blockers recorded for this sprint, grouped by ticket key.
  const { data: blkData } = useQuery(BLOCKERS, {
    variables: { squadId, includeResolved: true },
    skip: !squadId,
  });
  const blockersByTicket = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const b of blkData?.blockers ?? []) {
      if (b.sprintId !== effSprintId || !b.jiraTicket) continue;
      if (!map.has(b.jiraTicket)) map.set(b.jiraTicket, []);
      map.get(b.jiraTicket)!.push(b);
    }
    return map;
  }, [blkData, effSprintId]);

  // Aggregate entries into tickets (each with its date-sorted entries + latest meta).
  const tickets = useMemo<Ticket[]>(() => {
    const map = new Map<string, Ticket>();
    for (const e of entries) {
      let t = map.get(e.ticketKey);
      if (!t) {
        t = { key: e.ticketKey, entries: [] };
        map.set(e.ticketKey, t);
      }
      t.entries.push(e);
      // entries arrive date-asc, so later writes hold the most recent snapshot
      t.summary = e.ticketSummary ?? t.summary;
      t.status = e.ticketStatus ?? t.status;
      t.issueType = e.issueType ?? t.issueType;
      if (e.storyPoints != null) t.storyPoints = e.storyPoints;
      // Prefer live board status when the ticket is on the active sprint board.
      if (liveStatus.has(t.key)) t.status = liveStatus.get(t.key);
      const b = liveSP.get(t.key);
      if (b) {
        if (b.storyPoints != null) t.storyPoints = b.storyPoints;
        t.spFE = b.storyPointsFE;
        t.spBE = b.storyPointsBE;
        t.spQA = b.storyPointsQA;
      }
      t.epicKey = e.epicKey ?? t.epicKey;
      t.epicName = e.epicName ?? t.epicName;
      t.parentKey = e.parentKey ?? t.parentKey;
      t.parentName = e.parentName ?? t.parentName;
      if (e.carryOverCount != null) t.carryOverCount = e.carryOverCount;
      if (e.carryOverFrom) t.carryOverFrom = e.carryOverFrom;
      if (e.feAssignee) t.fe = e.feAssignee;
      if (e.beAssignee) t.be = e.beAssignee;
      if (e.qaAssignee) t.qa = e.qaAssignee;
    }

    // Include board (active-sprint) tickets that have no standup input yet.
    for (const b of boardData?.activeSprintTickets ?? []) {
      if (map.has(b.key)) continue;
      map.set(b.key, {
        key: b.key,
        summary: b.summary,
        status: b.status,
        issueType: b.issueType,
        storyPoints: b.storyPoints,
        spFE: b.storyPointsFE,
        spBE: b.storyPointsBE,
        spQA: b.storyPointsQA,
        epicKey: b.epicKey,
        epicName: b.epicName,
        parentKey: b.parentKey,
        parentName: b.parentName,
        entries: [],
      });
    }

    return Array.from(map.values()).sort(
      (a, b) => issueTypeRank(a.issueType) - issueTypeRank(b.issueType) || a.key.localeCompare(b.key),
    );
  }, [entries, liveStatus, liveSP, boardData]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all", label: "", tickets }];
    const map = new Map<string, { key: string; label: string; tickets: Ticket[] }>();
    for (const t of tickets) {
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
      if (!map.has(key)) map.set(key, { key, label, tickets: [] });
      map.get(key)!.tickets.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [groupBy, tickets]);

  if (!squadId) return null;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3">
        <div>
          <label className="label">{t("previous.sprint")}</label>
          <select className="input max-w-[300px]" value={effSprintId} onChange={(e) => setSprintId(e.target.value)}>
            {sprints.map((s: any) => (
              <option key={s.id} value={s.id}>
                {t("previous.sprintOptionLabel", { number: s.number, name: s.name ? `— ${s.name}` : "", startDate: s.startDate, endDate: s.endDate })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("previous.groupBy")}</label>
          <select className="input max-w-[150px]" value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
            <option value="none">{t("previous.groupNone")}</option>
            <option value="epic">{t("previous.groupEpic")}</option>
            <option value="story">{t("previous.groupParentStory")}</option>
          </select>
        </div>
        <button className="btn-ghost ml-auto" disabled={!effSprintId || exporting} onClick={doExportConfluence}>
          {exporting
            ? t("previous.exporting")
            : alreadyExported
              ? t("previous.updateConfluencePage")
              : t("previous.exportToConfluence")}
        </button>
        {alreadyExported && (
          <a
            href={selected.confluenceUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="chip bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
            title={t("previous.exportedAt", { date: new Date(selected.confluenceExportedAt).toLocaleString() })}
          >
            {t("previous.onConfluence")}
          </a>
        )}
      </div>

      {sprints.length === 0 && <div className="card text-sm text-gray-500">{t("previous.noSprintsYet")}</div>}

      {effSprintId && selected && (
        <SprintSummary
          tickets={tickets}
          sprint={selected}
          holidays={holidays}
          members={squadData?.squad?.members ?? []}
        />
      )}

      {effSprintId && history.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-base font-bold">{t("previous.confluenceExportHistory")}</h2>
          <ul className="space-y-1 text-sm">
            {history.map((h: any) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs text-gray-400">
                  {new Date(h.createdAt).toLocaleString()}
                </span>
                <span
                  className={`chip ${
                    h.action === "create"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  }`}
                >
                  {h.action}
                </span>
                {h.actor && <span className="text-gray-500">{h.actor}</span>}
                <a href={h.url} target="_blank" rel="noreferrer" className="ml-auto text-brand hover:underline">
                  {t("previous.openPage")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {effSprintId && tickets.length === 0 && (
        <div className="card text-sm text-gray-500">{t("previous.noStandupEntries")}</div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
          {groupBy !== "none" && (
            <div className="px-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
              {groupBy === "epic" ? "🗂 " : "📄 "}
              {g.label} <span className="font-normal text-gray-400">({g.tickets.length})</span>
            </div>
          )}
          {g.tickets.map((t) => (
            <TicketCard
              key={t.key}
              ticket={t}
              url={ticketUrl(t.key)}
              blockers={blockersByTicket.get(t.key) ?? []}
              sprintStart={selected?.startDate}
              sprintEnd={selected?.endDate}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const BUCKET_ORDER: StatusBucket[] = ["Done", "In QA", "In Progress", "To Do", "Other"];
const BUCKET_COLOR: Record<StatusBucket, string> = {
  Done: "bg-green-500",
  "In QA": "bg-amber-500",
  "In Progress": "bg-blue-500",
  "To Do": "bg-gray-400",
  Other: "bg-gray-300",
};

function SprintSummary({
  tickets,
  sprint,
  holidays,
  members,
}: {
  tickets: Ticket[];
  sprint: { startDate: string; endDate: string };
  holidays: { date: string }[];
  members: any[];
}) {
  const { t } = useTranslation();
  // Team status within the sprint range: members with any Cuti/Sakit/Izin overlapping.
  const holidaySet = new Set(holidays.map((h) => h.date));
  const overlaps = (l: any) => l.startDate <= sprint.endDate && l.endDate >= sprint.startDate;
  const team = { CUTI: 0, SAKIT: 0, IZIN: 0, available: 0 };
  const leaveDetails: { name: string; type: string; days: number; sub?: string }[] = [];
  for (const m of members) {
    const ls = (m.leaves ?? []).filter(overlaps);
    if (ls.length === 0) team.available++;
    const types = new Set<string>();
    for (const l of ls) {
      const type = l.type ?? "CUTI";
      types.add(type);
      // Working days of this leave that fall within the sprint.
      const os = l.startDate > sprint.startDate ? l.startDate : sprint.startDate;
      const oe = l.endDate < sprint.endDate ? l.endDate : sprint.endDate;
      const days = dayBreakdown(os, oe, holidaySet).working;
      leaveDetails.push({ name: m.name, type, days, sub: l.substitute?.name });
    }
    types.forEach((t) => {
      if (t in team) (team as any)[t]++;
    });
  }
  const total = tickets.length;
  const latestProgress = (t: Ticket) => {
    const last = t.entries.length
      ? [...t.entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0].progress
      : 0;
    // A Done ticket counts as 100% even if the last logged value was lower.
    return statusBucket(t.status) === "Done" ? 100 : last;
  };

  const avgProgress = total ? Math.round(tickets.reduce((s, t) => s + latestProgress(t), 0) / total) : 0;

  // Status distribution.
  const dist: Record<StatusBucket, number> = { Done: 0, "In QA": 0, "In Progress": 0, "To Do": 0, Other: 0 };
  for (const t of tickets) dist[statusBucket(t.status)]++;
  const done = dist.Done;
  const carryOver = total - done; // anything not Done carries to next sprint
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  // Blockers.
  const blockedTickets = tickets.filter((t) => t.entries.some((e) => (e.blockerNote ?? "").trim())).length;
  const blockerNotes = tickets.reduce(
    (s, t) => s + t.entries.filter((e) => (e.blockerNote ?? "").trim()).length,
    0,
  );

  const days = dayBreakdown(sprint.startDate, sprint.endDate, new Set(holidays.map((h) => h.date)));

  // Story points: total, done, and per-member (attributed to each assignee).
  const spOf = (t: Ticket) => (typeof t.storyPoints === "number" ? t.storyPoints : 0);
  const totalSP = tickets.reduce((s, t) => s + spOf(t), 0);
  const doneSP = tickets.filter((t) => statusBucket(t.status) === "Done").reduce((s, t) => s + spOf(t), 0);
  const numv = (x: any) => (typeof x === "number" ? x : 0);
  const spByMember = new Map<string, number>();
  const addSP = (name: string | undefined, pts: number) => {
    if (!name || !pts) return;
    spByMember.set(name, (spByMember.get(name) ?? 0) + pts);
  };
  for (const t of tickets) {
    const def = spOf(t);
    addSP(t.fe, t.spFE != null ? numv(t.spFE) : def);
    addSP(t.be, t.spBE != null ? numv(t.spBE) : def);
    addSP(t.qa, t.spQA != null ? numv(t.spQA) : def);
  }

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold">{t("previous.sprintSummary")}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* Performance */}
        <div>
          <div className="label">{t("previous.performance")}</div>
          <div className="text-2xl font-bold text-brand">{avgProgress}%</div>
          <div className="text-xs text-gray-500">{t("previous.avgProgressTickets", { total })}</div>
          <div className="text-xs text-gray-500">
            {t("previous.storyPointsDone")} <b>{doneSP}</b> / {totalSP} {t("previous.spDone")}
          </div>
          <div className="mt-1 text-xs">
            <span className="font-semibold text-green-600 dark:text-green-400">{t("previous.countDone", { done })}</span> ·{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">{t("previous.countCarryOver", { carryOver })}</span>
          </div>
        </div>

        {/* Status distribution */}
        <div className="md:col-span-2">
          <div className="label">{t("previous.jiraStatus", { total })}</div>
          <div className="mb-1 flex h-3 w-full overflow-hidden rounded">
            {BUCKET_ORDER.map((b) =>
              dist[b] ? (
                <div
                  key={b}
                  className={BUCKET_COLOR[b]}
                  style={{ width: `${pct(dist[b])}%` }}
                  title={`${b}: ${dist[b]} (${pct(dist[b])}%)`}
                />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {BUCKET_ORDER.filter((b) => dist[b]).map((b) => (
              <span key={b} className="flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${BUCKET_COLOR[b]}`} />
                {b}: {dist[b]} ({pct(dist[b])}%)
              </span>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
            {t("previous.carryOverNotDone", { carryOver, pct: pct(carryOver) })}
            <Tooltip content={t("previous.carryOverTooltip")}>
              <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-400 text-[9px] font-bold">
                i
              </span>
            </Tooltip>
          </div>
        </div>

        {/* Blockers + sprint days */}
        <div>
          <div className="label">{t("previous.blockers")}</div>
          <div className="text-sm">
            <b>{blockedTickets}</b> {t("previous.ticketsBlockedNotes", { notes: blockerNotes })}
          </div>
          <div className="label mt-2">{t("previous.sprint")}</div>
          <div className="text-xs text-gray-500">
            {sprint.startDate} → {sprint.endDate}
          </div>
          <div className="text-xs">
            {days.total} {t("previous.days")} · <b>{days.working}</b> {t("previous.working")} · {days.weekend} {t("previous.weekend")} · {days.holiday} {t("previous.holiday")}
          </div>
        </div>
      </div>

      {/* Team status during the sprint */}
      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div className="label">{t("previous.teamStatusThisSprint")}</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
            {t("previous.annualLeave", { count: team.CUTI })}
          </span>
          <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            {t("previous.sick", { count: team.SAKIT })}
          </span>
          <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
            {t("previous.permission", { count: team.IZIN })}
          </span>
          <span className="chip bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {t("previous.membersCount", { count: members.length })}
          </span>
        </div>

        {leaveDetails.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
            {leaveDetails.map((d, i) => (
              <li key={i}>
                <b>{d.name}</b> — {LEAVE_LABELS[d.type] ?? d.type} {t("previous.dayCount", { count: d.days })}
                {d.type === "CUTI" && d.sub && <span> · {t("previous.substitute")} <b>{d.sub}</b></span>}
              </li>
            ))}
          </ul>
        )}

        {spByMember.size > 0 && (
          <>
            <div className="label mt-3">{t("previous.storyPointsPerMember")}</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[...spByMember.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([name, pts]) => (
                  <span key={name} className="chip bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {name}: <b className="ml-1">{pts} SP</b>
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TicketCard({
  ticket,
  url,
  blockers = [],
  sprintStart,
  sprintEnd,
}: {
  ticket: Ticket;
  url: string | null;
  blockers?: any[];
  sprintStart?: string;
  sprintEnd?: string;
}) {
  const { t } = useTranslation();
  const sorted = [...ticket.entries].sort((a, b) => a.date.localeCompare(b.date));
  const updates = sorted.filter((e) => (e.updateText ?? "").trim());
  const sortedBlockers = [...blockers].sort((a, b) => a.foundDate.localeCompare(b.foundDate));
  const latestProgress = sorted.length ? sorted[sorted.length - 1].progress : 0;

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="font-mono font-bold text-brand hover:underline">
            {ticket.key}
          </a>
        ) : (
          <span className="font-mono font-bold">{ticket.key}</span>
        )}
        {ticket.issueType && (
          <span className="chip bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
            {ticket.issueType}
          </span>
        )}
        {ticket.status && <span className={`chip ${statusColor(ticket.status)}`}>{ticket.status}</span>}
        {ticket.storyPoints != null && (
          <span className="chip bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200">{ticket.storyPoints} SP</span>
        )}
        {!!ticket.carryOverCount && (
          <Tooltip content={ticket.carryOverFrom ? t("previous.carryOverFromTooltip", { from: ticket.carryOverFrom }) : t("previous.carryOver")}>
            <span className="chip cursor-help bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              {t("previous.carryOverChip", { count: ticket.carryOverCount })}
            </span>
          </Tooltip>
        )}
        {ticket.summary && <span className="text-sm text-gray-600 dark:text-gray-400">{ticket.summary}</span>}
        <span className="ml-auto text-xs font-semibold text-brand">{latestProgress}%</span>
      </div>
      {ticket.carryOverFrom && (
        <div className="mb-2 text-xs text-gray-500">{t("previous.carriedOverFrom", { from: ticket.carryOverFrom })}</div>
      )}

      {/* Assignees */}
      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        {(["FE", "BE", "QA"] as const).map((role) => {
          const v = role === "FE" ? ticket.fe : role === "BE" ? ticket.be : ticket.qa;
          return (
            <span key={role} className="chip bg-gray-100 dark:bg-gray-800">
              {role}: {v || "—"}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Progress chart */}
        <div>
          <div className="label">{t("previous.progressOverTime")}</div>
          <ProgressChart
            points={sorted.map((e) => ({ date: e.date, progress: e.progress }))}
            startDate={sprintStart}
            endDate={sprintEnd}
          />
        </div>

        {/* Update log rows */}
        <div>
          <div className="label">{t("previous.updateLog")}</div>
          {updates.length === 0 ? (
            <p className="text-xs text-gray-400">{t("previous.noUpdates")}</p>
          ) : (
            <ul className="space-y-1">
              {updates.map((e) => (
                <li key={e.id} className="flex gap-2 text-sm">
                  <span className="shrink-0 font-mono text-xs text-gray-400">{e.date.slice(5)}</span>
                  <span className="whitespace-pre-wrap">{e.updateText}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Blockers */}
      <div className="mt-3">
        <div className="label">{t("previous.blockers")}</div>
        {sortedBlockers.length === 0 ? (
          <p className="text-xs text-gray-400">{t("previous.noBlockers")}</p>
        ) : (
          <ul className="space-y-1.5">
            {sortedBlockers.map((b) => (
              <li key={b.id} className="text-sm">
                <div className="text-red-700 dark:text-red-300">🚧 {b.description}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                  <span>{t("previous.found", { date: b.foundDate })}</span>
                  {b.resolvedDate ? (
                    <span className="text-green-600 dark:text-green-400">{t("previous.resolved", { date: b.resolvedDate })}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">{t("previous.ongoing")}</span>
                  )}
                  {b.resolvedDate && b.foundDate && (
                    <span>{t("previous.durationDays", { count: Math.max(0, daysBetween(b.foundDate, b.resolvedDate)) })}</span>
                  )}
                </div>
                {b.resolveNote && (
                  <div className="text-xs text-green-700 dark:text-green-300">✓ {b.resolveNote}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T00:00:00`).getTime();
  const b = new Date(`${bISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function ProgressChart({
  points,
  startDate,
  endDate,
}: {
  points: { date: string; progress: number }[];
  startDate?: string;
  endDate?: string;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="text-xs text-gray-400">{t("previous.noData")}</p>;

  // X axis spans the whole sprint range when known; points are placed by date.
  const start = startDate ?? points[0].date;
  const end = endDate ?? points[points.length - 1].date;
  const totalDays = Math.max(1, daysBetween(start, end));

  const H = 90;
  const padX = 14;
  const padY = 16;
  const W = Math.max(totalDays * 16, 220) + padX * 2;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const x = (date: string) => padX + (Math.min(Math.max(daysBetween(start, date), 0), totalDays) / totalDays) * innerW;
  const y = (p: number) => padY + (1 - p / 100) * innerH;

  const line = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${x(pt.date)} ${y(pt.progress)}`).join(" ");
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="text-brand">
        {[0, 50, 100].map((g) => (
          <line key={g} x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
        ))}
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} />

        {/* hover guide + tooltip */}
        {hp && (
          <>
            <line x1={x(hp.date)} x2={x(hp.date)} y1={padY} y2={H - padY} className="stroke-gray-300 dark:stroke-gray-600" strokeDasharray="2 2" />
            <circle cx={x(hp.date)} cy={y(hp.progress)} r={5} fill="currentColor" />
            <g transform={`translate(${Math.min(Math.max(x(hp.date), 34), W - 34)}, 9)`}>
              <rect x={-32} y={-8} width={64} height={16} rx={3} className="fill-gray-900 dark:fill-gray-700" />
              <text x={0} y={3} textAnchor="middle" fontSize={9} className="fill-white">
                {hp.date.slice(5)} · {hp.progress}%
              </text>
            </g>
          </>
        )}

        {points.map((pt, i) => (
          <circle key={i} cx={x(pt.date)} cy={y(pt.progress)} r={3} fill="currentColor" />
        ))}

        {/* wide invisible hit areas for easy hover/tap */}
        {points.map((pt, i) => (
          <rect
            key={`h${i}`}
            x={x(pt.date) - 12}
            y={0}
            width={24}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover((h) => (h === i ? null : i))}
            style={{ cursor: "pointer" }}
          >
            <title>{`${pt.date}: ${pt.progress}%`}</title>
          </rect>
        ))}

        <text x={padX} y={H - 2} className="fill-gray-400" fontSize={9}>
          {start.slice(5)}
        </text>
        <text x={W - padX} y={H - 2} textAnchor="end" className="fill-gray-400" fontSize={9}>
          {end.slice(5)}
        </text>
      </svg>
    </div>
  );
}
