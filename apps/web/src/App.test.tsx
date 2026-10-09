import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import i18n from "./i18n";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the tagline and reports a healthy API", async () => {
    await i18n.changeLanguage("en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "ok", version: "0.1.0" }))),
    );

    renderApp();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Draw a website. Get a real one.",
    );
    expect(await screen.findByText("Server: ok")).toBeInTheDocument();
  });

  it("reports an unavailable API", async () => {
    await i18n.changeLanguage("ru");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );

    renderApp();

    expect(await screen.findByText("Сервер недоступен")).toBeInTheDocument();
  });
});
