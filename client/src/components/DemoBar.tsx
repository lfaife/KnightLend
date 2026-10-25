import { useEffect, useState } from "react";
import { useAuth } from "../context/auth";
import { useDemo } from "../context/demo";
import { api, type DemoUser, type JobReport } from "../lib/api";

function describe(j: JobReport | null): string {
  if (!j) return "";
  const parts = [
    j.reminders_sent && `${j.reminders_sent} hold reminder${j.reminders_sent > 1 ? "s" : ""}`,
    j.holds_refreshed && `${j.holds_refreshed} hold${j.holds_refreshed > 1 ? "s" : ""} refreshed`,
    j.refreshes_failed && `${j.refreshes_failed} refresh${j.refreshes_failed > 1 ? "es" : ""} failed`,
    j.rentals_marked_late && `${j.rentals_marked_late} rental${j.rentals_marked_late > 1 ? "s" : ""} now late`,
    j.requests_expired && `${j.requests_expired} request${j.requests_expired > 1 ? "s" : ""} expired`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "no scheduled events";
}

/** Dev-only controls. Rendered only when the server reports DEMO_MODE=true. */
export function DemoBar() {
  const { health, bump } = useDemo();
  const { user, signIn } = useAuth();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [days, setDays] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (health?.demo_mode) api.demo.users().then(setUsers).catch(() => setUsers([]));
  }, [health?.demo_mode]);

  if (!health?.demo_mode) return null;

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      setMsg(await fn());
      bump();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="on-dark border-b border-gold/40 bg-charcoal text-paper">
      <div className="mx-auto flex max-w-6xl items-center gap-x-3 gap-y-2 overflow-x-auto px-4 py-2 text-xs lg:flex-wrap">
        <span className="shrink-0 rounded bg-gold px-1.5 py-0.5 font-bold uppercase tracking-wider text-ink">Demo</span>
        <div className="flex shrink-0 gap-1.5" role="group" aria-label="Switch demo user">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() =>
                run(u.id, async () => {
                  signIn(await api.demo.loginAs(u.id));
                  return `Signed in as ${u.label}.`;
                })
              }
              disabled={busy !== null}
              aria-pressed={user?.id === u.id}
              className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 font-semibold transition-colors ${
                user?.id === u.id ? "border-gold bg-gold text-ink" : "border-gold/60 text-paper hover:bg-gold hover:text-ink"
              }`}
            >
              {busy === u.id ? "Switching…" : u.label}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-4 w-px shrink-0 bg-paper/30 sm:block" />
        <form
          className="flex shrink-0 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run("advance", async () => {
              const r = await api.demo.advance(days);
              return `Moved ahead ${days} day${days > 1 ? "s" : ""}: ${describe(r.jobs)}.`;
            });
          }}
        >
          <label htmlFor="demo-days" className="whitespace-nowrap">
            Advance time
          </label>
          <input
            id="demo-days"
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            className="w-12 rounded border border-gold/60 bg-ink px-1.5 py-0.5 text-paper"
          />
          <span>days</span>
          <button className="whitespace-nowrap rounded-full border border-gold px-2.5 py-1 font-semibold hover:bg-gold hover:text-ink" disabled={busy !== null}>
            {busy === "advance" ? "Working…" : "Go"}
          </button>
        </form>
        <button
          className="shrink-0 whitespace-nowrap rounded-full border border-gold/60 px-2.5 py-1 font-semibold hover:bg-gold hover:text-ink"
          disabled={busy !== null}
          onClick={() => run("jobs", async () => `Jobs ran: ${describe((await api.demo.runJobs()).jobs)}.`)}
        >
          Run jobs now
        </button>
        {confirmReset ? (
          <span className="flex shrink-0 items-center gap-1.5">
            Reset all demo data?
            <button
              className="rounded-full bg-gold px-2.5 py-1 font-bold text-ink"
              onClick={() => {
                setConfirmReset(false);
                run("reset", async () => {
                  await api.demo.reset();
                  return "Demo data reset.";
                });
              }}
            >
              Yes, reset
            </button>
            <button className="underline" onClick={() => setConfirmReset(false)}>
              No
            </button>
          </span>
        ) : (
          <button className="shrink-0 whitespace-nowrap underline underline-offset-2" onClick={() => setConfirmReset(true)} disabled={busy !== null}>
            Reset demo
          </button>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap text-paper/80 tabular">
          Today: {new Date(health.today + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
      {msg && (
        <div className="mx-auto max-w-6xl px-4 pb-2 text-xs text-gold" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}
