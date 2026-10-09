import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "./i18n";
import { json, mockApi, renderAt } from "./test/render";

// Excalidraw needs a real <canvas>; the editor shell is what these tests cover.
vi.mock("@/canvas/SketchCanvas", () => ({ default: () => null }));

const USER = { id: 1, provider: "github", login: "octocat", name: "The Octocat", avatar_url: null };

describe("App", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the tagline and reports a healthy API", async () => {
    mockApi((path) => (path === "/health" ? json({ status: "ok", version: "0.1.0" }) : undefined));

    renderAt("/");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Draw a website. Get a real one.",
    );
    expect(await screen.findByText("Server: ok")).toBeInTheDocument();
  });

  it("reports an unavailable API", async () => {
    await i18n.changeLanguage("ru");
    mockApi(() => new Response("", { status: 503 }));

    renderAt("/");

    expect(await screen.findByText("Сервер недоступен")).toBeInTheDocument();
  });

  it("sends signed-out visitors from the editor to the sign-in page", async () => {
    mockApi((path) => {
      if (path === "/health") return json({ status: "ok", version: "0.1.0" });
      if (path === "/v1/auth/providers") return json({ providers: ["github", "google"] });
      return undefined;
    });

    renderAt("/new");

    expect(await screen.findByRole("heading", { name: "Sign in to Chizma" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("explains when sign-in is not configured", async () => {
    mockApi((path) => {
      if (path === "/health") return json({ status: "ok", version: "0.1.0" });
      if (path === "/v1/auth/providers") return json({ providers: [] });
      return undefined;
    });

    renderAt("/login");

    expect(
      await screen.findByText("Sign-in is not configured on the server yet."),
    ).toBeInTheDocument();
  });

  it("exchanges the one-time code, stores the token and opens the editor", async () => {
    sessionStorage.setItem("chizma.next", "/new");
    const fetchMock = mockApi((path, init) => {
      if (path === "/health") return json({ status: "ok", version: "0.1.0" });
      if (path === "/v1/auth/exchange" && init?.method === "POST") {
        return json({ access_token: "jwt-token", expires_in: 3600, user: USER });
      }
      return undefined;
    });

    renderAt("/auth/callback?code=one-time-code-123456");

    expect(await screen.findByRole("heading", { name: "New site" })).toBeInTheDocument();
    expect(screen.getByText("The Octocat")).toBeInTheDocument();
    expect(localStorage.getItem("chizma.token")).toBe("jwt-token");
    const exchangeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/auth/exchange"),
    );
    expect(exchangeCalls).toHaveLength(1);
  });

  it("shows why sign-in was refused", async () => {
    mockApi((path) => (path === "/health" ? json({ status: "ok", version: "0.1.0" }) : undefined));

    renderAt("/auth/callback?error=not_allowed");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account is not on the test list yet.",
    );
  });

  it("drops an expired token and signs the user out", async () => {
    localStorage.setItem("chizma.token", "expired");
    mockApi((path) => {
      if (path === "/health") return json({ status: "ok", version: "0.1.0" });
      if (path === "/v1/me") return json({ detail: "invalid_token" }, 401);
      return undefined;
    });

    renderAt("/");

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("chizma.token")).toBeNull();
  });
});
