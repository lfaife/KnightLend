import { useState } from "react";
import { useAuth } from "../context/auth";
import { api, type ReportReason } from "../lib/api";
import { Icon } from "./Icon";
import { Notice } from "./States";

const REASONS: { id: ReportReason; label: string }[] = [
  { id: "no_show", label: "Didn't show up" },
  { id: "damaged_item", label: "Item damaged or not as described" },
  { id: "misleading_listing", label: "Misleading listing" },
  { id: "unsafe_behavior", label: "Unsafe or rude behavior" },
  { id: "scam", label: "Scam or asked to pay outside KnightLend" },
  { id: "other", label: "Something else" },
];

export function ReportButton({ targetType, targetId, label }: { targetType: "user" | "listing"; targetId: string; label: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("no_show");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;
  if (done) return <Notice tone="success" title={done} />;
  if (!open)
    return (
      <button className="inline-flex items-center gap-1 text-sm font-semibold underline" onClick={() => setOpen(true)}>
        <Icon name="flag" size={14} /> {label}
      </button>
    );
  return (
    <div className="space-y-3 rounded-card border border-line p-4">
      <p className="font-semibold">{label}</p>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Reason</legend>
        {REASONS.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input type="radio" name={`reason-${targetId}`} className="accent-black" checked={reason === r.id} onChange={() => setReason(r.id)} /> {r.label}
          </label>
        ))}
      </fieldset>
      <textarea className="input" rows={2} maxLength={800} placeholder="What happened? (optional)" value={details} onChange={(e) => setDetails(e.target.value)} aria-label="Report details" />
      {err && <Notice tone="danger" title={err} />}
      <div className="flex gap-2">
        <button
          className="btn-primary btn-sm"
          onClick={async () => {
            try {
              setDone((await api.report({ target_type: targetType, target_id: targetId, reason, details })).message);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Couldn't send the report.");
            }
          }}
        >
          Send report
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
