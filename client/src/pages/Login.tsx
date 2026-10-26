import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import { useDemo } from "../context/demo";
import { Notice } from "../components/States";
import { api } from "../lib/api";

export default function Login() {
  const { signIn } = useAuth();
  const { health, bump } = useDemo();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/browse";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await api.auth.login(email, password));
      bump();
      nav(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page max-w-md">
      <h1 className="text-2xl">Sign in</h1>
      <p className="mt-1 text-sm text-charcoal">Welcome back to KnightLend.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="password" className="field-label">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <Notice tone="danger" title={error} />}
        <button className="btn-primary w-full" disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-charcoal">
        New here?{" "}
        <Link to="/signup" className="font-semibold text-ink underline">
          Create an account
        </Link>
      </p>
      {health?.demo_mode && (
        <div className="mt-6">
          <Notice title="Demo mode is on">Use the Demo bar at the top to sign in as a seeded user in one click.</Notice>
        </div>
      )}
    </div>
  );
}
