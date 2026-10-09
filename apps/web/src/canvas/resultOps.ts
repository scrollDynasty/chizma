import type { GenerationJob } from "@/lib/scene";
import { type BlockData, blockData, blockDataOf, HIDDEN_OPACITY_KEY } from "./blocks";
import type { SketchBounds } from "./shapes";

/**
 * Pure scene transformations for the generate -> decide -> accept/back flow. They take an
 * `update` function so Excalidraw can bump element versions (newElementWith) while tests use
 * plain objects.
 */

export interface SceneItem {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  isDeleted: boolean;
  customData?: Record<string, unknown>;
  link?: string | null;
}

export type Update = <T extends SceneItem>(element: T, patch: Partial<SceneItem>) => T;

/**
 * Excalidraw paints a black border and grey fill behind iframe elements whose colours are
 * "transparent". A colour with alpha 1/255 is not treated as transparent but is invisible.
 */
export const INVISIBLE = "#ffffff01";

/** Excalidraw "iframe" element whose document is our sandboxed, CSP-locked block page. */
export interface NewBlock {
  id: string;
  type: "iframe";
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: typeof INVISIBLE;
  backgroundColor: typeof INVISIBLE;
  customData: {
    chizma: BlockData;
    generationData: { status: "done"; html: string };
  };
}

/** Builds the full, sanitised document shown inside a block. */
export type RenderBlock = (data: BlockData) => string;

/**
 * Hide the sketch strokes that were turned into blocks and insert the new (pending) blocks.
 * Each block goes right above its topmost source stroke, so overlaps keep the drawing order.
 */
export function insertResult<T extends SceneItem>(
  elements: readonly T[],
  job: GenerationJob,
  frame: SketchBounds,
  locale: string,
  update: Update,
  render: RenderBlock,
): { elements: (T | NewBlock)[]; added: NewBlock[] } {
  const scene = job.scene;
  if (!scene) return { elements: [...elements], added: [] };
  const blocks = new Map(job.blocks.map((block) => [block.element_id, block]));
  const position = new Map(elements.map((element, index) => [element.id, index]));
  const hidden = new Set<string>();
  const after = new Map<number, NewBlock[]>();
  const added: NewBlock[] = [];

  for (const element of scene.elements) {
    const block = blocks.get(element.id);
    if (!block) continue;
    const question = scene.questions.find((q) => q.element_id === element.id) ?? null;
    const data = blockData(element, block, locale, question);
    const created: NewBlock = {
      id: `chz-${crypto.randomUUID()}`,
      type: "iframe",
      x: frame.x + element.bbox.x * frame.width,
      y: frame.y + element.bbox.y * frame.height,
      width: Math.max(element.bbox.w * frame.width, 8),
      height: Math.max(element.bbox.h * frame.height, 8),
      strokeColor: INVISIBLE,
      backgroundColor: INVISIBLE,
      customData: { chizma: data, generationData: { status: "done", html: render(data) } },
    };
    added.push(created);
    let anchor = -1;
    for (const id of element.source_shape_ids) {
      const index = position.get(id);
      if (index !== undefined) {
        hidden.add(id);
        anchor = Math.max(anchor, index);
      }
    }
    const slot = anchor === -1 ? elements.length - 1 : anchor;
    after.set(slot, [...(after.get(slot) ?? []), created]);
  }

  const next: (T | NewBlock)[] = [];
  elements.forEach((element, index) => {
    next.push(
      hidden.has(element.id)
        ? update(element, {
            opacity: 0,
            customData: { ...element.customData, [HIDDEN_OPACITY_KEY]: element.opacity },
          })
        : element,
    );
    next.push(...(after.get(index) ?? []));
  });
  if (elements.length === 0) next.push(...(after.get(-1) ?? []));
  return { elements: next, added };
}

const withoutHiddenMark = (customData: Record<string, unknown> | undefined) => {
  const { [HIDDEN_OPACITY_KEY]: _ignored, ...rest } = customData ?? {};
  return rest;
};

/** Keep the pending blocks for good and drop the strokes they replaced. */
export function acceptResult<T extends SceneItem>(elements: readonly T[], update: Update): T[] {
  return elements.map((element) => {
    if (element.customData?.[HIDDEN_OPACITY_KEY] !== undefined) {
      return update(element, { isDeleted: true });
    }
    const data = blockDataOf(element);
    if (data?.pending) {
      return update(element, {
        customData: { ...element.customData, chizma: { ...data, pending: false } },
      });
    }
    return element;
  });
}

/** Back to the drawing: remove pending blocks and show the strokes again. */
export function discardResult<T extends SceneItem>(elements: readonly T[], update: Update): T[] {
  return elements.map((element) => {
    const opacity = element.customData?.[HIDDEN_OPACITY_KEY];
    if (typeof opacity === "number") {
      return update(element, { opacity, customData: withoutHiddenMark(element.customData) });
    }
    if (blockDataOf(element)?.pending) return update(element, { isDeleted: true });
    return element;
  });
}

export const hasPendingResult = (elements: readonly SceneItem[]) =>
  elements.some((element) => !element.isDeleted && blockDataOf(element)?.pending);
