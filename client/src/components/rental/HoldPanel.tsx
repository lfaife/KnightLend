import type { RentalDetail } from "../../lib/api";
import { dateOnly, money, money0, when } from "../../lib/format";
import { HoldBadge } from "../Badges";
import { Icon } from "../Icon";

const EVENT_TEXT: Record<string, string> = {
  created: "Hold set up, waiting for approval",
  authorize_ok: "Hold placed",
  authorize_fail: "Card declined the hold",
  refresh_ok: "Hold refreshed (no charge)",
  refresh_fail: "Hold refresh failed",
  release: "Hold released",
  capture: "Hold captured",
};

/** Charged and held side by side, never mixed. */
export function MoneyPanel({ r }: { r: RentalDetail }) {
  const h = r.hold;
  const charged = (r.payment?.charged_amount ?? 0) - (r.payment?.refunded_amount ?? 0) + (r.payment?.claim_charged_amount ?? 0);
  return (
    <section className="grid gap-3 sm:grid-cols-2" aria-label="Money">
      <div className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-charcoal">{r.my_role === "lender" ? "Borrower was charged" : "Charged"}</p>
        <p className="mt-1 text-2xl font-extrabold tabular">{money(r.payment ? charged : 0)}</p>
        <dl className="mt-2 space-y-1 text-sm">
          {r.payment ? (
            <>
              <div className="flex justify-between">
                <dt className="text-charcoal">Rental (paid {dateOnly(r.payment.charged_at)})</dt>
                <dd className="tabular">{money(r.payment.charged_amount)}</dd>
              </div>
              {r.payment.refunded_amount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-charcoal">Refunded</dt>
                  <dd className="tabular">-{money(r.payment.refunded_amount)}</dd>
                </div>
              )}
              {r.payment.claim_charged_amount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-charcoal">From the hold (claim)</dt>
                  <dd className="font-semibold text-danger tabular">{money(r.payment.claim_charged_amount)}</dd>
                </div>
              )}
            </>
          ) : (
            <div>
              <dt className="sr-only">Status</dt>
              <dd className="text-charcoal">Nothing yet. {r.my_role === "borrower" ? `You'll pay ${money(r.quote.total)} when you place the hold.` : `${r.borrower.name.split(" ")[0]} pays ${money(r.quote.total)} when the hold is placed.`}</dd>
            </div>
          )}
          {r.my_role === "lender" && (
            <div className="flex justify-between border-t border-line pt-1">
              <dt className="text-charcoal">Your earnings</dt>
              <dd className="font-semibold tabular">{money(r.lender_earnings)}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="rounded-card bg-gold p-4 text-ink">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
            <Icon name="lock" size={12} /> Protection hold
          </p>
          {h && <HoldBadge status={h.status} captured={h.captured_amount} />}
        </div>
        <p className="mt-1 text-2xl font-extrabold tabular">{money0(h?.amount ?? r.quote.hold_amount)}</p>
        <p className="text-sm font-semibold">{h?.status === "captured" ? "Partly or fully charged after a claim" : "Held, not charged"}</p>
        {h && (
          <ul className="mt-2 space-y-1 text-sm">
            {h.status === "pending" && <li>Not placed yet. It's placed after approval and the agreement.</li>}
            {h.status === "active" && h.expires_at && (
              <li>
                Active until {dateOnly(h.expires_at)}. {["confirmed", "in_progress", "return_pending", "claim_open"].includes(r.status) ? "It refreshes automatically, with a reminder the day before. No charge." : ""}
              </li>
            )}
            {h.status === "active" && h.refresh_count > 0 && <li>Refreshed {h.refresh_count} time{h.refresh_count > 1 ? "s" : ""}.</li>}
            {h.status === "failed" && <li className="font-semibold">{h.failure_message ?? "Your card declined the hold."} Nothing was charged.</li>}
            {h.status === "released" && <li>Released{h.released_at ? ` ${dateOnly(h.released_at)}` : ""}. {h.released_amount ? `${money0(h.released_amount)} back to the card.` : "Nothing was ever held."}</li>}
            {h.status === "captured" && (
              <li>
                Captured {money0(h.captured_amount)}. Released {money0(h.released_amount)}.
              </li>
            )}
            {h.card && (
              <li>
                On your {h.card.brand} {h.card.funding} ending {h.card.last4}
                {h.card.funding === "debit" ? " (held amount is temporarily unavailable in your account)" : ""}
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

export function HoldHistory({ r }: { r: RentalDetail }) {
  if (!r.hold || r.hold.history.length <= 1) return null;
  return (
    <details className="card p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Protection hold history</summary>
      <ol className="mt-2 space-y-1.5">
        {r.hold.history.map((e, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2">
            <span>
              <span className="font-semibold">{EVENT_TEXT[e.event] ?? e.event}</span>
              {e.note && <span className="text-charcoal"> · {e.note}</span>}
            </span>
            <span className="text-xs text-charcoal">{when(e.at)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
