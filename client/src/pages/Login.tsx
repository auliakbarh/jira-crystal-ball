import { useState } from "react";
import { useMutation } from "@apollo/client";
import { Link, useNavigate } from "react-router-dom";
import { LOGIN } from "../graphql";
import { useAuth } from "../context/AuthContext";

export default function Login() {
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
          setError("This account is not an admin.");
          return;
        }
        setAuth(payload.token, payload.user);
        navigate("/");
      }
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-4xl">🔮</div>
          <h1 className="mt-1 text-xl font-bold">JIRA Crystal Ball</h1>
          <p className="text-sm text-gray-500">Admin sign in</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="label">Email</label>
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
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in as admin"}
        </button>

        <div className="border-t border-gray-200 pt-3 text-center text-sm dark:border-gray-800">
          <Link to="/guest" className="text-brand hover:underline">
            ← Continue as guest to run a standup
          </Link>
        </div>
      </form>
    </div>
  );
}
