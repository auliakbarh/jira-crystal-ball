import { useTranslation } from "react-i18next";
import { todayISO } from "../lib/helpers";

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T00:00:00`).getTime();
  const b = new Date(`${bISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SprintProgress({
  startDate,
  endDate,
  holidays = [],
  currentDate,
  onSelect,
}: {
  startDate: string;
  endDate: string;
  holidays?: { date: string; name?: string }[];
  currentDate?: string;
  onSelect?: (iso: string) => void;
}) {
  const { t } = useTranslation();
  const today = todayISO();
  const selected = currentDate ?? today;
  const total = daysBetween(startDate, endDate) + 1; // inclusive
  if (total <= 0 || total > 400) return null;

  const holiMap = new Map(holidays.map((h) => [h.date, h.name ?? t("panels.progressHoliday")]));

  // Build one block per calendar day. Derive everything from the LOCAL date —
  // toISOString() would shift the day in non-UTC timezones and misalign weekends.
  const blocks: { iso: string; dom: number; wd: string; weekend: boolean }[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < total; i++) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const dow = cur.getDay();
    blocks.push({ iso: `${y}-${m}-${d}`, dom: cur.getDate(), wd: WD[dow], weekend: dow === 0 || dow === 6 });
    cur.setDate(cur.getDate() + 1);
  }

  const elapsed = Math.max(0, Math.min(total, daysBetween(startDate, today) + 1));
  const daysLeft = Math.max(0, total - elapsed);
  const before = today < startDate;
  const after = today > endDate;

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
        <span>{before ? t("panels.progressNotStarted") : after ? t("panels.progressEnded") : t("panels.progressDayOf", { elapsed, total })}</span>
        <span>{after ? t("panels.progressDoneLabel") : t("panels.progressDaysLeft", { count: daysLeft })}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {blocks.map((b) => {
          const weekend = b.weekend;
          const holiday = holiMap.has(b.iso);
          const isToday = b.iso === today;
          const isSelected = b.iso === selected;
          const past = b.iso < today;

          let cls = "border-gray-200 text-gray-400 dark:border-gray-700"; // future
          if (weekend || holiday)
            cls = "border-red-200 bg-red-50 text-red-400 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"; // weekend / holiday — soft red
          else if (past) cls = "bg-brand/70 border-brand/70 text-white"; // elapsed working day
          if (isToday)
            cls =
              "border-green-300 bg-green-100 text-green-700 ring-2 ring-green-300 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700"; // today — soft green

          return (
            <button
              key={b.iso}
              type="button"
              onClick={() => onSelect?.(b.iso)}
              title={`${b.iso}${holiday ? ` · ${holiMap.get(b.iso)}` : weekend ? ` · ${t("panels.progressWeekend")}` : ""}${
                isToday ? ` · ${t("panels.progressToday")}` : ""
              } — ${t("panels.progressClickToSet")}`}
              className={`flex h-9 w-9 flex-col items-center justify-center rounded border text-center leading-none transition hover:opacity-80 ${cls} ${
                isSelected ? "ring-2 ring-gray-500 dark:ring-gray-300" : ""
              }`}
            >
              <span className="text-[9px] uppercase opacity-80">{b.wd}</span>
              <span className="text-xs font-semibold">{b.dom}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
        <span><span className="text-brand">■</span> {t("panels.progressLegendElapsed")}</span>
        <span><span className="text-green-500">■</span> {t("panels.progressLegendToday")}</span>
        <span>▢ {t("panels.progressLegendUpcoming")}</span>
        <span><span className="text-red-400">■</span> {t("panels.progressLegendWeekendHoliday")}</span>
      </div>
    </div>
  );
}
