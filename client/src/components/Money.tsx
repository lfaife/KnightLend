import { useState } from "react";
import type { Quote } from "../lib/api";
import { money, money0 } from "../lib/format";
import { HeldAmount } from "./Badges";
import { Icon } from "./Icon";

export function HoldInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="grid h-5 w-5 place-items-center rounded-full border-2 border-ink text-[10px] font-extrabold"
        aria-label="What is a protection hold?"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open && (
        <span role="tooltip" className="absolute bottom-7 right-0 z-20 w-64 rounded-lg bg-ink p-3 text-xs font-normal leading-relaxed text-paper shadow-card">
          A temporary hold on your card, like the hold a hotel or gas pump places. Nothing is charged unless something goes wrong. It's released within 3 days of a clean return.
        </span>
      )}
    </span>
  );
}

/** Protection hold box shown up front on listings. */
export function HoldBox({ amount, compact = false }: { amount: number; compact?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-card bg-gold p-3 text-ink">
      <Icon name="lock" size={20} className="mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-bold">
          {money0(amount)} protection hold. Held, not charged.
        </p>
        {!compact && <p>Released within 3 days of a clean return. Only charged if the item comes back damaged, late, or not at all.</p>}
      </div>
      <HoldInfoButton />
    </div>
  );
}

/** Charges in bold black on white; the hold on its own gold row so it never reads as a charge. */
export function CostSummary({ quote, bundleName }: { quote: Quote; bundleName?: string | null }) {
  return (
    <div className="space-y-3" aria-label="Cost summary">
      <dl className="space-y-1.5 text-sm">
        {quote.lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-3">
            <dt className="text-charcoal">
              {l.label} rate × {l.quantity}
            </dt>
            <dd className="tabular">{money(l.amount)}</dd>
          </div>
        ))}
        {quote.bundle_fee > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-charcoal">{bundleName ?? "Bundle"} add-on</dt>
            <dd className="tabular">{money(quote.bundle_fee)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-charcoal">Service fee</dt>
          <dd className="tabular">{money(quote.service_fee)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-2 text-base">
          <dt className="font-bold">You'll be charged</dt>
          <dd className="font-extrabold tabular">{money(quote.total)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold bg-gold-soft px-3 py-2">
        <span className="text-sm font-semibold">Protection hold</span>
        <HeldAmount amount={quote.hold_amount} />
      </div>
      <p className="text-xs text-charcoal">No other fees. The hold isn't part of what you pay.</p>
    </div>
  );
}
