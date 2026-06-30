import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { SQUAD, ADD_LEAVE, DELETE_LEAVE } from "../graphql";
import { POSITION_COLORS, LEAVE_TYPES, LEAVE_LABELS, isOnLeave, todayISO } from "../lib/helpers";
import { SkeletonLines } from "./Skeleton";

export default function TeamPanel({ squadId }: { squadId: string }) {
  const { data, loading, refetch } = useQuery(SQUAD, { variables: { id: squadId } });
  const today = todayISO();
  const members = data?.squad?.members ?? [];
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold">Team Members</h2>
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
