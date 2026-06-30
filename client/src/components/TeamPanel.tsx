import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { SQUAD, ADD_LEAVE, DELETE_LEAVE, ACTIVE_SPRINT_TICKETS, STANDUP_ENTRIES } from "../graphql";
import { POSITION_COLORS, LEAVE_TYPES, LEAVE_LABELS, isOnLeave, todayISO } from "../lib/helpers";
import { SkeletonLines } from "./Skeleton";

export default function TeamPanel({ squadId, sprintId }: { squadId: string; sprintId?: string }) {
  const { data, loading, refetch } = useQuery(SQUAD, { variables: { id: squadId } });
  const today = todayISO();
  const members = data?.squad?.members ?? [];
  const [editing, setEditing] = useState<string | null>(null);

  // Story points per member: role SP (FE/BE/QA) from the board ticket, attributed
  // to the latest standup assignee of that role on each ticket (fallback default).
  const { data: boardData } = useQuery(ACTIVE_SPRINT_TICKETS, {
    variables: { squadId, refresh: false },
    skip: !squadId,
  });
  const { data: entryData } = useQuery(STANDUP_ENTRIES, { variables: { sprintId }, skip: !sprintId });
  const spByMember = useMemo(() => {
    const num = (x: any) => (typeof x === "number" ? x : 0);
    const latestRoles = new Map<string, any>();
    for (const e of [...(entryData?.standupEntries ?? [])].sort((a: any, b: any) => a.date.localeCompare(b.date)))
      latestRoles.set(e.ticketKey, e);
    const m = new Map<string, number>();
    const add = (name: string | undefined, pts: number) => {
      if (name && pts) m.set(name, (m.get(name) ?? 0) + pts);
    };
    for (const t of boardData?.activeSprintTickets ?? []) {
      const r = latestRoles.get(t.key);
      if (!r) continue;
      const def = num(t.storyPoints);
      add(r.feAssignee, t.storyPointsFE != null ? num(t.storyPointsFE) : def);
      add(r.beAssignee, t.storyPointsBE != null ? num(t.storyPointsBE) : def);
      add(r.qaAssignee, t.storyPointsQA != null ? num(t.storyPointsQA) : def);
    }
    return m;
  }, [boardData, entryData]);
  const totalSP = [...spByMember.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="card">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-bold">Team Members</h2>
        {totalSP > 0 && <span className="text-xs text-gray-500">{totalSP} SP total</span>}
      </div>
      {loading && members.length === 0 && <SkeletonLines rows={4} />}
      {!loading && members.length === 0 && (
        <p className="text-sm text-gray-500">No members yet. Add them in Settings.</p>
      )}
      <ul className="space-y-2">
        {members.map((m: any) => {
          const activeLeave = (m.leaves ?? []).find((l: any) => isOnLeave(l.startDate, l.endDate, today));
          return (
            <li
              key={m.id}
              className="rounded-lg border border-gray-100 px-2.5 py-2 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip ${POSITION_COLORS[m.position]}`}>{m.position}</span>
                <span className="font-medium">{m.name}</span>
                {spByMember.get(m.name) ? (
                  <span className="chip bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {spByMember.get(m.name)} SP
                  </span>
                ) : null}
                {activeLeave ? (
                  <span className="ml-auto text-right text-xs">
                    <span className="chip bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                      {LEAVE_LABELS[activeLeave.type] ?? "Leave"}
                    </span>
                    <div className="mt-0.5 text-gray-500">
                      {activeLeave.startDate} → {activeLeave.endDate}
                      {activeLeave.substitute && (
                        <span> · cover: <b>{activeLeave.substitute.name}</b></span>
                      )}
                    </div>
                  </span>
                ) : (
                  <span className="ml-auto chip bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                    Available
                  </span>
                )}
                <button
                  className="text-xs text-brand hover:underline"
                  onClick={() => setEditing(editing === m.id ? null : m.id)}
                >
                  {editing === m.id ? "Close" : "Status"}
                </button>
              </div>
              {editing === m.id && (
                <LeaveEditor member={m} members={members} onChanged={refetch} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LeaveEditor({ member, members, onChanged }: { member: any; members: any[]; onChanged: () => void }) {
  const [type, setType] = useState("CUTI");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sub, setSub] = useState("");
  const [add] = useMutation(ADD_LEAVE);
  const [del] = useMutation(DELETE_LEAVE);

  const addLeave = async () => {
    if (!start || !end) return;
    await add({
      variables: {
        input: { memberId: member.id, type, startDate: start, endDate: end, substituteId: sub || null },
      },
    });
    setStart("");
    setEnd("");
    setSub("");
    onChanged();
  };

  return (
    <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
      {(member.leaves ?? []).map((l: any) => (
        <div key={l.id} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span className="chip bg-gray-100 dark:bg-gray-800">{LEAVE_LABELS[l.type] ?? l.type}</span>
          <span>
            {l.startDate} → {l.endDate}
          </span>
          {l.substitute && <span>· {l.substitute.name}</span>}
          <button
            className="text-red-600 hover:underline"
            onClick={() => del({ variables: { id: l.id } }).then(onChanged)}
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
        <input type="date" className="input max-w-[130px] py-1 text-xs" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" className="input max-w-[130px] py-1 text-xs" value={end} onChange={(e) => setEnd(e.target.value)} />
        <select className="input max-w-[120px] py-1 text-xs" value={sub} onChange={(e) => setSub(e.target.value)}>
          <option value="">Substitute…</option>
          {members
            .filter((x: any) => x.id !== member.id)
            .map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <button className="btn-ghost text-xs" onClick={addLeave}>
          + set
        </button>
      </div>
    </div>
  );
}
