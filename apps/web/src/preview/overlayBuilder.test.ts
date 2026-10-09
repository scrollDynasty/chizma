import { describe, expect, it } from "vitest";
import type { SceneElement, SceneGraph } from "@/lib/scene";
import { buildOverlay } from "./overlayBuilder";

function element(id: string, x: number, y: number, w: number, h: number): SceneElement {
  return {
    id,
    kind: "illustration",
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

const scene: SceneGraph = {
  schema_version: "0.1",
  page: { title: "Uy", locale: "uz-Latn", palette: [], mood: "" },
  elements: [element("door", 0.2, 0.6, 0.05, 0.1), element("house", 0.1, 0.3, 0.3, 0.5)],
  questions: [],
};

const blocks = [
  { element_id: "house", html: "<svg></svg>", css: ".roof{fill:red}" },
  { element_id: "door", html: "<svg></svg>", css: "" },
];

describe("buildOverlay", () => {
  const doc = buildOverlay(scene, blocks, { sanitizeHtml: (html) => html });

  it("places every element exactly where it was drawn", () => {
    expect(doc).toContain(
      'data-el="house" style="left:10.000%;top:30.000%;width:30.000%;height:50.000%',
    );
    expect(doc).toContain(
      'data-el="door" style="left:20.000%;top:60.000%;width:5.000%;height:10.000%',
    );
  });

  it("draws bigger elements first so inner ones stay on top", () => {
    expect(doc.indexOf('data-el="house"')).toBeLessThan(doc.indexOf('data-el="door"'));
  });

  it("scopes block CSS and sizes text to the drawn box", () => {
    expect(doc).toContain('[data-el="house"]{.roof{fill:red}}');
    expect(doc).toContain("container-type:size");
  });

  it("keeps the canvas pixel size so the result never stretches", () => {
    const fixed = buildOverlay(scene, blocks, {
      sanitizeHtml: (html) => html,
      stage: { width: 800.4, height: 340 },
    });

    expect(fixed).toContain(".chz-stage{position:relative;width:800px;height:340px}");
  });
});
