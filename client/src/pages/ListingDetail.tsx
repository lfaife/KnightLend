import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { HoldChip, VerifiedBadge } from "../components/Badges";
import { CampusMap, MapLegend } from "../components/CampusMap";
import { Icon } from "../components/Icon";
import { CostSummary, HoldBox } from "../components/Money";
import { ErrorState, Loading, Notice } from "../components/States";
import { Stars } from "../components/Stars";
import { useAuth } from "../context/auth";
import { useDemo } from "../context/demo";
import { api, type ListingDetail as Detail, type QuoteCheck } from "../lib/api";
import { addDays, CATEGORY_LABEL, CONDITION_LABEL, day, initials, money0 } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useMeta } from "../lib/useMeta";

export default function ListingDetail() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.listings.get(id), [id]);
  if (loading) return <Loading label="Loading item" />;
  if (error || !data)
    return (
      <div className="page">
        <ErrorState message={error ?? "Not found"} onRetry={reload} />
      </div>
    );
  return <DetailView item={data} />;
}

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [i, setI] = useState(0);
  if (!photos.length) return <div className="aspect-[4/3] rounded-card bg-ink" />;
  return (
    <div className="space-y-2">
      <div className="aspect-[4/3] overflow-hidden rounded-card bg-ink">
        <img src={photos[i]} alt={`${title}, photo ${i + 1} of ${photos.length}`} className="h-full w-full object-cover" />
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2">
          {photos.map((p, idx) => (
            <button key={p} onClick={() => setI(idx)} aria-label={`Show photo ${idx + 1}`} aria-pressed={i === idx} className={`h-16 w-20 overflow-hidden rounded-lg border-2 ${i === idx ? "border-ink" : "border-transparent"}`}>
              <img src={p} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PriceOptions({ item }: { item: Detail }) {
  const opts = [
    { label: "Day", v: item.prices.day },
    { label: "Week", v: item.prices.week },
    { label: "Month", v: item.prices.month },
    { label: "Semester", v: item.prices.semester },
  ].filter((o) => o.v);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {opts.map((o) => (
        <div key={o.label} className="rounded-lg border border-line p-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal">{o.label}</p>
          <p className="text-lg font-extrabold tabular">{money0(o.v!)}</p>
        </div>
      ))}
    </div>
  );
}

function RequestPanel({ item }: { item: Detail }) {
  const { user } = useAuth();
  const { health } = useDemo();
  const nav = useNavigate();
  const loc = useLocation();
  const today = health?.today ?? new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 4));
  const [bundle, setBundle] = useState(false);
  const [note, setNote] = useState("");
  const [check, setCheck] = useState<QuoteCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!start || !end) return;
    setChecking(true);
    const t = setTimeout(() => {
      api.listings
        .quote(item.id, start, end, bundle)
        .then(setCheck)
        .catch((e) => setErr(e.message))
        .finally(() => setChecking(false));
    }, 200);
    return () => clearTimeout(t);
  }, [item.id, start, end, bundle]);

  const submit = async () => {
    if (!user) {
      nav("/login", { state: { from: loc.pathname } });
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await api.rentals.create({ listing_id: item.id, start_date: start, end_date: end, with_bundle: bundle, note });
      nav(`/rentals/${r.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  if (item.is_owner)
    return (
      <div className="card space-y-3 p-4">
        <p className="font-semibold">This is your listing.</p>
        <Link to={`/list/${item.id}`} className="btn-secondary w-full">
          Edit listing
        </Link>
      </div>
    );

  return (
    <div className="card space-y-4 p-4" id="request">
      <div className="flex items-baseline justify-between">
        <p>
          <span className="text-2xl font-extrabold tabular">{money0(item.prices.day)}</span>
          <span className="text-charcoal"> / day</span>
        </p>
        <span className="text-xs text-charcoal">Up to {item.max_rental_days} days</span>
      </div>
      <HoldBox amount={item.hold_amount} compact />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold">
          Pickup
          <input type="date" className="input mt-1 px-2" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Return by
          <input type="date" className="input mt-1 px-2" min={addDays(start || today, 1)} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {item.booked.length > 0 && (
        <p className="text-xs text-charcoal">
          Already booked: {item.booked.map((b) => `${day(b.start)} to ${day(b.end)}`).join("; ")}
        </p>
      )}
      {item.bundle && (
        <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-black" checked={bundle} onChange={(e) => setBundle(e.target.checked)} />
          <span>
            <span className="font-semibold">Add the {item.bundle.name}</span> (+{money0(item.bundle.extra_per_day)}/day)
            <span className="block text-xs text-charcoal">{item.bundle.includes.join(", ")}</span>
          </span>
        </label>
      )}
      <div aria-live="polite" className="space-y-3">
        {checking && !check && <Loading label="Pricing" />}
        {check?.problems.map((p) => (
          <Notice key={p} tone="danger" title={p} />
        ))}
        {check?.quote && <CostSummary quote={check.quote} bundleName={item.bundle?.name} />}
        {check?.warnings.map((w) => (
          <Notice key={w} title="Heads up">
            {w}
          </Notice>
        ))}
      </div>
      <div>
        <label htmlFor="req-note" className="field-label">
          Message to {item.owner.name.split(" ")[0]} (optional)
        </label>
        <textarea id="req-note" rows={2} className="input" maxLength={500} placeholder="What's it for? When can you pick up?" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err && <Notice tone="danger" title={err} />}
      <button className="btn-primary w-full py-3 text-base" onClick={submit} disabled={busy || !check?.available}>
        {busy ? "Sending…" : !user ? "Sign in to request" : item.requires_approval ? "Request to rent" : "Book now"}
      </button>
      <p className="text-center text-xs text-charcoal">
        {item.requires_approval ? `Nothing is charged or held until ${item.owner.name.split(" ")[0]} approves.` : "Instant book: no approval needed. You'll accept the agreement and place the hold next."}
      </p>
    </div>
  );
}

function DetailView({ item }: { item: Detail }) {
  const meta = useMeta();
  const { user, refresh } = useAuth();
  const [saved, setSaved] = useState(item.saved);
  const toggleSave = async () => {
    if (saved) await api.listings.unsave(item.id);
    else await api.listings.save(item.id);
    setSaved(!saved);
    refresh();
  };
  const spot = meta?.pickup_spots.find((s) => s.id === item.pickup.spot_id);

  return (
    <div className="page">
      <nav className="mb-3 text-sm" aria-label="Breadcrumb">
        <Link to="/browse" className="font-semibold underline">
          Browse
        </Link>
        <span className="text-charcoal"> / {CATEGORY_LABEL[item.category]}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <Gallery photos={item.photos} title={item.title} />

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-semibold">{CONDITION_LABEL[item.condition]} condition</span>
              {item.sanitized && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
                  <Icon name="sparkle" size={12} /> Sanitized between rentals
                </span>
              )}
              <HoldChip amount={item.hold_amount} />
              {!item.requires_approval && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-paper">Instant book</span>}
            </div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl md:text-3xl">{item.title}</h1>
              {user && !item.is_owner && (
                <button onClick={toggleSave} className="btn-secondary btn-sm shrink-0" aria-pressed={saved}>
                  <Icon name="heart" size={14} filled={saved} /> {saved ? "Saved" : "Save"}
                </button>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-charcoal">
              {item.rating_count > 0 && <Stars value={item.rating_avg} count={item.rating_count} />}
              <span>{item.rentals_count} past rentals</span>
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" size={14} /> {item.pickup.area_name} · {item.distance_miles} mi
              </span>
            </p>
            <p className="max-w-prose">{item.description}</p>
            {item.condition_notes && <p className="text-sm text-charcoal">Condition notes: {item.condition_notes}</p>}
            {item.sanitized_note && <p className="text-sm text-charcoal">{item.sanitized_note}</p>}
          </header>

          <section className="space-y-3">
            <h2 className="text-lg">Pricing</h2>
            <PriceOptions item={item} />
            <p className="text-sm text-charcoal">We use the cheapest mix of rates for your dates automatically.</p>
            {item.bundle && (
              <div className="rounded-card border border-line p-4">
                <p className="font-semibold">
                  Bundle: {item.bundle.name} <span className="font-normal text-charcoal">+{money0(item.bundle.extra_per_day)}/day</span>
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-charcoal">
                  {item.bundle.includes.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg">Protection hold</h2>
            <HoldBox amount={item.hold_amount} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg">Exact specs</h2>
            <dl className="divide-y divide-line rounded-card border border-line">
              {item.specs.map((s) => (
                <div key={s.label} className="grid grid-cols-[minmax(110px,35%)_1fr] gap-3 px-4 py-2.5 text-sm">
                  <dt className="font-semibold">{s.label}</dt>
                  <dd className="text-charcoal">{s.value}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[minmax(110px,35%)_1fr] gap-3 px-4 py-2.5 text-sm">
                <dt className="font-semibold">Estimated value</dt>
                <dd className="text-charcoal">{money0(item.estimated_value)}</dd>
              </div>
            </dl>
          </section>

          {item.usage_guide.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg">How to use it</h2>
              <ol className="list-inside list-decimal space-y-1.5 text-sm">
                {item.usage_guide.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ol>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg">Lender</h2>
            <div className="card flex flex-wrap items-center gap-4 p-4">
              <Link to={`/users/${item.owner.id}`} className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-ink text-lg font-bold text-gold">
                {item.owner.avatar_url ? <img src={item.owner.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(item.owner.name)}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/users/${item.owner.id}`} className="font-bold underline-offset-2 hover:underline">
                  {item.owner.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {item.owner.verified && <VerifiedBadge affiliation={item.owner.affiliation} />}
                  <Stars value={item.owner.rating_avg} count={item.owner.rating_count} />
                </div>
                <p className="mt-1 text-xs text-charcoal">
                  {item.owner.lent_count} items lent · {item.owner.rentals_count} rentals total
                </p>
              </div>
            </div>
            {item.owner_reviews.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {item.owner_reviews.map((r) => (
                  <li key={r.id} className="rounded-card border border-line p-3 text-sm">
                    <Stars value={r.rating} size={12} showNumber={false} />
                    <p className="mt-1">{r.text}</p>
                    <p className="mt-1 text-xs text-charcoal">
                      {r.author_name}
                      {r.listing_title ? ` · ${r.listing_title}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-charcoal">No reviews yet.</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg">Meetup</h2>
            <p className="text-sm text-charcoal">
              Pickup is at <span className="font-semibold text-ink">{item.pickup.area_name}</span>
              {spot ? `, a public campus spot (${spot.hours}). ${spot.accessibility}` : ". You can suggest any public campus spot after you book."}
            </p>
            {meta && (
              <>
                <CampusMap center={[item.pickup.lat, item.pickup.lng]} zoom={15} spots={meta.pickup_spots} highlight={{ lat: item.pickup.lat, lng: item.pickup.lng, label: "Pickup" }} height={300} />
                <MapLegend />
              </>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg">Cancellation rules</h2>
            {meta ? (
              <ul className="list-inside list-disc space-y-1 text-sm">
                {meta.cancellation_rules.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <Loading />
            )}
          </section>

        </div>

        <aside className="row-start-2 lg:row-start-auto" aria-label="Request to rent">
          <div className="lg:sticky lg:top-20">
            <RequestPanel item={item} />
          </div>
        </aside>
      </div>
      {!item.is_owner && (
        <a href="#request" className="btn-primary fixed inset-x-4 bottom-[76px] z-20 py-3 shadow-card lg:hidden">
          {money0(item.prices.day)}/day · Choose dates
        </a>
      )}
    </div>
  );
}
