import { describe, expect, it } from "vitest";
import { buildSite, columnsFor, type SiteBlock, siteRows } from "./sitePage";

const block = (
  id: string,
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<SiteBlock> = {},
): SiteBlock => ({
  id,
  kind,
  label: id,
  html: `<p>${id}</p>`,
  css: "",
  x,
  y,
  width,
  height,
  action: null,
  ...extra,
});

const options = {
  pageWidth: 1280,
  title: "Kafe",
  locale: "uz-Latn",
  sanitizeHtml: (html: string) => html,
  nonce: "abc123",
  submit: { mode: "parent" as const },
};

describe("siteRows and columnsFor", () => {
  it("puts side-by-side blocks in one row and stacks blocks drawn above each other", () => {
    const roof = block("roof", "illustration", 100, 100, 300, 200);
    const walls = block("walls", "illustration", 120, 250, 260, 200);
    const sun = block("sun", "illustration", 900, 120, 120, 120);

    expect(siteRows([roof, walls, sun]).map((r) => r.items.map((b) => b.id))).toEqual([
      ["roof", "sun"],
      ["walls"],
    ]);
  });

  it("keeps drawn widths and gaps as fractions of the page", () => {
    expect(columnsFor([block("a", "text", 100, 0, 300, 50)], 1280)).toEqual([
      "spacer:100fr",
      "300fr",
      "spacer:880fr",
    ]);
  });
});

describe("buildSite", () => {
  const toggle = block("btn", "button", 100, 100, 200, 60, {
    action: { type: "toggle", target_id: "info", start_hidden: true },
  });
  const info = block("info", "text", 100, 200, 600, 120);
  const page = buildSite([toggle, info], options);

  it("allows only the runtime script, by nonce", () => {
    expect(page).toContain("script-src 'nonce-abc123'");
    expect(page).toContain('<script nonce="abc123">');
    expect(page).toContain("default-src 'none'");
  });

  it("wires actions through data attributes and hides toggle targets at first", () => {
    expect(page).toContain('data-el="btn"');
    expect(page).toContain('data-chz-action="{&quot;type&quot;:&quot;toggle&quot;');
    expect(page).toMatch(/data-el="info"[^>]* hidden>/);
  });

  it("adapts to phones automatically: one column, blocks no wider than drawn", () => {
    expect(page).toContain("@media (max-width:700px)");
    expect(page).toContain("grid-template-columns:1fr!important");
    expect(page).toContain("width:min(100%,var(--w))");
  });

  it("sends forms through the editor in preview and to the API when published", () => {
    expect(page).toContain('data-chz-submit="parent"');
    const published = buildSite([info], {
      ...options,
      submit: { mode: "api", apiUrl: "https://api.example" },
    });
    expect(published).toContain('data-chz-api="https://api.example"');
    expect(published).toContain("connect-src https://api.example");
  });

  it("pins cells to their columns so hidden blocks do not shift their neighbours", () => {
    const left = block("left", "button", 100, 100, 200, 60, {
      action: { type: "toggle", target_id: "mid", start_hidden: true },
    });
    const mid = block("mid", "text", 400, 100, 200, 60);
    const right = block("right", "text", 700, 100, 200, 60);
    const row = buildSite([left, mid, right], options);

    expect(row).toMatch(/data-el="right" style="grid-column:6;/);
  });
});
