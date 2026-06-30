import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { JIRA_ENV, TEST_JIRA, UPDATE_SQUAD } from "../graphql";

/**
 * JIRA credentials (base URL, email, API token) are configured globally in the
 * server environment. Here a squad only sets its optional board id, and can test
 * the global connection.
 */
export default function JiraConfigForm({
  squadId,
  currentBoardId,
  onSaved,
}: {
  squadId: string;
  currentBoardId?: string | null;
  onSaved?: () => void;
}) {
  const { data: envData } = useQuery(JIRA_ENV);
  const envCfg = envData?.jiraEnv;

  const [boardId, setBoardId] = useState(currentBoardId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [update, { loading }] = useMutation(UPDATE_SQUAD);
  const [test, { loading: testing }] = useMutation(TEST_JIRA);

  const onSave = async () => {
    setErr(null);
    setMsg(null);
    try {
      await update({ variables: { id: squadId, defaultBoardId: boardId } });
      setMsg("Board id saved.");
      onSaved?.();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const onTest = async () => {
    setErr(null);
    setMsg(null);
    try {
      const res = await test();
      setMsg(`✅ Connected as: ${res.data?.testJiraConfig}`);
    } catch (e: any) {
      setErr(`❌ ${e.message}`);
    }
  };

  return (
    <div className="space-y-3">
      {/* Global credentials status */}
      <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
        <div className="mb-1 font-semibold">JIRA credentials (server environment)</div>
        {envCfg?.configured ? (
          <div className="text-gray-600 dark:text-gray-400">
            <div>✅ Configured</div>
            <div className="text-xs">Base URL: {envCfg.baseUrl}</div>
            <div className="text-xs">Account: {envCfg.email}</div>
          </div>
        ) : (
          <div className="text-amber-600 dark:text-amber-400">
            ⚠️ Not configured. Set <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code> and{" "}
            <code>JIRA_API_TOKEN</code> in the server <code>.env</code>, then restart the server.
          </div>
        )}
      </div>

      <div>
        <label className="label">Board ID (optional)</label>
        <input
          className="input"
          placeholder={envCfg?.defaultBoardId ? `env default: ${envCfg.defaultBoardId}` : "e.g. 123 or project key ATH"}
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          Per-squad board id (numeric id from <code>…/boards/123</code>, or a project key).
          Leave blank to use the env default
          {envCfg?.defaultBoardId ? ` (${envCfg.defaultBoardId})` : ""} — board ticket
          views just stay empty if no board id is resolvable.
        </p>
      </div>

      {msg && <div className="text-sm text-green-600 dark:text-green-400">{msg}</div>}
      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={onSave} disabled={loading}>
          {loading ? "Saving…" : "Save board id"}
        </button>
        <button className="btn-ghost" onClick={onTest} disabled={testing || !envCfg?.configured}>
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>
    </div>
  );
}
