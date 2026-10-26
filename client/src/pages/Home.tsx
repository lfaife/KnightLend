import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import { ErrorState, Loading } from "../components/States";
import { useAuth } from "../context/auth";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useMeta } from "../lib/useMeta";

const SAFETY = [
  { icon: "lock", title: "Protection hold on every rental", body: "A temporary hold on the borrower's card covers damage, late returns and no-shows. It's released after a clean return." },
  { icon: "check", title: "Verified Knights only", body: "Every member verifies a UCF student email or alumni status before they can lend." },
  { icon: "camera", title: "Condition photos at both ends", body: "Both sides add photos at pickup and return. They're the evidence if there's ever a question." },
  { icon: "pin", title: "Public campus meetups", body: "Hand off at the Student Union, the Library and other busy campus spots." },
];

export default function Home() {
  const nav = useNavigate();
  const meta = useMeta();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const nearby = useAsync(() => api.listings.search({ sort: "nearby", page_size: 8, origin: "student-union" }), []);

  const go = (e: FormEvent) => {
    e.preventDefault();
    nav(q.trim() ? `/browse?q=${encodeURIComponent(q.trim())}` : "/browse");
  };

  return (
    <div className="pb-24 md:pb-0">
      <section className="on-dark bg-ink text-paper">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:py-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gold">For UCF students and alumni</p>
            <h1 className="mt-3 text-4xl leading-tight text-paper md:text-5xl">Rent it from a Knight nearby. Return it the same way.</h1>
            <p className="mt-4 max-w-xl text-paper/80">
              Why buy a $40 calculator for one exam? Borrow it from someone on campus who isn't using theirs, and lend out what you own when it's sitting in your closet.
            </p>
            <form onSubmit={go} className="mt-6 flex max-w-xl gap-2" role="search">
              <label htmlFor="home-q" className="sr-only">
                What do you need?
              </label>
              <input id="home-q" className="input border-0 py-3" placeholder="What do you need? A GoPro, a drill, a gown…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn-primary px-5">Search</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {meta?.shortcuts.slice(0, 4).map((s) => (
                <Link
                  key={s.id}
                  to={`/browse?shortcut=${s.id}${s.category ? `&category=${s.category}` : ""}${s.tag ? `&tag=${encodeURIComponent(s.tag)}` : ""}`}
                  className="rounded-full border border-gold/70 px-3 py-1 text-xs font-semibold text-paper hover:bg-gold hover:text-ink"
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="grid content-center gap-3">
            <div className="rounded-card border border-paper/15 p-4">
              <p className="text-sm font-semibold text-gold">How the protection hold works</p>
              <ol className="mt-2 space-y-2 text-sm text-paper/85">
                <li className="flex gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-bold text-ink">1</span>
                  You pay the rental fee. A protection hold is placed on your card, like a hotel does.
                </li>
                <li className="flex gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-bold text-ink">2</span>
                  Return it in the same condition and the hold is released within 3 days.
                </li>
                <li className="flex gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-bold text-ink">3</span>
                  Only if something goes wrong can the lender claim up to the held amount.
                </li>
              </ol>
              <Link to="/safety" className="mt-3 inline-block text-sm font-semibold text-paper underline">
                Read the details
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl">Close to the Student Union</h2>
            <p className="text-sm text-charcoal">Nearest pickups first.</p>
          </div>
          <Link to="/browse" className="btn-secondary btn-sm">
            See everything
          </Link>
        </div>
        {nearby.loading && <Loading label="Loading items" />}
        {nearby.error && <ErrorState message={nearby.error} onRetry={nearby.reload} />}
        {nearby.data && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {nearby.data.items.map((it) => (
              <ListingCard key={it.id} item={it} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-mist">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="text-2xl">Lending that feels safe</h2>
          <p className="mt-1 max-w-2xl text-sm text-charcoal">Your stuff, your rules. You set the price, the hold amount, how long it can be out, and whether you approve each request.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SAFETY.map((s) => (
              <div key={s.title} className="card p-4">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold">
                  <Icon name={s.icon} size={18} />
                </span>
                <h3 className="mt-3 text-base">{s.title}</h3>
                <p className="mt-1 text-sm text-charcoal">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/list" className="btn-primary">
              List an item
            </Link>
            {!user && (
              <Link to="/signup" className="btn-secondary">
                Create an account
              </Link>
            )}
          </div>
        </div>
      </section>

      {meta && (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="text-2xl">Browse by class or major</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {meta.shortcuts.map((s) => (
              <Link
                key={s.id}
                to={`/browse?shortcut=${s.id}${s.category ? `&category=${s.category}` : ""}${s.tag ? `&tag=${encodeURIComponent(s.tag)}` : ""}`}
                className="card flex items-center justify-between gap-3 p-4 hover:border-ink"
              >
                <span>
                  <span className="block font-bold">{s.label}</span>
                  <span className="text-sm text-charcoal">{s.hint}</span>
                </span>
                <Icon name="chevron" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
