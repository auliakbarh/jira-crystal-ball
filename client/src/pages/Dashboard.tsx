import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import { useSquad } from "../context/SquadContext";
import { CURRENT_SPRINT, SQUAD, SYNC_ACTIVE_SPRINT } from "../graphql";
import { todayISO } from "../lib/helpers";
import TeamPanel from "../components/TeamPanel";
import BlockersPanel from "../components/BlockersPanel";
import StandupTable from "../components/StandupTable";
import ActivityPanel from "../components/ActivityPanel";
import LeadSchedule from "../components/LeadSchedule";
import SprintProgress from "../components/SprintProgress";
import CurrentSprintSummary from "../components/CurrentSprintSummary";
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

  const jiraConfigured = squadData?.squad?.jiraConfigured;
  const sprint = sprintData?.currentSprint;

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
          <TeamPanel squadId={squadId} />
          <BlockersPanel squadId={squadId} sprintId={sprint?.id} />
          <ActivityPanel squadId={squadId} />
        </div>
        <div className="lg:col-span-2">
          {sprint ? (
            <StandupTable squadId={squadId} sprintId={sprint.id} date={date} />
          ) : (
            <div className="card text-sm text-gray-500">Create a sprint to start recording standup updates.</div>
          )}
        </div>
      </div>
    </div>
  );
}
