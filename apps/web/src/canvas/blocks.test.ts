import { describe, expect, it } from "vitest";
import type { SceneElement } from "@/lib/scene";
import { blockData, stepVersion, withNewVersion } from "./blocks";
import { overlaps } from "./shapes";

const element = {
  id: "el_1",
  kind: "illustration",
  label: "house",
  intent: "",
  bbox: { x: 0, y: 0, w: 1, h: 1 },
  confidence: 0.4,
  parent_id: null,
  source_shape_ids: [],
  text: null,
  style_hints: { colors: [], shape: "", notes: "" },
  alternatives: [],
} satisfies SceneElement;

const question = { element_id: "el_1", text: "Что это?", options: ["отель", "дом"] };
const first = blockData(element, { element_id: "el_1", html: "v1", css: "" }, "ru", question);

describe("block versions", () => {
  it("adds a version on every edit and shows it", () => {
    const second = withNewVersion(first, { element_id: "el_1", html: "v2", css: "a{}" });

    expect(second.html).toBe("v2");
    expect(second.versions.map((v) => v.html)).toEqual(["v1", "v2"]);
    expect(second.current).toBe(1);
    expect(second.question).toEqual(question);
  });

  it("steps back and forward between versions without going out of range", () => {
    const second = withNewVersion(first, { element_id: "el_1", html: "v2", css: "" });

    expect(stepVersion(second, -1).html).toBe("v1");
    expect(stepVersion(second, -5).current).toBe(0);
    expect(stepVersion(stepVersion(second, -1), 1).html).toBe("v2");
  });

  it("drops later versions when editing an earlier one, and clears an answered question", () => {
    const second = withNewVersion(first, { element_id: "el_1", html: "v2", css: "" });
    const branched = withNewVersion(
      stepVersion(second, -1),
      { element_id: "el_1", html: "v3", css: "" },
      true,
    );

    expect(branched.versions.map((v) => v.html)).toEqual(["v1", "v3"]);
    expect(branched.question).toBeNull();
  });
});

describe("overlaps", () => {
  const block = { x: 0, y: 0, width: 100, height: 100 };

  it("detects strokes drawn over a block", () => {
    expect(overlaps(block, { x: 50, y: 50, width: 80, height: 10 })).toBe(true);
    expect(overlaps(block, { x: 100, y: 0, width: 10, height: 10 })).toBe(false);
    expect(overlaps(block, { x: 200, y: 200, width: 10, height: 10 })).toBe(false);
  });
});
