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
