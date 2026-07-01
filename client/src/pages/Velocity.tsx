import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { VELOCITY, BURNDOWN } from "../graphql";

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
  const { squadId } = useSquad();
  const { data, loading, error } = useQuery(VELOCITY, {
    variables: { squadId, limit: 12 },
    skip: !squadId,
    fetchPolicy: "cache-and-network",
  });
  const rows: V[] = data?.velocity ?? [];
  const [selected, setSelected] = useState<string>("");

  // Default the burndown to the most recent sprint once data arrives.
  const currentSprint = selected || rows[rows.length - 1]?.sprintId || "";

  const avg = useMemo(() => {
    const done = rows.filter((r) => r.completedPoints > 0);
    if (!done.length) return 0;
    return Math.round((done.reduce((a, r) => a + r.completedPoints, 0) / done.length) * 10) / 10;
  }, [rows]);

  const maxPts = Math.max(1, ...rows.map((r) => Math.max(r.committedPoints, r.completedPoints)));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">📈 Velocity &amp; Burndown</h1>

      {error && (
        <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Could not load velocity: {error.message}
        </div>
      )}

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Story points per sprint</h2>
          <span className="text-sm text-gray-500">
            Avg completed: <b>{avg}</b> pts{loading && " · refreshing…"}
          </span>
        </div>

        {rows.length === 0 && !loading ? (
          <p className="text-sm text-gray-500">
            No sprint data yet. Story points come from standup ticket snapshots — run some standups first.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="flex min-w-[480px] items-end gap-4 border-b border-gray-200 pb-2 pt-4 dark:border-gray-700" style={{ height: 220 }}>
                {rows.map((r) => {
                  const cH = (r.committedPoints / maxPts) * 170;
                  const dH = (r.completedPoints / maxPts) * 170;
                  const active = r.sprintId === currentSprint;
                  return (
                    <button
                      key={r.sprintId}
                      onClick={() => setSelected(r.sprintId)}
                      title={`Sprint ${r.number}: ${r.completedPoints}/${r.committedPoints} pts (${r.doneCount}/${r.ticketCount} tickets)`}
                      className="flex flex-1 flex-col items-center justify-end gap-1"
                    >
                      <div className="flex items-end gap-1" style={{ height: 175 }}>
                        <div
                          className="w-4 rounded-t bg-gray-300 dark:bg-gray-600"
                          style={{ height: Math.max(2, cH) }}
                          title="Committed"
                        />
                        <div
                          className="w-4 rounded-t bg-brand"
                          style={{ height: Math.max(2, dH) }}
                          title="Completed"
                        />
                      </div>
                      <span className={`text-xs ${active ? "font-bold text-brand" : "text-gray-500"}`}>
                        #{r.number}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-gray-300 dark:bg-gray-600" /> Committed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-brand" /> Completed
              </span>
              <span>Click a sprint to see its burndown below.</span>
            </div>
          </>
        )}
      </section>

      {currentSprint && <Burndown sprintId={currentSprint} label={rows.find((r) => r.sprintId === currentSprint)?.number} />}
    </div>
  );
}

function Burndown({ sprintId, label }: { sprintId: string; label?: number }) {
  const { data, loading } = useQuery(BURNDOWN, { variables: { sprintId }, fetchPolicy: "cache-and-network" });
  const pts: { date: string; remainingPoints: number; idealPoints: number }[] = data?.burndown ?? [];

  if (!loading && pts.length === 0)
    return (
      <section className="card">
        <h2 className="mb-2 text-base font-bold">Burndown — Sprint #{label}</h2>
        <p className="text-sm text-gray-500">No daily data for this sprint.</p>
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

  return (
    <section className="card">
      <h2 className="mb-3 text-base font-bold">Burndown — Sprint #{label}</h2>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" style={{ maxHeight: 260 }}>
          {/* axes */}
          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="stroke-gray-300 dark:stroke-gray-600" />
          <line x1={pad} y1={pad} x2={pad} y2={H - pad} className="stroke-gray-300 dark:stroke-gray-600" />
          {/* ideal (dashed) */}
          <path d={line("idealPoints")} fill="none" strokeDasharray="4 4" className="stroke-gray-400" strokeWidth={1.5} />
          {/* remaining (brand) */}
          <path d={line("remainingPoints")} fill="none" className="stroke-brand" strokeWidth={2} />
          <text x={pad} y={pad - 8} className="fill-gray-500 text-[10px]">{maxY} pts</text>
          <text x={pad} y={H - pad + 14} className="fill-gray-500 text-[10px]">day 1</text>
          <text x={W - pad} y={H - pad + 14} textAnchor="end" className="fill-gray-500 text-[10px]">day {n}</text>
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-brand" /> Remaining
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-gray-400" /> Ideal
        </span>
      </div>
    </section>
  );
}
