export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function isOnLeave(startISO: string, endISO: string, dayISO: string): boolean {
  return startISO <= dayISO && dayISO <= endISO;
}

export function isWeekend(dayISO: string): boolean {
  const d = new Date(`${dayISO}T00:00:00`).getDay();
  return d === 0 || d === 6;
}

// Working days in [startISO, endISO] excluding weekends and the given holidays.
export function workingDays(startISO: string, endISO: string, holidays: Set<string>): string[] {
  const out: string[] = [];
  if (!startISO || !endISO) return out;
  const cur = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  // Guard against bad ranges / runaway loops. Use LOCAL date parts — toISOString()
  // would shift the day in non-UTC timezones and misalign weekends.
  for (let i = 0; i < 400 && cur <= end; i++) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) out.push(iso);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export interface LeadDay {
  date: string;
  leadName: string;
  leadId: string;
  coveringForName?: string; // set when this lead is covering a sick/izin member
  coverType?: string; // SAKIT | IZIN
}

interface LeadMember {
  id: string;
  name: string;
  leaves?: { type?: string; startDate: string; endDate: string; substitute?: { id: string; name: string } | null }[];
}

// Active leave (record) for a member on a given day, or null.
function leaveOn(m: LeadMember, day: string) {
  return (m.leaves ?? []).find((l) => isOnLeave(l.startDate, l.endDate, day)) ?? null;
}

/**
 * Rolling standup-lead rotation, one lead per working day:
 * - A member on **CUTI** is excluded that day — the turn passes to the next member.
 * - A member on **SAKIT/IZIN** is covered (by their leave substitute, else the next
 *   available member) but keeps their place, so they lead the next standup (switch).
 */
export function computeLeadSchedule(
  members: LeadMember[],
  holidays: Set<string>,
  startISO: string,
  endISO: string,
): LeadDay[] {
  if (members.length === 0) return [];
  const n = members.length;
  const days = workingDays(startISO, endISO, holidays);

  const nextAvailable = (from: number, day: string): LeadMember | null => {
    for (let k = 0; k < n; k++) {
      const m = members[(from + k) % n];
      if (!leaveOn(m, day)) return m;
    }
    return null;
  };

  const schedule: LeadDay[] = [];
  let ptr = 0;
  for (const date of days) {
    // Skip members on CUTI (fully excluded for the day); they lose this turn.
    let guard = 0;
    while (guard < n && leaveOn(members[ptr % n], date)?.type === "CUTI") {
      ptr = (ptr + 1) % n;
      guard++;
    }
    const candidate = members[ptr % n];
    const lv = leaveOn(candidate, date);

    if (lv && (lv.type === "SAKIT" || lv.type === "IZIN")) {
      // Covered today; candidate keeps their slot → leads the next standup.
      const cover = lv.substitute ?? nextAvailable(ptr + 1, date) ?? candidate;
      schedule.push({
        date,
        leadId: cover.id,
        leadName: cover.name,
        coveringForName: candidate.name,
        coverType: lv.type,
      });
      // ptr NOT advanced — candidate is first in line next working day.
    } else if (lv) {
      // Everyone reachable is on leave (CUTI loop exhausted): just note a cover.
      const cover = nextAvailable(ptr, date) ?? candidate;
      schedule.push({ date, leadId: cover.id, leadName: cover.name });
      ptr = (ptr + 1) % n;
    } else {
      schedule.push({ date, leadId: candidate.id, leadName: candidate.name });
      ptr = (ptr + 1) % n;
    }
  }
  return schedule;
}

export const LEAVE_TYPES = ["CUTI", "SAKIT", "IZIN"] as const;
export const LEAVE_LABELS: Record<string, string> = {
  CUTI: "Annual Leave",
  SAKIT: "Sick",
  IZIN: "Permission",
};

export const POSITION_COLORS: Record<string, string> = {
  FE: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  BE: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  QA: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  PM: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
};

// Ticket statuses hidden by default in status filters (done / archived).
export function hiddenByDefaultStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("done") || s.includes("archiv");
}

// Rank issue types largest→smallest: Epic > Story > Task > Sub-task > Spike > other.
export function issueTypeRank(type?: string | null): number {
  const s = (type ?? "").toLowerCase();
  if (s.includes("epic")) return 0;
  if (s.includes("story")) return 1;
  if (s.includes("sub")) return 3; // sub-task / subtask (check before "task")
  if (s.includes("task")) return 2;
  if (s.includes("spike")) return 4;
  return 5;
}

// Bucket a JIRA status into a coarse category for sprint summaries.
export type StatusBucket = "Done" | "In QA" | "In Progress" | "To Do" | "Other";
export function statusBucket(status?: string | null): StatusBucket {
  const s = (status ?? "").toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved")) return "Done";
  if (s.includes("qa") || s.includes("review") || s.includes("test")) return "In QA";
  if (s.includes("progress") || s.includes("doing") || s.includes("develop")) return "In Progress";
  if (s.includes("to do") || s.includes("todo") || s.includes("open") || s.includes("backlog") || s.includes("new"))
    return "To Do";
  return "Other";
}

// Count total / working / weekend / holiday days in [startISO, endISO].
export function dayBreakdown(startISO: string, endISO: string, holidays: Set<string>) {
  let total = 0,
    working = 0,
    weekend = 0,
    holiday = 0;
  if (!startISO || !endISO) return { total, working, weekend, holiday };
  const cur = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  for (let i = 0; i < 400 && cur <= end; i++) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    const dow = cur.getDay();
    total++;
    if (dow === 0 || dow === 6) weekend++;
    else if (holidays.has(iso)) holiday++;
    else working++;
    cur.setDate(cur.getDate() + 1);
  }
  return { total, working, weekend, holiday };
}

export function priorityColor(priority?: string | null): string {
  const p = (priority ?? "").toLowerCase();
  if (p.includes("highest") || p.includes("blocker") || p.includes("critical"))
    return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
  if (p.includes("high")) return "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300";
  if (p.includes("medium")) return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
  if (p.includes("low")) return "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}

export function statusColor(status?: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved"))
    return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
  if (s.includes("progress") || s.includes("review"))
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
  if (s.includes("block")) return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}
