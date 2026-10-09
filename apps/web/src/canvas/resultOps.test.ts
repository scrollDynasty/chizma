import { describe, expect, it } from "vitest";
import type { GenerationJob, SceneElement } from "@/lib/scene";
import { blockDataOf, HIDDEN_OPACITY_KEY } from "./blocks";
import {
  acceptResult,
  discardResult,
  hasPendingResult,
  insertResult,
  type SceneItem,
  type Update,
} from "./resultOps";

const update: Update = (element, patch) => ({ ...element, ...patch });

function shape(id: string, x: number, y: number): SceneItem {
  return { id, type: "rectangle", x, y, width: 10, height: 10, opacity: 100, isDeleted: false };
}

function element(
  id: string,
  sources: string[],
  bbox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
): SceneElement {
  return {
    id,
    kind: "illustration",
    label: id,
    intent: "",
    bbox,
    confidence: 0.9,
    parent_id: null,
    source_shape_ids: sources,
    text: null,
    style_hints: { colors: [], shape: "", notes: "" },
    alternatives: [],
  };
}

const job: GenerationJob = {
  id: "job",
  status: "done",
  stage: "done",
  error: null,
  scene: {
    schema_version: "0.1",
    page: { title: "", locale: "ru", palette: [], mood: "" },
    elements: [element("walls", ["w"]), element("roof", ["r"])],
    questions: [],
  },
  blocks: [
    { element_id: "walls", html: "<div></div>", css: "" },
    { element_id: "roof", html: "<svg></svg>", css: "" },
  ],
};

const frame = { x: 100, y: 50, width: 1000, height: 500 };
// Drawing order: walls first, roof drawn on top, then an untouched note.
const drawing = [shape("w", 0, 0), shape("r", 0, 0), shape("note", 0, 0)];

describe("insertResult", () => {
  const { elements, added } = insertResult(
    drawing,
    job,
    frame,
    "ru",
    update,
    (d) => `<doc>${d.html}</doc>`,
  );

  it("places blocks in scene coordinates from the frame", () => {
    expect(added[0]).toMatchObject({ type: "iframe", x: 200, y: 150, width: 300, height: 200 });
    expect(added[0]?.strokeColor).toBe("#ffffff01");
    expect(added[0]?.customData.generationData).toEqual({
      status: "done",
      html: "<doc><div></div></doc>",
    });
  });

  it("keeps the drawing order: each block sits right above its own strokes", () => {
    const order = elements.map((e) => blockDataOf(e)?.elementId ?? e.id);
    expect(order).toEqual(["w", "walls", "r", "roof", "note"]);
  });

  it("hides the replaced strokes and remembers their opacity", () => {
    const walls = elements.find((e) => e.id === "w") as SceneItem;
    expect(walls.opacity).toBe(0);
    expect(walls.customData?.[HIDDEN_OPACITY_KEY]).toBe(100);
    expect((elements.find((e) => e.id === "note") as SceneItem).opacity).toBe(100);
    expect(hasPendingResult(elements as SceneItem[])).toBe(true);
  });
});

describe("acceptResult and discardResult", () => {
  const inserted = insertResult(drawing, job, frame, "ru", update, (d) => `<doc>${d.html}</doc>`)
    .elements as SceneItem[];

  it("accept deletes the replaced strokes and keeps the blocks", () => {
    const accepted = acceptResult(inserted, update);

    expect(
      accepted.filter((e) => !e.isDeleted).map((e) => blockDataOf(e)?.elementId ?? e.id),
    ).toEqual(["walls", "roof", "note"]);
    expect(hasPendingResult(accepted)).toBe(false);
  });

  it("back removes the blocks and shows the strokes again", () => {
    const restored = discardResult(inserted, update);
    const visible = restored.filter((e) => !e.isDeleted);

    expect(visible.map((e) => e.id)).toEqual(["w", "r", "note"]);
    expect(visible.every((e) => e.opacity === 100 && !e.customData?.[HIDDEN_OPACITY_KEY])).toBe(
      true,
    );
  });
});
