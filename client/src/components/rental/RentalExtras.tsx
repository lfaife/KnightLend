import type { RentalDetail } from "../../lib/api";

/** Condition photos, return, claims, reviews and messages (filled in with M5). */
export function RentalExtras(_props: { r: RentalDetail; act: (fn: () => Promise<RentalDetail>, success?: string) => Promise<void>; today: string }) {
  return null;
}
