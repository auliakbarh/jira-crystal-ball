import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      setMsg(t("comp.boardIdSaved"));
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
      setMsg(t("comp.connectedAs", { user: res.data?.testJiraConfig }));
    } catch (e: any) {
      setErr(t("comp.connectionError", { message: e.message }));
    }
  };

  return (
    <div className="space-y-3">
      {/* Global credentials status */}
      <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
        <div className="mb-1 font-semibold">{t("comp.jiraCredentialsTitle")}</div>
        {envCfg?.configured ? (
          <div className="text-gray-600 dark:text-gray-400">
            <div>{t("comp.configured")}</div>
            <div className="text-xs">{t("comp.baseUrlLabel", { url: envCfg.baseUrl })}</div>
            <div className="text-xs">{t("comp.accountLabel", { email: envCfg.email })}</div>
          </div>
        ) : (
          <div className="text-amber-600 dark:text-amber-400">
            {t("comp.notConfiguredPrefix")} <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code>{" "}
            {t("comp.notConfiguredAnd")} <code>JIRA_API_TOKEN</code> {t("comp.notConfiguredInServer")}{" "}
            <code>.env</code>{t("comp.notConfiguredSuffix")}
          </div>
        )}
      </div>

      <div>
        <label className="label">{t("comp.boardIdOptional")}</label>
        <input
          className="input"
          placeholder={envCfg?.defaultBoardId ? t("comp.envDefaultPlaceholder", { id: envCfg.defaultBoardId }) : t("comp.boardIdPlaceholder")}
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          {t("comp.boardIdHelpBefore")} <code>…/boards/123</code>{t("comp.boardIdHelpAfter")}
          {envCfg?.defaultBoardId ? ` (${envCfg.defaultBoardId})` : ""}{t("comp.boardIdHelpEnd")}
        </p>
      </div>

      {msg && <div className="text-sm text-green-600 dark:text-green-400">{msg}</div>}
      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={onSave} disabled={loading}>
          {loading ? t("comp.saving") : t("comp.saveBoardId")}
        </button>
        <button className="btn-ghost" onClick={onTest} disabled={testing || !envCfg?.configured}>
          {testing ? t("comp.testing") : t("comp.testConnection")}
        </button>
      </div>
    </div>
  );
}
