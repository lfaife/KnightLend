import { Link } from "react-router-dom";
import type { ListingCard as Card } from "../lib/api";
import { CONDITION_LABEL, miles, money0 } from "../lib/format";
import { HoldChip, VerifiedBadge } from "./Badges";
import { Icon } from "./Icon";
import { Stars } from "./Stars";

export function ListingCard({ item }: { item: Card }) {
  return (
    <Link to={`/listings/${item.id}`} className="card group flex min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-card focus-visible:shadow-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-ink">
        {item.photo && <img src={item.photo} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />}
        {item.sanitized && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink">
            <Icon name="sparkle" size={11} /> Sanitized
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">{item.title}</h3>
        <p className="text-sm">
          <span className="font-bold tabular">{money0(item.prices.day)}</span>
          <span className="text-charcoal">/day</span>
          {item.prices.week && (
            <>
              <span className="text-charcoal"> · </span>
              <span className="font-bold tabular">{money0(item.prices.week)}</span>
              <span className="text-charcoal">/week</span>
            </>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-charcoal">
          <span className="inline-flex items-center gap-0.5">
            <Icon name="pin" size={12} /> {miles(item.distance_miles)}
          </span>
          <span>{CONDITION_LABEL[item.condition]}</span>
          {!item.requires_approval && <span className="font-semibold text-ink">Instant book</span>}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5 pt-1.5">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Stars value={item.owner.rating_avg} size={12} />
            {item.owner.verified && <VerifiedBadge compact />}
          </span>
          <HoldChip amount={item.hold_amount} />
        </div>
      </div>
    </Link>
  );
}
