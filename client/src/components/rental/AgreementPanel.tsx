import { useState } from "react";
import type { RentalDetail } from "../../lib/api";
import { when } from "../../lib/format";
import { Icon } from "../Icon";

export function AgreementTerms({ r }: { r: RentalDetail }) {
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {r.agreement.terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3 text-xs">
        <Signed who={`Borrower (${r.borrower.name})`} at={r.agreement.borrower_accepted_at} />
        <Signed who={`Lender (${r.lender.name})`} at={r.agreement.lender_accepted_at} />
      </div>
    </div>
  );
}

function Signed({ who, at }: { who: string; at: string | null }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${at ? "bg-success-soft text-success" : "bg-mist text-charcoal"}`}>
      <Icon name={at ? "check" : "clock"} size={12} />
      {who}: {at ? `accepted ${when(at)}` : "not yet"}
    </span>
  );
}

export function AcceptAgreement({ r, onAccept, label = "Accept the agreement" }: { r: RentalDetail; onAccept: () => Promise<void>; label?: string }) {
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <AgreementTerms r={r} />
      <label className="flex items-start gap-2 text-sm font-semibold">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-black" checked={read} onChange={(e) => setRead(e.target.checked)} />
        I've read the agreement and accept it.
      </label>
      <button
        className="btn-primary"
        disabled={!read || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onAccept();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
