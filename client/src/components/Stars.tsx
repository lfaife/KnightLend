export function Stars({ value, count, size = 14, showNumber = true }: { value: number; count?: number; size?: number; showNumber?: boolean }) {
  const full = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-1" aria-label={count !== undefined ? `${value.toFixed(1)} out of 5 stars, ${count} reviews` : `${value} out of 5 stars`}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs>
              <linearGradient id={`half-${i}-${size}`}>
                <stop offset="50%" stopColor="#FFC904" />
                <stop offset="50%" stopColor="#E0E0E0" />
              </linearGradient>
            </defs>
            <path
              d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
              fill={full >= i ? "#FFC904" : full >= i - 0.5 ? `url(#half-${i}-${size})` : "#E0E0E0"}
              stroke="#000"
              strokeWidth={0.8}
            />
          </svg>
        ))}
      </span>
      {showNumber && (
        <span className="text-xs font-semibold text-ink tabular">
          {value ? value.toFixed(1) : "New"}
          {count !== undefined && <span className="font-normal text-charcoal"> ({count})</span>}
        </span>
      )}
    </span>
  );
}
