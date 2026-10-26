import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import { useDemo } from "../context/demo";
import { Notice } from "../components/States";
import { api, type Affiliation } from "../lib/api";

export default function Signup() {
  const { signIn } = useAuth();
  const { bump } = useDemo();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", affiliation: "student" as Affiliation, major: "", grad_year: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(
        await api.auth.register({
          name: form.name,
          email: form.email,
          password: form.password,
          affiliation: form.affiliation,
          major: form.major || undefined,
          grad_year: form.grad_year ? Number(form.grad_year) : undefined,
        }),
      );
      bump();
      nav("/verify", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page max-w-md">
      <h1 className="text-2xl">Create your account</h1>
      <p className="mt-1 text-sm text-charcoal">For UCF students and alumni. You'll verify your status next.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <fieldset>
          <legend className="field-label">I am a</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["student", "alumni"] as const).map((a) => (
              <label key={a} className={`cursor-pointer rounded-lg border-2 px-3 py-2.5 text-sm font-semibold ${form.affiliation === a ? "border-ink bg-mist" : "border-line"}`}>
                <input type="radio" name="affiliation" value={a} checked={form.affiliation === a} onChange={set("affiliation")} className="mr-2 accent-black" />
                {a === "student" ? "Current student" : "Alum"}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="name" className="field-label">Name</label>
          <input id="name" className="input" autoComplete="name" value={form.name} onChange={set("name")} />
          <p className="field-hint">This is the name other members see.</p>
        </div>
        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={form.email} onChange={set("email")} />
          <p className="field-hint">Used to sign in. Never shown to other members.</p>
        </div>
        <div>
          <label htmlFor="password" className="field-label">Password</label>
          <input id="password" type="password" autoComplete="new-password" className="input" value={form.password} onChange={set("password")} />
          <p className="field-hint">At least 8 characters.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="major" className="field-label">Major (optional)</label>
            <input id="major" className="input" value={form.major} onChange={set("major")} />
          </div>
          <div>
            <label htmlFor="grad_year" className="field-label">{form.affiliation === "alumni" ? "Graduation year" : "Expected grad year"}</label>
            <input id="grad_year" inputMode="numeric" className="input" value={form.grad_year} onChange={set("grad_year")} />
          </div>
        </div>
        {error && <Notice tone="danger" title={error} />}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-charcoal">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-ink underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
