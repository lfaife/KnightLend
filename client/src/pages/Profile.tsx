import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { UnverifiedBadge, VerifiedBadge } from "../components/Badges";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import { ReportButton } from "../components/ReportButton";
import { RequireAuth } from "../components/RequireAuth";
import { Empty, ErrorState, Loading, Notice } from "../components/States";
import { Stars } from "../components/Stars";
import { useAuth } from "../context/auth";
import { api, type Review } from "../lib/api";
import { day, initials } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useMeta } from "../lib/useMeta";

export function MyProfile() {
  const { user } = useAuth();
  return <RequireAuth title="Sign in to see your profile">{user && <ProfileView id={user.id} />}</RequireAuth>;
}

export default function UserProfile() {
  const { id = "" } = useParams();
  return <ProfileView id={id} />;
}

function Reviews({ items, empty }: { items: Review[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-charcoal">{empty}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.slice(0, 8).map((r) => (
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
  );
}

function EditProfile({ onDone }: { onDone: () => void }) {
  const { user, refresh } = useAuth();
  const meta = useMeta();
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [major, setMajor] = useState(user?.major ?? "");
  const [area, setArea] = useState(user?.home_area ?? "");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Name
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Major
          <input className="input mt-1" value={major} onChange={(e) => setMajor(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Where you live (used for distances; only the area is shown)
        <select className="input mt-1" value={area} onChange={(e) => setArea(e.target.value)}>
          {meta?.areas.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        About you
        <textarea className="input mt-1" rows={2} maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      {err && <Notice tone="danger" title={err} />}
      <div className="flex gap-2">
        <button
          className="btn-primary btn-sm"
          onClick={async () => {
            try {
              await api.users.updateMe({ name, bio, major, ...(area ? { home_area: area } : {}) });
              await refresh();
              onDone();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Couldn't save.");
            }
          }}
        >
          Save
        </button>
        <button className="btn-secondary btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProfileView({ id }: { id: string }) {
  const { user: me, refresh } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.users.profile(id), [id]);
  const [editing, setEditing] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  if (loading) return <Loading label="Loading profile" />;
  if (error || !data) return <div className="page"><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;
  const u = data.user;

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-start gap-4">
        <div className="relative">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-ink text-2xl font-bold text-gold">
            {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(u.name)}
          </div>
          {data.is_me && (
            <label className="absolute -bottom-1 -right-1 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-paper bg-gold" title="Change photo">
              <Icon name="camera" size={14} />
              <span className="sr-only">Change profile photo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    await api.users.avatar(f);
                    await refresh();
                    reload();
                  } catch (er) {
                    setAvatarErr(er instanceof Error ? er.message : "Upload failed.");
                  }
                }}
              />
            </label>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl md:text-3xl">{u.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {u.verified ? <VerifiedBadge affiliation={u.affiliation} /> : <UnverifiedBadge />}
            <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold">
              {u.affiliation === "alumni" ? `UCF alum${u.grad_year ? `, class of ${u.grad_year}` : ""}` : `UCF student${u.grad_year ? `, class of ${u.grad_year}` : ""}`}
            </span>
            {u.role === "moderator" && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-paper">Moderator</span>}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-charcoal">
            <Stars value={u.rating_avg} count={u.rating_count} />
            <span>{u.lent_count} lent</span>
            <span>{u.borrowed_count} borrowed</span>
            {u.major && <span>{u.major}</span>}
            <span>{u.home_area}</span>
          </p>
          {u.bio && <p className="max-w-prose pt-1">{u.bio}</p>}
        </div>
        {data.is_me && !editing && (
          <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        )}
      </header>
      {avatarErr && <Notice tone="danger" title={avatarErr} />}
      {editing && <EditProfile onDone={() => { setEditing(false); reload(); }} />}

      {data.is_me && me && !me.verified && (
        <Notice tone="hold" title="Verify your UCF status">
          Verified members get a badge, and you need it to list items. <Link to="/verify" className="font-semibold underline">Verify now</Link>
        </Notice>
      )}
      {data.is_me && me?.restricted && (
        <Notice tone="danger" title="Your account is restricted">
          You can't list or request items right now. {me.restricted_reason}
        </Notice>
      )}
      {!data.is_me && u.restricted && <Notice tone="danger" title="This member is restricted and can't list or request items right now." />}

      <section className="space-y-3">
        <h2 className="text-lg">Current listings</h2>
        {data.listings.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.listings.map((l) => (
              <ListingCard key={l.id} item={l} />
            ))}
          </div>
        ) : (
          <Empty title="No listings right now" action={data.is_me ? <Link to="/list" className="btn-primary">List an item</Link> : undefined} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">Reviews as a lender ({data.reviews_as_lender.length})</h2>
        <Reviews items={data.reviews_as_lender} empty="No lender reviews yet." />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg">Reviews as a borrower ({data.reviews_as_borrower.length})</h2>
        <Reviews items={data.reviews_as_borrower} empty="No borrower reviews yet." />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">Past rentals</h2>
        {data.past_rentals.length ? (
          <ul className="divide-y divide-line rounded-card border border-line">
            {data.past_rentals.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span className="font-semibold capitalize">{p.role}</span> {p.listing_title}
                </span>
                <span className="text-charcoal">
                  {day(p.start_date)} to {day(p.end_date)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-charcoal">No completed rentals yet.</p>
        )}
      </section>

      {!data.is_me && me && <ReportButton targetType="user" targetId={u.id} label={`Report ${u.name.split(" ")[0]}`} />}
      {data.is_me && me?.role === "moderator" && (
        <Link to="/moderation" className="btn-primary">
          Open moderation
        </Link>
      )}
    </div>
  );
}
