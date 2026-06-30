import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client";
import { ACTIVITY_LOG } from "../graphql";
import { SkeletonLines } from "./Skeleton";

const PAGE = 20;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ActivityPanel({ squadId }: { squadId: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // Debounce the query variable so we don't fire per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, loading, fetchMore } = useQuery(ACTIVITY_LOG, {
    variables: { squadId, limit: PAGE, offset: 0, search },
    fetchPolicy: "cache-and-network",
  });
  const logs = data?.activityLog ?? [];
  const [done, setDone] = useState(false);
  const [more, setMore] = useState(false);

  // Reset the "end of log" flag whenever the search term changes.
  useEffect(() => setDone(false), [search]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (done || more) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      setMore(true);
      fetchMore({
        variables: { offset: logs.length, search },
        updateQuery: (prev, { fetchMoreResult }) => {
          const extra = fetchMoreResult?.activityLog ?? [];
          if (extra.length < PAGE) setDone(true);
          const seen = new Set(prev.activityLog.map((x: any) => x.id));
          return { activityLog: [...prev.activityLog, ...extra.filter((x: any) => !seen.has(x.id))] };
        },
      }).finally(() => setMore(false));
    }
  };

  return (
    <div className="card">
      <h2 className="mb-2 text-base font-bold">🕒 Update Log</h2>
      <input
        className="input mb-3 text-sm"
        placeholder="Search updates (ticket, name, note…)"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />
      {loading && logs.length === 0 ? (
        <SkeletonLines rows={5} />
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-500">{search ? "No matches." : "No updates yet today."}</p>
      ) : (
        <div className="max-h-72 overflow-y-auto overscroll-contain pr-1" onScroll={onScroll}>
          <ul className="space-y-2">
            {logs.map((l: any) => (
              <li key={l.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{l.actor}</span>
                  <span className="text-xs text-gray-400">{timeAgo(l.createdAt)}</span>
                </div>
                <div className="text-gray-600 dark:text-gray-400">{l.message}</div>
                {(l.prevText || l.newText) && (
                  <div className="mt-0.5 rounded bg-gray-50 px-1.5 py-1 text-xs dark:bg-gray-800/60">
                    <div className="text-red-600 line-through dark:text-red-400/80">
                      {l.prevText ? l.prevText : <span className="italic opacity-60">(empty)</span>}
                    </div>
                    <div className="text-green-700 dark:text-green-300">
                      {l.newText ? l.newText : <span className="italic opacity-60">(cleared)</span>}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {more && <p className="py-2 text-center text-xs text-gray-400">Loading…</p>}
          {done && <p className="py-2 text-center text-xs text-gray-300">End of log</p>}
        </div>
      )}
    </div>
  );
}
