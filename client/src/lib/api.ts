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
}
export interface DemoUser {
  id: string;
  label: string;
  name: string;
  role: string;
  affiliation: string;
}

/* ---------- endpoints ---------- */

export const api = {
  health: () => get<Health>("/api/health"),
  auth: {
    login: (email: string, password: string) => post<TokenOut>("/api/auth/login", { email, password }),
    register: (body: { name: string; email: string; password: string; affiliation: Affiliation; major?: string; grad_year?: number }) =>
      post<TokenOut>("/api/auth/register", body),
    me: () => get<UserMe>("/api/auth/me"),
  },
  demo: {
    users: () => get<DemoUser[]>("/api/demo/users"),
    loginAs: (user_id: string) => post<TokenOut>("/api/demo/login-as", { user_id }),
  },
};

export { del, patch, qs, upload };
