import { useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import { HEALTH } from "../graphql";

function Row({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-xs text-gray-500">{hint}</div>}
      </div>
      <span
        className={`chip ${
          ok
            ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
            : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
        }`}
      >
        {ok ? "OK" : "DOWN"}
      </span>
    </div>
  );
}

export default function Health() {
  const { data, loading, error, refetch } = useQuery(HEALTH, {
    fetchPolicy: "network-only",
    pollInterval: 15000,
  });
  const h = data?.health;
  const apiUp = !error && !!h;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">🩺 Health Check</h1>
          <button className="btn-ghost" onClick={() => refetch()} disabled={loading}>
            {loading ? "…" : "↻"}
          </button>
        </div>

        <div className="space-y-2">
          <Row label="GraphQL API" ok={apiUp} hint={error ? error.message : undefined} />
          <Row label="Database (PostgreSQL)" ok={!!h?.database} />
          <Row
            label="JIRA credentials"
            ok={!!h?.jira}
            hint={h && !h.jira ? "JIRA_* env vars not set" : undefined}
          />
        </div>

        <div
          className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
            apiUp && h?.ok
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          }`}
        >
          {apiUp && h?.ok ? "All systems operational" : "Degraded / unreachable"}
        </div>

        {h?.time && (
          <div className="text-center text-xs text-gray-400">
            Server time: {new Date(h.time).toLocaleString()}
          </div>
        )}

        <div className="text-center text-sm">
          <Link to="/login" className="text-brand hover:underline">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
