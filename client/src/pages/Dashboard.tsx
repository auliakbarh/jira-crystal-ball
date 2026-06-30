import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useSubscription, useApolloClient } from "@apollo/client";
import { Link } from "react-router-dom";
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
        setSyncMsg(s ? `Synced Sprint ${s.number} from JIRA.` : "No active sprint found on the board.");
      }
    } catch (e: any) {
      if (!silent) setSyncMsg(`Sync failed: ${e.message}`);
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
        <Modal title="🔧 Configure JIRA first" onClose={() => setDismissed(true)}>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
            JIRA credentials are not set on the server. An admin must set{" "}
            <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code> and <code>JIRA_API_TOKEN</code>{" "}
            in the server <code>.env</code> and restart. You can still record standup updates
            manually — only live ticket data needs JIRA.
          </p>
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
                Sprint {sprint.number}
                {sprint.name ? ` — ${sprint.name}` : ""}
              </div>
              <div className="text-sm text-gray-500">
                {sprint.startDate} → {sprint.endDate}
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">
              No active sprint.{" "}
              {jiraConfigured ? (
                <span>Use “Sync from JIRA”, or </span>
              ) : null}
              <Link to="/settings" className="text-brand hover:underline">
                create one in Settings
              </Link>
              .
            </div>
          )}
          {syncMsg && <div className="mt-1 text-xs text-gray-400">{syncMsg}</div>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {jiraConfigured && (
            <button className="btn-ghost" onClick={() => doSync(false)} disabled={syncing} title="Pull active sprint from JIRA">
              {syncing ? "Syncing…" : "↻ Sync from JIRA"}
            </button>
          )}
          <label className="label mb-0">Standup date</label>
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

      {/* Standup session control */}
      {sprint && (
        <div
          className={`card flex flex-wrap items-center gap-3 ${
            ledByOther ? "border-amber-300 dark:border-amber-900/60" : ""
          }`}
        >
          {!standup?.active && (
            <>
              <span className="text-sm text-gray-500">No standup in progress.</span>
              <button className="btn-primary ml-auto" onClick={begin}>
                ▶ Start standup
              </button>
            </>
          )}
          {isLeading && (
            <>
              <span className="text-sm">
                🎤 You are leading this standup{" "}
                <span className="chip bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                  editing enabled
                </span>
              </span>
              {standup?.startedAt && (
                <span className="chip bg-gray-100 dark:bg-gray-800" title="Elapsed since start">
                  ⏱ <Elapsed startedAt={standup.startedAt} />
                </span>
              )}
              <button className="btn-ghost ml-auto" onClick={finish}>
                ■ End standup
              </button>
            </>
          )}
          {ledByOther && (
            <>
              <span className="text-sm">
                🔒 Standup led by <b>{standup.leadName}</b> —{" "}
                {isAdmin ? "you're admin (editing allowed)" : "read-only for you"}
              </span>
              {isAdmin && (
                <button className="btn-ghost ml-auto" onClick={begin} title="Take over as admin">
                  Take over
                </button>
              )}
            </>
          )}
        </div>
      )}

      {sprint && (
        <div className="card">
          <h2 className="mb-2 text-sm font-bold">Sprint Timeline</h2>
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
            <div className="card text-sm text-gray-500">Create a sprint to start recording standup updates.</div>
          )}
        </div>
      </div>
    </div>
  );
}
