import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../components/Badges";
import { RequireAuth } from "../components/RequireAuth";
import { MessageThread } from "../components/rental/RentalExtras";
import { Empty, ErrorState, Loading } from "../components/States";
import { api, type Conversation } from "../lib/api";
import { when } from "../lib/format";

export default function Messages() {
  return (
    <RequireAuth title="Sign in to see your messages">
      <MessagesView />
    </RequireAuth>
  );
}

function MessagesView() {
  const [sp, setSp] = useSearchParams();
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = sp.get("rental");

  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .conversations()
        .then((c) => live && setConvos(c))
        .catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (error && !convos) return <div className="page"><ErrorState message={error} /></div>;
  if (!convos) return <Loading label="Loading messages" />;
  const current = convos.find((c) => c.rental_id === active);

  return (
    <div className="page">
      <h1 className="mb-1 text-2xl">Messages</h1>
      <p className="mb-4 text-sm text-charcoal">One conversation per rental. Phone numbers and emails are hidden to protect your personal info.</p>
      {convos.length === 0 ? (
        <Empty icon="chat" title="No conversations yet" body="When you request or lend an item, you can message the other person here." action={<Link to="/browse" className="btn-primary">Browse items</Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
          <ul className={`min-w-0 space-y-2 ${active ? "hidden md:block" : ""}`} aria-label="Conversations">
            {convos.map((c) => (
              <li key={c.rental_id}>
                <button
                  onClick={() => setSp({ rental: c.rental_id })}
                  aria-current={c.rental_id === active}
                  className={`flex w-full items-start gap-3 rounded-card border p-3 text-left ${c.rental_id === active ? "border-ink bg-mist" : "border-line hover:border-ink"}`}
                >
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink">{c.listing_photo && <img src={c.listing_photo} alt="" className="h-full w-full object-cover" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">{c.other_party.name}</span>
                      {c.unread > 0 && <span className="rounded-full bg-gold px-1.5 text-xs font-bold text-ink">{c.unread}</span>}
                    </span>
                    <span className="block truncate text-xs text-charcoal">{c.listing_title}</span>
                    <span className="block truncate text-xs">{c.last_message ?? "No messages yet"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section className={`${active ? "" : "hidden md:block"} min-w-0`}>
            {current ? (
              <div className="card space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <button className="mb-1 text-xs font-semibold underline md:hidden" onClick={() => setSp({})}>
                      All conversations
                    </button>
                    <p className="font-bold">{current.other_party.name}</p>
                    <Link to={`/rentals/${current.rental_id}`} className="text-sm underline">
                      {current.listing_title}
                    </Link>
                  </div>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={current.status} label={current.status_label} />
                    {current.last_at && <span className="text-xs text-charcoal">{when(current.last_at)}</span>}
                  </span>
                </div>
                <MessageThread key={current.rental_id} rentalId={current.rental_id} canSend={current.status !== "rejected"} />
              </div>
            ) : (
              <Empty icon="chat" title="Pick a conversation" body="Choose a rental on the left to see its messages." />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
