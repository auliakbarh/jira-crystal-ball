import { useState } from "react";
import { useApolloClient, useMutation, useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { useAuth } from "../context/AuthContext";
import ConfirmModal from "../components/ConfirmModal";
import {
  SQUAD,
  SQUADS,
  CREATE_SQUAD,
  UPDATE_SQUAD,
  JIRA_FIELDS,
  JIRA_USERS,
  DELETE_SQUAD,
  RESET_DATABASE,
  ADD_MEMBER,
  UPDATE_MEMBER,
  DELETE_MEMBER,
  ADD_LEAVE,
  DELETE_LEAVE,
  ADD_HOLIDAY,
  DELETE_HOLIDAY,
  CREATE_SPRINT,
  UPDATE_SPRINT,
  DELETE_SPRINT,
} from "../graphql";
import { POSITION_COLORS, LEAVE_TYPES, LEAVE_LABELS } from "../lib/helpers";
import JiraConfigForm from "../components/JiraConfigForm";

const POSITIONS = ["FE", "BE", "QA", "PM", "FULLSTACK", "ALL"] as const;

export default function Settings() {
  const { squadId, setSquadId } = useSquad();
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const { data, refetch } = useQuery(SQUAD, { variables: { id: squadId }, skip: !squadId });
  const squad = data?.squad;

  if (!squadId)
    return (
      <div className="space-y-5">
        <SquadsSection currentId={squadId} setSquadId={setSquadId} isAdmin={isAdmin} />
        {isAdmin && <DangerZone setSquadId={setSquadId} />}
      </div>
    );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Settings — {squad?.name}</h1>

      <SquadsSection currentId={squadId} setSquadId={setSquadId} isAdmin={isAdmin} />

      <section className="card">
        <h2 className="mb-3 text-base font-bold">JIRA Board</h2>
        <JiraConfigForm squadId={squadId} currentBoardId={squad?.defaultBoardId} onSaved={refetch} />
      </section>

      <MembersSection squadId={squadId} members={squad?.members ?? []} refetch={refetch} />
      <SprintsSection squadId={squadId} sprints={squad?.sprints ?? []} refetch={refetch} />
      <HolidaysSection squadId={squadId} holidays={squad?.holidays ?? []} refetch={refetch} />

      {isAdmin && <DangerZone setSquadId={setSquadId} />}
    </div>
  );
}

// --------------------------- Danger zone (admin) ---------------------------
function DangerZone({ setSquadId }: { setSquadId: (id: string) => void }) {
  const apollo = useApolloClient();
  const [reset, { loading }] = useMutation(RESET_DATABASE);
  const [reseed, setReseed] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const doReset = async () => {
    setMsg(null);
    try {
      await reset({ variables: { reseedDefaults: reseed } });
      localStorage.removeItem("jcb_squad");
      setSquadId("");
      await apollo.resetStore(); // clear cache so the UI reflects the wipe
      setMsg("Database reset complete.");
      setConfirmText("");
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <section className="card border-red-300 dark:border-red-900/60">
      <h2 className="mb-1 text-base font-bold text-red-600 dark:text-red-400">⚠️ Danger Zone — Reset Database</h2>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Deletes <b>all squads</b> and everything under them (members, leaves, holidays,
        sprints, standup entries, blockers, JIRA configs). User accounts are kept. This
        cannot be undone.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reseed} onChange={(e) => setReseed(e.target.checked)} />
        Recreate default squads (Athens / Berlin / Cairo) after reset
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[220px]"
          placeholder='Type "RESET" to confirm'
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
        <button className="btn-danger" onClick={() => setConfirming(true)} disabled={loading || confirmText !== "RESET"}>
          {loading ? "Resetting…" : "Reset Database"}
        </button>
      </div>
      {msg && <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
      {confirming && (
        <ConfirmModal
          title="Reset database"
          message="This permanently deletes ALL squads and their data (members, leaves, holidays, sprints, standup entries, blockers, JIRA configs). User accounts are kept. This cannot be undone."
          confirmLabel="Reset Database"
          danger
          busy={loading}
          onConfirm={doReset}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

// --------------------------- Squads ---------------------------
function SquadsSection({
  currentId,
  setSquadId,
  isAdmin,
}: {
  currentId: string | null;
  setSquadId: (id: string) => void;
  isAdmin: boolean;
}) {
  const { data, refetch } = useQuery(SQUADS);
  const [create] = useMutation(CREATE_SQUAD);
  const [del, { loading: deleting }] = useMutation(DELETE_SQUAD);
  const [name, setName] = useState("");
  const [delTarget, setDelTarget] = useState<{ id: string; label: string } | null>(null);
  const squads = data?.squads ?? [];

  const add = async () => {
    if (!name.trim()) return;
    const res = await create({ variables: { name: name.trim() } });
    setName("");
    await refetch();
    if (res.data?.createSquad?.id) setSquadId(res.data.createSquad.id);
  };

  const remove = (id: string, label: string) => setDelTarget({ id, label });

  const performDelete = async () => {
    if (!delTarget) return;
    const { id } = delTarget;
    await del({ variables: { id } });
    const rest = squads.filter((s: any) => s.id !== id);
    await refetch();
    if (currentId === id && rest[0]) setSquadId(rest[0].id);
    setDelTarget(null);
  };

  return (
    <section className="card">
      <h2 className="mb-3 text-base font-bold">Squads / Teams</h2>
      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="label">New squad name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <button className="btn-primary" onClick={add}>
          Add Squad
        </button>
      </div>
      <ul className="space-y-1.5">
        {squads.map((s: any) => (
          <SquadRow
            key={s.id}
            squad={s}
            isCurrent={s.id === currentId}
            isAdmin={isAdmin}
            onSwitch={() => setSquadId(s.id)}
            onDelete={() => remove(s.id, s.name)}
            onSaved={refetch}
          />
        ))}
      </ul>
      {delTarget && (
        <ConfirmModal
          title="Delete squad"
          message={`Delete squad "${delTarget.label}"? All its sprints, members, blockers and JIRA config are removed. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          busy={deleting}
          onConfirm={performDelete}
          onClose={() => setDelTarget(null)}
        />
      )}
    </section>
  );
}

function SquadRow({
  squad,
  isCurrent,
  isAdmin,
  onSwitch,
  onDelete,
  onSaved,
}: {
  squad: any;
  isCurrent: boolean;
  isAdmin: boolean;
  onSwitch: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(squad.name);
  const [boardId, setBoardId] = useState(squad.defaultBoardId ?? "");
  const [spDefault, setSpDefault] = useState(squad.spFieldDefault ?? "");
  const [spFE, setSpFE] = useState(squad.spFieldFE ?? "");
  const [spBE, setSpBE] = useState(squad.spFieldBE ?? "");
  const [spQA, setSpQA] = useState(squad.spFieldQA ?? "");
  const [confSpace, setConfSpace] = useState(squad.confluenceSpaceKey ?? "");
  const [confParent, setConfParent] = useState(squad.confluenceParentId ?? "");
  const [tarotType, setTarotType] = useState(squad.tarotScaleType ?? "");
  const [tarotValues, setTarotValues] = useState(() => {
    try {
      const arr = JSON.parse(squad.tarotScaleValues ?? "[]");
      return Array.isArray(arr) ? arr.join(", ") : "";
    } catch {
      return "";
    }
  });
  const [update, { loading }] = useMutation(UPDATE_SQUAD);

  // Lazy-load the board's JIRA fields (id + name) when editing, to help pick SP fields.
  const { data: fieldsData, loading: fieldsLoading } = useQuery(JIRA_FIELDS, {
    variables: { squadId: squad.id },
    skip: !editing,
  });
  const fields = fieldsData?.jiraFields ?? [];

  const save = async () => {
    if (!name.trim()) return;
    await update({
      variables: {
        id: squad.id,
        name: name.trim(),
        defaultBoardId: boardId,
        spFieldDefault: spDefault,
        spFieldFE: spFE,
        spFieldBE: spBE,
        spFieldQA: spQA,
        confluenceSpaceKey: confSpace,
        confluenceParentId: confParent,
        tarotScaleType: tarotType,
        tarotScaleValues:
          tarotType === "CUSTOM"
            ? JSON.stringify(tarotValues.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n)))
            : "",
      },
    });
    setEditing(false);
    onSaved();
  };

  const jiraChip = (
    <span
      className={`chip ${
        squad.jiraConfigured
          ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800"
      }`}
    >
      {squad.jiraConfigured ? "JIRA ✓" : "no JIRA"}
    </span>
  );

  if (editing) {
    const listId = `jcb-fields-${squad.id}`;
    const spInput = (label: string, val: string, set: (v: string) => void) => (
      <div>
        <label className="label">{label}</label>
        <input
          className="input max-w-[220px]"
          list={listId}
          placeholder="field id or name"
          value={val}
          onChange={(e) => set(e.target.value)}
        />
      </div>
    );
    return (
      <li className="space-y-2 rounded-lg border border-brand/40 px-3 py-2 text-sm">
        <datalist id={listId}>
          {fields.map((f: any) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.id})
            </option>
          ))}
        </datalist>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Name</label>
            <input className="input max-w-[200px]" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Board ID (optional)</label>
            <input className="input max-w-[160px]" placeholder="e.g. ATH or 123" value={boardId} onChange={(e) => setBoardId(e.target.value)} />
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Story Points field — id (e.g. <code>customfield_10033</code>) or exact field name (e.g. "Story Points QA").
          {fieldsLoading ? " Loading board fields…" : ` ${fields.length} fields available (see suggestions).`}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {spInput("SP default", spDefault, setSpDefault)}
          {spInput("SP FE", spFE, setSpFE)}
          {spInput("SP BE", spBE, setSpBE)}
          {spInput("SP QA", spQA, setSpQA)}
        </div>
        <div className="text-xs text-gray-500">
          Confluence export target — leave blank to use the global env defaults
          (<code>CONFLUENCE_SPACE_KEY</code> / <code>CONFLUENCE_PARENT_ID</code>).
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Confluence Space Key</label>
            <input
              className="input max-w-[200px]"
              placeholder="e.g. MYHERO"
              value={confSpace}
              onChange={(e) => setConfSpace(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Confluence Parent ID</label>
            <input
              className="input max-w-[200px]"
              placeholder="e.g. 1119092737"
              value={confParent}
              onChange={(e) => setConfParent(e.target.value)}
            />
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Tarot (planning poker) default scale — used when a host opens a new room (the host
          can still override per-room). <code>?</code> and <code>☕</code> cards are always added.
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Default scale</label>
            <select className="input max-w-[160px]" value={tarotType} onChange={(e) => setTarotType(e.target.value)}>
              <option value="">— (Fibonacci)</option>
              <option value="FIBONACCI">Fibonacci</option>
              <option value="SCRUM">Scrum</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          {tarotType === "CUSTOM" && (
            <div>
              <label className="label">Custom values</label>
              <input
                className="input max-w-[260px]"
                placeholder="e.g. 1, 2, 3, 5, 8, 13"
                value={tarotValues}
                onChange={(e) => setTarotValues(e.target.value)}
              />
            </div>
          )}
        </div>
        {/* Quick reference: list of fields with ids (filterable by browser datalist above) */}
        {fields.length > 0 && (
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">Board fields (name → id)</summary>
            <div className="mt-1 max-h-40 overflow-y-auto">
              {fields.map((f: any) => (
                <div key={f.id} className="flex justify-between gap-2 border-b border-gray-100 py-0.5 dark:border-gray-800">
                  <span>{f.name}</span>
                  <code className="text-gray-400">{f.id}</code>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost text-xs" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button className="btn-primary text-xs" onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
      <span className="font-medium">{squad.name}</span>
      {isCurrent && <span className="chip bg-brand text-white">current</span>}
      <span className="chip bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        board: {squad.defaultBoardId || "—"}
      </span>
      {jiraChip}
      <div className="ml-auto flex gap-2">
        {!isCurrent && (
          <button className="text-xs text-brand hover:underline" onClick={onSwitch}>
            Switch
          </button>
        )}
        {isAdmin && (
          <button className="text-xs text-brand hover:underline" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {isAdmin && (
          <button className="text-xs text-red-600 hover:underline" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

// --------------------------- Members + leaves ---------------------------
function MembersSection({ squadId, members, refetch }: any) {
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("FE");
  const [jiraId, setJiraId] = useState("");
  const [add] = useMutation(ADD_MEMBER);
  const [del] = useMutation(DELETE_MEMBER);
  const { data: usersData, loading: usersLoading } = useQuery(JIRA_USERS, {
    variables: { squadId },
    skip: !squadId,
  });
  const jiraUsers = usersData?.jiraUsers ?? [];
  const usersListId = `jcb-users-${squadId}`;

  const addMember = async () => {
    if (!name.trim()) return;
    await add({
      variables: {
        squadId,
        input: { name: name.trim(), fullName: fullName.trim() || null, position, jiraAccountId: jiraId || null },
      },
    });
    setName("");
    setFullName("");
    setJiraId("");
    refetch();
  };

  return (
    <section className="card">
      <h2 className="mb-3 text-base font-bold">Team Members</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="label">Full name (optional)</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Position</label>
          <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="label">JIRA account id (optional)</label>
          <input
            className="input"
            list={usersListId}
            placeholder={usersLoading ? "loading JIRA users…" : "pick a name or paste an account id"}
            value={jiraId}
            onChange={(e) => setJiraId(e.target.value)}
          />
          <datalist id={usersListId}>
            {jiraUsers.map((u: any) => (
              <option key={u.accountId} value={u.accountId}>
                {u.displayName}
                {u.email ? ` — ${u.email}` : ""}
              </option>
            ))}
          </datalist>
        </div>
        <button className="btn-primary" onClick={addMember}>
          Add
        </button>
      </div>

      <ul className="space-y-3">
        {members.map((m: any) => (
          <MemberRow
            key={m.id}
            member={m}
            members={members}
            refetch={refetch}
            del={del}
            jiraUsers={jiraUsers}
            usersListId={usersListId}
            usersLoading={usersLoading}
          />
        ))}
      </ul>
    </section>
  );
}

// One member: read-only summary + inline edit (name / position / JIRA account id).
function MemberRow({ member: m, members, refetch, del, jiraUsers, usersListId, usersLoading }: any) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [fullName, setFullName] = useState(m.fullName ?? "");
  const [position, setPosition] = useState(m.position);
  const [jiraId, setJiraId] = useState(m.jiraAccountId ?? "");
  const [update, { loading }] = useMutation(UPDATE_MEMBER);

  const save = async () => {
    if (!name.trim()) return;
    await update({
      variables: {
        id: m.id,
        input: { name: name.trim(), fullName: fullName.trim() || null, position, jiraAccountId: jiraId || null },
      },
    });
    setEditing(false);
    refetch();
  };

  const cancel = () => {
    setName(m.name);
    setFullName(m.fullName ?? "");
    setPosition(m.position);
    setJiraId(m.jiraAccountId ?? "");
    setEditing(false);
  };

  return (
    <li className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[120px]">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">Full name (optional)</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">Position</label>
            <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">JIRA account id (optional)</label>
            <input
              className="input"
              list={usersListId}
              placeholder={usersLoading ? "loading JIRA users…" : "pick a name or paste an account id"}
              value={jiraId}
              onChange={(e) => setJiraId(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={cancel}>
              Cancel
            </button>
            <button className="btn-primary text-xs" onClick={save} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`chip ${POSITION_COLORS[m.position]}`}>{m.position}</span>
          <span className="font-medium">{m.name}</span>
          {m.fullName && <span className="text-xs text-gray-500">{m.fullName}</span>}
          {m.jiraAccountId && <span className="text-xs text-gray-400">({m.jiraAccountId})</span>}
          <div className="ml-auto flex gap-2">
            <button className="text-xs text-brand hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              className="text-xs text-red-600 hover:underline"
              onClick={() => del({ variables: { id: m.id } }).then(() => refetch())}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <LeavesEditor member={m} members={members} refetch={refetch} />
    </li>
  );
}

function LeavesEditor({ member, members, refetch }: any) {
  const [type, setType] = useState("CUTI");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sub, setSub] = useState("");
  const [note, setNote] = useState("");
  const [add] = useMutation(ADD_LEAVE);
  const [del] = useMutation(DELETE_LEAVE);

  const addLeave = async () => {
    if (!start || !end) return;
    await add({
      variables: {
        input: { memberId: member.id, type, startDate: start, endDate: end, substituteId: sub || null, note: note || null },
      },
    });
    setStart("");
    setEnd("");
    setSub("");
    setNote("");
    refetch();
  };

  return (
    <div className="mt-2 pl-1">
      <div className="mb-1 text-xs font-semibold text-gray-500">Leave status (annual / sick / permission)</div>
      {(member.leaves ?? []).map((l: any) => (
        <div key={l.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="chip bg-gray-100 dark:bg-gray-800">{LEAVE_LABELS[l.type] ?? l.type}</span>
          <span>
            {l.startDate} → {l.endDate}
          </span>
          {l.substitute && <span>· cover: {l.substitute.name}</span>}
          {l.note && <span className="italic">· {l.note}</span>}
          <button
            className="text-red-600 hover:underline"
            onClick={() => del({ variables: { id: l.id } }).then(() => refetch())}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <select className="input max-w-[90px] py-1 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEAVE_LABELS[t]}
            </option>
          ))}
        </select>
        <input type="date" className="input max-w-[140px] py-1 text-xs" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" className="input max-w-[140px] py-1 text-xs" value={end} onChange={(e) => setEnd(e.target.value)} />
        <select className="input max-w-[150px] py-1 text-xs" value={sub} onChange={(e) => setSub(e.target.value)}>
          <option value="">Substitute…</option>
          {members
            .filter((x: any) => x.id !== member.id)
            .map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <input className="input max-w-[160px] py-1 text-xs" placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-ghost text-xs" onClick={addLeave}>
          + leave
        </button>
      </div>
    </div>
  );
}

// --------------------------- Sprints ---------------------------
function SprintsSection({ squadId, sprints, refetch }: any) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [create] = useMutation(CREATE_SPRINT);
  const [update] = useMutation(UPDATE_SPRINT);
  const [del] = useMutation(DELETE_SPRINT);

  const addSprint = async () => {
    if (!number || !start || !end) return;
    await create({
      variables: {
        squadId,
        input: { number: parseInt(number, 10), name: name || null, startDate: start, endDate: end },
      },
    });
    setNumber("");
    setName("");
    setStart("");
    setEnd("");
    refetch();
  };

  return (
    <section className="card">
      <h2 className="mb-3 text-base font-bold">Sprints</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Number</label>
          <input className="input max-w-[90px]" type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="label">Name (optional)</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Start</label>
          <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">End</label>
          <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={addSprint}>
          Add Sprint
        </button>
      </div>

      <ul className="space-y-1.5">
        {sprints.map((s: any) => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
            <span className="font-semibold">Sprint {s.number}</span>
            {s.name && <span className="text-gray-500">{s.name}</span>}
            <span className="text-xs text-gray-400">
              {s.startDate} → {s.endDate}
            </span>
            <button
              className="ml-auto text-xs text-red-600 hover:underline"
              onClick={() => del({ variables: { id: s.id } }).then(() => refetch())}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --------------------------- Holidays ---------------------------
function HolidaysSection({ squadId, holidays, refetch }: any) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [add] = useMutation(ADD_HOLIDAY);
  const [del] = useMutation(DELETE_HOLIDAY);

  const addHoliday = async () => {
    if (!date || !name.trim()) return;
    await add({ variables: { squadId, input: { date, name: name.trim() } } });
    setDate("");
    setName("");
    refetch();
  };

  return (
    <section className="card">
      <h2 className="mb-3 text-base font-bold">Public Holidays</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={addHoliday}>
          Add
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {holidays.map((h: any) => (
          <li key={h.id} className="chip bg-gray-100 dark:bg-gray-800">
            {h.date} · {h.name}
            <button
              className="ml-1 text-red-600"
              onClick={() => del({ variables: { id: h.id } }).then(() => refetch())}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
