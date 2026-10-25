/**
 * The single typed wrapper around the KnightLend API. Every request goes through `request()`.
 * Types mirror the server's Pydantic response models (see /docs).
 */

const TOKEN_KEY = "knightlend.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session-only login */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length) {
      const first = d[0] as { msg?: string; loc?: unknown[] };
      const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
      return `${field ? field.replace(/_/g, " ") + ": " : ""}${(first.msg ?? "Invalid value").replace(/^Value error, /, "")}`;
    }
  }
  if (status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return "Request failed.";
}

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError(0, "Can't reach the KnightLend server. Is it running?");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {});
const patch = <T>(p: string, b: unknown) => request<T>("PATCH", p, b);
const del = <T>(p: string) => request<T>("DELETE", p);
const upload = <T>(p: string, form: FormData) => request<T>("POST", p, undefined, form);

function qs(params: Record<string, string | number | boolean | undefined | null | string[]>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* ---------- types ---------- */

export type Affiliation = "student" | "alumni";
export interface UserPublic {
  id: string;
  name: string;
  affiliation: Affiliation;
  role: "member" | "moderator";
  verified: boolean;
  major: string | null;
  grad_year: number | null;
  bio: string;
  avatar_url: string | null;
  home_area: string;
  home_area_kind: string;
  rating_avg: number;
  rating_count: number;
  rentals_count: number;
  lent_count: number;
  borrowed_count: number;
  restricted: boolean;
  created_at: string;
}
export interface UserMe extends UserPublic {
  verification_status: "unverified" | "pending" | "verified";
  verification_method: "ucf_email" | "alumni" | null;
  restricted_reason: string | null;
  flagged: boolean;
  saved_listing_ids: string[];
}
export interface TokenOut {
  access_token: string;
  token_type: "bearer";
  user: UserMe;
}
export interface Health {
  status: string;
  database: string;
  demo_mode: boolean;
  now: string;
  today: string;
}
export interface JobReport {
  reminders_sent: number;
  holds_refreshed: number;
  refreshes_failed: number;
  rentals_marked_late: number;
  requests_expired: number;
}
export interface ClockOut {
  now: string;
  today: string;
  offset_days: number;
  jobs: JobReport | null;
}
export interface CardIn {
  number: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
  name: string;
}
export interface Message {
  id: string;
  rental_id: string;
  sender_id: string | null;
  sender_name: string;
  mine: boolean;
  body: string;
  redacted: boolean;
  created_at: string;
}
export interface Conversation {
  rental_id: string;
  listing_title: string;
  listing_photo: string | null;
  other_party: UserPublic;
  status: RentalStatus;
  status_label: string;
  last_message: string | null;
  last_at: string | null;
  unread: number;
}
export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  rental_id: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}
export interface DemoUser {
  id: string;
  label: string;
  name: string;
  role: string;
  affiliation: string;
}

export interface Option {
  id: string;
  label: string;
}
export interface Shortcut {
  id: string;
  label: string;
  hint: string;
  category: string | null;
  tag: string | null;
}
export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  accessibility: string | null;
  hours: string | null;
  kind: string | null;
}
export interface HoldTier {
  label: string;
  min_value: number;
  max_value: number | null;
  min_hold: number;
  max_hold: number;
}
export interface TestCard {
  number: string;
  brand: string;
  funding: string;
  description: string;
}
export interface Meta {
  categories: Option[];
  conditions: Option[];
  shortcuts: Shortcut[];
  pickup_spots: Place[];
  areas: Place[];
  campus_center: [number, number];
  hold_tiers: HoldTier[];
  cancellation_rules: string[];
  times_of_day: Option[];
  return_checklist: string[];
  service_fee: number;
  test_cards: TestCard[];
}

export type Category = "calculators_electronics" | "art_supplies" | "tools" | "cameras_media" | "household_appliances" | "clothing_events";
export type Condition = "new" | "like_new" | "good" | "fair";

export interface OwnerSnippet {
  id: string;
  name: string;
  affiliation: Affiliation;
  verified: boolean;
  rating_avg: number;
  rating_count: number;
  rentals_count: number;
  lent_count: number;
  avatar_url: string | null;
}
export interface Prices {
  day: number;
  week: number | null;
  month: number | null;
  semester: number | null;
}
export interface Bundle {
  name: string;
  includes: string[];
  extra_per_day: number;
}
export interface Pickup {
  area_name: string;
  lat: number;
  lng: number;
  spot_id: string | null;
}
export interface Spec {
  label: string;
  value: string;
}
export interface ListingCard {
  id: string;
  title: string;
  category: Category;
  photo: string | null;
  prices: Prices;
  condition: Condition;
  hold_amount: number;
  distance_miles: number;
  pickup: Pickup;
  sanitized: boolean;
  requires_approval: boolean;
  rating_avg: number;
  rating_count: number;
  owner: OwnerSnippet;
  tags: string[];
}
export interface ListingPage {
  items: ListingCard[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  origin_label: string;
}
export interface Review {
  id: string;
  rating: number;
  text: string;
  author_name: string;
  author_id: string;
  subject_role: "lender" | "borrower";
  listing_title: string | null;
  created_at: string;
}
export interface ListingDetail {
  id: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  specs: Spec[];
  condition: Condition;
  condition_notes: string;
  estimated_value: number;
  prices: Prices;
  bundle: Bundle | null;
  hold_amount: number;
  max_rental_days: number;
  usage_guide: string[];
  sanitized: boolean;
  sanitized_note: string | null;
  pickup: Pickup;
  requires_approval: boolean;
  photos: string[];
  status: string;
  rating_avg: number;
  rating_count: number;
  rentals_count: number;
  owner: OwnerSnippet;
  owner_reviews: Review[];
  listing_reviews: Review[];
  booked: { start: string; end: string }[];
  distance_miles: number;
  is_owner: boolean;
  saved: boolean;
  created_at: string;
}
export interface QuoteLine {
  label: string;
  quantity: number;
  unit_price: number;
  amount: number;
}
export interface Quote {
  days: number;
  lines: QuoteLine[];
  rental_fee: number;
  bundle_fee: number;
  service_fee: number;
  total: number;
  hold_amount: number;
  estimated_value: number;
  value_ratio: number;
  near_purchase_price: boolean;
}
export interface QuoteCheck {
  start: string;
  end: string;
  quote: Quote | null;
  available: boolean;
  problems: string[];
  warnings: string[];
}
export interface SearchParams {
  q?: string;
  category?: string;
  tag?: string;
  min_price?: number;
  max_price?: number;
  max_distance?: number;
  condition?: string[];
  available_from?: string;
  available_to?: string;
  max_hold?: number;
  min_rating?: number;
  sanitized?: boolean;
  no_approval?: boolean;
  owner_id?: string;
  origin?: string;
  origin_lat?: number;
  origin_lng?: number;
  sort?: "nearby" | "price" | "rating" | "newest";
  page?: number;
  page_size?: number;
}

export type RentalStatus = "requested" | "approved" | "rejected" | "cancelled" | "confirmed" | "in_progress" | "return_pending" | "claim_open" | "completed";
export type HoldStatus = "pending" | "active" | "released" | "captured" | "failed";
export type Role = "borrower" | "lender" | "moderator";

export interface ListingMini {
  id: string;
  title: string;
  photo: string | null;
  category: string;
  pickup_area: string;
  estimated_value: number;
}
export interface HoldEvent {
  at: string;
  event: string;
  from_status: HoldStatus;
  to_status: HoldStatus;
  note: string;
}
export interface Hold {
  id: string;
  amount: number;
  status: HoldStatus;
  card: { brand: string; last4: string; funding: "credit" | "debit" } | null;
  placed_at: string | null;
  expires_at: string | null;
  refresh_count: number;
  next_refresh_at: string | null;
  failure_message: string | null;
  captured_amount: number;
  released_amount: number;
  released_at: string | null;
  captured_at: string | null;
  history: HoldEvent[];
}
export interface Meetup {
  spot_id: string;
  spot_name: string;
  lat: number;
  lng: number;
  date: string;
  time_of_day: "morning" | "afternoon" | "evening";
  accessibility_note: string;
  notes: string;
  set_by: string;
  set_at: string;
}
export interface Claim {
  type: "damage" | "late" | "not_returned";
  amount: number;
  description: string;
  photo_set_id: string | null;
  filed_at: string;
  status: "open" | "under_review" | "resolved";
  borrower_response: "accept" | "dispute" | null;
  borrower_message: string;
  responded_at: string | null;
  decision: "release" | "capture" | null;
  decision_amount: number;
  explanation: string;
  resolved_at: string | null;
}
export interface PhotoSet {
  id: string;
  phase: "pickup" | "return" | "claim";
  uploaded_by: string;
  uploader_role: "borrower" | "lender";
  uploader_name: string;
  photos: string[];
  note: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}
export interface RentalSummary {
  id: string;
  status: RentalStatus;
  status_label: string;
  my_role: Role;
  listing: ListingMini;
  other_party: UserPublic;
  start_date: string;
  end_date: string;
  days: number;
  total: number;
  lender_earnings: number;
  hold_amount: number;
  hold_status: HoldStatus | null;
  hold_expires_at: string | null;
  late: boolean;
  late_days: number;
  needs_action: boolean;
  next_step: string;
  unread_messages: number;
  created_at: string;
  updated_at: string;
}
export interface RentalDetail {
  id: string;
  status: RentalStatus;
  status_label: string;
  my_role: Role;
  listing: ListingMini;
  borrower: UserPublic;
  lender: UserPublic;
  start_date: string;
  end_date: string;
  with_bundle: boolean;
  bundle_name: string | null;
  quote: Quote;
  lender_earnings: number;
  request_note: string;
  decision_note: string;
  agreement: { version: string; terms: string[]; borrower_accepted_at: string | null; lender_accepted_at: string | null };
  hold: Hold | null;
  payment: { charged_amount: number; charged_at: string; refunded_amount: number; claim_charged_amount: number } | null;
  meetup: Meetup | null;
  picked_up_at: string | null;
  returned_at: string | null;
  return_checklist: string[];
  late: boolean;
  late_days: number;
  claim: Claim | null;
  photo_sets: PhotoSet[];
  timeline: { at: string; kind: string; text: string }[];
  actions: string[];
  next_step: string;
  can_review: boolean;
  my_review_done: boolean;
  cancellation_refund_preview: number | null;
  created_at: string;
  updated_at: string;
}

/* ---------- endpoints ---------- */

export const api = {
  health: () => get<Health>("/api/health"),
  meta: () => get<Meta>("/api/meta"),
  auth: {
    login: (email: string, password: string) => post<TokenOut>("/api/auth/login", { email, password }),
    register: (body: { name: string; email: string; password: string; affiliation: Affiliation; major?: string; grad_year?: number }) =>
      post<TokenOut>("/api/auth/register", body),
    me: () => get<UserMe>("/api/auth/me"),
  },
  listings: {
    search: (p: SearchParams) => get<ListingPage>(`/api/listings${qs(p as Record<string, string | number | boolean | undefined | string[]>)}`),
    get: (id: string) => get<ListingDetail>(`/api/listings/${id}`),
    quote: (id: string, start: string, end: string, bundle: boolean) => get<QuoteCheck>(`/api/listings/${id}/quote${qs({ start, end, bundle })}`),
    save: (id: string) => post<{ ok: boolean }>(`/api/listings/${id}/save`),
    unsave: (id: string) => del<{ ok: boolean }>(`/api/listings/${id}/save`),
    saved: () => get<ListingCard[]>("/api/listings/saved"),
  },
  rentals: {
    create: (body: { listing_id: string; start_date: string; end_date: string; with_bundle: boolean; note: string }) =>
      post<RentalDetail>("/api/rentals", body),
    list: (role: "borrower" | "lender" | "all" = "all", scope: "active" | "history" | "all" = "all") =>
      get<RentalSummary[]>(`/api/rentals${qs({ role, scope })}`),
    get: (id: string) => get<RentalDetail>(`/api/rentals/${id}`),
    approve: (id: string, note = "", accept_agreement = true) => post<RentalDetail>(`/api/rentals/${id}/approve`, { note, accept_agreement }),
    reject: (id: string, note = "") => post<RentalDetail>(`/api/rentals/${id}/reject`, { note }),
    cancel: (id: string) => post<RentalDetail>(`/api/rentals/${id}/cancel`),
    acceptAgreement: (id: string) => post<RentalDetail>(`/api/rentals/${id}/agreement/accept`),
    placeHold: (id: string, card: CardIn) => post<RentalDetail>(`/api/rentals/${id}/hold`, card),
    setMeetup: (id: string, body: { spot_id: string; date: string; time_of_day: string; notes: string }) => post<RentalDetail>(`/api/rentals/${id}/meetup`, body),
    uploadPhotos: (id: string, phase: "pickup" | "return" | "claim", note: string, files: File[]) => {
      const form = new FormData();
      form.append("phase", phase);
      form.append("note", note);
      files.forEach((f) => form.append("files", f));
      return upload<RentalDetail>(`/api/rentals/${id}/photos`, form);
    },
    confirmPhotos: (id: string, setId: string) => post<RentalDetail>(`/api/rentals/${id}/photos/${setId}/confirm`),
    pickup: (id: string) => post<RentalDetail>(`/api/rentals/${id}/pickup`),
    markReturned: (id: string, checklist: string[]) => post<RentalDetail>(`/api/rentals/${id}/return`, { checklist }),
    confirmClean: (id: string) => post<RentalDetail>(`/api/rentals/${id}/inspect`),
    fileClaim: (id: string, body: { type: string; amount: number; description: string }) => post<RentalDetail>(`/api/rentals/${id}/claim`, body),
    respondClaim: (id: string, response: "accept" | "dispute", message: string) => post<RentalDetail>(`/api/rentals/${id}/claim/respond`, { response, message }),
    resolveClaim: (id: string, decision: "release" | "capture", amount: number, explanation: string) =>
      post<RentalDetail>(`/api/rentals/${id}/claim/resolve`, { decision, amount, explanation }),
    review: (id: string, rating: number, text: string) => post<RentalDetail>(`/api/rentals/${id}/reviews`, { rating, text }),
    messages: (id: string) => get<Message[]>(`/api/rentals/${id}/messages`),
    send: (id: string, body: string) => post<Message>(`/api/rentals/${id}/messages`, { body }),
  },
  conversations: () => get<Conversation[]>("/api/conversations"),
  notifications: {
    list: () => get<{ items: Notification[]; unread: number }>("/api/notifications"),
    readAll: () => post<{ ok: boolean }>("/api/notifications/read-all"),
    read: (id: string) => post<{ ok: boolean }>(`/api/notifications/${id}/read`),
  },
  demo: {
    users: () => get<DemoUser[]>("/api/demo/users"),
    loginAs: (user_id: string) => post<TokenOut>("/api/demo/login-as", { user_id }),
    clock: () => get<ClockOut>("/api/demo/clock"),
    advance: (days: number) => post<ClockOut>("/api/demo/advance-time", { days }),
    runJobs: () => post<ClockOut>("/api/demo/run-jobs"),
    reset: () => post<ClockOut>("/api/demo/reset"),
  },
};

export { patch, upload };
