import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-charcoal" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-line border-t-ink" />
      <span className="text-sm font-medium">{label}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-danger bg-danger-soft p-4" role="alert">
      <Icon name="alert" className="mt-0.5 shrink-0 text-danger" />
      <div className="flex-1">
        <p className="font-semibold text-danger">Couldn't load this</p>
        <p className="text-sm text-charcoal">{message}</p>
      </div>
      {onRetry && (
        <button className="btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, body, action, icon = "info" }: { title: string; body?: string; action?: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-line px-6 py-12 text-center">
      <Icon name={icon} size={28} className="text-charcoal" />
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-md text-sm text-charcoal">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "success" | "danger" | "hold"; title?: string; children?: ReactNode }) {
  const styles = {
    info: "border-line bg-mist",
    success: "border-success bg-success-soft",
    danger: "border-danger bg-danger-soft",
    hold: "border-gold bg-gold-soft",
  }[tone];
  const icon = { info: "info", success: "check", danger: "alert", hold: "lock" }[tone];
  const iconColor = { info: "text-charcoal", success: "text-success", danger: "text-danger", hold: "text-ink" }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-card border p-4 ${styles}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={icon} className={`mt-0.5 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className={`font-semibold ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-ink"}`}>{title}</p>}
        {children && <div className="text-charcoal">{children}</div>}
      </div>
    </div>
  );
}
