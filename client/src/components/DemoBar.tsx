import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import { useDemo } from "../context/demo";
import { api, type DemoUser } from "../lib/api";

/** Dev-only controls. Rendered only when the server reports DEMO_MODE=true. */
export function DemoBar() {
  const { health, bump } = useDemo();
  const { user, signIn } = useAuth();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (health?.demo_mode) api.demo.users().then(setUsers).catch(() => setUsers([]));
  }, [health?.demo_mode]);

  if (!health?.demo_mode) return null;

  const switchTo = async (u: DemoUser) => {
    setBusy(u.id);
    try {
      signIn(await api.demo.loginAs(u.id));
      bump();
      setMsg(`Signed in as ${u.label}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="on-dark border-b border-gold/40 bg-charcoal text-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-xs">
        <span className="rounded bg-gold px-1.5 py-0.5 font-bold uppercase tracking-wider text-ink">Demo mode</span>
        <span className="text-paper/80">Simulated payments and data.</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Switch demo user">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => switchTo(u)}
              disabled={busy !== null}
              aria-pressed={user?.id === u.id}
              className={`rounded-full border px-2.5 py-1 font-semibold transition-colors ${
                user?.id === u.id ? "border-gold bg-gold text-ink" : "border-gold/60 text-paper hover:bg-gold hover:text-ink"
              }`}
            >
              {busy === u.id ? "Switching…" : u.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-paper/80 tabular">
          Today: {new Date(health.now + "Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </span>
        <button className="underline underline-offset-2" onClick={() => navigate("/")}>
          Home
        </button>
        {msg && (
          <span className="w-full text-gold" role="status">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
