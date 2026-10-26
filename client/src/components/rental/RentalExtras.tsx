import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type PhotoSet, type RentalDetail } from "../../lib/api";
import { money, money0, when } from "../../lib/format";
import { useMeta } from "../../lib/useMeta";
import { Icon } from "../Icon";
import { Notice } from "../States";

type Act = (fn: () => Promise<RentalDetail>, success?: string) => Promise<void>;

const MAX_MB = 5;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PHASE_LABEL = { pickup: "Before pickup", return: "After return", claim: "Claim evidence" } as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-3 p-4 md:p-5">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

/** File picker with client-side checks. The server checks again (type, magic bytes, size). */
function PhotoUploader({ label, onUpload }: { label: string; onUpload: (files: File[], note: string) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useRef(`photos-${Math.random().toString(36).slice(2)}`).current;

  const pick = (list: FileList | null) => {
    setErr(null);
    const arr = Array.from(list ?? []);
    const bad = arr.find((f) => !TYPES.includes(f.type));
    if (bad) return setErr(`${bad.name} isn't a JPG, PNG, WebP or GIF photo.`);
    const big = arr.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) return setErr(`${big.name} is over ${MAX_MB} MB.`);
    if (arr.length > 6) return setErr("Add up to 6 photos at a time.");
    setFiles(arr);
  };

  return (
    <div className="space-y-3 rounded-card border border-dashed border-charcoal/50 p-3">
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      <input id={inputId} type="file" accept={TYPES.join(",")} multiple onChange={(e) => pick(e.target.files)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-2 file:border-ink file:bg-paper file:px-3 file:py-1.5 file:font-semibold" />
      <p className="field-hint">JPG, PNG, WebP or GIF, up to {MAX_MB} MB each. Show every side and any existing marks.</p>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <img key={f.name} src={URL.createObjectURL(f)} alt={f.name} className="h-16 w-16 rounded-lg object-cover" />
          ))}
        </div>
      )}
      <input className="input" placeholder="Note (optional), e.g. small scratch on the back already" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Photo note" />
      {err && <Notice tone="danger" title={err} />}
      <button
        className="btn-primary btn-sm"
        disabled={!files.length || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onUpload(files, note);
            setFiles([]);
            setNote("");
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Upload failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="upload" size={14} /> {busy ? "Uploading…" : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

function PhotoSetView({ set, r, act }: { set: PhotoSet; r: RentalDetail; act: Act }) {
  const mine = (r.my_role === "borrower" ? r.borrower.id : r.lender.id) === set.uploaded_by;
  const canConfirm = r.actions.includes("confirm_photos") && !mine && !set.confirmed_by && set.phase !== "claim";
  return (
    <div className="space-y-2 rounded-card border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-semibold">{PHASE_LABEL[set.phase]}</span> · by {set.uploader_name} ({set.uploader_role}) · {when(set.created_at)}
        </span>
        {set.phase !== "claim" &&
          (set.confirmed_by ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
              <Icon name="check" size={12} /> Confirmed by the other side
            </span>
          ) : (
            <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-charcoal">Not confirmed yet</span>
          ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {set.photos.map((p) => (
          <a key={p} href={p} target="_blank" rel="noreferrer" className="block h-24 w-32 overflow-hidden rounded-lg bg-ink">
            <img src={p} alt={`${PHASE_LABEL[set.phase]} photo`} className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
      {set.note && <p className="text-sm text-charcoal">“{set.note}”</p>}
      {canConfirm && (
        <button className="btn-secondary btn-sm" onClick={() => act(() => api.rentals.confirmPhotos(r.id, set.id), "Photos confirmed.").catch(() => undefined)}>
          <Icon name="check" size={14} /> These match what I see
        </button>
      )}
    </div>
  );
}

function ClaimTracker({ r }: { r: RentalDetail }) {
  const c = r.claim!;
  const steps = [
    { label: "Claim filed", done: true, at: c.filed_at },
    { label: c.borrower_response === "accept" ? "Borrower accepted" : c.borrower_response === "dispute" ? "Borrower disputed" : "Waiting for the borrower", done: !!c.responded_at, at: c.responded_at },
    { label: c.borrower_response === "accept" ? "No review needed" : "Moderator review", done: c.status === "resolved", at: c.borrower_response === "dispute" ? c.resolved_at : null, current: c.status === "under_review" },
    { label: "Result", done: c.status === "resolved", at: c.resolved_at },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Dispute status">
      {steps.map((s, i) => (
        <li key={i} className={`rounded-lg border p-2 text-xs ${s.done ? "border-ink bg-mist" : s.current ? "border-gold bg-gold-soft" : "border-line"}`}>
          <p className="flex items-center gap-1 font-bold">
            <Icon name={s.done ? "check" : "clock"} size={12} /> {s.label}
          </p>
          {s.at && <p className="text-charcoal">{when(s.at)}</p>}
        </li>
      ))}
    </ol>
  );
}

const CLAIM_LABEL = { damage: "Damage", late: "Late return", not_returned: "Not returned" };

function ClaimView({ r, act }: { r: RentalDetail; act: Act }) {
  const c = r.claim!;
  const hold = r.hold!;
  const [msg, setMsg] = useState("");
  const [decision, setDecision] = useState<"release" | "capture">("capture");
  const [amount, setAmount] = useState(String(c.amount));
  const [explanation, setExplanation] = useState("");
  const evidence = r.photo_sets;
  const resolved = c.status === "resolved";

  return (
    <Card title={resolved ? (c.decision === "capture" ? `Hold captured: ${money0(c.decision_amount)}` : "Hold released") : "Claim"}>
      {resolved ? (
        <div className={`rounded-card p-4 ${c.decision === "capture" ? "bg-danger-soft" : "bg-success-soft"}`}>
          <p className={`flex items-center gap-2 text-lg font-bold ${c.decision === "capture" ? "text-danger" : "text-success"}`}>
            <Icon name={c.decision === "capture" ? "alert" : "check"} />
            {c.decision === "capture" ? `Hold captured: ${money0(c.decision_amount)}` : "Hold released"}
          </p>
          <p className="mt-1 text-sm">{c.explanation}</p>
          {c.decision === "capture" && (
            <p className="mt-2 text-sm">
              Charged from the hold: <strong>{money(c.decision_amount)}</strong>. Released back to the card: <strong>{money(hold.released_amount)}</strong>.
              {c.type === "not_returned" && ` For an item that isn't returned, the borrower may also owe the rest of its ${money0(r.listing.estimated_value)} replacement value.`}
            </p>
          )}
        </div>
      ) : (
        <Notice tone="hold" title={`${money0(hold.amount)} is still held, not charged`}>
          Nothing is charged unless the borrower accepts the claim or a moderator approves it.
        </Notice>
      )}
      <ClaimTracker r={r} />
      <dl className="grid gap-1 text-sm sm:grid-cols-[140px_1fr]">
        <dt className="font-semibold">Type</dt>
        <dd>{CLAIM_LABEL[c.type]}</dd>
        <dt className="font-semibold">Amount claimed</dt>
        <dd>
          {money(c.amount)} <span className="text-charcoal">of the {money0(hold.amount)} hold</span>
        </dd>
        <dt className="font-semibold">Lender says</dt>
        <dd>{c.description}</dd>
        {c.borrower_response && (
          <>
            <dt className="font-semibold">Borrower says</dt>
            <dd>{c.borrower_message || (c.borrower_response === "accept" ? "Accepted the claim." : "Disputed the claim.")}</dd>
          </>
        )}
      </dl>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Evidence: condition photos from both sides</p>
        <div className="grid gap-2 md:grid-cols-2">
          {evidence.map((s) => (
            <PhotoSetView key={s.id} set={s} r={{ ...r, actions: [] }} act={act} />
          ))}
        </div>
      </div>

      {r.actions.includes("respond_claim") && (
        <div className="space-y-3 rounded-card border-2 border-ink p-4">
          <p className="font-semibold">Your response</p>
          <textarea className="input" rows={3} maxLength={800} placeholder="Tell your side. Point to your pickup photos if they show the issue was already there." value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Your response" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => act(() => api.rentals.respondClaim(r.id, "dispute", msg), "Response sent. A moderator will review the claim.").catch(() => undefined)}>
              Dispute the claim
            </button>
            <button className="btn-danger" onClick={() => act(() => api.rentals.respondClaim(r.id, "accept", msg), "Claim accepted.").catch(() => undefined)}>
              Accept and pay {money(c.amount)} from the hold
            </button>
          </div>
        </div>
      )}

      {r.actions.includes("resolve_claim") && (
        <div className="space-y-3 rounded-card border-2 border-ink p-4">
          <p className="font-semibold">Moderator decision</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-black" checked={decision === "release"} onChange={() => setDecision("release")} /> Release the hold
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-black" checked={decision === "capture"} onChange={() => setDecision("capture")} /> Capture part or all of the claim
            </label>
          </div>
          {decision === "capture" && (
            <label className="block text-sm font-semibold">
              Amount to capture (up to {money(Math.min(c.amount, hold.amount))})
              <input className="input mt-1 w-40" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          )}
          <textarea className="input" rows={3} placeholder="Short explanation both sides will see." value={explanation} onChange={(e) => setExplanation(e.target.value)} aria-label="Explanation" />
          <button className="btn-primary" disabled={explanation.trim().length < 10} onClick={() => act(() => api.rentals.resolveClaim(r.id, decision, decision === "capture" ? Number(amount) : 0, explanation), "Decision saved.").catch(() => undefined)}>
            Save decision
          </button>
        </div>
      )}
    </Card>
  );
}

function ClaimForm({ r, act, lateOnly }: { r: RentalDetail; act: Act; lateOnly: boolean }) {
  const [type, setType] = useState<"damage" | "late" | "not_returned">(lateOnly ? "late" : "damage");
  const [amount, setAmount] = useState(String(Math.min(r.quote.hold_amount, lateOnly ? r.quote.rental_fee / Math.max(1, r.quote.days) * Math.max(1, r.late_days) : 25).toFixed(0)));
  const [desc, setDesc] = useState("");
  const claimPhotos = r.photo_sets.filter((p) => p.phase === "claim");
  const hold = r.hold!;
  return (
    <div className="space-y-3 rounded-card border-2 border-danger p-4">
      <p className="font-semibold text-danger">File a claim</p>
      <p className="text-sm text-charcoal">
        You can claim up to the held {money0(hold.amount)}. The borrower can accept or dispute it. Disputes go to a moderator, who compares both sides' photos.
      </p>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Claim type</legend>
        {(lateOnly ? (["late", "not_returned"] as const) : (["damage", "late", "not_returned"] as const)).map((t) => (
          <label key={t} className="flex items-center gap-2">
            <input type="radio" name="claim-type" className="accent-black" checked={type === t} onChange={() => setType(t)} /> {CLAIM_LABEL[t]}
          </label>
        ))}
      </fieldset>
      {type === "not_returned" && (
        <Notice tone="danger" title="Not returned or destroyed">
          You can claim the full {money0(hold.amount)} hold. The borrower may also owe the rest of the item's {money0(r.listing.estimated_value)} replacement value.
        </Notice>
      )}
      {type === "damage" && (
        <>
          <PhotoUploader label="Photos of the damage (required)" onUpload={(files, note) => act(() => api.rentals.uploadPhotos(r.id, "claim", note, files), "Claim photos added.")} />
          {claimPhotos.length > 0 && <p className="text-sm text-success">{claimPhotos.reduce((n, p) => n + p.photos.length, 0)} claim photo(s) ready.</p>}
        </>
      )}
      <label className="block text-sm font-semibold">
        Amount (up to {money0(hold.amount)})
        <input className="input mt-1 w-40" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <textarea className="input" rows={3} maxLength={800} placeholder="What happened? Be specific: which part, and how you got the amount." value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Claim details" />
      <button
        className="btn-danger"
        disabled={desc.trim().length < 10 || !Number(amount)}
        onClick={() => act(() => api.rentals.fileClaim(r.id, { type, amount: Number(amount), description: desc }), "Claim filed. The borrower has been notified.").catch(() => undefined)}
      >
        File claim for {money(Number(amount) || 0)}
      </button>
    </div>
  );
}

function ReviewForm({ r, act }: { r: RentalDetail; act: Act }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const subject = r.my_role === "borrower" ? r.lender : r.borrower;
  return (
    <Card title={`Review ${subject.name.split(" ")[0]}`}>
      <fieldset>
        <legend className="field-label">Rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" onClick={() => setRating(i)} aria-label={`Rate ${i} star${i > 1 ? "s" : ""}`} aria-pressed={rating === i} className="rounded p-0.5">
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill={i <= rating ? "#FFC904" : "#E0E0E0"} stroke="#000" strokeWidth={1} />
              </svg>
            </button>
          ))}
        </div>
      </fieldset>
      <textarea className="input" rows={3} maxLength={800} placeholder={r.my_role === "borrower" ? "How was the item and the handoff?" : "Was it returned on time and in the same condition?"} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your review" />
      <button className="btn-primary" disabled={text.trim().length < 5} onClick={() => act(() => api.rentals.review(r.id, rating, text), "Thanks for the review.").catch(() => undefined)}>
        Post review
      </button>
    </Card>
  );
}

export function MessageThread({ rentalId, canSend, compact = false }: { rentalId: string; canSend: boolean; compact?: boolean }) {
  const [msgs, setMsgs] = useState<Awaited<ReturnType<typeof api.rentals.messages>>>([]);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      api.rentals
        .messages(rentalId)
        .then((m) => {
          if (!live) return;
          setMsgs((prev) => (prev.length === m.length ? prev : m));
          setLoaded(true);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 5000); // polling, per spec: no websockets
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [rentalId]);

  // Keep the newest message in view inside the thread without moving the page.
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [msgs.length]);

  const send = async () => {
    if (!body.trim()) return;
    setErr(null);
    try {
      const m = await api.rentals.send(rentalId, body);
      setMsgs((prev) => [...prev, m]);
      setBody("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Message didn't send.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div ref={boxRef} className={`space-y-2 overflow-y-auto rounded-card bg-mist p-3 ${compact ? "max-h-72" : "max-h-[55vh] min-h-[240px]"}`} aria-live="polite">
        {!loaded && <p className="text-sm text-charcoal">Loading messages…</p>}
        {loaded && msgs.length === 0 && <p className="text-sm text-charcoal">No messages yet. Say hi and agree on a time.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-ink text-paper" : "border border-line bg-paper"}`}>
              {!m.mine && <p className="text-xs font-semibold">{m.sender_name}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-0.5 text-[10px] ${m.mine ? "text-paper/70" : "text-charcoal"}`}>{when(m.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
      {canSend && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor={`msg-${rentalId}`} className="sr-only">
            Message
          </label>
          <input id={`msg-${rentalId}`} className="input" maxLength={1000} placeholder="Write a message" value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn-primary" disabled={!body.trim()}>
            Send
          </button>
        </form>
      )}
      {err && <Notice tone="danger" title={err} />}
      <p className="flex items-center gap-1.5 text-xs text-charcoal">
        <Icon name="shield" size={13} /> Phone numbers and emails are hidden automatically to protect your personal info. Messages are the permanent record of this rental.
      </p>
    </div>
  );
}

export function RentalExtras({ r, act }: { r: RentalDetail; act: Act; today: string }) {
  const meta = useMeta();
  const has = (a: string) => r.actions.includes(a);
  const [checked, setChecked] = useState<string[]>([]);
  const pickupSets = r.photo_sets.filter((p) => p.phase === "pickup");
  const returnSets = r.photo_sets.filter((p) => p.phase === "return");
  const showPhotos = pickupSets.length > 0 || returnSets.length > 0 || has("upload_pickup_photos") || has("upload_return_photos");

  return (
    <>
      {showPhotos && (
        <Card title="Condition photos">
          <p className="text-sm text-charcoal">Both of you add photos at pickup and at return, and the other side confirms them. They count as evidence if there's ever a claim.</p>
          {[...pickupSets, ...returnSets].map((s) => (
            <PhotoSetView key={s.id} set={s} r={r} act={act} />
          ))}
          {has("upload_pickup_photos") && (
            <PhotoUploader label="Add before-pickup photos" onUpload={(files, note) => act(() => api.rentals.uploadPhotos(r.id, "pickup", note, files), "Pickup photos added. Ask the other person to confirm them.")} />
          )}
          {has("upload_return_photos") && (
            <PhotoUploader label="Add after-return photos" onUpload={(files, note) => act(() => api.rentals.uploadPhotos(r.id, "return", note, files), "Return photos added.")} />
          )}
        </Card>
      )}

      {r.status === "confirmed" && (
        <Card title="Pickup">
          {has("mark_picked_up") ? (
            <>
              <p className="text-sm">Photos are confirmed. Once the item changes hands, mark it picked up.</p>
              <button className="btn-primary" onClick={() => act(() => api.rentals.pickup(r.id), "Picked up. Enjoy, and return it the same way.").catch(() => undefined)}>
                Mark as picked up
              </button>
            </>
          ) : (
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Icon name={pickupSets.length ? "check" : "clock"} size={14} /> Add before-pickup photos together
              </li>
              <li className="flex items-center gap-2">
                <Icon name={pickupSets.some((p) => p.confirmed_by) ? "check" : "clock"} size={14} /> The other person confirms them
              </li>
              <li className="flex items-center gap-2">
                <Icon name="clock" size={14} /> Pickup opens the day before {r.start_date}
              </li>
            </ul>
          )}
        </Card>
      )}

      {has("mark_returned") || (r.status === "in_progress" && r.my_role === "borrower") ? (
        <Card title="Return checklist">
          <p className="text-sm text-charcoal">Go through the list, add return photos above, then mark it returned. The lender has 24 hours to check it.</p>
          <ul className="space-y-2">
            {meta?.return_checklist.map((c) => (
              <li key={c}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-black" checked={checked.includes(c)} onChange={(e) => setChecked(e.target.checked ? [...checked, c] : checked.filter((x) => x !== c))} />
                  {c}
                </label>
              </li>
            ))}
          </ul>
          {!has("mark_returned") && <p className="text-sm text-charcoal">Add at least one return photo to finish.</p>}
          <button className="btn-primary" disabled={!has("mark_returned")} onClick={() => act(() => api.rentals.markReturned(r.id, checked), "Marked as returned. Your hold stays in place while the lender checks it.").catch(() => undefined)}>
            Mark as returned
          </button>
        </Card>
      ) : null}

      {has("confirm_clean_return") && (
        <Card title="Check the return">
          <p className="text-sm">Compare the item to the pickup photos. If it's in the same condition, confirm and the borrower's {money0(r.hold?.amount ?? 0)} hold is released.</p>
          <button className="btn-primary" onClick={() => act(() => api.rentals.confirmClean(r.id), `Hold released. ${money0(r.hold?.amount ?? 0)} back to the borrower.`).catch(() => undefined)}>
            <Icon name="check" size={16} /> Same condition. Release the hold.
          </button>
          {has("file_claim") && <ClaimForm r={r} act={act} lateOnly={false} />}
        </Card>
      )}

      {r.status === "in_progress" && has("file_claim") && (
        <Card title="Late return">
          <ClaimForm r={r} act={act} lateOnly />
        </Card>
      )}

      {r.claim && <ClaimView r={r} act={act} />}

      {r.status === "completed" && !r.claim && r.hold?.status === "released" && (
        <section className="rounded-card bg-success-soft p-4">
          <p className="flex items-center gap-2 text-lg font-bold text-success">
            <Icon name="check" /> Hold released
          </p>
          <p className="text-sm">
            {r.my_role === "borrower" ? "Your" : "The borrower's"} {money0(r.hold.amount)} hold has been released. Nothing was charged beyond the rental.
          </p>
        </section>
      )}

      {has("review") && <ReviewForm r={r} act={act} />}
      {r.status === "completed" && r.my_review_done && r.my_role !== "moderator" && <Notice tone="success" title="You've reviewed this rental. Thanks!" />}

      {r.my_role !== "moderator" && r.status !== "rejected" && (
        <Card title="Messages">
          <MessageThread rentalId={r.id} canSend={has("message")} compact />
        </Card>
      )}
      {r.my_role === "moderator" && (
        <Card title="Messages (read-only record)">
          <MessageThread rentalId={r.id} canSend={false} compact />
        </Card>
      )}
    </>
  );
}
