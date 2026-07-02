import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { SPRINT_MOOD_HISTORY } from "../graphql";
import { MOODS, moodMeta, type MoodValue } from "../lib/mood";
import TipsCarousel, { TipCard } from "../components/TipsCarousel";
import FloatingDecor from "../components/FloatingDecor";
import { SkeletonLines } from "../components/Skeleton";

type MoodPoint = { date: string; mood: number };
type MemberSeries = { memberId: string; memberName: string; position: string | null; average: number; points: MoodPoint[] };
type SprintMood = {
  sprintId: string;
  number: number;
  name: string | null;
  startDate: string;
  endDate: string;
  teamAverage: number;
  members: MemberSeries[];
};

export default function MoonPhase() {
  const { t } = useTranslation();
  const { squadId } = useSquad();
  const { data, loading, error } = useQuery(SPRINT_MOOD_HISTORY, {
    variables: { squadId, limit: 12 },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
  });
  const sprints: SprintMood[] = data?.sprintMoodHistory ?? [];

  const [sprintId, setSprintId] = useState<string>("");
  const sprint = sprints.find((s) => s.sprintId === sprintId) ?? sprints[0];

  // All distinct recorded dates in the selected sprint, ascending = the day axis.
  const dates = useMemo(() => {
    if (!sprint) return [] as string[];
    const set = new Set<string>();
    for (const m of sprint.members) for (const p of m.points) set.add(p.date);
    return Array.from(set).sort();
  }, [sprint]);

  // Team average mood per recorded date (for the line chart).
  const avgPerDate = useMemo(() => {
    if (!sprint) return [] as number[];
    return dates.map((d) => {
      const vals: number[] = [];
      for (const m of sprint.members) {
        const p = m.points.find((x) => x.date === d);
        if (p) vals.push(p.mood);
      }
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
  }, [sprint, dates]);

  const MOON_TIPS: TipCard[] = [
    { icon: "🌙", title: t("moonPhase.tip1Title"), body: t("moonPhase.tip1Body") },
    { icon: "💬", title: t("moonPhase.tip2Title"), body: t("moonPhase.tip2Body") },
    { icon: "📉", title: t("moonPhase.tip3Title"), body: t("moonPhase.tip3Body") },
    { icon: "🤝", title: t("moonPhase.tip4Title"), body: t("moonPhase.tip4Body") },
  ];

  const hasData = !!sprint && sprint.members.length > 0 && dates.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🌙 {t("moonPhase.heading")}</h1>
          <p className="text-xs text-gray-400">{t("moonPhase.subtitle")}</p>
        </div>
        {sprints.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">{t("moonPhase.sprintLabel")}</label>
            <select
              className="input max-w-[220px] py-1 text-sm"
              value={sprint?.sprintId ?? ""}
              onChange={(e) => setSprintId(e.target.value)}
            >
              {sprints.map((s, i) => (
                <option key={s.sprintId} value={s.sprintId}>
                  #{s.number}
                  {s.name ? ` — ${s.name}` : ""}
                  {i === 0 ? ` (${t("moonPhase.current")})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          {t("moonPhase.loadError", { message: error.message })}
        </div>
      )}

      {loading && sprints.length === 0 && (
        <div className="card">
          <SkeletonLines rows={5} />
        </div>
      )}

      {!loading && sprints.length === 0 && (
        <div className="card text-sm text-gray-500">{t("moonPhase.noData")}</div>
      )}

      {sprint && !hasData && (
        <div className="card text-sm text-gray-500">{t("moonPhase.noSprintData")}</div>
      )}

      {hasData && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="font-semibold uppercase tracking-wide">{t("moonPhase.legend")}</span>
            {[5, 4, 3, 2, 1].map((v) => {
              const m = MOODS[v as MoodValue];
              return (
                <span key={v} className="flex items-center gap-1">
                  <span className="text-base">{m.emoji}</span>
                  {t(`mood.${m.key}.label`)}
                </span>
              );
            })}
          </div>

          {/* Team average mood over the sprint */}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">{t("moonPhase.teamMoodTitle")}</h2>
              <span className="text-sm text-gray-500">
                {t("moonPhase.avgLabel")} <b>{sprint.teamAverage.toFixed(1)}</b> {moodMeta(sprint.teamAverage).emoji}
              </span>
            </div>
            <MoodLine values={avgPerDate} dates={dates} />
          </section>

          {/* Per-member heatmap */}
          <section className="card">
            <h2 className="mb-3 text-base font-bold">{t("moonPhase.perMemberTitle")}</h2>
            <MoodHeatmap members={sprint.members} dates={dates} />
          </section>
        </>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <TipsCarousel title={t("moonPhase.tipsTitle")} cards={MOON_TIPS} />
        <FloatingDecor
          items={["🌑", "🌒", "🌓", "🌔", "🌕", "🌙", "⭐"]}
          className="relative hidden flex-1 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 md:block"
        />
      </div>
    </div>
  );
}

const shortDate = (d: string) => d.slice(5); // YYYY-MM-DD → MM-DD

// Line chart of team-average mood (1..5) across recorded dates.
function MoodLine({ values, dates }: { values: number[]; dates: string[] }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = 34;
  const n = values.length;
  const x = (i: number) => pad + (n <= 1 ? W / 2 - pad : (i / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((Math.max(1, v) - 1) / 4) * (H - 2 * pad);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const slot = n > 1 ? (W - 2 * pad) / (n - 1) : W - 2 * pad;
  const hv = hover != null ? values[hover] : null;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" style={{ maxHeight: 240 }}>
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={pad} y1={y(v)} x2={W - pad} y2={y(v)} className="stroke-gray-100 dark:stroke-gray-800" />
            <text x={pad - 8} y={y(v) + 5} textAnchor="end" className="text-[12px]">{MOODS[v as MoodValue].emoji}</text>
          </g>
        ))}
        <path d={path} fill="none" className="stroke-brand" strokeWidth={2.5} />
        {hover != null && <line x1={x(hover)} y1={pad} x2={x(hover)} y2={H - pad} className="stroke-gray-300 dark:stroke-gray-600" strokeDasharray="2 2" />}
        {values.map((v, i) => (
          <g key={i}>
            <rect x={x(i) - slot / 2} y={pad} width={slot} height={H - 2 * pad} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))} />
            <circle cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3} style={{ fill: moodMeta(v).color }} />
          </g>
        ))}
        <text x={pad} y={H - pad + 16} className="fill-gray-500 text-[10px]">{shortDate(dates[0] ?? "")}</text>
        <text x={W - pad} y={H - pad + 16} textAnchor="end" className="fill-gray-500 text-[10px]">{shortDate(dates[dates.length - 1] ?? "")}</text>
        {hv != null && (
          <g transform={`translate(${Math.min(x(hover!) + 6, W - 150)},${pad})`}>
            <rect width={140} height={30} rx={4} className="fill-gray-900 dark:fill-gray-700" opacity={0.95} />
            <text x={8} y={19} className="fill-white text-[11px]">
              {shortDate(dates[hover!] ?? "")} · {hv.toFixed(1)} {moodMeta(hv).emoji}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// Heatmap: one row per member, one cell per recorded date.
function MoodHeatmap({ members, dates }: { members: MemberSeries[]; dates: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-center text-xs">
        <thead>
          <tr className="text-gray-400">
            <th className="p-1 text-left font-semibold">{t("moonPhase.member")}</th>
            {dates.map((d) => (
              <th key={d} className="p-1 font-normal" title={d}>{shortDate(d)}</th>
            ))}
            <th className="p-1 font-semibold">{t("moonPhase.avgLabel")}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((r) => {
            const byDate = new Map(r.points.map((p) => [p.date, p.mood]));
            return (
              <tr key={r.memberId}>
                <td className="whitespace-nowrap p-1 text-left font-medium">{r.memberName}</td>
                {dates.map((d) => {
                  const v = byDate.get(d);
                  if (v == null) return <td key={d} className="p-0.5"><div className="mx-auto h-7 w-7 rounded bg-gray-50 dark:bg-gray-800/40" /></td>;
                  const m = MOODS[v as MoodValue] ?? moodMeta(v);
                  return (
                    <td key={d} className="p-0.5">
                      <div className={`mx-auto flex h-7 w-7 items-center justify-center rounded ${m.chip}`} title={`${d} · ${t(`mood.${m.key}.label`)}`}>
                        {m.emoji}
                      </div>
                    </td>
                  );
                })}
                <td className="p-1 font-semibold">
                  {r.average.toFixed(1)} {moodMeta(r.average).emoji}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
