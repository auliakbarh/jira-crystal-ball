import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { VELOCITY, BURNDOWN } from "../graphql";
import TipsCarousel, { TipCard } from "../components/TipsCarousel";

type V = {
  sprintId: string;
  number: number;
  name: string | null;
  committedPoints: number;
  completedPoints: number;
  ticketCount: number;
  doneCount: number;
};

export default function Velocity() {
  const { t } = useTranslation();
  const { squadId } = useSquad();

  const VELOCITY_TIPS: TipCard[] = [
    { icon: "🎯", title: t("velocity.tip1Title"), body: t("velocity.tip1Body") },
    { icon: "📉", title: t("velocity.tip2Title"), body: t("velocity.tip2Body") },
    { icon: "🧩", title: t("velocity.tip3Title"), body: t("velocity.tip3Body") },
    { icon: "🔁", title: t("velocity.tip4Title"), body: t("velocity.tip4Body") },
    { icon: "🚧", title: t("velocity.tip5Title"), body: t("velocity.tip5Body") },
    { icon: "📈", title: t("velocity.tip6Title"), body: t("velocity.tip6Body") },
  ];
  const { data, loading, error } = useQuery(VELOCITY, {
    variables: { squadId, limit: 12 },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
  });
  const rows: V[] = data?.velocity ?? [];
  const [selected, setSelected] = useState<string>("");
  const [hover, setHover] = useState<number | null>(null);

  const currentSprint = selected || rows[rows.length - 1]?.sprintId || "";

  const avg = useMemo(() => {
    const done = rows.filter((r) => r.completedPoints > 0);
    if (!done.length) return 0;
    return Math.round((done.reduce((a, r) => a + r.completedPoints, 0) / done.length) * 10) / 10;
  }, [rows]);

  const maxPts = Math.max(1, ...rows.map((r) => Math.max(r.committedPoints, r.completedPoints)));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t("velocity.heading")}</h1>

      {error && (
        <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          {t("velocity.loadError", { message: error.message })}
        </div>
      )}

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{t("velocity.storyPointsPerSprint")}</h2>
          <span className="text-sm text-gray-500">
            {t("velocity.avgCompletedLabel")} <b>{avg}</b> {t("velocity.ptsSuffix")}{loading && ` · ${t("velocity.refreshing")}`}
          </span>
        </div>

        {rows.length === 0 && !loading ? (
          <p className="text-sm text-gray-500">
            {t("velocity.noSprintData")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div
                className="flex min-w-[480px] items-end gap-4 border-b border-gray-200 pb-2 pt-8 dark:border-gray-700"
                style={{ height: 240 }}
              >
                {rows.map((r, idx) => {
                  const cH = (r.committedPoints / maxPts) * 170;
                  const dH = (r.completedPoints / maxPts) * 170;
                  const active = r.sprintId === currentSprint;
                  const pct = r.committedPoints > 0 ? Math.round((r.completedPoints / r.committedPoints) * 100) : 0;
                  return (
                    <button
                      key={r.sprintId}
                      onClick={() => setSelected(r.sprintId)}
                      onMouseEnter={() => setHover(idx)}
                      onMouseLeave={() => setHover((h) => (h === idx ? null : h))}
                      className="relative flex flex-1 flex-col items-center justify-end gap-1"
                    >
                      {/* Hover tooltip */}
                      {hover === idx && (
                        <div className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white shadow dark:bg-gray-700">
                          {r.completedPoints}/{r.committedPoints} {t("velocity.ptsSuffix")} · {pct}% · {r.doneCount}/{r.ticketCount} {t("velocity.ticketsSuffix")}
                        </div>
                      )}
                      <div className="flex items-end gap-1" style={{ height: 175 }}>
                        <div
                          className={`w-4 rounded-t bg-gray-300 transition-colors dark:bg-gray-600 ${hover === idx ? "bg-gray-400 dark:bg-gray-500" : ""}`}
                          style={{ height: Math.max(2, cH) }}
                        />
                        <div
                          className="w-4 rounded-t bg-brand transition-opacity"
                          style={{ height: Math.max(2, dH), opacity: hover === null || hover === idx ? 1 : 0.6 }}
                        />
                      </div>
                      <span className={`text-xs ${active ? "font-bold text-brand" : "text-gray-500"}`}>#{r.number}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-gray-300 dark:bg-gray-600" /> {t("velocity.committed")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-brand" /> {t("velocity.completed")}
              </span>
              <span>{t("velocity.barChartHint")}</span>
            </div>
          </>
        )}
      </section>

      {currentSprint && (
        <Burndown sprintId={currentSprint} label={rows.find((r) => r.sprintId === currentSprint)?.number} />
      )}

      <TipsCarousel title={t("velocity.tipsTitle")} cards={VELOCITY_TIPS} />
    </div>
  );
}

function Burndown({ sprintId, label }: { sprintId: string; label?: number }) {
  const { t } = useTranslation();
  const { data, loading } = useQuery(BURNDOWN, { variables: { sprintId }, fetchPolicy: "cache-and-network" });
  const pts: { date: string; remainingPoints: number; idealPoints: number }[] = data?.burndown ?? [];
  const [hover, setHover] = useState<number | null>(null);

  if (!loading && pts.length === 0)
    return (
      <section className="card">
        <h2 className="mb-2 text-base font-bold">{t("velocity.burndownTitle", { label })}</h2>
        <p className="text-sm text-gray-500">{t("velocity.noDailyData")}</p>
      </section>
    );

  const W = 640;
  const H = 240;
  const pad = 32;
  const n = pts.length;
  const maxY = Math.max(1, ...pts.map((p) => Math.max(p.remainingPoints, p.idealPoints)));
  const x = (i: number) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - (v / maxY) * (H - 2 * pad);
  const line = (key: "remainingPoints" | "idealPoints") =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const hp = hover != null ? pts[hover] : null;
  const slot = n > 1 ? (W - 2 * pad) / (n - 1) : W - 2 * pad;

  return (
    <section className="card">
      <h2 className="mb-3 text-base font-bold">{t("velocity.burndownTitle", { label })}</h2>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" style={{ maxHeight: 260 }}>
          {/* axes */}
          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="stroke-gray-300 dark:stroke-gray-600" />
          <line x1={pad} y1={pad} x2={pad} y2={H - pad} className="stroke-gray-300 dark:stroke-gray-600" />
          {/* ideal (dashed) */}
          <path d={line("idealPoints")} fill="none" strokeDasharray="4 4" className="stroke-gray-400" strokeWidth={1.5} />
          {/* remaining (brand) */}
          <path d={line("remainingPoints")} fill="none" className="stroke-brand" strokeWidth={2} />

          {/* hover guide + point markers */}
          {hp && <line x1={x(hover!)} y1={pad} x2={x(hover!)} y2={H - pad} className="stroke-gray-300 dark:stroke-gray-600" strokeDasharray="2 2" />}
          {pts.map((p, i) => (
            <g key={i}>
              {/* wide invisible hit target */}
              <rect
                x={x(i) - slot / 2}
                y={pad}
                width={slot}
                height={H - 2 * pad}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              />
              <circle cx={x(i)} cy={y(p.remainingPoints)} r={hover === i ? 4 : 2.5} className="fill-brand" />
            </g>
          ))}

          <text x={pad} y={pad - 10} className="fill-gray-500 text-[10px]">{maxY} {t("velocity.ptsSuffix")}</text>
          <text x={pad} y={H - pad + 14} className="fill-gray-500 text-[10px]">{t("velocity.dayFirst")}</text>
          <text x={W - pad} y={H - pad + 14} textAnchor="end" className="fill-gray-500 text-[10px]">{t("velocity.dayN", { n })}</text>

          {/* tooltip */}
          {hp && (
            <g transform={`translate(${Math.min(x(hover!) + 6, W - 150)},${pad + 6})`}>
              <rect width={148} height={44} rx={4} className="fill-gray-900 dark:fill-gray-700" opacity={0.95} />
              <text x={8} y={16} className="fill-white text-[10px]">{t("velocity.tooltipDay", { day: hover! + 1, date: hp.date })}</text>
              <text x={8} y={30} className="fill-white text-[10px]">{t("velocity.tooltipRemaining", { pts: hp.remainingPoints })}</text>
              <text x={8} y={40} className="fill-gray-300 text-[9px]">{t("velocity.tooltipIdeal", { pts: hp.idealPoints })}</text>
            </g>
          )}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-brand" /> {t("velocity.remaining")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-gray-400" /> {t("velocity.ideal")}
        </span>
        <span>{t("velocity.burndownHint")}</span>
      </div>
    </section>
  );
}
