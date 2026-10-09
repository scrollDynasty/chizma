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
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

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
