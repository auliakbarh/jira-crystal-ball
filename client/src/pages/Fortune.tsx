import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation, Trans } from "react-i18next";
import { useSquad } from "../context/SquadContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  SQUADS,
  JIRA_ENV,
  FORTUNE_MODELS,
  FORTUNE_SEARCH_TICKETS,
  FORTUNE_DRAFTS,
  FORTUNE_HISTORY,
  JIRA_USERS,
  FORTUNE_GENERATE,
  FORTUNE_REFINE,
  FORTUNE_IMPORT,
  FORTUNE_CREATE,
  FORTUNE_UPDATE,
  FORTUNE_UNDO,
  SAVE_FORTUNE_DRAFT,
  DELETE_FORTUNE_DRAFT,
} from "../graphql";
import { motion } from "framer-motion";
import FileDrop from "../components/FileDrop";
import Modal from "../components/Modal";
import TipsCarousel, { TipCard } from "../components/TipsCarousel";
import FloatingDecor from "../components/FloatingDecor";

type Mode = "single" | "epic" | "import";
type Step = "input" | "generating" | "review" | "done";
type View = "new" | "drafts" | "history";

interface Turn { role: "user" | "model"; text: string; }
interface Usage { promptTokens: number; outputTokens: number; totalTokens: number; model: string; estCostUSD: number; estCostIDR: number; }
interface Draft { summary: string; description: string; issuetype: string; }
interface Child { summary: string; description: string; issuetype: string; }
interface Plan { epic: { summary: string; description: string }; tasks: Child[]; }

const FALLBACK_MODEL = "gemini-2.5-flash";

const fmtUSD = (n: number) => `$${n.toFixed(4)}`;
const fmtIDR = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

// Read a File as base64 (no data: prefix) for the Gemini multimodal payload.
function fileToBase64(file: File): Promise<{ name: string; mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve({ name: file.name, mimeType: file.type || "application/octet-stream", data: s.slice(s.indexOf(",") + 1) });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const safeParse = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

export default function Fortune() {
  const { t } = useTranslation();
  const toast = useToast();
  const { squadId } = useSquad();
  const { user } = useAuth();

  const { data: squadsData } = useQuery(SQUADS);
  const squad = (squadsData?.squads ?? []).find((s: any) => s.id === squadId);
  const { data: jiraEnvData } = useQuery(JIRA_ENV);
  const baseUrl = (jiraEnvData?.jiraEnv?.baseUrl ?? "").replace(/\/$/, "");
  const browseUrl = (key: string) => (baseUrl ? `${baseUrl}/browse/${key}` : "#");

  const { data: jiraUsersData } = useQuery(JIRA_USERS, { variables: { squadId }, skip: !squadId, fetchPolicy: "cache-first" });
  const jiraUsers = (jiraUsersData?.jiraUsers ?? []).filter((u: any) => u.email);

  const { data: modelsData } = useQuery(FORTUNE_MODELS);
  const models: string[] = modelsData?.fortuneModels?.length ? modelsData.fortuneModels : [FALLBACK_MODEL];
  const defaultModel = models[0] ?? FALLBACK_MODEL;

  const { data: draftsData, refetch: refetchDrafts } = useQuery(FORTUNE_DRAFTS, { variables: { squadId }, skip: !squadId, fetchPolicy: "cache-and-network" });
  const drafts = draftsData?.fortuneDrafts ?? [];
  const { data: historyData, refetch: refetchHistory } = useQuery(FORTUNE_HISTORY, { variables: { squadId, limit: 100 }, skip: !squadId, fetchPolicy: "cache-and-network" });
  const history = historyData?.fortuneHistory ?? [];

  const [genM] = useMutation(FORTUNE_GENERATE);
  const [refineM] = useMutation(FORTUNE_REFINE);
  const [importM] = useMutation(FORTUNE_IMPORT);
  const [createM] = useMutation(FORTUNE_CREATE);
  const [updateM] = useMutation(FORTUNE_UPDATE);
  const [undoM] = useMutation(FORTUNE_UNDO);
  const [saveDraftM] = useMutation(SAVE_FORTUNE_DRAFT);
  const [deleteDraftM] = useMutation(DELETE_FORTUNE_DRAFT);

  const [view, setView] = useState<View>("new");
  const [step, setStep] = useState<Step>("input");
  const [mode, setMode] = useState<Mode>("single");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [lang, setLang] = useState<"en" | "id">("en");
  const [issuetype, setIssuetype] = useState("Story");
  const [model, setModel] = useState(FALLBACK_MODEL);
  useEffect(() => { setModel((m) => (models.includes(m) ? m : defaultModel)); }, [defaultModel]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);

  const [refinePrompt, setRefinePrompt] = useState("");
  const [refining, setRefining] = useState(false);

  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState(false);
  const [startOverModal, setStartOverModal] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Import mode
  const [ticketQuery, setTicketQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [ticketKey, setTicketKey] = useState("");
  const [importPrev, setImportPrev] = useState<string | null>(null);
  const [undoData, setUndoData] = useState<{ key: string; prev: string } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [reporterEmail, setReporterEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ epic?: any; created?: any; children?: any[]; updated?: any } | null>(null);

  // Gemini error → popup; AbortController → cancel an in-flight generate/refine/import.
  const [errModal, setErrModal] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isAbort = (e: any) => e?.name === "AbortError" || /abort/i.test(e?.message ?? "");
  const abortCtx = () => {
    const c = new AbortController();
    abortRef.current = c;
    return { context: { fetchOptions: { signal: c.signal } } };
  };
  function cancelGemini() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  // Debounce the ticket search box.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(ticketQuery.trim()), 300);
    return () => clearTimeout(id);
  }, [ticketQuery]);
  const { data: searchData, loading: searching, error: searchError } = useQuery(FORTUNE_SEARCH_TICKETS, {
    variables: { squadId, query: searchTerm },
    skip: !squadId || view !== "new" || mode !== "import" || step !== "input",
    fetchPolicy: "cache-and-network",
  });
  const suggestions = searchData?.fortuneSearchTickets ?? [];

  const boardId = (squad?.defaultBoardId ?? "").trim();
  const jiraOk = Boolean(squad?.jiraConfigured);
  const hasInput = text.trim().length > 0 || files.length > 0;

  // ── Apply a FortuneResult (from generate/refine/import) to local state ──
  function applyResult(res: any) {
    const p = safeParse<any>(res.payload, {});
    if (p.plan) { setPlan(p.plan); setDraft(null); }
    else { setDraft(p.single); setPlan(null); }
    setTurns(safeParse<Turn[]>(res.turns, []));
    setUsage(res.usage ?? null);
    setMode(res.mode);
  }
  const currentPayload = () => (mode === "epic" ? JSON.stringify({ plan }) : JSON.stringify({ single: draft }));

  async function generate() {
    if (!hasInput) { toast.error(t("fortune.needInput")); return; }
    setStep("generating");
    try {
      const filePayload = await Promise.all(files.map(fileToBase64));
      const res = await genM({ variables: { squadId, mode, lang, issuetype, model, text: text.trim() || null, files: filePayload }, ...abortCtx() });
      applyResult(res.data.fortuneGenerate);
      setCurrentDraftId(null);
      setStep("review");
      refetchHistory();
    } catch (e) {
      setStep("input");
      if (!isAbort(e)) setErrModal((e as Error).message);
    }
  }

  async function refine() {
    if (!refinePrompt.trim()) return;
    setRefining(true);
    try {
      const res = await refineM({ variables: { squadId, mode, model, instruction: refinePrompt.trim(), payload: currentPayload(), turns: JSON.stringify(turns) }, ...abortCtx() });
      applyResult(res.data.fortuneRefine);
      setRefinePrompt("");
    } catch (e) {
      if (!isAbort(e)) setErrModal((e as Error).message);
    } finally {
      setRefining(false);
    }
  }

  async function importTicket(tk: { key: string; summary: string }) {
    setTicketQuery(`${tk.key} — ${tk.summary}`);
    setStep("generating");
    try {
      const res = await importM({ variables: { squadId, ticketKey: tk.key }, ...abortCtx() });
      const r = res.data.fortuneImport;
      applyResult(r);
      setTicketKey(r.ticketKey);
      setUndoData(null);
      setImportPrev(r.prev); // stash original values for undo after update
      setCurrentDraftId(null);
      setStep("review");
    } catch (e) {
      setStep("input");
      if (!isAbort(e)) setErrModal((e as Error).message);
    }
  }

  async function doCreate() {
    if (!reporterEmail.trim()) { toast.error(t("fortune.reporterRequired")); return; }
    setCreating(true);
    try {
      const res = await createM({ variables: { squadId, mode, payload: currentPayload(), reporterEmail: reporterEmail.trim() } });
      const d = res.data.fortuneCreate;
      setResult({
        created: d.created ? JSON.parse(d.created) : undefined,
        epic: d.epic ? JSON.parse(d.epic) : undefined,
        children: d.children ? JSON.parse(d.children) : undefined,
      });
      setConfirming(false);
      setStep("done");
      if (d.reporterWarning) toast.info(d.reporterWarning);
      toast.success(t("fortune.doneTitle"));
      refetchHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function doUpdate() {
    setCreating(true);
    try {
      await updateM({ variables: { squadId, ticketKey, payload: JSON.stringify({ single: draft }) } });
      setResult({ updated: { key: ticketKey, url: browseUrl(ticketKey) } });
      setUndoData(importPrev ? { key: ticketKey, prev: importPrev } : null);
      setConfirming(false);
      setStep("done");
      toast.success(t("fortune.updatedTitle"));
      refetchHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function doUndo() {
    if (!undoData) return;
    setUndoing(true);
    try {
      await undoM({ variables: { squadId, ticketKey: undoData.key, prev: undoData.prev } });
      setUndoData(null);
      toast.success(t("fortune.undoneTitle"));
      refetchHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUndoing(false);
    }
  }

  function reset() {
    setStep("input"); setText(""); setFiles([]); setDraft(null); setPlan(null);
    setResult(null); setReporterEmail(""); setConfirming(false);
    setTurns([]); setUsage(null); setCurrentDraftId(null); setSaveModal(false); setStartOverModal(false);
    setTicketQuery(""); setSearchTerm(""); setTicketKey(""); setImportPrev(null); setUndoData(null); setRefinePrompt("");
  }

  // ── Drafts ──
  function requestSaveDraft() {
    const summary = mode === "epic" ? plan?.epic.summary : draft?.summary;
    if (!summary) return;
    if (currentDraftId) { setSaveModal(true); return; }
    doSaveDraft(true);
  }
  async function doSaveDraft(asNew: boolean) {
    const summary = mode === "epic" ? plan?.epic.summary : draft?.summary;
    if (!summary) return;
    setSavingDraft(true);
    try {
      await saveDraftM({
        variables: {
          squadId,
          id: asNew ? null : currentDraftId,
          mode,
          summary,
          payload: currentPayload(),
          requirementText: turns[0]?.text ?? null,
          turns: JSON.stringify(turns),
          usage: usage ? JSON.stringify(usage) : null,
        },
      });
      setSaveModal(false);
      reset();
      setView("drafts");
      await refetchDrafts();
      toast.success(t("fortune.draftSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingDraft(false);
    }
  }
  function loadDraft(d: any) {
    reset();
    setMode(d.mode);
    const p = safeParse<any>(d.payload, {});
    if (p.plan) setPlan(p.plan); else setDraft(p.single);
    setTurns(safeParse<Turn[]>(d.turns, []));
    setUsage(safeParse<Usage | null>(d.usage, null));
    setCurrentDraftId(d.id);
    setStep("review");
    setView("new");
  }
  async function deleteDraft(d: any) {
    if (!d.canDelete) return;
    if (!confirm(t("fortune.deleteConfirm"))) return;
    try {
      await deleteDraftM({ variables: { id: d.id } });
      await refetchDrafts();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function recreate(h: any) {
    reset();
    setMode(h.mode);
    const p = safeParse<any>(h.payload, {});
    if (p.plan) setPlan(p.plan); else if (p.single) setDraft(p.single);
    setTurns(safeParse<Turn[]>(h.turns, []));
    setUsage(safeParse<Usage | null>(h.usage, null));
    setStep("review");
    setView("new");
  }

  const tipCards: TipCard[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ title: t(`fortune.tip${n}t`), body: t(`fortune.tip${n}b`) }));

  const sumUsage = (a: Usage | null, b: Usage): Usage =>
    a ? { ...a, promptTokens: a.promptTokens + b.promptTokens, outputTokens: a.outputTokens + b.outputTokens, totalTokens: a.totalTokens + b.totalTokens, estCostUSD: a.estCostUSD + b.estCostUSD, estCostIDR: a.estCostIDR + b.estCostIDR } : b;
  const histTotal = (history as any[]).reduce((acc: Usage | null, h: any) => {
    const u = safeParse<Usage | null>(h.usage, null);
    return u ? sumUsage(acc, u) : acc;
  }, null as Usage | null);

  const setChild = (i: number, patch: Partial<Child>) =>
    setPlan((p) => (p ? { ...p, tasks: p.tasks.map((tk, idx) => (idx === i ? { ...tk, ...patch } : tk)) } : p));

  const modelSelect = (
    <div>
      <label className="block text-sm font-medium">{t("fortune.modelLabel")}</label>
      <select className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)}>
        {models.map((m) => <option key={m} value={m}>{m === defaultModel ? `${m} — ${t("fortune.modelRecommended")}` : m}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{t("fortune.heading")}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("fortune.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          ["new", "fortune.tabNew", 0],
          ["drafts", "fortune.tabDrafts", drafts.length],
          ["history", "fortune.tabHistory", history.length],
        ] as [View, string, number][]).map(([v, key, count]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"}`}
          >
            {t(key)}
            {v !== "new" && count > 0 && <span className="ml-1 opacity-70">({count})</span>}
          </button>
        ))}
      </div>

      {/* Drafts */}
      {view === "drafts" && (
        drafts.length === 0 ? (
          <div className="card text-sm text-gray-500 dark:text-gray-400">{t("fortune.noDrafts")}</div>
        ) : (
          drafts.map((d: any) => (
            <div key={d.id} className="card flex flex-wrap items-center gap-3">
              <span className={`chip ${d.mode === "epic" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"}`}>
                {t(d.mode === "epic" ? "fortune.modeEpic" : d.mode === "import" ? "fortune.modeImport" : "fortune.modeSingle")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.summary}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t("fortune.draftBy", { name: d.createdByName })} · {new Date(d.updatedAt).toLocaleDateString()}</div>
              </div>
              <button className="btn-ghost text-sm" onClick={() => loadDraft(d)}>{t("fortune.open")}</button>
              <button className="btn-ghost text-sm text-red-600 disabled:opacity-40 dark:text-red-400" onClick={() => deleteDraft(d)} disabled={!d.canDelete} title={d.canDelete ? "" : t("fortune.cantDelete")}>
                {t("fortune.delete")}
              </button>
            </div>
          ))
        )
      )}

      {/* History */}
      {view === "history" && (
        history.length === 0 ? (
          <div className="card text-sm text-gray-500 dark:text-gray-400">{t("fortune.noHistory")}</div>
        ) : (
          <>
            {histTotal && (
              <div className="card flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="font-semibold text-gray-600 dark:text-gray-300">{t("fortune.histTotal")}</span>
                <span>{t("fortune.usageTotalTok")}: <b>{histTotal.totalTokens.toLocaleString()}</b></span>
                <span>{t("fortune.usageCost")}: <b>{fmtUSD(histTotal.estCostUSD)}</b> · <b>{fmtIDR(histTotal.estCostIDR)}</b></span>
              </div>
            )}
            {history.map((h: any) => {
              const icon = { generated: "🔮", created: "🚀", updated: "✏️", reverted: "↩️" }[h.action as string] ?? "🔮";
              const chipColor =
                h.action === "created" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : h.action === "updated" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                : h.action === "reverted" ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
              const modeKey = h.mode === "epic" ? "fortune.modeEpic" : h.mode === "import" ? "fortune.modeImport" : "fortune.modeSingle";
              const actKey = `fortune.act${h.action.charAt(0).toUpperCase()}${h.action.slice(1)}`;
              const u = safeParse<Usage | null>(h.usage, null);
              return (
                <div key={h.id} className="card flex flex-wrap items-center gap-3">
                  <span className={`chip ${chipColor}`}>{icon} {t(modeKey)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {h.summary}
                      {h.jiraKey && <span className="ml-2 font-mono text-xs text-gray-500">{h.jiraKey}</span>}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <b>{h.byName}</b> · {t(actKey)} · {new Date(h.createdAt).toLocaleDateString()}
                      {u && u.totalTokens > 0 && <> · {u.totalTokens.toLocaleString()} tok · {fmtUSD(u.estCostUSD)}</>}
                    </div>
                  </div>
                  {h.mode !== "import" && h.payload && (
                    <button className="btn-ghost text-sm" onClick={() => recreate(h)} title={t("fortune.recreateHint")}>{t("fortune.recreate")}</button>
                  )}
                </div>
              );
            })}
          </>
        )
      )}

      {/* Input */}
      {view === "new" && step === "input" && (
        <>
          <div className="relative flex flex-wrap items-stretch gap-4">
            <TipsCarousel cards={tipCards} title={t("fortune.tipsTitle")} />
            <div className="relative hidden min-h-[160px] flex-1 rounded-lg md:block">
              <FloatingDecor items={["🔮", "✨", "🃏", "⭐", "🌙", "🎴"]} className="absolute inset-0 rounded-lg" />
            </div>
          </div>

          <section className="card">
            <h2 className="mb-2 text-base font-bold">{t("fortune.step1")}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["single", "epic", "import"] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`rounded-lg border p-4 text-left transition ${mode === m ? "border-brand bg-brand/5" : "border-gray-200 hover:border-brand/50 dark:border-gray-800"}`}>
                  <div className="font-semibold">{t(m === "single" ? "fortune.singleTitle" : m === "epic" ? "fortune.epicTitle" : "fortune.importTitle")}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t(m === "single" ? "fortune.singleDesc" : m === "epic" ? "fortune.epicDesc" : "fortune.importDesc")}</div>
                </button>
              ))}
            </div>
          </section>

          {mode === "import" ? (
            <section className="card">
              <h2 className="mb-1 text-base font-bold">{t("fortune.importSearchTitle")}</h2>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t("fortune.importSearchHint")}</p>
              <label className="block text-sm font-medium">{t("fortune.importKeyLabel")}</label>
              <input className="input mt-1 w-full" value={ticketQuery} onChange={(e) => setTicketQuery(e.target.value)} placeholder={t("fortune.importKeyPlaceholder")} />
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
                {searchError ? (
                  <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{searchError.message}</div>
                ) : searching && suggestions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">…</div>
                ) : suggestions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{t("fortune.importNoMatch")}</div>
                ) : (
                  suggestions.map((tk: any) => (
                    <button key={tk.key} onClick={() => importTicket(tk)} className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-800">
                      <span className="font-mono text-xs text-brand">{tk.key}</span>
                      <span className="flex-1 truncate">{tk.summary}</span>
                      {tk.issueType && <span className={`chip badge ${tk.issueType.toLowerCase()}`}>{tk.issueType}</span>}
                    </button>
                  ))
                )}
              </div>
              <div className="mt-3">{modelSelect}</div>
            </section>
          ) : (
            <section className="card">
              <h2 className="mb-1 text-base font-bold">{t("fortune.step2")}</h2>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t("fortune.sourceHint")}</p>
              <FileDrop files={files} onChange={setFiles} title={t("fortune.dropTitle")} sub={t("fortune.dropSub")} skippedLabel={(list) => t("fortune.skipped", { list })} />
              <label className="mt-4 block text-sm font-medium">{t("fortune.textLabel")} <span className="text-gray-400">{t("fortune.textOptional")}</span></label>
              <textarea className="input mt-1 h-36 w-full font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={t(mode === "single" ? "fortune.textPlaceholderSingle" : "fortune.textPlaceholderEpic")} />
              <div className="mt-3 flex flex-wrap gap-3">
                <div>
                  <label className="block text-sm font-medium">{t("fortune.lang")}</label>
                  <select className="input mt-1" value={lang} onChange={(e) => setLang(e.target.value as "en" | "id")}>
                    <option value="en">English</option>
                    <option value="id">Bahasa Indonesia</option>
                  </select>
                </div>
                {modelSelect}
                {mode === "single" && (
                  <div>
                    <label className="block text-sm font-medium">{t("fortune.issueType")}</label>
                    <select className="input mt-1" value={issuetype} onChange={(e) => setIssuetype(e.target.value)}>
                      {["Story", "Task", "Bug", "Spike"].map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <button className="btn-primary" onClick={generate} disabled={!hasInput}>{t("fortune.generate")}</button>
              </div>
            </section>
          )}
        </>
      )}

      {view === "new" && step === "generating" && (
        <section className="card flex flex-col items-center py-10 text-center">
          <div className="relative h-32 w-32">
            {/* pulsing glow */}
            <motion.div
              className="absolute inset-3 rounded-full bg-brand/30 blur-2xl"
              animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* floating crystal ball */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center text-6xl"
              animate={{ y: [0, -10, 0], rotate: [-5, 5, -5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              🔮
            </motion.div>
            {/* twinkling sparkles around the ball */}
            {[
              { e: "✨", x: "6%", y: "12%", d: 0 },
              { e: "⭐", x: "78%", y: "8%", d: 0.5 },
              { e: "🌙", x: "84%", y: "64%", d: 1 },
              { e: "🃏", x: "2%", y: "62%", d: 1.5 },
            ].map((s, i) => (
              <motion.span
                key={i}
                className="absolute text-xl"
                style={{ left: s.x, top: s.y }}
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3], rotate: [0, 15, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: s.d }}
              >
                {s.e}
              </motion.span>
            ))}
          </div>

          <motion.h2
            className="mt-4 text-base font-bold"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            {t("fortune.generating")}
          </motion.h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("fortune.generatingHint")}</p>

          {/* shimmer progress bar */}
          <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <motion.div
              className="h-full w-1/3 rounded-full bg-brand"
              animate={{ x: ["-140%", "340%"] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          <button className="btn-ghost mt-5" onClick={() => { cancelGemini(); setStep("input"); }}>{t("fortune.cancelGemini")}</button>
        </section>
      )}

      {/* Review */}
      {view === "new" && step === "review" && (
        <>
          <div className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{t("fortune.reviewReady")}</div>

          {currentDraftId && (
            <div className="rounded-md bg-blue-100 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{t("fortune.editingDraft", { id: currentDraftId })}</div>
          )}

          {usage && (
            <section className="card">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{t("fortune.usageTitle")}</h2>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>{t("fortune.usagePrompt")}: <b>{usage.promptTokens.toLocaleString()}</b></span>
                <span>{t("fortune.usageOutput")}: <b>{usage.outputTokens.toLocaleString()}</b></span>
                <span>{t("fortune.usageTotalTok")}: <b>{usage.totalTokens.toLocaleString()}</b></span>
                <span>{t("fortune.usageCost")}: <b>{fmtUSD(usage.estCostUSD)}</b> · <b>{fmtIDR(usage.estCostIDR)}</b></span>
                <span className="text-gray-400">{usage.model}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">{t("fortune.usageEst")}</p>
            </section>
          )}

          {turns.length > 0 && (
            <section className="card">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{t("fortune.ctxTitle")}</h2>
              <p className="mb-2 text-xs text-gray-400">{t("fortune.ctxHint")}</p>
              <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {turns.map((tn, i) => (
                  <div key={i} className="text-sm">
                    <span className={`chip mr-2 ${tn.role === "user" ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200" : "bg-brand/15 text-brand"}`}>{t(tn.role === "user" ? "fortune.roleUser" : "fortune.roleModel")}</span>
                    <span className="text-gray-700 dark:text-gray-300">{tn.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(mode === "single" || mode === "import") && draft && (
            <section className="card space-y-3">
              {mode === "import" && (
                <div className="flex items-center gap-2">
                  <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{t("fortune.modeImport")}</span>
                  <span className="font-mono text-sm text-gray-500">{ticketKey}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium">{t("fortune.summary")}</label>
                <input className="input mt-1 w-full" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
              </div>
              {mode === "single" && (
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="block text-sm font-medium">{t("fortune.issueType")}</label>
                    <select className="input mt-1" value={draft.issuetype} onChange={(e) => setDraft({ ...draft, issuetype: e.target.value })}>
                      {["Story", "Task", "Bug", "Spike", "Epic"].map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium">{t("fortune.description")}</label>
                <textarea className="input mt-1 h-80 w-full font-mono text-xs" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
            </section>
          )}

          {mode === "epic" && plan && (
            <>
              <section className="card space-y-3">
                <div className="flex items-center gap-2"><span className="chip bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">Epic</span></div>
                <div>
                  <label className="block text-sm font-medium">{t("fortune.summary")}</label>
                  <input className="input mt-1 w-full" value={plan.epic.summary} onChange={(e) => setPlan({ ...plan, epic: { ...plan.epic, summary: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">{t("fortune.description")}</label>
                  <textarea className="input mt-1 h-48 w-full font-mono text-xs" value={plan.epic.description} onChange={(e) => setPlan({ ...plan, epic: { ...plan.epic, description: e.target.value } })} />
                </div>
              </section>
              {plan.tasks.map((c, i) => (
                <section key={i} className="card ml-4 space-y-3 border-l-4 border-brand">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{t("fortune.child")} #{i + 1}</span>
                    <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setPlan({ ...plan, tasks: plan.tasks.filter((_, idx) => idx !== i) })}>{t("fortune.removeChild")}</button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <input className="input flex-1" value={c.summary} onChange={(e) => setChild(i, { summary: e.target.value })} placeholder={t("fortune.summary")} />
                    <select className="input" value={c.issuetype} onChange={(e) => setChild(i, { issuetype: e.target.value })}>{["Story", "Task"].map((x) => <option key={x}>{x}</option>)}</select>
                  </div>
                  <textarea className="input h-40 w-full font-mono text-xs" value={c.description} onChange={(e) => setChild(i, { description: e.target.value })} />
                </section>
              ))}
              <button className="btn-ghost text-sm" onClick={() => setPlan({ ...plan, tasks: [...plan.tasks, { summary: "", description: "", issuetype: "Task" }] })}>{t("fortune.addChild")}</button>
            </>
          )}

          <section className="card">
            <h2 className="text-base font-bold">{t("fortune.refineTitle")}</h2>
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">{t("fortune.refineHint")}</p>
            <textarea className="input h-20 w-full text-sm" value={refinePrompt} onChange={(e) => setRefinePrompt(e.target.value)} placeholder={t("fortune.refinePlaceholder")} />
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost" onClick={refine} disabled={refining || !refinePrompt.trim()}>{refining ? t("fortune.refining") : t("fortune.refineBtn")}</button>
              {refining && <button className="btn-ghost" onClick={cancelGemini}>{t("fortune.cancelGemini")}</button>}
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setConfirming(true)}>{mode === "import" ? t("fortune.updateBtn") : t("fortune.createBtn")}</button>
            <button className="btn-ghost" onClick={requestSaveDraft} disabled={savingDraft}>{t("fortune.saveDraft")}</button>
            <button className="btn-ghost" onClick={() => setStartOverModal(true)}>{t("fortune.restart")}</button>
          </div>
        </>
      )}

      {/* Done */}
      {view === "new" && step === "done" && result && (
        <>
          <div className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{result.updated ? t("fortune.updatedTitle") : t("fortune.doneTitle")}</div>
          {result.updated && (
            <div className="card flex flex-wrap items-center gap-3">
              <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{t("fortune.modeImport")}</span>
              <span className="font-semibold">{result.updated.key}</span>
              <a className="text-brand" href={result.updated.url} target="_blank" rel="noreferrer">{t("fortune.openInJira")}</a>
              <span className="flex-1" />
              {undoData ? (
                <button className="btn-ghost text-sm" onClick={doUndo} disabled={undoing} title={t("fortune.undoHint")}>{undoing ? t("fortune.undoing") : t("fortune.undoBtn")}</button>
              ) : (
                <span className="text-xs text-gray-400">{t("fortune.undoneNote")}</span>
              )}
            </div>
          )}
          {result.created && (
            <div className="card flex items-center gap-3"><span className="font-semibold">{result.created.key}</span><a className="text-brand" href={result.created.url} target="_blank" rel="noreferrer">{t("fortune.openInJira")}</a></div>
          )}
          {result.epic && (
            <div className="card flex items-center gap-3"><span className="chip bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">Epic</span><span className="font-semibold">{result.epic.key}</span><a className="text-brand" href={result.epic.url} target="_blank" rel="noreferrer">{t("fortune.openInJira")}</a></div>
          )}
          {result.children?.map((c, i) => (
            <div key={i} className="card ml-4 flex items-center gap-3 border-l-4 border-brand">
              <span className="font-semibold">{c.status === "created" ? c.key : `❌ ${c.input}`}</span>
              {c.status === "created" && <a className="text-brand" href={c.url} target="_blank" rel="noreferrer">{t("fortune.openInJira")}</a>}
              {c.status !== "created" && <span className="text-xs text-gray-500">{c.error}</span>}
            </div>
          ))}

          {(result.created || result.epic) && (
            <section className="card relative overflow-hidden">
              <FloatingDecor items={["✨", "🔮"]} className="absolute right-0 top-0 hidden h-full w-40 sm:block" />
              <h2 className="relative mb-2 text-base font-bold">{t("fortune.nextTitle")}</h2>
              <ol className="relative list-decimal space-y-1.5 pl-5 text-sm text-gray-700 dark:text-gray-300">
                <li>{t("fortune.next1")}</li>
                <li>{t("fortune.next2")}</li>
                <li>{t("fortune.next3")}</li>
                <li>{t("fortune.next4")}</li>
              </ol>
            </section>
          )}

          <button className="btn-primary" onClick={reset}>{t("fortune.createAnother")}</button>
        </>
      )}

      {/* Confirm create/update popup */}
      {confirming && (
        <Modal title={mode === "import" ? t("fortune.confirmUpdateTitle") : t("fortune.confirmTitle")} onClose={() => setConfirming(false)}>
          <div className="space-y-3">
            {!jiraOk ? (
              <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{t("fortune.confirmNotConfigured", { squad: squad?.name ?? "?" })}</div>
            ) : !boardId ? (
              <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{t("fortune.confirmNoBoard", { squad: squad?.name ?? "?" })}</div>
            ) : mode === "import" ? (
              <p className="text-sm text-gray-700 dark:text-gray-300"><Trans i18nKey="fortune.confirmUpdate" values={{ key: ticketKey, board: boardId }} components={{ b: <b /> }} /></p>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300"><Trans i18nKey="fortune.confirmBoard" values={{ board: boardId, squad: squad?.name ?? "?" }} components={{ b: <b /> }} /></p>
            )}

            {mode !== "import" && (
              <div>
                <label className="block text-sm font-medium">{t("fortune.reporterLabel")}</label>
                <input className="input mt-1 w-full" type="email" list="fortune-reporter-users" value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)} placeholder={t("fortune.reporterPlaceholder")} />
                <datalist id="fortune-reporter-users">
                  {jiraUsers.map((u: any) => <option key={u.accountId} value={u.email}>{u.displayName}</option>)}
                </datalist>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("fortune.reporterHint")}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setConfirming(false)}>{t("fortune.cancel")}</button>
              <button className="btn-primary" onClick={mode === "import" ? doUpdate : doCreate} disabled={creating || !jiraOk || !boardId}>
                {mode === "import" ? (creating ? t("fortune.updating") : t("fortune.confirmUpdateBtn")) : (creating ? t("fortune.creating") : t("fortune.confirmCreate"))}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Save-draft popup */}
      {saveModal && (
        <Modal title={t("fortune.saveModalTitle")} onClose={() => setSaveModal(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">{t("fortune.saveModalHint")}</p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setSaveModal(false)}>{t("fortune.cancel")}</button>
              <button className="btn-ghost" onClick={() => doSaveDraft(true)} disabled={savingDraft}>{t("fortune.saveNew")}</button>
              <button className="btn-primary" onClick={() => doSaveDraft(false)} disabled={savingDraft}>{t("fortune.saveUpdate")}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Gemini error popup */}
      {errModal && (
        <Modal title={t("fortune.errorTitle")} onClose={() => setErrModal(null)}>
          <div className="space-y-3">
            <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300 break-words">{errModal}</div>
            <div className="flex justify-end pt-1">
              <button className="btn-primary" onClick={() => setErrModal(null)}>{t("fortune.errorClose")}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Start-over popup */}
      {startOverModal && (
        <Modal title={t("fortune.startOverTitle")} onClose={() => setStartOverModal(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">{t("fortune.startOverBody")}</p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setStartOverModal(false)}>{t("fortune.cancel")}</button>
              <button className="btn-primary" onClick={reset}>{t("fortune.startOverConfirm")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
