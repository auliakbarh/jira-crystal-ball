import { useMemo } from "react";
import { computeLeadSchedule } from "../lib/helpers";

interface Sprint {
  startDate: string;
  endDate: string;
}

export default function LeadSchedule({
  members,
  holidays,
  sprint,
  currentDate,
}: {
  members: any[];
  holidays: { date: string }[];
  sprint?: Sprint | null;
  currentDate: string;
}) {
  const schedule = useMemo(() => {
    if (!sprint) return [];
    const hSet = new Set((holidays ?? []).map((h) => h.date));
    return computeLeadSchedule(members ?? [], hSet, sprint.startDate, sprint.endDate);
  }, [members, holidays, sprint]);

  if (!sprint) return null;

  const todayLead = schedule.find((d) => d.date === currentDate);
  // Show today (or the selected date) plus the next few working days.
  const idx = schedule.findIndex((d) => d.date === currentDate);
  const upcoming = idx >= 0 ? schedule.slice(idx, idx + 6) : schedule.slice(0, 6);

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold">🎤 Standup Lead</h2>
      {members.length === 0 ? (
        <p className="text-sm text-gray-500">Add team members to build the rotation.</p>
      ) : (
        <>
          <div className="mb-3 rounded-lg bg-brand/10 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {todayLead ? `Lead for ${currentDate}` : "No standup on selected date"}
            </div>
            {todayLead && <div className="text-lg font-bold text-brand">{todayLead.leadName}</div>}
            {todayLead?.coveringForName && (
              <div className="text-xs text-gray-500">
                covering for {todayLead.coveringForName} ({todayLead.coverType?.toLowerCase()})
              </div>
            )}
          </div>
          <ul className="space-y-1">
            {upcoming.map((d) => (
              <li
                key={d.date}
                className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                  d.date === currentDate ? "bg-gray-100 font-semibold dark:bg-gray-800" : ""
                }`}
              >
                <span className="font-mono text-xs text-gray-500">{d.date.slice(5)}</span>
                <span className="text-right">
                  {d.leadName}
                  {d.coveringForName && (
                    <span className="block text-[10px] font-normal text-gray-400">
                      ↩ {d.coveringForName} ({d.coverType?.toLowerCase()})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
