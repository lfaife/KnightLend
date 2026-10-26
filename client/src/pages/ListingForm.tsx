import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { HeldAmount } from "../components/Badges";
import { Icon } from "../components/Icon";
import { RequireAuth } from "../components/RequireAuth";
import { Empty, ErrorState, Loading, Notice } from "../components/States";
import { useAuth } from "../context/auth";
import { api, type HoldSuggestion, type ListingIn } from "../lib/api";
import { money0 } from "../lib/format";
import { useMeta } from "../lib/useMeta";

export default function ListingFormPage() {
  return (
    <RequireAuth title="Sign in to list an item">
      <Gate />
    </RequireAuth>
  );
}

function Gate() {
  const { user } = useAuth();
  const { id } = useParams();
  if (user?.restricted)
    return (
      <div className="page max-w-2xl">
        <Notice tone="danger" title="Your account is restricted">
          You can't list or request items right now. {user.restricted_reason ? `Reason: ${user.restricted_reason}` : ""} Reach out to a moderator through the Safety page.
        </Notice>
      </div>
    );
  if (!user?.verified)
    return (
      <div className="page max-w-2xl">
        <Empty icon="check" title="Verify before you lend" body="Only verified UCF students and alumni can list items. It takes about a minute." action={<Link to="/verify" className="btn-primary">Verify my status</Link>} />
      </div>
    );
  return <ListingForm id={id} />;
}

const EMPTY: ListingIn = {
  title: "",
  description: "",
  category: "calculators_electronics",
  tags: [],
  specs: [{ label: "", value: "" }],
  condition: "like_new",
  condition_notes: "",
  estimated_value: 60,
  prices: { day: 3, week: null, month: null, semester: null },
  bundle: null,
  hold_amount: 30,
  max_rental_days: 14,
  usage_guide: [""],
  sanitized: false,
  sanitized_note: null,
  pickup_spot_id: "student-union",
  requires_approval: true,
  photos: [],
  status: "active",
};

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function ListingForm({ id }: { id?: string }) {
  const meta = useMeta();
  const nav = useNavigate();
  const [f, setF] = useState<ListingIn | null>(id ? null : EMPTY);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sug, setSug] = useState<HoldSuggestion | null>(null);
  const [holdTouched, setHoldTouched] = useState(!!id);
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.listings
      .get(id)
      .then((x) => {
        setF({
          title: x.title,
          description: x.description,
          category: x.category,
          tags: x.tags,
          specs: x.specs.length ? x.specs : [{ label: "", value: "" }],
          condition: x.condition,
          condition_notes: x.condition_notes,
          estimated_value: x.estimated_value,
          prices: x.prices,
          bundle: x.bundle,
          hold_amount: x.hold_amount,
          max_rental_days: x.max_rental_days,
          usage_guide: x.usage_guide.length ? x.usage_guide : [""],
          sanitized: x.sanitized,
          sanitized_note: x.sanitized_note,
          pickup_spot_id: x.pickup.spot_id ?? "student-union",
          requires_approval: x.requires_approval,
          photos: x.photos,
          status: x.status === "paused" ? "paused" : "active",
        });
        setTagText(x.tags.join(", "));
      })
      .catch((e) => setLoadErr(e.message));
  }, [id]);

  // Suggest a hold from the estimated value; the server enforces the same limits.
  useEffect(() => {
    if (!f || !(f.estimated_value > 0)) return;
    const t = setTimeout(() => {
      api.listings
        .holdSuggestion(f.estimated_value)
        .then((s) => {
          setSug(s);
          setF((cur) => {
            if (!cur) return cur;
            if (!holdTouched || cur.hold_amount < s.min_hold || cur.hold_amount > s.max_hold) return { ...cur, hold_amount: holdTouched ? Math.min(s.max_hold, Math.max(s.min_hold, cur.hold_amount)) : s.suggested };
            return cur;
          });
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f?.estimated_value]);

  if (loadErr) return <div className="page"><ErrorState message={loadErr} /></div>;
  if (!f || !meta) return <Loading label="Loading form" />;

  const set = <K extends keyof ListingIn>(k: K, v: ListingIn[K]) => setF({ ...f, [k]: v });
  const price = (k: keyof ListingIn["prices"]) => (e: { target: { value: string } }) => set("prices", { ...f.prices, [k]: e.target.value === "" ? null : Number(e.target.value) });

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setErr(null);
    try {
      const { urls } = await api.listings.uploadPhotos(Array.from(files).slice(0, 6));
      set("photos", [...f.photos, ...urls].slice(0, 8));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.photos.length) return setErr("Add at least one photo so borrowers can see the item.");
    setBusy(true);
    const body: ListingIn = {
      ...f,
      tags: tagText.split(",").map((t) => t.trim()).filter(Boolean),
      specs: f.specs.filter((s) => s.label.trim() && s.value.trim()),
      usage_guide: f.usage_guide.filter((u) => u.trim()),
      sanitized_note: f.sanitized ? f.sanitized_note : null,
    };
    try {
      const saved = id ? await api.listings.update(id, body) : await api.listings.create(body);
      nav(`/listings/${saved.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't save the listing.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="page max-w-3xl space-y-6" onSubmit={submit} noValidate>
      <div>
        <h1 className="text-2xl md:text-3xl">{id ? "Edit listing" : "List an item"}</h1>
        <p className="text-sm text-charcoal">You choose the price, the protection hold, how long it can be out, and whether you approve each request.</p>
      </div>
      {err && <Notice tone="danger" title={err} />}

      <section className="card space-y-4 p-4 md:p-5">
        <h2 className="text-lg">Photos</h2>
        <div className="flex flex-wrap gap-2">
          {f.photos.map((p, i) => (
            <div key={p} className="relative h-24 w-32 overflow-hidden rounded-lg bg-ink">
              <img src={p} alt={`Listing photo ${i + 1}`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => set("photos", f.photos.filter((x) => x !== p))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-paper text-ink" aria-label={`Remove photo ${i + 1}`}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <label className="grid h-24 w-32 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-charcoal/50 text-center text-xs font-semibold hover:border-ink">
            <span>
              <Icon name="camera" className="mx-auto" />
              {uploading ? "Uploading…" : "Add photos"}
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
          </label>
        </div>
        <p className="field-hint">JPG, PNG, WebP or GIF, up to 5 MB each. Show the item from every side, including any marks.</p>
      </section>

      <section className="card space-y-4 p-4 md:p-5">
        <h2 className="text-lg">The basics</h2>
        <Field label="Title" htmlFor="title" hint="Brand, model and size, e.g. “TI-84 Plus CE Graphing Calculator”.">
          <input id="title" className="input" maxLength={90} value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <select id="category" className="input" value={f.category} onChange={(e) => set("category", e.target.value as ListingIn["category"])}>
              {meta.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition" htmlFor="condition">
            <select id="condition" className="input" value={f.condition} onChange={(e) => set("condition", e.target.value as ListingIn["condition"])}>
              {meta.conditions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description" htmlFor="description">
          <textarea id="description" className="input" rows={3} maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Condition notes" htmlFor="cond-notes" hint="Be upfront about scratches or wear. It protects you in a claim.">
          <input id="cond-notes" className="input" maxLength={300} value={f.condition_notes} onChange={(e) => set("condition_notes", e.target.value)} />
        </Field>
        <Field label="Classes or majors (comma separated)" htmlFor="tags" hint="Helps students find it, e.g. FIN 3403, Finance">
          <input id="tags" className="input" value={tagText} onChange={(e) => setTagText(e.target.value)} />
        </Field>
      </section>

      <section className="card space-y-3 p-4 md:p-5">
        <h2 className="text-lg">Exact specs</h2>
        {f.specs.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <input aria-label={`Spec ${i + 1} name`} className="input" placeholder="e.g. Battery" value={s.label} onChange={(e) => set("specs", f.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input aria-label={`Spec ${i + 1} value`} className="input" placeholder="e.g. 30 hours" value={s.value} onChange={(e) => set("specs", f.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <button type="button" className="btn-secondary btn-sm" aria-label={`Remove spec ${i + 1}`} onClick={() => set("specs", f.specs.filter((_, j) => j !== i))}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="text-sm font-semibold underline" onClick={() => set("specs", [...f.specs, { label: "", value: "" }])}>
          Add a spec
        </button>
      </section>

      <section className="card space-y-4 p-4 md:p-5">
        <h2 className="text-lg">Pricing</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["day", "week", "month", "semester"] as const).map((k) => (
            <Field key={k} label={`Per ${k}${k === "day" ? "" : " (optional)"}`} htmlFor={`price-${k}`}>
              <input id={`price-${k}`} className="input" inputMode="decimal" value={f.prices[k] ?? ""} onChange={price(k)} />
            </Field>
          ))}
        </div>
        <p className="field-hint">Borrowers automatically get the cheapest mix of your rates. A semester is 16 weeks.</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-black" checked={!!f.bundle} onChange={(e) => set("bundle", e.target.checked ? { name: "", includes: [""], extra_per_day: 2 } : null)} />
          Offer a bundle (extra accessories for a little more per day)
        </label>
        {f.bundle && (
          <div className="grid gap-3 rounded-card border border-line p-3 sm:grid-cols-3">
            <Field label="Bundle name" htmlFor="b-name">
              <input id="b-name" className="input" value={f.bundle.name} onChange={(e) => set("bundle", { ...f.bundle!, name: e.target.value })} />
            </Field>
            <Field label="What's included (comma separated)" htmlFor="b-inc">
              <input id="b-inc" className="input" value={f.bundle.includes.join(", ")} onChange={(e) => set("bundle", { ...f.bundle!, includes: e.target.value.split(",").map((x) => x.trim()) })} />
            </Field>
            <Field label="Extra per day" htmlFor="b-price">
              <input id="b-price" className="input" inputMode="decimal" value={f.bundle.extra_per_day} onChange={(e) => set("bundle", { ...f.bundle!, extra_per_day: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        )}
        <Field label="Longest rental you'll allow (days)" htmlFor="max-days">
          <input id="max-days" className="input w-32" inputMode="numeric" value={f.max_rental_days} onChange={(e) => set("max_rental_days", Number(e.target.value) || 1)} />
        </Field>
      </section>

      <section className="card space-y-4 p-4 md:p-5">
        <h2 className="text-lg">Protection hold amount</h2>
        <p className="text-sm text-charcoal">A temporary hold on the borrower's card. It's released after a clean return, and you can claim up to this amount if the item comes back damaged, late, or not at all.</p>
        <Field label="Estimated value of the item ($)" htmlFor="value" hint="What it would cost to replace. We use it to suggest the hold.">
          <input id="value" className="input w-40" inputMode="decimal" value={f.estimated_value || ""} onChange={(e) => set("estimated_value", Number(e.target.value) || 0)} />
        </Field>
        {sug && (
          <div className="space-y-3 rounded-card bg-gold-soft p-4">
            <p className="text-sm">
              Suggested for a {money0(sug.estimated_value)} item: <strong>{money0(sug.suggested)}</strong>. Items {sug.tier_label.toLowerCase()} can hold between {money0(sug.min_hold)} and {money0(sug.max_hold)}.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <label htmlFor="hold" className="sr-only">
                Protection hold amount
              </label>
              <input
                id="hold"
                type="range"
                min={sug.min_hold}
                max={sug.max_hold}
                step={5}
                value={f.hold_amount}
                onChange={(e) => {
                  setHoldTouched(true);
                  set("hold_amount", Number(e.target.value));
                }}
                className="flex-1 accent-black"
              />
              <HeldAmount amount={f.hold_amount} size="lg" />
            </div>
            {holdTouched && f.hold_amount !== sug.suggested && (
              <button
                type="button"
                className="text-sm font-semibold underline"
                onClick={() => {
                  setHoldTouched(false);
                  set("hold_amount", sug.suggested);
                }}
              >
                Use the suggested {money0(sug.suggested)}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-4 p-4 md:p-5">
        <h2 className="text-lg">Pickup and care</h2>
        <Field label="Pickup spot" htmlFor="pickup" hint="Public campus spots are safest. Borrowers can suggest another public spot when they book.">
          <select id="pickup" className="input" value={f.pickup_spot_id} onChange={(e) => set("pickup_spot_id", e.target.value)}>
            <optgroup label="Public campus spots">
              {meta.pickup_spots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Near where you live">
              {meta.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <div className="space-y-2">
          <p className="field-label">How to use it</p>
          {f.usage_guide.map((u, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Usage step ${i + 1}`} className="input" placeholder="e.g. Charge it fully before returning." value={u} onChange={(e) => set("usage_guide", f.usage_guide.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className="btn-secondary btn-sm" aria-label={`Remove step ${i + 1}`} onClick={() => set("usage_guide", f.usage_guide.filter((_, j) => j !== i))}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="text-sm font-semibold underline" onClick={() => set("usage_guide", [...f.usage_guide, ""])}>
            Add a step
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-black" checked={f.sanitized} onChange={(e) => set("sanitized", e.target.checked)} />I sanitize it between rentals
        </label>
        {f.sanitized && (
          <Field label="How you clean it" htmlFor="san-note">
            <input id="san-note" className="input" maxLength={200} value={f.sanitized_note ?? ""} onChange={(e) => set("sanitized_note", e.target.value)} />
          </Field>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-black" checked={f.requires_approval} onChange={(e) => set("requires_approval", e.target.checked)} />
          <span>
            <span className="font-semibold">Require my approval</span>
            <span className="block text-charcoal">
              {f.requires_approval ? "You approve or decline each request." : "Instant book: requests are approved automatically, and you accept the standard rental agreement for each one."}
            </span>
          </span>
        </label>
        {id && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-black" checked={f.status === "paused"} onChange={(e) => set("status", e.target.checked ? "paused" : "active")} />
            Pause this listing (hide it from search)
          </label>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary px-6 py-3" disabled={busy || uploading}>
          {busy ? "Saving…" : id ? "Save changes" : "Publish listing"}
        </button>
        <Link to={id ? `/listings/${id}` : "/dashboard"} className="btn-secondary">
          Cancel
        </Link>
        {id &&
          (confirmRemove ? (
            <span className="flex items-center gap-2 text-sm">
              Remove it for good?
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={async () => {
                  try {
                    await api.listings.remove(id);
                    nav("/dashboard?tab=listings");
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Couldn't remove it.");
                    setConfirmRemove(false);
                  }
                }}
              >
                Yes, remove
              </button>
              <button type="button" className="underline" onClick={() => setConfirmRemove(false)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" className="ml-auto text-sm font-semibold text-danger underline" onClick={() => setConfirmRemove(true)}>
              Remove listing
            </button>
          ))}
      </div>
    </form>
  );
}
