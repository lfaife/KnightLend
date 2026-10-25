import { useState, type FormEvent } from "react";
import type { CardIn } from "../../lib/api";
import { money, money0 } from "../../lib/format";
import { useMeta } from "../../lib/useMeta";
import { HeldAmount } from "../Badges";
import { Icon } from "../Icon";
import { Notice } from "../States";

interface Props {
  holdAmount: number;
  /** Rental charge collected with the hold. 0 when only the hold is renewed. */
  chargeAmount: number;
  onSubmit: (card: CardIn) => Promise<void>;
  submitLabel: string;
}

const digits = (s: string) => s.replace(/\D/g, "");
const groupCard = (s: string) => digits(s).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");

/** Mock card form. Only the test numbers listed below are accepted; nothing real is processed. */
export function CardForm({ holdAmount, chargeAmount, onSubmit, submitLabel }: Props) {
  const meta = useMeta();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const card = meta?.test_cards.find((c) => c.number === digits(number));
  const isDebit = card?.funding === "debit";

  const clear = () => {
    setNumber("");
    setExp("");
    setCvc("");
    setDeclined(null);
    setError(null);
  };

  const fill = (n: string) => {
    setNumber(groupCard(n));
    setExp("08/29");
    setCvc("123");
    if (!name) setName("Demo Knight");
    setDeclined(null);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const [mm, yy] = exp.split("/").map((x) => Number(x));
    if (!name.trim()) return setError("Enter the name on the card.");
    if (digits(number).length < 13) return setError("Enter a card number. Use one of the test cards below.");
    if (!mm || !yy) return setError("Enter the expiry as MM/YY.");
    setBusy(true);
    try {
      await onSubmit({ number: digits(number), exp_month: mm, exp_year: yy, cvc, name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The hold didn't go through.";
      if ((err as { status?: number }).status === 402) setDeclined(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-card border-2 border-ink bg-paper p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal">You'll be charged</p>
          <p className="text-2xl font-extrabold tabular">{money(chargeAmount)}</p>
          <p className="text-xs text-charcoal">{chargeAmount ? "Rental fee and service fee" : "Nothing is charged to renew a hold"}</p>
        </div>
        <div className="rounded-card bg-gold p-3 text-ink">
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
            <Icon name="lock" size={12} /> Held, not charged
          </p>
          <p className="text-2xl font-extrabold tabular">{money0(holdAmount)}</p>
          <p className="text-xs">Released automatically on a clean return</p>
        </div>
      </div>
      <p className="text-sm">
        In plain words: you'll be charged <strong>{money(chargeAmount)}</strong>
        {chargeAmount ? " for the rental" : ""}. <strong>{money0(holdAmount)}</strong> is held, not charged.
      </p>

      {declined ? (
        <div className="space-y-3 rounded-card border-2 border-danger bg-danger-soft p-4" role="alert">
          <p className="flex items-center gap-2 font-bold text-danger">
            <Icon name="alert" size={18} /> Your card didn't accept the hold
          </p>
          <p className="text-sm text-charcoal">{declined}</p>
          <p className="text-sm text-charcoal">This rental can't move ahead until a hold goes through. Your card wasn't charged.</p>
          <button type="button" className="btn-primary" onClick={clear}>
            Use a different card
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="cc-name" className="field-label">
              Name on card
            </label>
            <input id="cc-name" className="input" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cc-number" className="field-label">
              Card number
            </label>
            <div className="relative">
              <input id="cc-number" className="input pr-28 font-mono" inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={number} onChange={(e) => setNumber(groupCard(e.target.value))} />
              {card && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-charcoal">
                  {card.brand} {card.funding}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cc-exp" className="field-label">
                Expiry (MM/YY)
              </label>
              <input
                id="cc-exp"
                className="input font-mono"
                inputMode="numeric"
                autoComplete="off"
                placeholder="08/29"
                value={exp}
                onChange={(e) => {
                  const d = digits(e.target.value).slice(0, 4);
                  setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
              />
            </div>
            <div>
              <label htmlFor="cc-cvc" className="field-label">
                CVC
              </label>
              <input id="cc-cvc" className="input font-mono" inputMode="numeric" autoComplete="off" placeholder="123" value={cvc} onChange={(e) => setCvc(digits(e.target.value).slice(0, 4))} />
            </div>
          </div>

          {isDebit ? (
            <div className="rounded-card border-2 border-ink bg-mist p-3 text-sm">
              <p className="font-bold">This is a debit card</p>
              <p className="text-charcoal">Debit cards: the held amount is temporarily unavailable in your account. {money0(holdAmount)} will be set aside until the hold is released.</p>
              <button type="button" className="btn-secondary btn-sm mt-2" onClick={clear}>
                Use a different card
              </button>
            </div>
          ) : (
            <p className="text-xs text-charcoal">Debit cards: the held amount is temporarily unavailable in your account. A credit card avoids that.</p>
          )}

          {error && <Notice tone="danger" title={error} />}
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy ? "Checking with your bank…" : submitLabel}
          </button>
          {number && !isDebit && (
            <button type="button" className="w-full text-sm font-semibold underline" onClick={clear}>
              Use a different card
            </button>
          )}
        </form>
      )}

      {meta && (
        <details className="rounded-card border border-dashed border-charcoal/50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Test cards (simulated payments, no real cards)</summary>
          <ul className="mt-2 space-y-1.5">
            {meta.test_cards.map((c) => (
              <li key={c.number} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-mono">{groupCard(c.number)}</span> <span className="text-charcoal">· {c.description}</span>
                </span>
                <button type="button" className="btn-secondary btn-sm" onClick={() => fill(c.number)}>
                  Use
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="flex items-center gap-1.5 text-xs text-charcoal">
        <HeldAmount amount={holdAmount} /> means money set aside on your card, not paid to anyone.
      </p>
    </div>
  );
}
