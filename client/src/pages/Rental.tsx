import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { HoldBadge, StatusBadge, VerifiedBadge } from "../components/Badges";
import { CampusMap } from "../components/CampusMap";
import { Icon } from "../components/Icon";
import { CostSummary } from "../components/Money";
import { RequireAuth } from "../components/RequireAuth";
import { AcceptAgreement, AgreementTerms } from "../components/rental/AgreementPanel";
import { CardForm } from "../components/rental/CardForm";
import { HoldHistory, MoneyPanel } from "../components/rental/HoldPanel";
import { MeetupPicker } from "../components/rental/MeetupPicker";
import { RentalExtras } from "../components/rental/RentalExtras";
import { ErrorState, Loading, Notice } from "../components/States";
import { Stars } from "../components/Stars";
import { useDemo } from "../context/demo";
import { api, type RentalDetail } from "../lib/api";
import { day, money, money0, when } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function RentalPage() {
  return (
    <RequireAuth>
      <RentalView />
    </RequireAuth>
  );
}

const STEPS = ["Requested", "Approved", "Hold placed", "Picked up", "Returned", "Done"];
const STEP_OF: Record<string, number> = { requested: 0, approved: 1, confirmed: 2, in_progress: 3, return_pending: 4, claim_open: 4, completed: 5 };

function Progress({ r }: { r: RentalDetail }) {
  if (r.status === "rejected" || r.status === "cancelled") return null;
  const at = STEP_OF[r.status] ?? 0;
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Rental progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-col gap-1" aria-current={i === at ? "step" : undefined}>
          <span className={`h-1.5 rounded-full ${i < at ? "bg-ink" : i === at ? "bg-gold" : "bg-line"}`} />
          <span className={`text-[11px] leading-tight ${i === at ? "font-bold text-ink" : "text-charcoal"}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="card space-y-3 p-4 md:p-5" id={id}>
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

function RentalView() {
  const { id = "" } = useParams();
  const { data: r, error, loading, reload, setData } = useAsync(() => api.rentals.get(id), [id]);
  const { health } = useDemo();
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editMeetup, setEditMeetup] = useState(false);

  if (loading && !r) return <Loading label="Loading rental" />;
  if (error || !r)
    return (
      <div className="page">
        <ErrorState message={error ?? "Not found"} onRetry={reload} />
      </div>
    );

  const has = (a: string) => r.actions.includes(a);
  const other = r.my_role === "borrower" ? r.lender : r.borrower;
  const today = health?.today ?? new Date().toISOString().slice(0, 10);

  /** Run an action, swap in the fresh rental, and show an optional success line. */
  const act = async (fn: () => Promise<RentalDetail>, success?: string) => {
    setActionError(null);
    try {
      const next = await fn();
      setData(next);
      if (success) setFlash(success);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That didn't work.");
      throw e;
    }
  };
  const quiet = (fn: () => Promise<RentalDetail>, success?: string) => act(fn, success).catch(() => undefined);

  return (
    <div className="page max-w-4xl space-y-5">
      <header className="flex flex-wrap items-start gap-4">
        <Link to={`/listings/${r.listing.id}`} className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-ink">
          {r.listing.photo && <img src={r.listing.photo} alt="" className="h-full w-full object-cover" />}
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="eyebrow">{r.my_role === "borrower" ? "You're borrowing" : r.my_role === "lender" ? "You're lending" : "Moderator view"}</p>
          <h1 className="text-xl md:text-2xl">
            <Link to={`/listings/${r.listing.id}`} className="hover:underline">
              {r.listing.title}
            </Link>
          </h1>
          <p className="text-sm text-charcoal">
            {day(r.start_date)} to {day(r.end_date)} · {r.quote.days} day{r.quote.days > 1 ? "s" : ""}
            {r.bundle_name ? ` · with the ${r.bundle_name}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <StatusBadge status={r.status} label={r.status_label} />
            {r.hold && <HoldBadge status={r.hold.status} expires={r.hold.expires_at} captured={r.hold.captured_amount} />}
            {r.late && <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-bold text-paper">{r.late_days} day{r.late_days > 1 ? "s" : ""} late</span>}
          </div>
        </div>
      </header>

      <Progress r={r} />

      {flash && (
        <Notice tone="success" title={flash}>
          <button className="mt-1 text-xs font-semibold underline" onClick={() => setFlash(null)}>
            Dismiss
          </button>
        </Notice>
      )}
      <Notice tone={r.hold?.status === "failed" ? "danger" : "hold"} title="Next step">
        {r.next_step}
      </Notice>
      {actionError && <Notice tone="danger" title={actionError} />}

      {has("approve") && (
        <Section title="Approve this request?">
          {r.request_note && (
            <blockquote className="rounded-lg bg-mist p-3 text-sm">
              “{r.request_note}” <span className="text-charcoal">— {r.borrower.name}</span>
            </blockquote>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{r.borrower.name}</span>
            {r.borrower.verified && <VerifiedBadge affiliation={r.borrower.affiliation} />}
            <Stars value={r.borrower.rating_avg} count={r.borrower.rating_count} />
            <Link to={`/users/${r.borrower.id}`} className="underline">
              View profile
            </Link>
          </div>
          <p className="text-sm">
            They'll pay <strong>{money(r.quote.total)}</strong> and a <strong>{money0(r.quote.hold_amount)}</strong> protection hold covers your item. You keep{" "}
            <strong>{money(r.lender_earnings)}</strong>.
          </p>
          <AgreementTerms r={r} />
          <p className="text-xs text-charcoal">Approving also accepts the agreement above on your side.</p>
          <div className="flex flex-wrap items-end gap-3">
            <button className="btn-primary" onClick={() => quiet(() => api.rentals.approve(r.id, "", true), "Approved. We've asked the borrower to place the protection hold.")}>
              Approve and accept agreement
            </button>
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <label className="min-w-[180px] flex-1 text-sm">
                <span className="sr-only">Reason for declining (optional)</span>
                <input className="input" placeholder="Reason (optional)" value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} />
              </label>
              <button className="btn-secondary" onClick={() => quiet(() => api.rentals.reject(r.id, declineNote), "Request declined.")}>
                Decline
              </button>
            </div>
          </div>
        </Section>
      )}

      {has("accept_agreement") && (
        <Section title="Rental agreement">
          <p className="text-sm text-charcoal">Both of you accept the same plain-language agreement before the protection hold is placed.</p>
          <AcceptAgreement r={r} onAccept={() => act(() => api.rentals.acceptAgreement(r.id), "Agreement accepted.")} />
        </Section>
      )}

      {r.status === "approved" && r.my_role === "borrower" && !has("accept_agreement") && !has("place_hold") && (
        <Notice title={`Waiting for ${r.lender.name.split(" ")[0]} to accept the agreement`}>You'll place the hold as soon as they do.</Notice>
      )}

      {has("place_hold") && (
        <Section title="Place protection hold" id="hold">
          <CardForm
            holdAmount={r.quote.hold_amount}
            chargeAmount={r.quote.total}
            submitLabel={`Pay ${money(r.quote.total)} and place ${money0(r.quote.hold_amount)} hold`}
            onSubmit={(card) => act(() => api.rentals.placeHold(r.id, card), "Hold placed. Released automatically on return.")}
          />
        </Section>
      )}

      {has("update_card") && (
        <Section title="Update your card" id="hold">
          <Notice tone="danger" title="Your protection hold couldn't be renewed">
            Holds last 7 days, so longer rentals refresh them. Your bank declined the last refresh. Nothing was charged. Add a different card to keep this rental in good standing.
          </Notice>
          <CardForm
            holdAmount={r.hold?.amount ?? r.quote.hold_amount}
            chargeAmount={0}
            submitLabel={`Renew the ${money0(r.hold?.amount ?? r.quote.hold_amount)} hold on this card`}
            onSubmit={(card) => act(() => api.rentals.placeHold(r.id, card), "Hold renewed. No charge.")}
          />
        </Section>
      )}

      <MoneyPanel r={r} />

      {(has("set_meetup") || r.meetup) && (
        <Section title="Meetup">
          {r.meetup && !editMeetup ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold">{r.meetup.spot_name}</p>
                  <p>
                    {day(r.meetup.date)} · {r.meetup.time_of_day}
                  </p>
                  <p className="text-charcoal">{r.meetup.accessibility_note}</p>
                  {r.meetup.notes && <p className="mt-1">Note: {r.meetup.notes}</p>}
                </div>
                {has("set_meetup") && (
                  <button className="btn-secondary btn-sm" onClick={() => setEditMeetup(true)}>
                    Change
                  </button>
                )}
              </div>
              <CampusMap center={[r.meetup.lat, r.meetup.lng]} zoom={16} highlight={{ lat: r.meetup.lat, lng: r.meetup.lng, label: "Meet here" }} height={220} />
            </div>
          ) : (
            <MeetupPicker
              current={r.meetup}
              today={today}
              startDate={r.start_date}
              onSave={async (body) => {
                await act(() => api.rentals.setMeetup(r.id, body), "Meetup saved.");
                setEditMeetup(false);
              }}
            />
          )}
        </Section>
      )}

      <RentalExtras r={r} act={act} today={today} />

      <Section title="Cost summary at booking">
        <CostSummary
          quote={r.quote}
          bundleName={r.bundle_name}
          holdLabel={r.hold && ["released", "captured"].includes(r.hold.status) ? "Protection hold at booking (see above for what happened)" : undefined}
        />
      </Section>

      {!has("accept_agreement") && !has("approve") && (
        <Section title="Rental agreement">
          <AgreementTerms r={r} />
        </Section>
      )}

      <HoldHistory r={r} />

      <Section title="Timeline">
        <ol className="space-y-2 border-l-2 border-line pl-4">
          {r.timeline.map((t, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-ink bg-paper" />
              <span className="font-semibold">{t.text}</span> <span className="text-xs text-charcoal">{when(t.at)}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={r.my_role === "borrower" ? "Your lender" : r.my_role === "lender" ? "Your borrower" : "People"}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link to={`/users/${other.id}`} className="font-semibold underline">
            {other.name}
          </Link>
          {other.verified && <VerifiedBadge affiliation={other.affiliation} />}
          <Stars value={other.rating_avg} count={other.rating_count} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-charcoal">
          <Icon name="shield" size={14} /> Phone numbers and personal emails are never shown. Message each other in KnightLend so there's a record.
        </p>
      </Section>

      {has("cancel") && (
        <section className="rounded-card border border-line p-4">
          {confirmCancel ? (
            <div className="space-y-3">
              <p className="font-semibold">Cancel this rental?</p>
              <ul className="list-inside list-disc text-sm text-charcoal">
                {r.payment ? (
                  <li>
                    Refund of the rental fee: <strong className="text-ink">{money(r.my_role === "lender" ? r.payment.charged_amount : r.cancellation_refund_preview ?? 0)}</strong>
                    {r.my_role === "lender" ? " to the borrower (lender cancellations refund in full)" : ""}
                  </li>
                ) : (
                  <li>Nothing has been charged.</li>
                )}
                <li>The protection hold is released right away.</li>
              </ul>
              <div className="flex gap-2">
                <button className="btn-danger" onClick={() => quiet(() => api.rentals.cancel(r.id), "Rental cancelled. The hold was released.")}>
                  Yes, cancel
                </button>
                <button className="btn-secondary" onClick={() => setConfirmCancel(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button className="text-sm font-semibold text-danger underline" onClick={() => setConfirmCancel(true)}>
              Cancel rental
            </button>
          )}
        </section>
      )}
    </div>
  );
}
