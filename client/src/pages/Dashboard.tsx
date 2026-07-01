import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useSubscription, useApolloClient } from "@apollo/client";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSquad } from "../context/SquadContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  CURRENT_SPRINT,
  SQUAD,
  SYNC_ACTIVE_SPRINT,
  ACTIVE_STANDUP,
  START_STANDUP,
  STANDUP_HEARTBEAT,
  END_STANDUP,
  STANDUP_CHANGED,
  DASHBOARD,
} from "../graphql";
import { todayISO } from "../lib/helpers";
import { LEAD_KEY } from "../lib/leadKey";
import TeamPanel from "../components/TeamPanel";
import BlockersPanel from "../components/BlockersPanel";
import StandupTable from "../components/StandupTable";
import ActivityPanel from "../components/ActivityPanel";
import LeadSchedule from "../components/LeadSchedule";
import SprintProgress from "../components/SprintProgress";
import CurrentSprintSummary from "../components/CurrentSprintSummary";
import Elapsed from "../components/Elapsed";
import StandupDurationLog from "../components/StandupDurationLog";
import { STANDUP_LOGS } from "../graphql";
import Modal from "../components/Modal";
import JiraConfigForm from "../components/JiraConfigForm";

export default function Dashboard() {
  const { t } = useTranslation();
  const { squadId } = useSquad();
  const [date, setDate] = useState(todayISO());
  const [dismissed, setDismissed] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const { data: squadData, refetch: refetchSquad } = useQuery(SQUAD, {
    variables: { id: squadId },
    skip: !squadId,
  });
  const { data: sprintData, refetch: refetchSprint } = useQuery(CURRENT_SPRINT, {
    variables: { squadId },
    skip: !squadId,
  });
  const [syncActiveSprint, { loading: syncing }] = useMutation(SYNC_ACTIVE_SPRINT);

  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const toast = useToast();

  const jiraConfigured = squadData?.squad?.jiraConfigured;
  const sprint = sprintData?.currentSprint;

  // --- Standup session lock ---
  const apollo = useApolloClient();
  const { data: standupData, refetch: refetchStandup } = useQuery(ACTIVE_STANDUP, {
    variables: { sprintId: sprint?.id, leadKey: LEAD_KEY },
    skip: !sprint,
    fetchPolicy: "cache-and-network",
  });

  // Live updates: when anyone changes this sprint's lock/cells, re-pull.
  useSubscription(STANDUP_CHANGED, {
    variables: { sprintId: sprint?.id },
    skip: !sprint,
    onData: ({ data }) => {
      const kind = data.data?.standupChanged?.kind;
      refetchStandup();
      if (kind === "entry" && sprint) {
        apollo.refetchQueries({ include: [DASHBOARD] });
      }
    },
  });
  const standup = standupData?.activeStandup;
  const isLeading = !!standup?.isMine;
  const ledByOther = !!standup?.active && !standup.isMine;
  const canEdit = isAdmin || !standup?.active || isLeading;

  const logsRefetch = squadId
    ? [{ query: STANDUP_LOGS, variables: { squadId, limit: 20, offset: 0 } }]
    : [];
  const [startStandup] = useMutation(START_STANDUP, { refetchQueries: logsRefetch });
  const [heartbeat] = useMutation(STANDUP_HEARTBEAT);
  const [endStandup] = useMutation(END_STANDUP, { refetchQueries: logsRefetch });

  const begin = async () => {
    const leadName = user?.name || "Lead";
    try {
      await startStandup({ variables: { sprintId: sprint.id, leadName, leadKey: LEAD_KEY } });
      refetchStandup();
    } catch (e: any) {
      toast.error(e.message);
      refetchStandup();
    }
  };
  const finish = async () => {
    await endStandup({ variables: { sprintId: sprint.id, leadKey: LEAD_KEY } });
    refetchStandup();
  };

  // Heartbeat + release-on-close while leading.
  useEffect(() => {
    if (!sprint || !isLeading) return;
    const id = setInterval(() => {
      heartbeat({ variables: { sprintId: sprint.id, leadKey: LEAD_KEY } });
    }, 7000);

    // Release on tab close/hide. sendBeacon can't set the auth header (endStandup
    // requires it), so use fetch with keepalive — it survives the unload and can
    // carry Authorization. The server-side staleness check is the safety net if
    // this never fires (crash / lost network).
    const release = () => {
      const token = localStorage.getItem("jcb_token");
      try {
        fetch(import.meta.env.VITE_GRAPHQL_URL || "http://localhost:4000/", {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            query: "mutation($s:ID!,$k:String!){endStandup(sprintId:$s,leadKey:$k)}",
            variables: { s: sprint.id, k: LEAD_KEY },
          }),
        });
      } catch {
        /* ignore */
      }
    };
    // pagehide fires on real unload/navigation (not on plain tab-switch), so it
    // won't release the lock just because the lead peeked at another tab.
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", release);
    };
  }, [sprint?.id, isLeading, heartbeat]);

  const doSync = async (silent = false) => {
    setSyncMsg(null);
    try {
      const res = await syncActiveSprint({ variables: { squadId } });
      await refetchSprint();
      if (!silent) {
        const s = res.data?.syncActiveSprint;
        setSyncMsg(s ? t("dashboard.syncedFrom", { number: s.number }) : t("dashboard.noActiveOnBoard"));
      }
    } catch (e: any) {
      if (!silent) setSyncMsg(t("dashboard.syncFailed", { msg: e.message }));
    }
  };

  // On first load: if JIRA is configured but there's no local sprint, pull the
  // active sprint (number + dates) from JIRA automatically.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (!squadId || autoSynced.current) return;
    if (jiraConfigured && sprintData && !sprintData.currentSprint) {
      autoSynced.current = true;
      doSync(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squadId, jiraConfigured, sprintData]);

  // Reset the auto-sync guard when the squad changes.
  useEffect(() => {
    autoSynced.current = false;
  }, [squadId]);

  if (!squadId) return null;

  return (
    <div className="space-y-5">
      {/* JIRA not configured popup (global credentials missing) */}
      {squadData && !jiraConfigured && !dismissed && (
        <Modal title={t("dashboard.jiraModalTitle")} onClose={() => setDismissed(true)}>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t("dashboard.jiraModalBody")}</p>
          <JiraConfigForm
            squadId={squadId}
            currentBoardId={squadData?.squad?.defaultBoardId}
            onSaved={() => {
              refetchSquad();
              setDismissed(true);
            }}
          />
        </Modal>
      )}

      {/* Sprint header */}
      <div className="card flex flex-wrap items-center gap-4">
        <div>
          {sprint ? (
            <>
              <div className="text-lg font-bold">
                {t("dashboard.sprint")} {sprint.number}
                {sprint.name ? ` — ${sprint.name}` : ""}
              </div>
              <div className="text-sm text-gray-500">
                {sprint.startDate} → {sprint.endDate}
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">
              {t("dashboard.noActiveSprint")}{" "}
              {jiraConfigured ? <span>{t("dashboard.useSyncOr")}</span> : null}
              <Link to="/settings" className="text-brand hover:underline">
                {t("dashboard.createInSettings")}
              </Link>
              .
            </div>
          )}
          {syncMsg && <div className="mt-1 text-xs text-gray-400">{syncMsg}</div>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          {jiraConfigured && (
            <button className="btn-ghost shrink-0" onClick={() => doSync(false)} disabled={syncing} title={t("dashboard.syncTitle")}>
              {syncing ? t("dashboard.syncing") : t("dashboard.syncFromJira")}
            </button>
          )}
          <div className="flex items-center gap-2">
            <label className="label mb-0 shrink-0">{t("dashboard.standupDate")}</label>
            <input
              type="date"
              className="input max-w-[170px]"
              value={date}
              min={sprint?.startDate}
              max={sprint?.endDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Standup session control */}
      {sprint && (
        <div
          className={`card flex flex-wrap items-center gap-3 ${
            ledByOther ? "border-amber-300 dark:border-amber-900/60" : ""
          }`}
        >
          {!standup?.active && (
            <>
              <span className="text-sm text-gray-500">{t("dashboard.noStandup")}</span>
              <button className="btn-primary ml-auto" onClick={begin}>
                {t("dashboard.startStandup")}
              </button>
            </>
          )}
          {isLeading && (
            <>
              <span className="text-sm">
                {t("dashboard.youLeading")}{" "}
                <span className="chip bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                  {t("dashboard.editingEnabled")}
                </span>
              </span>
              {standup?.startedAt && (
                <span className="chip bg-gray-100 dark:bg-gray-800" title={t("dashboard.elapsedTitle")}>
                  ⏱ <Elapsed startedAt={standup.startedAt} />
                </span>
              )}
              <button className="btn-ghost ml-auto" onClick={finish}>
                {t("dashboard.endStandup")}
              </button>
            </>
          )}
          {ledByOther && (
            <>
              <span className="text-sm">
                {t("dashboard.ledBy")} <b>{standup.leadName}</b> —{" "}
                {isAdmin ? t("dashboard.adminEditing") : t("dashboard.readOnly")}
              </span>
              {isAdmin && (
                <button className="btn-ghost ml-auto" onClick={begin} title={t("dashboard.takeOverTitle")}>
                  {t("dashboard.takeOver")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {sprint && (
        <div className="card">
          <h2 className="mb-2 text-sm font-bold">{t("dashboard.sprintTimeline")}</h2>
          <SprintProgress
            startDate={sprint.startDate}
            endDate={sprint.endDate}
            holidays={squadData?.squad?.holidays ?? []}
            currentDate={date}
            onSelect={setDate}
          />
        </div>
      )}

      {sprint && (
        <CurrentSprintSummary
          squadId={squadId}
          sprintId={sprint.id}
          sprint={sprint}
          members={squadData?.squad?.members ?? []}
          holidays={squadData?.squad?.holidays ?? []}
        />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <LeadSchedule
            members={squadData?.squad?.members ?? []}
            holidays={squadData?.squad?.holidays ?? []}
            sprint={sprint}
            currentDate={date}
          />
          <TeamPanel squadId={squadId} sprintId={sprint?.id} />
          <BlockersPanel squadId={squadId} sprintId={sprint?.id} />
          <ActivityPanel squadId={squadId} />
          <StandupDurationLog squadId={squadId} />
        </div>
        <div className="lg:col-span-2">
          {sprint ? (
            <StandupTable squadId={squadId} sprintId={sprint.id} date={date} canEdit={canEdit} leadKey={LEAD_KEY} />
          ) : (
            <div className="card text-sm text-gray-500">{t("dashboard.createSprintHint")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
