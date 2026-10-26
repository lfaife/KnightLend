import { Link } from "react-router-dom";

/** Original KnightLend mark: a gold shield with a keyhole. Not based on any university logo. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 6 7v7.6c0 6.2 4.2 11.5 10 13.4 5.8-1.9 10-7.2 10-13.4V7L16 3Z" fill="#FFC904" />
      <circle cx="16" cy="13.5" r="3.2" fill="#000" />
      <path d="M14.4 15.5h3.2l1 6.2h-5.2z" fill="#000" />
    </svg>
  );
}

export function Logo({ onDark = true }: { onDark?: boolean }) {
  return (
    <Link to="/" className={`flex items-center gap-2 text-lg font-extrabold tracking-tight ${onDark ? "text-paper" : "text-ink"}`} aria-label="KnightLend home">
      <LogoMark />
      <span>
        Knight<span className={onDark ? "text-gold" : ""}>Lend</span>
      </span>
    </Link>
  );
}
