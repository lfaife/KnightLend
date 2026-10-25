import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { CampusMap, MapLegend } from "../components/CampusMap";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import { Empty, ErrorState, Loading } from "../components/States";
import { useAuth } from "../context/auth";
import { api, type SearchParams } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useMeta } from "../lib/useMeta";

const NUM_KEYS = ["min_price", "max_price", "max_distance", "max_hold", "min_rating", "page"] as const;

function paramsToSearch(sp: URLSearchParams): SearchParams {
  const p: SearchParams = {};
  const str = (k: string) => sp.get(k) || undefined;
  p.q = str("q");
  p.category = str("category");
  p.tag = str("tag");
  p.available_from = str("from");
  p.available_to = str("to");
  p.origin = str("origin");
  p.sort = (str("sort") as SearchParams["sort"]) ?? "nearby";
  for (const k of NUM_KEYS) {
    const v = sp.get(k);
    if (v) (p as Record<string, number>)[k] = Number(v);
  }
  const cond = sp.getAll("condition");
  if (cond.length) p.condition = cond;
  if (sp.get("sanitized") === "1") p.sanitized = true;
  if (sp.get("no_approval") === "1") p.no_approval = true;
  return p;
}

export default function Browse() {
  const [sp, setSp] = useSearchParams();
  const meta = useMeta();
  const { user } = useAuth();
  const view = sp.get("view") === "map" ? "map" : "list";
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const search = useMemo(() => paramsToSearch(sp), [sp]);
  const key = sp.toString();
  const { data, error, loading, reload } = useAsync(
    () => api.listings.search({ ...search, page_size: view === "map" ? 60 : 12, page: view === "map" ? 1 : search.page }),
    [key, view],
  );

  const update = (changes: Record<string, string | string[] | null>, keepPage = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(changes)) {
      next.delete(k);
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
      else if (v !== null && v !== "") next.set(k, v);
    }
    if (!keepPage) next.delete("page");
    setSp(next, { replace: false });
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    update({ q: q.trim() || null });
  };

  const activeFilters = ["category", "tag", "min_price", "max_price", "max_distance", "condition", "from", "to", "max_hold", "min_rating", "sanitized", "no_approval"].filter((k) =>
    sp.has(k),
  ).length;

  const conditions = sp.getAll("condition");
  const toggleCondition = (c: string) => update({ condition: conditions.includes(c) ? conditions.filter((x) => x !== c) : [...conditions, c] });

  return (
    <div className="page">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl">Browse items near campus</h1>
            <p className="text-sm text-charcoal">Closest pickups first. Every rental is covered by a protection hold.</p>
          </div>
          <div className="flex rounded-lg border-2 border-ink p-0.5" role="group" aria-label="View">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                onClick={() => update({ view: v === "list" ? null : v }, true)}
                aria-pressed={view === v}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${view === v ? "bg-gold text-ink" : "text-ink"}`}
              >
                <Icon name={v === "list" ? "list" : "map"} size={16} /> {v === "list" ? "List" : "Map"}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submitSearch} className="flex gap-2" role="search">
          <label htmlFor="browse-q" className="sr-only">
            Search items
          </label>
          <div className="relative flex-1">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-charcoal" />
            <input id="browse-q" className="input pl-10" placeholder="Try “financial calculator”, “GoPro” or “drill”" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-primary">Search</button>
        </form>

        {meta && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Browse by class or major">
            {meta.shortcuts.map((s) => {
              const on = sp.get("shortcut") === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => (on ? update({ shortcut: null, category: null, tag: null }) : update({ shortcut: s.id, category: s.category, tag: s.tag }))}
                  className={`chip shrink-0 py-1.5 ${on ? "chip-on" : ""}`}
                  aria-pressed={on}
                >
                  {s.label}
                  <span className={`hidden font-normal sm:inline ${on ? "text-paper/80" : "text-charcoal"}`}>· {s.hint}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary btn-sm md:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="filters">
            <Icon name="list" size={14} /> Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
            <span className="shrink-0 font-semibold">Distance from</span>
            <select className="input min-w-0 py-1.5 sm:w-auto" value={sp.get("origin") ?? ""} onChange={(e) => update({ origin: e.target.value || null })}>
              <option value="">Student Union</option>
              {meta?.pickup_spots.slice(1).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {meta?.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 font-semibold">Sort</span>
            <select className="input min-w-0 py-1.5 sm:w-auto" value={sp.get("sort") ?? "nearby"} onChange={(e) => update({ sort: e.target.value === "nearby" ? null : e.target.value })}>
              <option value="nearby">Nearby first</option>
              <option value="price">Lowest price</option>
              <option value="rating">Top-rated lenders</option>
              <option value="newest">Newest</option>
            </select>
          </label>
          {activeFilters > 0 && (
            <button
              className="text-sm font-semibold underline"
              onClick={() => update({ category: null, tag: null, shortcut: null, min_price: null, max_price: null, max_distance: null, condition: [], from: null, to: null, max_hold: null, min_rating: null, sanitized: null, no_approval: null })}
            >
              Clear filters
            </button>
          )}
          {user && <span className="ml-auto hidden text-xs text-charcoal lg:inline">Signed in as {user.name}</span>}
        </div>

        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          <aside id="filters" className={`${showFilters ? "block" : "hidden"} space-y-5 md:block`} aria-label="Filters">
            <div>
              <label htmlFor="f-cat" className="field-label">Category</label>
              <select id="f-cat" className="input" value={sp.get("category") ?? ""} onChange={(e) => update({ category: e.target.value || null, shortcut: null })}>
                <option value="">All categories</option>
                {meta?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="field-label">Price per day</legend>
              <div className="flex items-center gap-2">
                <input aria-label="Minimum price per day" inputMode="decimal" className="input" key={`min-${sp.get("min_price") ?? ""}`} placeholder="Min $" defaultValue={sp.get("min_price") ?? ""} onBlur={(e) => update({ min_price: e.target.value || null })} />
                <span>to</span>
                <input aria-label="Maximum price per day" inputMode="decimal" className="input" key={`max-${sp.get("max_price") ?? ""}`} placeholder="Max $" defaultValue={sp.get("max_price") ?? ""} onBlur={(e) => update({ max_price: e.target.value || null })} />
              </div>
            </fieldset>
            <div>
              <label htmlFor="f-dist" className="field-label">Distance</label>
              <select id="f-dist" className="input" value={sp.get("max_distance") ?? ""} onChange={(e) => update({ max_distance: e.target.value || null })}>
                <option value="">Any distance</option>
                <option value="0.5">Within 0.5 mi</option>
                <option value="1">Within 1 mi</option>
                <option value="3">Within 3 mi</option>
                <option value="10">Within 10 mi</option>
              </select>
            </div>
            <fieldset>
              <legend className="field-label">Condition</legend>
              <div className="flex flex-wrap gap-1.5">
                {meta?.conditions.map((c) => (
                  <button key={c.id} type="button" onClick={() => toggleCondition(c.id)} aria-pressed={conditions.includes(c.id)} className={`chip ${conditions.includes(c.id) ? "chip-on" : ""}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">Available</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  From
                  <input type="date" className="input mt-1 px-2" value={sp.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || null })} />
                </label>
                <label className="text-xs">
                  To
                  <input type="date" className="input mt-1 px-2" value={sp.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || null })} />
                </label>
              </div>
            </fieldset>
            <div>
              <label htmlFor="f-hold" className="field-label">Protection hold</label>
              <select id="f-hold" className="input" value={sp.get("max_hold") ?? ""} onChange={(e) => update({ max_hold: e.target.value || null })}>
                <option value="">Any amount</option>
                <option value="15">Up to $15</option>
                <option value="50">Up to $50</option>
                <option value="100">Up to $100</option>
                <option value="150">Up to $150</option>
              </select>
              <p className="field-hint">The most that could be held on your card. It's only charged if something goes wrong.</p>
            </div>
            <div>
              <label htmlFor="f-rating" className="field-label">Lender rating</label>
              <select id="f-rating" className="input" value={sp.get("min_rating") ?? ""} onChange={(e) => update({ min_rating: e.target.value || null })}>
                <option value="">Any rating</option>
                <option value="4">4 stars and up</option>
                <option value="4.5">4.5 stars and up</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-black" checked={sp.get("sanitized") === "1"} onChange={(e) => update({ sanitized: e.target.checked ? "1" : null })} />
                Sanitized between rentals
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-black" checked={sp.get("no_approval") === "1"} onChange={(e) => update({ no_approval: e.target.checked ? "1" : null })} />
                Instant book (no approval needed)
              </label>
            </div>
          </aside>

          <section className="min-w-0" aria-live="polite" aria-busy={loading}>
            {loading && <Loading label="Finding items" />}
            {error && <ErrorState message={error} onRetry={reload} />}
            {data && !loading && (
              <>
                <p className="mb-3 text-sm text-charcoal">
                  {data.total} {data.total === 1 ? "item" : "items"} · distance from {data.origin_label}
                </p>
                {data.total === 0 ? (
                  <Empty icon="search" title="Nothing matches yet" body="Try fewer filters, a different date range, or a broader search." />
                ) : view === "map" ? (
                  <div className="space-y-2">
                    <CampusMap center={meta?.campus_center ?? [28.6024, -81.2001]} zoom={14} listings={data.items} spots={meta?.pickup_spots} areas={meta?.areas} height={520} />
                    <MapLegend />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                      {data.items.map((it) => (
                        <ListingCard key={it.id} item={it} />
                      ))}
                    </div>
                    {data.pages > 1 && (
                      <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pages">
                        <button className="btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) }, true)}>
                          Previous
                        </button>
                        <span className="text-sm tabular">
                          Page {data.page} of {data.pages}
                        </span>
                        <button className="btn-secondary btn-sm" disabled={data.page >= data.pages} onClick={() => update({ page: String(data.page + 1) }, true)}>
                          Next
                        </button>
                      </nav>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
