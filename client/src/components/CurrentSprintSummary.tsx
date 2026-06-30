import { useQuery } from "@apollo/client";
import { ACTIVE_SPRINT_TICKETS, BLOCKERS, STANDUP_ENTRIES } from "../graphql";
import { statusBucket, dayBreakdown, LEAVE_LABELS, type StatusBucket } from "../lib/helpers";
import Tooltip from "./Tooltip";

const BUCKET_ORDER: StatusBucket[] = ["Done", "In QA", "In Progress", "To Do", "Other"];
const BUCKET_COLOR: Record<StatusBucket, string> = {
  Done: "bg-green-500",
  "In QA": "bg-amber-500",
  "In Progress": "bg-blue-500",
  "To Do": "bg-gray-400",
  Other: "bg-gray-300",
};

export default function CurrentSprintSummary({
  squadId,
  sprintId,
  sprint,
  members,
  holidays,
}: {
  squadId: string;
  sprintId: string;
  sprint: { startDate: string; endDate: string };
  members: any[];
  holidays: { date: string }[];
}) {
  const { data: tData } = useQuery(ACTIVE_SPRINT_TICKETS, { variables: { squadId } });
  const { data: bData } = useQuery(BLOCKERS, { variables: { squadId, includeResolved: false } });
  const { data: eData } = useQuery(STANDUP_ENTRIES, { variables: { sprintId }, skip: !sprintId });

  const tickets = tData?.activeSprintTickets ?? [];
  const total = tickets.length;

  // Status distribution (live board).
  const dist: Record<StatusBucket, number> = { Done: 0, "In QA": 0, "In Progress": 0, "To Do": 0, Other: 0 };
  for (const t of tickets) dist[statusBucket(t.status)]++;
  const done = dist.Done;
  const carryOver = total - done;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  // Avg progress over ALL board tickets: latest recorded progress if the ticket
  // was touched this sprint, otherwise 100% when Done, else 0%.
  const entries = eData?.standupEntries ?? [];
  const latestByKey = new Map<string, number>();
  for (const e of [...entries].sort((a: any, b: any) => a.date.localeCompare(b.date))) {
    latestByKey.set(e.ticketKey, e.progress);
  }
  const progressFor = (t: any) => {
    const p = latestByKey.get(t.key);
    if (p != null) return p;
    return statusBucket(t.status) === "Done" ? 100 : 0;
  };
  const avgProgress = total ? Math.round(tickets.reduce((s: number, t: any) => s + progressFor(t), 0) / total) : 0;

  // Active blockers.
  const activeBlockers = bData?.blockers ?? [];

  // Team status during the sprint.
  const holidaySet = new Set(holidays.map((h) => h.date));
  const overlaps = (l: any) => l.startDate <= sprint.endDate && l.endDate >= sprint.startDate;
  const team = { CUTI: 0, SAKIT: 0, IZIN: 0 };
  const leaveDetails: { name: string; type: string; days: number; sub?: string }[] = [];
  for (const m of members) {
    const seen = new Set<string>();
    for (const l of (m.leaves ?? []).filter(overlaps)) {
      const type = l.type ?? "CUTI";
      if (!seen.has(type)) {
        seen.add(type);
        if (type in team) (team as any)[type]++;
      }
      const os = l.startDate > sprint.startDate ? l.startDate : sprint.startDate;
      const oe = l.endDate < sprint.endDate ? l.endDate : sprint.endDate;
      leaveDetails.push({ name: m.name, type, days: dayBreakdown(os, oe, holidaySet).working, sub: l.substitute?.name });
    }
  }

  const days = dayBreakdown(sprint.startDate, sprint.endDate, holidaySet);

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold">📊 Sprint Summary</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <div className="label">Performance</div>
          <div className="text-2xl font-bold text-brand">{avgProgress}%</div>
          <div className="text-xs text-gray-500">avg progress · {total} tickets</div>
          <div className="mt-1 text-xs">
            <span className="font-semibold text-green-600 dark:text-green-400">{done} done</span> ·{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">{carryOver} carry-over</span>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="label">JIRA status ({total})</div>
          <div className="mb-1 flex h-3 w-full overflow-hidden rounded">
            {BUCKET_ORDER.map((b) =>
              dist[b] ? (
                <div key={b} className={BUCKET_COLOR[b]} style={{ width: `${pct(dist[b])}%` }} title={`${b}: ${dist[b]}`} />
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
            Carry-over (not Done): {carryOver} ({pct(carryOver)}%)
            <Tooltip content="Tickets not yet Done (In QA + In Progress + To Do). These are expected to roll over (carry over) into the next sprint.">
              <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-400 text-[9px] font-bold">
                i
              </span>
            </Tooltip>
          </div>
        </div>

        <div>
          <div className="label">Blockers</div>
          <div className="text-sm">
            <b>{activeBlockers.length}</b> active
          </div>
          <div className="label mt-2">Sprint</div>
          <div className="text-xs">
            {days.total} days · <b>{days.working}</b> working · {days.weekend} weekend · {days.holiday} holiday
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div className="label">Team status (this sprint)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">Annual Leave: {team.CUTI}</span>
          <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Sick: {team.SAKIT}</span>
          <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">Permission: {team.IZIN}</span>
        </div>
        {leaveDetails.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
            {leaveDetails.map((d, i) => (
              <li key={i}>
                <b>{d.name}</b> — {LEAVE_LABELS[d.type] ?? d.type} {d.days} day{d.days === 1 ? "" : "s"}
                {d.type === "CUTI" && d.sub && <span> · substitute: <b>{d.sub}</b></span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
