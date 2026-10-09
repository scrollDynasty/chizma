import { describe, expect, it } from "vitest";
import type { Block, SceneElement, SceneGraph } from "@/lib/scene";
import { buildPage, groupIntoRows, rowColumns } from "./pageBuilder";

function element(
  id: string,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
): SceneElement {
  return {
    id,
    kind,
    label: id,
    intent: "",
    bbox: { x, y, w, h },
    confidence: 0.9,
    parent_id: null,
    source_shape_ids: [],
    text: null,
    style_hints: { colors: [], shape: "", notes: "" },
    alternatives: [],
  };
}

const house = element("house", "illustration", 0, 0.3, 0.4, 0.7);
const sun = element("sun", "illustration", 0.8, 0, 0.2, 0.35);
const title = element("title", "heading", 0.1, 0, 0.5, 0.15);

const scene: SceneGraph = {
  schema_version: "0.1",
  page: { title: "Uy & Quyosh", locale: "uz-Latn", palette: [], mood: "" },
  elements: [house, sun, title],
  questions: [],
};

const blocks: Block[] = [
  { element_id: "house", html: "<svg></svg>", css: ".roof{fill:red}" },
  { element_id: "sun", html: "<svg></svg>", css: "" },
  { element_id: "title", html: "<h1>Salom</h1>", css: "h1{margin:0}" },
];

describe("groupIntoRows", () => {
  it("puts vertically overlapping elements in one row, ordered left to right", () => {
    const rows = groupIntoRows([house, sun, title]);

    expect(rows.map((row) => row.map((e) => e.id))).toEqual([["title", "sun"], ["house"]]);
  });

  it("stacks elements drawn above each other instead of placing them side by side", () => {
    const roof = element("roof", "illustration", 0, 0.2, 0.4, 0.4);
    const walls = element("walls", "illustration", 0.05, 0.45, 0.3, 0.5);
    const sunRight = element("sun", "illustration", 0.8, 0.25, 0.2, 0.3);

    const rows = groupIntoRows([roof, walls, sunRight]);

    expect(rows.map((row) => row.map((e) => e.id))).toEqual([["roof", "sun"], ["walls"]]);
  });
});

describe("rowColumns", () => {
  it("keeps drawn widths and adds spacers for real gaps", () => {
    expect(rowColumns([title, sun])).toEqual([
      "spacer:0.100fr",
      "0.500fr",
      "spacer:0.200fr",
      "0.200fr",
    ]);
    expect(rowColumns([house])).toEqual(["0.400fr", "spacer:0.600fr"]);
  });
});

describe("buildPage", () => {
  const page = buildPage(scene, blocks, { aspect: 2, sanitizeHtml: (html) => html });

  it("produces a complete document in the page language", () => {
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain('<html lang="uz-Latn">');
    expect(page).toContain("<title>Uy &amp; Quyosh</title>");
  });

  it("scopes each block's CSS to its own container", () => {
    expect(page).toContain('[data-el="house"]{.roof{fill:red}}');
    expect(page).toContain('[data-el="title"]{h1{margin:0}}');
  });

  it("keeps picture proportions but lets text flow", () => {
    expect(page).toContain('data-el="house" style="aspect-ratio:1.143"');
    expect(page).toContain('class="chz-cell chz-flow" data-el="title">');
  });

  it("collapses rows into one column on phones", () => {
    expect(page).toContain(
      "@media (max-width:640px){.chz-row{grid-template-columns:1fr!important}",
    );
  });

  it("skips elements without a block", () => {
    const partial = buildPage(scene, blocks.slice(0, 1), { aspect: 1, sanitizeHtml: (h) => h });
    expect(partial).not.toContain('data-el="sun"');
  });
});
