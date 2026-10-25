import { useState } from "react";
import { Link } from "react-router-dom";
import { RequireAuth } from "../components/RequireAuth";
import { Empty, ErrorState, Loading, Notice } from "../components/States";
import { Stars } from "../components/Stars";
import { useAuth } from "../context/auth";
import { api } from "../lib/api";
import { money, when } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function Moderation() {
  return (
    <RequireAuth title="Moderators only">
      <ModerationView />
    </RequireAuth>
  );
}

function ModerationView() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.moderation.overview(), []);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  if (user?.role !== "moderator") return <div className="page"><Empty icon="lock" title="Moderators only" body="Switch to the Moderator account in the Demo bar to see this page." /></div>;
  if (loading) return <Loading label="Loading moderation" />;
  if (error || !data) return <div className="page"><ErrorState message={error ?? "Couldn't load"} onRetry={reload} /></div>;

  const run = async (fn: () => Promise<{ message: string }>) => {
    try {
      setMsg((await fn()).message);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    }
  };

  return (
    <div className="page space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl">Moderation</h1>
        <p className="text-sm text-charcoal">Disputes to decide, members flagged by bad reviews or reports, and open reports.</p>
      </div>
      {msg && <Notice tone="success" title={msg} />}

      <section className="space-y-3">
        <h2 className="text-lg">Disputes to review ({data.disputes.length})</h2>
        {data.disputes.length ? (
          <ul className="space-y-2">
            {data.disputes.map((d) => (
              <li key={d.rental_id}>
                <Link to={`/rentals/${d.rental_id}`} className="card flex flex-wrap items-center justify-between gap-2 p-3 hover:border-ink">
                  <span>
                    <span className="font-semibold">{d.listing_title}</span>
                    <span className="block text-sm text-charcoal">
                      {d.lender_name} claims {money(d.amount)} ({d.claim_type.replace("_", " ")}) from {d.borrower_name} · filed {when(d.filed_at)}
                    </span>
                  </span>
                  <span className="btn-primary btn-sm">Review evidence</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No disputes waiting" />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">Flagged and restricted members ({data.flagged.length})</h2>
        {data.flagged.length ? (
          <ul className="space-y-3">
            {data.flagged.map((f) => (
              <li key={f.user.id} className={`card space-y-2 p-4 ${f.restricted ? "border-danger" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/users/${f.user.id}`} className="font-semibold underline">
                      {f.user.name}
                    </Link>
                    <Stars value={f.user.rating_avg} count={f.user.rating_count} />
                    {f.restricted ? <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-paper">Restricted</span> : <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-ink">Flagged</span>}
                  </div>
                  <span className="text-xs text-charcoal">
                    {f.flag_reason ?? ""}
                    {f.open_reports ? ` · ${f.open_reports} open report(s)` : ""}
                  </span>
                </div>
                {f.restricted_reason && <p className="text-sm">Restriction: {f.restricted_reason}</p>}
                {f.low_reviews.length > 0 && (
                  <ul className="list-inside list-disc text-sm text-charcoal">
                    {f.low_reviews.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
                {f.restricted ? (
                  <button className="btn-secondary btn-sm" onClick={() => run(() => api.moderation.unrestrict(f.user.id))}>
                    Lift restriction
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input min-w-[200px] flex-1"
                      placeholder="Reason the member will see"
                      value={reasons[f.user.id] ?? ""}
                      onChange={(e) => setReasons({ ...reasons, [f.user.id]: e.target.value })}
                      aria-label={`Restriction reason for ${f.user.name}`}
                    />
                    <button className="btn-danger btn-sm" disabled={(reasons[f.user.id] ?? "").trim().length < 5} onClick={() => run(() => api.moderation.restrict(f.user.id, reasons[f.user.id]))}>
                      Restrict
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => run(() => api.moderation.clearFlag(f.user.id))}>
                      Clear flag
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No flagged members" />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">Open reports ({data.reports.length})</h2>
        {data.reports.length ? (
          <ul className="space-y-2">
            {data.reports.map((r) => (
              <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <span className="font-semibold">{r.reason.replace(/_/g, " ")}</span> · {r.target_type}{" "}
                  {r.target_type === "user" ? (
                    <Link to={`/users/${r.target_id}`} className="underline">
                      {r.target_label}
                    </Link>
                  ) : (
                    <Link to={`/listings/${r.target_id}`} className="underline">
                      {r.target_label}
                    </Link>
                  )}
                  <span className="block text-charcoal">
                    From {r.reporter_name} · {when(r.created_at)}
                    {r.details ? ` · “${r.details}”` : ""}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => run(() => api.moderation.resolveReport(r.id, "resolved", ""))}>
                    Mark resolved
                  </button>
                  <button className="btn-sm text-sm font-semibold underline" onClick={() => run(() => api.moderation.resolveReport(r.id, "dismissed", ""))}>
                    Dismiss
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No open reports" />
        )}
      </section>
    </div>
  );
}
