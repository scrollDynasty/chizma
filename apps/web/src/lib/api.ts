import type { GenerationJob } from "./scene";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

const TOKEN_KEY = "chizma.token";

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode): the session lasts until the tab closes
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export interface Health {
  status: string;
  version: string;
}

export interface User {
  id: number;
  provider: string;
  login: string | null;
  name: string | null;
  avatar_url: string | null;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  user: User;
}

export type Provider = "github" | "google";

export const fetchHealth = (signal?: AbortSignal) => apiFetch<Health>("/health", { signal });

export const fetchProviders = (signal?: AbortSignal) =>
  apiFetch<{ providers: Provider[] }>("/v1/auth/providers", { signal });

export const fetchMe = (signal?: AbortSignal) => apiFetch<User>("/v1/me", { signal });

export const exchangeCode = (code: string) =>
  apiFetch<TokenResponse>("/v1/auth/exchange", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const loginUrl = (provider: Provider) => `${API_URL}/v1/auth/${provider}/login`;

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

export interface GenerationRequest {
  png: Blob;
  shapes: unknown[];
  width: number;
  height: number;
  locale: string;
}

export function startGeneration(request: GenerationRequest) {
  const form = new FormData();
  form.append("image", request.png, "sketch.png");
  form.append("shapes", JSON.stringify(request.shapes));
  form.append("width", String(Math.max(1, Math.round(request.width))));
  form.append("height", String(Math.max(1, Math.round(request.height))));
  form.append("locale", request.locale);
  return apiFetch<{ id: string; status: string }>("/v1/generations", {
    method: "POST",
    body: form,
  });
}

export const fetchGeneration = (id: string, signal?: AbortSignal) =>
  apiFetch<GenerationJob>(`/v1/generations/${encodeURIComponent(id)}`, { signal });

export const fetchQuota = (signal?: AbortSignal) =>
  apiFetch<Quota>("/v1/generations/quota", { signal });

export interface RefineRequest {
  element: unknown;
  html: string;
  css: string;
  /** Block size in canvas units; drawn strokes are positioned inside it. */
  width: number;
  height: number;
  locale: string;
  instruction?: string;
  /** Strokes drawn over the block (PNG + shapes relative to the block). */
  png?: Blob;
  shapes?: unknown[];
}

export function startRefine(request: RefineRequest) {
  const form = new FormData();
  form.append("element", JSON.stringify(request.element));
  form.append("html", request.html);
  form.append("css", request.css);
  form.append("width", String(Math.max(1, Math.round(request.width))));
  form.append("height", String(Math.max(1, Math.round(request.height))));
  form.append("locale", request.locale);
  if (request.instruction) form.append("instruction", request.instruction);
  if (request.shapes) form.append("shapes", JSON.stringify(request.shapes));
  if (request.png) form.append("image", request.png, "drawn.png");
  return apiFetch<{ id: string; status: string }>("/v1/generations/refine", {
    method: "POST",
    body: form,
  });
}

export interface SuggestRequest {
  instruction: string;
  block: { id: string; kind: string; label: string };
  targets: { id: string; kind: string; label: string }[];
  locale: string;
}

export const suggestAction = (request: SuggestRequest) =>
  apiFetch<{ action: import("@/actions/types").Action | null; explanation: string }>(
    "/v1/actions/suggest",
    { method: "POST", body: JSON.stringify(request) },
  );

export interface FormInfo {
  id: string;
  name: string;
  fields: import("@/actions/types").FormField[];
  submissions: number;
  created_at: string;
}

export interface Submission {
  id: number;
  data: Record<string, string>;
  created_at: string;
}

export const createForm = (name: string, fields: import("@/actions/types").FormField[]) =>
  apiFetch<FormInfo>("/v1/forms", { method: "POST", body: JSON.stringify({ name, fields }) });

export const listForms = (signal?: AbortSignal) => apiFetch<FormInfo[]>("/v1/forms", { signal });

export const listSubmissions = (formId: string, signal?: AbortSignal) =>
  apiFetch<Submission[]>(`/v1/forms/${encodeURIComponent(formId)}/submissions`, { signal });

/** Public endpoint used by published sites; also used by "Try" mode in the editor. */
export const submitForm = (formId: string, values: Record<string, string>) =>
  apiFetch<{ ok: boolean }>(`/v1/forms/${encodeURIComponent(formId)}/submissions`, {
    method: "POST",
    body: JSON.stringify(values),
  });
