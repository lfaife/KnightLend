import { Link, useParams } from "react-router-dom";
import { HoldBadge, StatusBadge } from "../components/Badges";
import { CostSummary } from "../components/Money";
import { RequireAuth } from "../components/RequireAuth";
import { ErrorState, Loading, Notice } from "../components/States";
import { api } from "../lib/api";
import { day } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function RentalPage() {
  return (
    <RequireAuth>
      <RentalView />
    </RequireAuth>
  );
}

function RentalView() {
  const { id = "" } = useParams();
  const { data: r, error, loading, reload } = useAsync(() => api.rentals.get(id), [id]);
  if (loading) return <Loading label="Loading rental" />;
  if (error || !r)
    return (
      <div className="page">
        <ErrorState message={error ?? "Not found"} onRetry={reload} />
      </div>
    );
  return (
    <div className="page max-w-3xl space-y-5">
      <Link to={`/listings/${r.listing.id}`} className="text-sm font-semibold underline">
        {r.listing.title}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl">Your rental</h1>
        <StatusBadge status={r.status} label={r.status_label} />
        {r.hold && <HoldBadge status={r.hold.status} expires={r.hold.expires_at} captured={r.hold.captured_amount} />}
      </div>
      <p className="text-sm text-charcoal">
        {day(r.start_date)} to {day(r.end_date)}
      </p>
      <Notice title="Next step">{r.next_step}</Notice>
      <div className="card p-4">
        <CostSummary quote={r.quote} bundleName={r.bundle_name} />
      </div>
    </div>
  );
}
