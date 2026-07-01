import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApolloClient, useMutation, useQuery } from "@apollo/client";
import { useSquad } from "../context/SquadContext";
import { useAuth } from "../context/AuthContext";
import ConfirmModal from "../components/ConfirmModal";
import {
  ME,
  ADMINS,
  CREATE_ADMIN,
  UPDATE_ADMIN,
  CHANGE_ADMIN_PASSWORD,
  DELETE_ADMIN,
  SQUAD,
  SQUADS,
  CREATE_SQUAD,
  UPDATE_SQUAD,
  JIRA_FIELDS,
  JIRA_USERS,
  DELETE_SQUAD,
  RESET_DATABASE,
  SEED_CONFIG,
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
  GEMINI_SETTINGS,
  SET_GEMINI_TEMPERATURE,
} from "../graphql";
import { POSITION_COLORS, LEAVE_TYPES, LEAVE_LABELS } from "../lib/helpers";
import JiraConfigForm from "../components/JiraConfigForm";

const POSITIONS = ["FE", "BE", "QA", "PM", "FULLSTACK", "ALL"] as const;

export default function Settings() {
  const { t } = useTranslation();
  const { squadId, setSquadId } = useSquad();
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  // Fresh super-admin flag from the server (cached localStorage user may predate it).
  const { data: meData } = useQuery(ME, { skip: !isAdmin });
  const isSuperAdmin = !!meData?.me?.isSuperAdmin;
  const { data, refetch } = useQuery(SQUAD, { variables: { id: squadId }, skip: !squadId });
  const squad = data?.squad;
  const [active, setActive] = useState("squads");

  // Master-detail: pick a category on the left, its detail shows on the right.
  const nav = [
    { key: "squads", label: t("settings.navSquads"), show: true },
    { key: "jira", label: t("settings.navJira"), show: !!squadId },
    { key: "members", label: t("settings.navMembers"), show: !!squadId },
    { key: "sprints", label: t("settings.navSprints"), show: !!squadId },
    { key: "holidays", label: t("settings.navHolidays"), show: !!squadId },
    { key: "admins", label: t("settings.navAdmins"), show: isSuperAdmin },
    { key: "gemini", label: t("settings.navGemini"), show: isAdmin },
    { key: "seed", label: t("settings.navSeed"), show: isAdmin },
    { key: "danger", label: t("settings.navDanger"), show: isAdmin },
  ].filter((n) => n.show);
  const activeKey = nav.some((n) => n.key === active) ? active : nav[0].key;

  const detail = () => {
    switch (activeKey) {
      case "jira":
        return squadId ? (
          <section className="card">
            <h2 className="mb-3 text-base font-bold">{t("settings.jiraBoardTitle")}</h2>
            <JiraConfigForm squadId={squadId} currentBoardId={squad?.defaultBoardId} onSaved={refetch} />
          </section>
        ) : null;
      case "members":
        return squadId ? <MembersSection squadId={squadId} members={squad?.members ?? []} refetch={refetch} /> : null;
      case "sprints":
        return squadId ? <SprintsSection squadId={squadId} sprints={squad?.sprints ?? []} refetch={refetch} /> : null;
      case "holidays":
        return squadId ? <HolidaysSection squadId={squadId} holidays={squad?.holidays ?? []} refetch={refetch} /> : null;
      case "admins":
        return <AdminsSection />;
      case "gemini":
        return <GeminiSection />;
      case "seed":
        return <SeedSection />;
      case "danger":
        return <DangerZone setSquadId={setSquadId} />;
      default:
        return <SquadsSection currentId={squadId} setSquadId={setSquadId} isAdmin={isAdmin} />;
    }
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">{squadId ? t("settings.pageTitle", { name: squad?.name }) : t("nav.settings")}</h1>
      <div className="flex flex-col gap-5 sm:flex-row">
        <aside className="shrink-0 sm:w-56">
          <div className="flex gap-1 overflow-x-auto sm:flex-col">
            {nav.map((n) => (
              <button
                key={n.key}
                onClick={() => setActive(n.key)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium ${
                  activeKey === n.key
                    ? n.key === "danger"
                      ? "bg-red-600 text-white"
                      : "bg-brand text-white"
                    : `hover:bg-gray-200 dark:hover:bg-gray-800 ${n.key === "danger" ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1 space-y-5">{detail()}</div>
      </div>
    </div>
  );
}

// --------------------------- Gemini (Fortune) settings — admin ---------------------------
// Suggested temperature presets shown as quick-pick chips beside the input.
const TEMP_PRESETS = [
  { value: 0, key: "settings.geminiPreset0" },
  { value: 0.2, key: "settings.geminiPreset02" },
  { value: 0.4, key: "settings.geminiPreset04" },
  { value: 0.7, key: "settings.geminiPreset07" },
  { value: 1, key: "settings.geminiPreset10" },
];

function GeminiSection() {
  const { t } = useTranslation();
  const { data, refetch } = useQuery(GEMINI_SETTINGS);
  const [setTemp, { loading }] = useMutation(SET_GEMINI_TEMPERATURE);
  const [value, setValue] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const s = data?.geminiSettings;

  // Seed the input from the server value once loaded.
  const current = s?.temperature;
  if (value === "" && current != null) setValue(String(current));

  const save = async (v?: number) => {
    setMsg(null);
    const num = v ?? Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 2) { setMsg(t("settings.geminiRange")); return; }
    try {
      const res = await setTemp({ variables: { value: num } });
      setValue(String(res.data.setGeminiTemperature));
      await refetch();
      setMsg(t("settings.geminiSaved", { value: res.data.setGeminiTemperature }));
    } catch (e: any) {
      setMsg(t("settings.errorPrefix", { message: e.message }));
    }
  };

  return (
    <section className="card">
      <h2 className="mb-1 text-base font-bold">{t("settings.geminiTitle")}</h2>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t("settings.geminiDesc")}</p>

      {!s?.configured && (
        <div className="mb-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          {t("settings.geminiNotConfigured")}
        </div>
      )}

      <label className="block text-sm font-medium">{t("settings.geminiTemperature")}</label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[120px]"
          type="number"
          min={0}
          max={2}
          step={0.1}
          list="gemini-temp-suggestions"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <datalist id="gemini-temp-suggestions">
          {TEMP_PRESETS.map((p) => <option key={p.value} value={p.value} />)}
        </datalist>
        <button className="btn-primary" onClick={() => save()} disabled={loading}>
          {loading ? t("settings.geminiSaving") : t("settings.geminiSave")}
        </button>
        {s?.defaultTemperature != null && (
          <span className="text-xs text-gray-400">{t("settings.geminiDefault", { value: s.defaultTemperature })} · {s?.model}</span>
        )}
      </div>

      {/* Suggested presets */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEMP_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => { setValue(String(p.value)); save(p.value); }}
            className={`rounded-full border px-2.5 py-1 text-xs ${Number(value) === p.value ? "border-brand bg-brand/10 text-brand" : "border-gray-300 text-gray-600 hover:border-brand/50 dark:border-gray-700 dark:text-gray-300"}`}
            title={t(p.key)}
          >
            {p.value} · {t(p.key)}
          </button>
        ))}
      </div>

      {msg && <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
    </section>
  );
}

// --------------------------- Admins (super-admin only) ---------------------------
function AdminsSection() {
  const { t } = useTranslation();
  const { data, refetch } = useQuery(ADMINS);
  const [create, { loading: creating }] = useMutation(CREATE_ADMIN);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const admins = data?.admins ?? [];

  const add = async () => {
    setMsg(null);
    try {
      await create({ variables: { email, name, password } });
      setEmail("");
      setName("");
      setPassword("");
      await refetch();
    } catch (e: any) {
      setMsg(t("settings.errorPrefix", { message: e.message }));
    }
  };

  return (
    <section className="card">
      <h2 className="mb-1 text-base font-bold">{t("settings.adminAccountsTitle")}</h2>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {t("settings.adminAccountsDesc")}
      </p>
      <div className="space-y-2">
        {admins.map((a: any) => (
          <AdminRow key={a.id} admin={a} refetch={refetch} />
        ))}
      </div>
      <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
        <div className="mb-2 text-sm font-semibold">{t("settings.adminAdd")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-[220px]"
            placeholder={t("settings.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input max-w-[180px]"
            placeholder={t("settings.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input max-w-[200px]"
            type="password"
            placeholder={t("settings.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={add}
            disabled={creating || !email.trim() || !name.trim() || password.length < 6}
          >
            {creating ? t("settings.adding") : t("settings.add")}
          </button>
        </div>
      </div>
      {msg && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{msg}</div>}
    </section>
  );
}

function AdminRow({ admin, refetch }: { admin: any; refetch: () => void }) {
  const { t } = useTranslation();
  const [update, { loading: saving }] = useMutation(UPDATE_ADMIN);
  const [changePw, { loading: pwLoading }] = useMutation(CHANGE_ADMIN_PASSWORD);
  const [del, { loading: deleting }] = useMutation(DELETE_ADMIN);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(admin.name);
  const [email, setEmail] = useState(admin.email);
  const [pw, setPw] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (admin.isSuperAdmin) {
    return (
      <div className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-700">
        <div>
          <span className="font-medium">{admin.name}</span>
          <span className="ml-2 text-sm text-gray-500">{admin.email}</span>
        </div>
        <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
          {t("settings.superAdminEnv")}
        </span>
      </div>
    );
  }

  const save = async () => {
    setMsg(null);
    try {
      await update({ variables: { id: admin.id, name, email } });
      setEditing(false);
      await refetch();
    } catch (e: any) {
      setMsg(t("settings.errorPrefix", { message: e.message }));
    }
  };
  const resetPw = async () => {
    setMsg(null);
    try {
      await changePw({ variables: { id: admin.id, password: pw } });
      setPw("");
      setMsg(t("settings.passwordUpdated"));
    } catch (e: any) {
      setMsg(t("settings.errorPrefix", { message: e.message }));
    }
  };
  const remove = async () => {
    setMsg(null);
    try {
      await del({ variables: { id: admin.id } });
      await refetch();
    } catch (e: any) {
      setMsg(t("settings.errorPrefix", { message: e.message }));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="rounded border border-gray-200 px-3 py-2 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <input
              className="input max-w-[180px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.namePlaceholder")}
            />
            <input
              className="input max-w-[220px]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("settings.emailPlaceholder")}
            />
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? t("settings.saving") : t("settings.save")}
            </button>
            <button
              className="text-sm text-gray-500 hover:underline"
              onClick={() => {
                setEditing(false);
                setName(admin.name);
                setEmail(admin.email);
              }}
            >
              {t("settings.cancel")}
            </button>
          </>
        ) : (
          <>
            <span className="font-medium">{admin.name}</span>
            <span className="text-sm text-gray-500">{admin.email}</span>
            <div className="ml-auto flex items-center gap-3">
              <button
                className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                onClick={() => setEditing(true)}
              >
                {t("settings.edit")}
              </button>
              <button
                className="text-sm text-red-600 hover:underline dark:text-red-400"
                onClick={() => setConfirming(true)}
                disabled={deleting}
              >
                {t("settings.delete")}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[200px]"
          type="password"
          placeholder={t("settings.newPasswordPlaceholder")}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <button className="btn-primary" onClick={resetPw} disabled={pwLoading || pw.length < 6}>
          {pwLoading ? t("settings.saving") : t("settings.resetPassword")}
        </button>
      </div>
      {msg && <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
      {confirming && (
        <ConfirmModal
          title={t("settings.deleteAdminTitle")}
          message={t("settings.deleteAdminMessage", { email: admin.email })}
          confirmLabel={t("settings.delete")}
          danger
          busy={deleting}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

// --------------------------- Bulk seed (admin) ---------------------------
function SeedSection() {
  const { t } = useTranslation();
  const apollo = useApolloClient();
  const [seed, { loading }] = useMutation(SEED_CONFIG);
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const example = `{
  "squads": [
    { "name": "Athens", "boardId": "ATH" }
  ],
  "teams": [
    { "name": "Budi", "fullName": "Budi Santoso", "position": "FE", "squads": ["Athens"] }
  ]
}`;

  const run = async () => {
    setMsg(null);
    try {
      const res = await seed({ variables: { json } });
      const r = res.data?.seedConfig;
      setMsg(t("settings.seedResult", { squads: r.squads, created: r.membersCreated, updated: r.membersUpdated }));
      await apollo.refetchQueries({ include: [SQUADS, SQUAD] });
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  };

  // Read an uploaded .json file into the textarea. The file itself is never
  // uploaded/stored — only its text is read client-side and sent as the json arg.
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setJson(String(reader.result ?? ""));
    reader.onerror = () => setMsg("Error: could not read file");
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  const downloadTemplate = () => {
    const blob = new Blob([example + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dashboard-config-seed.template.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card">
      <h2 className="mb-1 text-base font-bold">{t("settings.seedTitle")}</h2>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t("settings.seedDesc")}</p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="btn-ghost cursor-pointer text-sm">
          {t("settings.seedUpload")}
          <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        </label>
        <button className="btn-ghost text-sm" onClick={downloadTemplate}>
          {t("settings.seedDownloadTemplate")}
        </button>
        <button className="btn-ghost text-sm" onClick={() => setJson(example)} disabled={loading}>
          {t("settings.seedExample")}
        </button>
      </div>
      <textarea
        className="input h-40 w-full font-mono text-xs"
        placeholder={example}
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-2">
        <button className="btn-primary" onClick={run} disabled={loading || !json.trim()}>
          {loading ? t("settings.seedRunning") : t("settings.seedRun")}
        </button>
      </div>
      {msg && <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
    </section>
  );
}

// --------------------------- Danger zone (admin) ---------------------------
function DangerZone({ setSquadId }: { setSquadId: (id: string) => void }) {
  const { t } = useTranslation();
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
      setMsg(t("settings.databaseResetComplete"));
      setConfirmText("");
    } catch (e: any) {
      setMsg(t("settings.errorPrefix", { message: e.message }));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <section className="card border-red-300 dark:border-red-900/60">
      <h2 className="mb-1 text-base font-bold text-red-600 dark:text-red-400">{t("settings.dangerZoneTitle")}</h2>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {t("settings.dangerZoneDesc")}
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reseed} onChange={(e) => setReseed(e.target.checked)} />
        {t("settings.reseedDefaults")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[220px]"
          placeholder={t("settings.resetConfirmPlaceholder")}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
        <button className="btn-danger" onClick={() => setConfirming(true)} disabled={loading || confirmText !== "RESET"}>
          {loading ? t("settings.resetting") : t("settings.resetDatabase")}
        </button>
      </div>
      {msg && <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
      {confirming && (
        <ConfirmModal
          title={t("settings.resetDatabaseTitle")}
          message={t("settings.resetDatabaseMessage")}
          confirmLabel={t("settings.resetDatabase")}
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
  const { t } = useTranslation();
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
      <h2 className="mb-3 text-base font-bold">{t("settings.squadsTitle")}</h2>
      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="label">{t("settings.newSquadName")}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <button className="btn-primary" onClick={add}>
          {t("settings.addSquad")}
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
          title={t("settings.deleteSquadTitle")}
          message={t("settings.deleteSquadMessage", { label: delTarget.label })}
          confirmLabel={t("settings.delete")}
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
  const { t } = useTranslation();
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
      {squad.jiraConfigured ? t("settings.jiraConfigured") : t("settings.noJira")}
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
          placeholder={t("settings.fieldIdOrNamePlaceholder")}
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
            <label className="label">{t("settings.name")}</label>
            <input className="input max-w-[200px]" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("settings.boardIdOptional")}</label>
            <input className="input max-w-[160px]" placeholder={t("settings.boardIdPlaceholder")} value={boardId} onChange={(e) => setBoardId(e.target.value)} />
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {t("settings.spFieldHelp")}
          {fieldsLoading ? t("settings.loadingBoardFields") : t("settings.fieldsAvailable", { count: fields.length })}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {spInput(t("settings.spDefault"), spDefault, setSpDefault)}
          {spInput(t("settings.spFE"), spFE, setSpFE)}
          {spInput(t("settings.spBE"), spBE, setSpBE)}
          {spInput(t("settings.spQA"), spQA, setSpQA)}
        </div>
        <div className="text-xs text-gray-500">
          {t("settings.confluenceHelp")}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">{t("settings.confluenceSpaceKey")}</label>
            <input
              className="input max-w-[200px]"
              placeholder={t("settings.confluenceSpacePlaceholder")}
              value={confSpace}
              onChange={(e) => setConfSpace(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t("settings.confluenceParentId")}</label>
            <input
              className="input max-w-[200px]"
              placeholder={t("settings.confluenceParentPlaceholder")}
              value={confParent}
              onChange={(e) => setConfParent(e.target.value)}
            />
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {t("settings.tarotScaleHelp")}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">{t("settings.defaultScale")}</label>
            <select className="input max-w-[160px]" value={tarotType} onChange={(e) => setTarotType(e.target.value)}>
              <option value="">{t("settings.scaleFibonacciDefault")}</option>
              <option value="FIBONACCI">{t("settings.scaleFibonacci")}</option>
              <option value="SCRUM">{t("settings.scaleScrum")}</option>
              <option value="CUSTOM">{t("settings.scaleCustom")}</option>
            </select>
          </div>
          {tarotType === "CUSTOM" && (
            <div>
              <label className="label">{t("settings.customValues")}</label>
              <input
                className="input max-w-[260px]"
                placeholder={t("settings.customValuesPlaceholder")}
                value={tarotValues}
                onChange={(e) => setTarotValues(e.target.value)}
              />
            </div>
          )}
        </div>
        {/* Quick reference: list of fields with ids (filterable by browser datalist above) */}
        {fields.length > 0 && (
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">{t("settings.boardFieldsSummary")}</summary>
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
            {t("settings.cancel")}
          </button>
          <button className="btn-primary text-xs" onClick={save} disabled={loading}>
            {loading ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
      <span className="font-medium">{squad.name}</span>
      {isCurrent && <span className="chip bg-brand text-white">{t("settings.current")}</span>}
      <span className="chip bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        {t("settings.boardLabel", { board: squad.defaultBoardId || "—" })}
      </span>
      {jiraChip}
      <div className="ml-auto flex gap-2">
        {!isCurrent && (
          <button className="text-xs text-brand hover:underline" onClick={onSwitch}>
            {t("settings.switch")}
          </button>
        )}
        {isAdmin && (
          <button className="text-xs text-brand hover:underline" onClick={() => setEditing(true)}>
            {t("settings.edit")}
          </button>
        )}
        {isAdmin && (
          <button className="text-xs text-red-600 hover:underline" onClick={onDelete}>
            {t("settings.delete")}
          </button>
        )}
      </div>
    </li>
  );
}

// --------------------------- Members + leaves ---------------------------
function MembersSection({ squadId, members, refetch }: any) {
  const { t } = useTranslation();
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
      <h2 className="mb-3 text-base font-bold">{t("settings.teamMembersTitle")}</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="label">{t("settings.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="label">{t("settings.fullNameOptional")}</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("settings.position")}</label>
          <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="label">{t("settings.jiraAccountIdOptional")}</label>
          <input
            className="input"
            list={usersListId}
            placeholder={usersLoading ? t("settings.loadingJiraUsers") : t("settings.jiraUserPlaceholder")}
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
          {t("settings.add")}
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
  const { t } = useTranslation();
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
            <label className="label">{t("settings.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">{t("settings.fullNameOptional")}</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("settings.position")}</label>
            <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">{t("settings.jiraAccountIdOptional")}</label>
            <input
              className="input"
              list={usersListId}
              placeholder={usersLoading ? t("settings.loadingJiraUsers") : t("settings.jiraUserPlaceholder")}
              value={jiraId}
              onChange={(e) => setJiraId(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={cancel}>
              {t("settings.cancel")}
            </button>
            <button className="btn-primary text-xs" onClick={save} disabled={loading}>
              {loading ? t("settings.saving") : t("settings.save")}
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
              {t("settings.edit")}
            </button>
            <button
              className="text-xs text-red-600 hover:underline"
              onClick={() => del({ variables: { id: m.id } }).then(() => refetch())}
            >
              {t("settings.delete")}
            </button>
          </div>
        </div>
      )}
      <LeavesEditor member={m} members={members} refetch={refetch} />
    </li>
  );
}

function LeavesEditor({ member, members, refetch }: any) {
  const { t } = useTranslation();
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
      <div className="mb-1 text-xs font-semibold text-gray-500">{t("settings.leaveStatusTitle")}</div>
      {(member.leaves ?? []).map((l: any) => (
        <div key={l.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="chip bg-gray-100 dark:bg-gray-800">{LEAVE_LABELS[l.type] ?? l.type}</span>
          <span>
            {l.startDate} → {l.endDate}
          </span>
          {l.substitute && <span>{t("settings.leaveCover", { name: l.substitute.name })}</span>}
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
          <option value="">{t("settings.substitutePlaceholder")}</option>
          {members
            .filter((x: any) => x.id !== member.id)
            .map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <input className="input max-w-[160px] py-1 text-xs" placeholder={t("settings.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-ghost text-xs" onClick={addLeave}>
          {t("settings.addLeave")}
        </button>
      </div>
    </div>
  );
}

// --------------------------- Sprints ---------------------------
function SprintsSection({ squadId, sprints, refetch }: any) {
  const { t } = useTranslation();
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
      <h2 className="mb-3 text-base font-bold">{t("settings.sprintsTitle")}</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">{t("settings.sprintNumber")}</label>
          <input className="input max-w-[90px]" type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="label">{t("settings.sprintNameOptional")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("settings.sprintStart")}</label>
          <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("settings.sprintEnd")}</label>
          <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={addSprint}>
          {t("settings.addSprint")}
        </button>
      </div>

      <ul className="space-y-1.5">
        {sprints.map((s: any) => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
            <span className="font-semibold">{t("settings.sprintLabel", { number: s.number })}</span>
            {s.name && <span className="text-gray-500">{s.name}</span>}
            <span className="text-xs text-gray-400">
              {s.startDate} → {s.endDate}
            </span>
            <button
              className="ml-auto text-xs text-red-600 hover:underline"
              onClick={() => del({ variables: { id: s.id } }).then(() => refetch())}
            >
              {t("settings.delete")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --------------------------- Holidays ---------------------------
function HolidaysSection({ squadId, holidays, refetch }: any) {
  const { t } = useTranslation();
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
      <h2 className="mb-3 text-base font-bold">{t("settings.publicHolidaysTitle")}</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">{t("settings.holidayDate")}</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="label">{t("settings.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={addHoliday}>
          {t("settings.add")}
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
