import { useState } from "react";
import { useQuery } from "@apollo/client";
import { STANDUP_LOGS } from "../graphql";
import { formatDuration } from "../lib/helpers";

const PAGE = 20;
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StandupDurationLog({ squadId }: { squadId: string }) {
  const { data, fetchMore } = useQuery(STANDUP_LOGS, {
    variables: { squadId, limit: PAGE, offset: 0 },
    fetchPolicy: "cache-and-network",
  });
  const logs = data?.standupLogs ?? [];
  const [done, setDone] = useState(false);
  const [more, setMore] = useState(false);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (done || more) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      setMore(true);
      fetchMore({
        variables: { offset: logs.length },
        updateQuery: (prev, { fetchMoreResult }) => {
          const extra = fetchMoreResult?.standupLogs ?? [];
          if (extra.length < PAGE) setDone(true);
          const seen = new Set(prev.standupLogs.map((x: any) => x.id));
          return { standupLogs: [...prev.standupLogs, ...extra.filter((x: any) => !seen.has(x.id))] };
        },
      }).finally(() => setMore(false));
    }
  };

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold">⏱ Standup Duration Log</h2>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-500">No completed standups yet.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto overscroll-contain pr-1" onScroll={onScroll}>
          <ul className="space-y-1.5">
            {logs.map((l: any) => {
              const d = new Date(l.startedAt);
              const day = DAY[d.getDay()];
              const date = l.startedAt.slice(0, 10);
              const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-mono text-xs text-gray-400">
                    {day} {date} {time}
                  </span>
                  <span className="font-medium">{l.leadName}</span>
                  <span className="ml-auto font-mono text-xs font-semibold text-brand">
                    {formatDuration(l.durationSec)}
                  </span>
                </li>
              );
            })}
          </ul>
          {more && <p className="py-2 text-center text-xs text-gray-400">Loading…</p>}
          {done && <p className="py-2 text-center text-xs text-gray-300">End of log</p>}
        </div>
      )}
    </div>
  );
}
