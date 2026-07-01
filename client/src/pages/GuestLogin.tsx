import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GUEST_LOGIN, SQUADS, MEMBER_SUGGESTIONS } from "../graphql";
import { useAuth } from "../context/AuthContext";
import { useSquad } from "../context/SquadContext";
import FloatingDecor from "../components/FloatingDecor";

export default function GuestLogin() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [squadId, setLocalSquad] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [guestLogin, { loading }] = useMutation(GUEST_LOGIN);
  const { login: setAuth } = useAuth();
  const { setSquadId } = useSquad();
  const navigate = useNavigate();

  // Squads load only after we hold a guest token (step 2).
  const { data, loading: loadingSquads } = useQuery(SQUADS, { skip: step !== 2 });
  const squads = data?.squads ?? [];
  const selected = squads.find((s: any) => s.id === squadId);

  // Public name hints (all team members) for the name field.
  const { data: suggestData } = useQuery(MEMBER_SUGGESTIONS);
  const suggestions = suggestData?.memberSuggestions ?? [];

  const continueAsGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await guestLogin({ variables: { name } });
      const payload = res.data?.guestLogin;
      if (payload) {
        setAuth(payload.token, payload.user);
        setStep(2);
      }
    } catch (err: any) {
      setError(err.message ?? t("guest.couldNotContinue"));
    }
  };

  const enterDashboard = () => {
    if (!squadId) return;
    setSquadId(squadId);
    navigate("/");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <FloatingDecor items={["🔮", "✨", "🌙", "⭐", "🃏", "📊"]} className="absolute inset-0" />
      <div className="card relative z-10 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-4xl">🔮</div>
          <h1 className="mt-1 text-xl font-bold">{t("guest.title")}</h1>
          <p className="text-sm text-gray-500">{t("guest.subtitle")}</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={continueAsGuest} className="space-y-4">
            <div>
              <label className="label">{t("guest.yourName")}</label>
              <input
                className="input"
                list="jcb-member-names"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("guest.namePlaceholder")}
                required
                autoFocus
              />
              <datalist id="jcb-member-names">
                {suggestions.map((s: any) => (
                  <option key={s.name} value={s.name}>
                    {s.fullName && s.fullName !== s.name ? s.fullName : ""}
                  </option>
                ))}
              </datalist>
            </div>
            <button className="btn-primary w-full" disabled={loading || !name.trim()}>
              {loading ? t("guest.pleaseWait") : t("guest.continue")}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="text-sm text-gray-500">
              {t("guest.lead")} <b className="text-gray-800 dark:text-gray-100">{name}</b>
            </div>
            <div>
              <label className="label">{t("guest.squad")}</label>
              <select className="input" value={squadId} onChange={(e) => setLocalSquad(e.target.value)}>
                <option value="">{loadingSquads ? t("guest.loading") : t("guest.selectSquad")}</option>
                {squads.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div>
                <label className="label">{t("guest.board")}</label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="chip bg-gray-100 dark:bg-gray-800">
                    {selected.defaultBoardId || "—"}
                  </span>
                  {selected.jiraConfigured ? (
                    <span className="text-green-600 dark:text-green-400">{t("guest.jiraConnected")}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {t("guest.jiraNotConfigured")}
                    </span>
                  )}
                </div>
              </div>
            )}

            <button className="btn-primary w-full" onClick={enterDashboard} disabled={!squadId}>
              {t("guest.enterDashboard")}
            </button>
          </div>
        )}

        <div className="text-center text-sm">
          <Link to="/login" className="text-brand hover:underline">
            {t("guest.adminLogin")}
          </Link>
        </div>
        <p className="text-center text-[11px] text-gray-400">{t("guest.createdBy")}</p>
      </div>
    </div>
  );
}
