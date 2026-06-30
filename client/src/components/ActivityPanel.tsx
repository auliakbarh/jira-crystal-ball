import { useQuery } from "@apollo/client";
import { ACTIVITY_LOG } from "../graphql";
import { SkeletonLines } from "./Skeleton";

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
  const { data, loading } = useQuery(ACTIVITY_LOG, {
    variables: { squadId, limit: 30 },
    fetchPolicy: "cache-and-network",
  });
  const logs = data?.activityLog ?? [];

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold">🕒 Update Log</h2>
      {loading && logs.length === 0 ? (
        <SkeletonLines rows={5} />
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-500">No updates yet today.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((l: any) => (
            <li key={l.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{l.actor}</span>
                <span className="text-xs text-gray-400">{timeAgo(l.createdAt)}</span>
              </div>
              <div className="text-gray-600 dark:text-gray-400">{l.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
