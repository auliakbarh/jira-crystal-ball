import { useState } from "react";
import { useMutation } from "@apollo/client";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LOGIN } from "../graphql";
import { useAuth } from "../context/AuthContext";
import FloatingDecor from "../components/FloatingDecor";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, { loading }] = useMutation(LOGIN);
  const { login: setAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await login({ variables: { email, password } });
      const payload = res.data?.login;
      if (payload) {
        if (!payload.user.isAdmin) {
          setError(t("login.notAdmin"));
          return;
        }
        setAuth(payload.token, payload.user);
        navigate("/");
      }
    } catch (err: any) {
      setError(err.message ?? t("login.loginFailed"));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <FloatingDecor items={["🔮", "✨", "🌙", "⭐", "🃏", "📊"]} className="absolute inset-0" />
      <form onSubmit={submit} className="card relative z-10 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-4xl">🔮</div>
          <h1 className="mt-1 text-xl font-bold">{t("login.title")}</h1>
          <p className="text-sm text-gray-500">{t("login.subtitle")}</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="label">{t("login.email")}</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label">{t("login.password")}</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? t("login.signingIn") : t("login.signInAsAdmin")}
        </button>

        <div className="border-t border-gray-200 pt-3 text-center text-sm dark:border-gray-800">
          <Link to="/guest" className="text-brand hover:underline">
            {t("login.continueAsGuest")}
          </Link>
        </div>
        <p className="text-center text-[11px] text-gray-400">{t("login.createdBy")}</p>
      </form>
    </div>
  );
}
