import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Link, useNavigate } from "react-router-dom";
import { GUEST_LOGIN, SQUADS } from "../graphql";
import { useAuth } from "../context/AuthContext";
import { useSquad } from "../context/SquadContext";

export default function GuestLogin() {
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
      setError(err.message ?? "Could not continue");
    }
  };

  const enterDashboard = () => {
    if (!squadId) return;
    setSquadId(squadId);
    navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-4xl">🔮</div>
          <h1 className="mt-1 text-xl font-bold">Run a Standup</h1>
          <p className="text-sm text-gray-500">Guest access — no account needed</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={continueAsGuest} className="space-y-4">
            <div>
              <label className="label">Your name (standup lead)</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Budi"
                required
                autoFocus
              />
            </div>
            <button className="btn-primary w-full" disabled={loading || !name.trim()}>
              {loading ? "Please wait…" : "Continue"}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="text-sm text-gray-500">
              Lead: <b className="text-gray-800 dark:text-gray-100">{name}</b>
            </div>
            <div>
              <label className="label">Squad</label>
              <select className="input" value={squadId} onChange={(e) => setLocalSquad(e.target.value)}>
                <option value="">{loadingSquads ? "Loading…" : "Select a squad…"}</option>
                {squads.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div>
                <label className="label">Board</label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="chip bg-gray-100 dark:bg-gray-800">
                    {selected.defaultBoardId || "—"}
                  </span>
                  {selected.jiraConfigured ? (
                    <span className="text-green-600 dark:text-green-400">JIRA connected</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      JIRA not configured — tickets won't load
                    </span>
                  )}
                </div>
              </div>
            )}

            <button className="btn-primary w-full" onClick={enterDashboard} disabled={!squadId}>
              Enter dashboard
            </button>
          </div>
        )}

        <div className="text-center text-sm">
          <Link to="/login" className="text-brand hover:underline">
            Admin login →
          </Link>
        </div>
      </div>
    </div>
  );
}
