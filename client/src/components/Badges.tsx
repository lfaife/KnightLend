import type { HoldStatus } from "../lib/api";
import { dateOnly, money0 } from "../lib/format";
import { Icon } from "./Icon";

export function VerifiedBadge({ affiliation, compact = false }: { affiliation?: "student" | "alumni"; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper" title="Verified UCF member">
      <Icon name="check" size={12} className="text-gold" />
      {compact ? "Verified" : affiliation === "alumni" ? "Verified alum" : "Verified student"}
    </span>
  );
}

export function UnverifiedBadge() {
  return <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-charcoal">Not verified yet</span>;
}

const HOLD_STYLE: Record<HoldStatus, string> = {
  pending: "bg-mist text-charcoal border border-line",
  active: "bg-gold text-ink",
  released: "bg-success text-paper",
  captured: "bg-danger text-paper",
  failed: "border border-danger bg-danger-soft text-danger",
};
const HOLD_WORD: Record<HoldStatus, string> = { pending: "Pending", active: "Active", released: "Released", captured: "Captured", failed: "Needs new card" };

/** Hold status: Pending gray, Active gold, Released green, Captured red. */
export function HoldBadge({ status, expires, captured }: { status: HoldStatus; expires?: string | null; captured?: number }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${HOLD_STYLE[status]}`}>
      <Icon name={status === "released" ? "check" : status === "failed" || status === "captured" ? "alert" : "lock"} size={12} />
      Hold {HOLD_WORD[status].toLowerCase()}
      {status === "active" && expires ? ` · until ${dateOnly(expires)}` : ""}
      {status === "captured" && captured ? `: ${money0(captured)}` : ""}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-mist text-ink border border-line",
  approved: "bg-mist text-ink border border-ink",
  confirmed: "bg-ink text-paper",
  in_progress: "bg-ink text-paper",
  return_pending: "bg-mist text-ink border border-ink",
  claim_open: "bg-danger text-paper",
  completed: "bg-success-soft text-success border border-success",
  rejected: "bg-mist text-charcoal",
  cancelled: "bg-mist text-charcoal",
};
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[status] ?? "bg-mist"}`}>{label}</span>;
}

/** Small "$X hold" chip for cards. Gold background, black text, lock icon. */
export function HoldChip({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-gold px-1.5 py-0.5 text-[11px] font-bold text-ink">
      <Icon name="lock" size={11} />
      {money0(amount)} hold
    </span>
  );
}

/** The one way a held amount is shown. Never styled like a charge. */
export function HeldAmount({ amount, label = "Held, not charged", size = "md" }: { amount: number; label?: string; size?: "md" | "lg" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg bg-gold font-bold text-ink ${size === "lg" ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-sm"}`}>
      <Icon name="lock" size={size === "lg" ? 16 : 13} />
      <span className="tabular">{money0(amount)}</span>
      <span className="font-semibold">{label}</span>
    </span>
  );
}
