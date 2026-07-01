import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { BLOCKERS, UPSERT_BLOCKER, DELETE_BLOCKER } from "../graphql";
import { todayISO } from "../lib/helpers";

export default function BlockersPanel({ squadId, sprintId }: { squadId: string; sprintId?: string }) {
  const { t } = useTranslation();
  const [includeResolved, setIncludeResolved] = useState(false);
  const { data, refetch } = useQuery(BLOCKERS, { variables: { squadId, includeResolved } });
  const [upsert] = useMutation(UPSERT_BLOCKER);
  const [del] = useMutation(DELETE_BLOCKER);

  const [desc, setDesc] = useState("");
  const [ticket, setTicket] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const blockers = data?.blockers ?? [];

  const add = async () => {
    if (!desc.trim()) return;
    await upsert({
      variables: {
        squadId,
        input: { sprintId, description: desc.trim(), jiraTicket: ticket || null, foundDate: todayISO() },
      },
    });
    setDesc("");
    setTicket("");
    refetch();
  };

  // Resolve with an optional resolve note; or reopen (clears resolve fields).
  const resolve = async (b: any, note?: string) => {
    const reopening = !!b.resolvedDate;
    await upsert({
      variables: {
        squadId,
        id: b.id,
        input: {
          description: b.description,
          jiraTicket: b.jiraTicket,
          foundDate: b.foundDate,
          resolvedDate: reopening ? null : todayISO(),
          note: b.note,
          resolveNote: reopening ? null : note || null,
        },
      },
    });
    setResolvingId(null);
    setResolveNote("");
    refetch();
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">{t("panels.blockersTitle")}</h2>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(e) => setIncludeResolved(e.target.checked)}
          />
          {t("panels.blockersShowResolved")}
        </label>
      </div>

      <ul className="space-y-2">
        {blockers.length === 0 && <p className="text-sm text-gray-500">{t("panels.blockersEmpty")}</p>}
        {blockers.map((b: any) => (
          <li
            key={b.id}
            className={`rounded-lg border px-2.5 py-2 text-sm ${
              b.resolvedDate
                ? "border-gray-100 opacity-60 dark:border-gray-800"
                : "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20"
            }`}
          >
            <div className="font-medium">{b.description}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
              {b.jiraTicket && <span>🎫 {b.jiraTicket}</span>}
              <span>{t("panels.blockersFound", { date: b.foundDate })}</span>
              {b.resolvedDate && <span>{t("panels.blockersResolvedOn", { date: b.resolvedDate })}</span>}
              {b.note && <span className="italic">{b.note}</span>}
            </div>
            {b.resolvedDate && b.resolveNote && (
              <div className="mt-1 text-xs text-green-700 dark:text-green-300">✓ {b.resolveNote}</div>
            )}

            {resolvingId === b.id ? (
              <div className="mt-2 space-y-1.5">
                <textarea
                  className="input min-h-[44px] text-xs"
                  placeholder={t("panels.blockersResolveNotePlaceholder")}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button className="btn-primary text-xs" onClick={() => resolve(b, resolveNote)}>
                    {t("panels.blockersResolve")}
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => { setResolvingId(null); setResolveNote(""); }}>
                    {t("panels.blockersCancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex gap-2">
                <button
                  className="text-xs text-brand hover:underline"
                  onClick={() => (b.resolvedDate ? resolve(b) : (setResolvingId(b.id), setResolveNote("")))}
                >
                  {b.resolvedDate ? t("panels.blockersReopen") : t("panels.blockersMarkResolved")}
                </button>
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => del({ variables: { id: b.id } }).then(() => refetch())}
                >
                  {t("panels.blockersDelete")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <input
          className="input"
          placeholder={t("panels.blockersNewDescPlaceholder")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="input"
            placeholder={t("panels.blockersTicketPlaceholder")}
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
          />
          <button className="btn-primary" onClick={add}>
            {t("panels.blockersAdd")}
          </button>
        </div>
      </div>
    </div>
  );
}
