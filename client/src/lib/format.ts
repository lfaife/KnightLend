export const money = (n: number) => `$${n.toFixed(2)}`;
export const money0 = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`);

/** ISO date (YYYY-MM-DD) to "Mon, Oct 26" without timezone drift. */
export function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
/** Server datetimes are naive UTC. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
export const CONDITION_LABEL: Record<string, string> = { new: "New", like_new: "Like new", good: "Good", fair: "Fair" };
export const CATEGORY_LABEL: Record<string, string> = {
  calculators_electronics: "Calculators and electronics",
  art_supplies: "Art supplies",
  tools: "Tools",
  cameras_media: "Cameras and media",
  household_appliances: "Household and appliances",
  clothing_events: "Clothing and events",
};
export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const miles = (n: number) => (n < 0.1 ? "Under 0.1 mi" : `${n} mi`);
