import { useQuery } from "@apollo/client";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const bucketLabel: Record<StatusBucket, string> = {
    Done: t("panels.summaryBucketDone"),
    "In QA": t("panels.summaryBucketInQA"),
    "In Progress": t("panels.summaryBucketInProgress"),
    "To Do": t("panels.summaryBucketToDo"),
    Other: t("panels.summaryBucketOther"),
  };
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

  // Story points per member: latest standup FE/BE/QA assignees per ticket ×
  // the board ticket's role SP (fallback default SP).
  const latestRoles = new Map<string, { fe?: string; be?: string; qa?: string }>();
  for (const e of [...entries].sort((a: any, b: any) => a.date.localeCompare(b.date))) {
    latestRoles.set(e.ticketKey, { fe: e.feAssignee, be: e.beAssignee, qa: e.qaAssignee });
  }
  const num = (x: any) => (typeof x === "number" ? x : 0);
  const spByMember = new Map<string, number>();
  const addSP = (name: string | undefined, pts: number) => {
    if (!name || !pts) return;
    spByMember.set(name, (spByMember.get(name) ?? 0) + pts);
  };
  for (const t of tickets) {
    const r = latestRoles.get(t.key);
    if (!r) continue;
    const def = num(t.storyPoints);
    addSP(r.fe, t.storyPointsFE != null ? num(t.storyPointsFE) : def);
    addSP(r.be, t.storyPointsBE != null ? num(t.storyPointsBE) : def);
    addSP(r.qa, t.storyPointsQA != null ? num(t.storyPointsQA) : def);
  }
  const totalSP = tickets.reduce((s: number, t: any) => s + num(t.storyPoints), 0);

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold">{t("panels.summaryTitle")}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <div className="label">{t("panels.summaryPerformance")}</div>
          <div className="text-2xl font-bold text-brand">{avgProgress}%</div>
          <div className="text-xs text-gray-500">{t("panels.summaryAvgProgress", { count: total })}</div>
          <div className="mt-1 text-xs">
            <span className="font-semibold text-green-600 dark:text-green-400">{t("panels.summaryDone", { count: done })}</span> ·{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">{t("panels.summaryCarryOver", { count: carryOver })}</span>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="label">{t("panels.summaryJiraStatus", { count: total })}</div>
          <div className="mb-1 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            {(() => {
              const present = BUCKET_ORDER.filter((b) => dist[b]);
              return (
                <motion.div
                  className="flex h-full w-full"
                  initial={{ clipPath: "inset(0 100% 0 0)" }}
                  animate={{ clipPath: "inset(0 0% 0 0)" }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                >
                  {present.map((b, i) => (
                    <div
                      key={b}
                      className={`${BUCKET_COLOR[b]} ${i === 0 ? "rounded-l-full" : ""} ${i === present.length - 1 ? "rounded-r-full" : ""}`}
                      title={`${bucketLabel[b]}: ${dist[b]}`}
                      style={{ flexBasis: 0, flexGrow: dist[b] }}
                    />
                  ))}
                </motion.div>
              );
            })()}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {BUCKET_ORDER.filter((b) => dist[b]).map((b) => (
              <span key={b} className="flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${BUCKET_COLOR[b]}`} />
                {bucketLabel[b]}: {dist[b]} ({pct(dist[b])}%)
              </span>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
            {t("panels.summaryCarryOverNotDone", { count: carryOver, pct: pct(carryOver) })}
            <Tooltip content={t("panels.summaryCarryOverTooltip")}>
              <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-400 text-[9px] font-bold">
                i
              </span>
            </Tooltip>
          </div>
        </div>

        <div>
          <div className="label">{t("panels.summaryBlockers")}</div>
          <div className="text-sm">
            <b>{activeBlockers.length}</b> {t("panels.summaryActive")}
          </div>
          <div className="label mt-2">{t("panels.summarySprint")}</div>
          <div className="text-xs">
            {t("panels.summaryDaysTotal", { count: days.total })} · <b>{days.working}</b> {t("panels.summaryDaysWorking")} · {t("panels.summaryDaysWeekend", { count: days.weekend })} · {t("panels.summaryDaysHoliday", { count: days.holiday })}
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div className="label">{t("panels.summaryTeamStatus")}</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">{t("panels.summaryAnnualLeave", { count: team.CUTI })}</span>
          <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{t("panels.summarySick", { count: team.SAKIT })}</span>
          <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">{t("panels.summaryPermission", { count: team.IZIN })}</span>
        </div>
        {leaveDetails.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
            {leaveDetails.map((d, i) => (
              <li key={i}>
                <b>{d.name}</b> — {LEAVE_LABELS[d.type] ?? d.type} {t("panels.summaryLeaveDays", { count: d.days })}
                {d.type === "CUTI" && d.sub && <span> · {t("panels.summarySubstitute")}: <b>{d.sub}</b></span>}
              </li>
            ))}
          </ul>
        )}

        <div className="label mt-3">{t("panels.summaryStoryPoints", { count: totalSP })}</div>
        {spByMember.size === 0 ? (
          <p className="text-xs text-gray-400">{t("panels.summaryNoStoryPoints")}</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...spByMember.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, pts]) => (
                <span key={name} className="chip bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {name}: <b className="ml-1">{t("panels.summarySpValue", { count: pts })}</b>
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
