import { Link, useSearchParams } from "react-router-dom";
import { HoldBadge, StatusBadge } from "../components/Badges";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import { RequireAuth } from "../components/RequireAuth";
import { Empty, ErrorState, Loading, Notice } from "../components/States";
import { useAuth } from "../context/auth";
import { api, type MoneySide, type RentalSummary } from "../lib/api";
import { day, money, when } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const TABS = [
  { id: "rentals", label: "My Rentals" },
  { id: "listings", label: "My Listings" },
  { id: "requests", label: "Requests" },
  { id: "messages", label: "Messages" },
  { id: "history", label: "History" },
  { id: "saved", label: "Saved Items" },
] as const;

export default function Dashboard() {
  return (
    <RequireAuth title="Sign in to see your dashboard">
      <DashboardView />
    </RequireAuth>
  );
}

function Stat({ label, value, tone = "plain", note }: { label: string; value: number; tone?: "plain" | "held" | "released" | "captured"; note: string }) {
  const style = { plain: "border border-line bg-paper", held: "bg-gold", released: "border border-success bg-success-soft", captured: "border border-danger bg-danger-soft" }[tone];
  const valueColor = { plain: "text-ink", held: "text-ink", released: "text-success", captured: "text-danger" }[tone];
  return (
    <div className={`rounded-card p-3 ${style}`}>
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
        {tone === "held" && <Icon name="lock" size={12} />}
        {label}
      </p>
      <p className={`text-xl font-extrabold tabular ${valueColor}`}>{money(value)}</p>
      <p className="text-xs text-charcoal">{note}</p>
    </div>
  );
}

function MoneySummary({ b, l }: { b: MoneySide; l: MoneySide }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-base">As a borrower</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Charged" value={b.charged} note="Rental fees you paid, plus any claims" />
          <Stat label="Held, not charged" value={b.held} tone="held" note={b.pending_holds ? `${money(b.pending_holds)} more once requests are approved` : "On your card right now"} />
          <Stat label="Released" value={b.released} tone="released" note="Holds returned to you" />
          <Stat label="Captured" value={b.captured} tone="captured" note="Charged from holds after claims" />
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-base">As a lender</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Earned" value={l.earned} note="Rental fees you keep, plus approved claims" />
          <Stat label="Held, not charged" value={l.held} tone="held" note="Protecting your items right now" />
          <Stat label="Released" value={l.released} tone="released" note="Returned to borrowers after clean returns" />
          <Stat label="Captured for you" value={l.captured} tone="captured" note="Paid to you from approved claims" />
        </div>
      </section>
    </div>
  );
}

function RentalRow({ r }: { r: RentalSummary }) {
  return (
    <Link to={`/rentals/${r.id}`} className={`card flex flex-wrap items-center gap-3 p-3 hover:border-ink ${r.needs_action ? "border-ink" : ""}`}>
      <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-ink">{r.listing.photo && <img src={r.listing.photo} alt="" className="h-full w-full object-cover" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{r.listing.title}</span>
        <span className="block text-xs text-charcoal">
          {r.my_role === "borrower" ? "From" : "To"} {r.other_party.name} · {day(r.start_date)} to {day(r.end_date)}
        </span>
        <span className="mt-1 block text-xs">{r.next_step}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {r.needs_action && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-gold">Your turn</span>}
        {r.unread_messages > 0 && <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-ink">{r.unread_messages} new</span>}
        <StatusBadge status={r.status} label={r.status_label} />
        {r.hold_status && <HoldBadge status={r.hold_status} expires={r.hold_expires_at} />}
      </span>
    </Link>
  );
}

function RentalList({ items, empty }: { items: RentalSummary[]; empty: React.ReactNode }) {
  if (!items.length) return <>{empty}</>;
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id}>
          <RentalRow r={r} />
        </li>
      ))}
    </ul>
  );
}

function DashboardView() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as (typeof TABS)[number]["id"]) ?? "rentals";
  const dash = useAsync(() => api.dashboard(), []);
  const rentals = useAsync(() => api.rentals.list("all", "all"), []);

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">Hi, {user?.name.split(" ")[0]}</h1>
          <p className="text-sm text-charcoal">Everything you're borrowing and lending, in one place.</p>
        </div>
        <div className="flex gap-2">
          {user?.role === "moderator" && (
            <Link to="/moderation" className="btn-secondary btn-sm">
              Moderation
            </Link>
          )}
          <Link to="/list" className="btn-primary btn-sm">
            <Icon name="plus" size={14} /> List an item
          </Link>
        </div>
      </div>

      {user?.restricted && (
        <Notice tone="danger" title="Your account is restricted">
          You can't list or request items right now. {user.restricted_reason}
        </Notice>
      )}

      {dash.loading && <Loading label="Loading your summary" />}
      {dash.error && <ErrorState message={dash.error} onRetry={dash.reload} />}
      {dash.data && (
        <>
          {dash.data.reminders.length > 0 && (
            <section className="rounded-card border-2 border-ink p-4" aria-label="Reminders">
              <h2 className="mb-2 flex items-center gap-2 text-base">
                <Icon name="bell" size={18} /> Needs your attention
              </h2>
              <ul className="space-y-1.5">
                {dash.data.reminders.map((m, i) => (
                  <li key={i}>
                    <Link to={`/rentals/${m.rental_id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-mist">
                      <span>{m.text}</span>
                      <Icon name="chevron" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <MoneySummary b={dash.data.borrowing} l={dash.data.lending} />
        </>
      )}

      <div>
        <div className="-mx-4 overflow-x-auto px-4" role="tablist" aria-label="Dashboard sections">
          <div className="flex min-w-max gap-1 border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setSp({ tab: t.id })}
                className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.id ? "border-ink bg-gold text-ink" : "border-transparent text-charcoal hover:text-ink"}`}
              >
                {t.label}
                {t.id === "requests" && dash.data?.counts.requests_to_review ? ` (${dash.data.counts.requests_to_review})` : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-4" role="tabpanel">
          {tab === "listings" ? (
            <MyListings />
          ) : tab === "messages" ? (
            <MessagesTab />
          ) : tab === "saved" ? (
            <SavedTab />
          ) : rentals.loading ? (
            <Loading />
          ) : rentals.error ? (
            <ErrorState message={rentals.error} onRetry={rentals.reload} />
          ) : (
            <RentalTabs tab={tab} items={rentals.data ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

function RentalTabs({ tab, items }: { tab: string; items: RentalSummary[] }) {
  const finished = (r: RentalSummary) => ["completed", "rejected", "cancelled"].includes(r.status);
  if (tab === "requests") {
    const incoming = items.filter((r) => r.my_role === "lender" && ["requested", "approved"].includes(r.status));
    const outgoing = items.filter((r) => r.my_role === "borrower" && ["requested", "approved"].includes(r.status));
    return (
      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-base">Requests for your items</h2>
          <RentalList items={incoming} empty={<Empty title="No requests right now" body="When someone asks to rent one of your items, it shows up here." />} />
        </section>
        <section className="space-y-2">
          <h2 className="text-base">Your requests</h2>
          <RentalList items={outgoing} empty={<Empty title="You haven't requested anything yet" action={<Link to="/browse" className="btn-primary">Browse items</Link>} />} />
        </section>
      </div>
    );
  }
  if (tab === "history") {
    return <RentalList items={items.filter(finished)} empty={<Empty title="No finished rentals yet" />} />;
  }
  const active = items.filter((r) => !finished(r) && !["requested"].includes(r.status));
  const borrowing = active.filter((r) => r.my_role === "borrower");
  const lending = active.filter((r) => r.my_role === "lender");
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-base">Borrowing</h2>
        <RentalList items={borrowing} empty={<Empty title="Nothing borrowed right now" body="Find something you need for a class or a weekend." action={<Link to="/browse" className="btn-primary">Browse items</Link>} />} />
      </section>
      <section className="space-y-2">
        <h2 className="text-base">Lending</h2>
        <RentalList items={lending} empty={<Empty title="None of your items are out" body="List something you aren't using and earn from it." action={<Link to="/list" className="btn-primary">List an item</Link>} />} />
      </section>
    </div>
  );
}

function MyListings() {
  const { data, error, loading, reload } = useAsync(() => api.listings.mine(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <Empty title="You haven't listed anything yet" body="Students near you are looking for calculators, cameras, tools and more." action={<Link to="/list" className="btn-primary">List an item</Link>} />;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {data.map((m) => (
        <div key={m.card.id} className="space-y-2">
          <ListingCard item={m.card} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${m.status === "paused" ? "bg-mist text-charcoal" : "bg-success-soft text-success"}`}>{m.status === "paused" ? "Paused" : "Live"}</span>
            <span className="text-charcoal">
              {m.open_rentals} open · {m.rentals_count} done
            </span>
            <Link to={`/list/${m.card.id}`} className="font-semibold underline">
              Edit
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function MessagesTab() {
  const { data, error, loading, reload } = useAsync(() => api.conversations(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <Empty icon="chat" title="No conversations yet" />;
  return (
    <ul className="space-y-2">
      {data.slice(0, 8).map((c) => (
        <li key={c.rental_id}>
          <Link to={`/messages?rental=${c.rental_id}`} className="card flex items-center gap-3 p-3 hover:border-ink">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {c.other_party.name} <span className="font-normal text-charcoal">· {c.listing_title}</span>
              </span>
              <span className="block truncate text-sm text-charcoal">{c.last_message ?? "No messages yet"}</span>
            </span>
            <span className="text-xs text-charcoal">{when(c.last_at)}</span>
            {c.unread > 0 && <span className="rounded-full bg-gold px-2 text-xs font-bold text-ink">{c.unread}</span>}
          </Link>
        </li>
      ))}
      <li>
        <Link to="/messages" className="text-sm font-semibold underline">
          Open all messages
        </Link>
      </li>
    </ul>
  );
}

function SavedTab() {
  const { data, error, loading, reload } = useAsync(() => api.listings.saved(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <Empty icon="heart" title="No saved items" body="Tap Save on any listing to keep it here." action={<Link to="/browse" className="btn-primary">Browse items</Link>} />;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {data.map((it) => (
        <ListingCard key={it.id} item={it} />
      ))}
    </div>
  );
}
