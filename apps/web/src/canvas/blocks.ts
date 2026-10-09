import { type Action, parseAction } from "@/actions/types";
import type { Block, SceneElement, SceneGraph } from "@/lib/scene";

/**
 * Generated blocks live on the Excalidraw canvas as "iframe" elements, so people can move,
 * resize, delete and undo them like anything else they drew. The block data is kept in
 * customData.chizma; the rendered, sanitised document in customData.generationData.
 */

export interface BlockVersion {
  html: string;
  css: string;
}

export type BlockQuestion = SceneGraph["questions"][number];

export interface BlockData {
  elementId: string;
  kind: string;
  label: string;
  /** Current version, rendered on the canvas. */
  html: string;
  css: string;
  locale: string;
  /** True while the person decides between Accept and Back. */
  pending: boolean;
  /** What the model understood; sent back when the block is edited. */
  element: SceneElement;
  /** Every version of this block, oldest first; `current` points at the shown one. */
  versions: BlockVersion[];
  current: number;
  /** A clarifying question the model asked about this block, until it is answered. */
  question: BlockQuestion | null;
  /** What happens when a visitor clicks the block (from the safe action registry). */
  action: Action | null;
}

/** Saved on a sketch shape while it is hidden behind a pending result. */
export const HIDDEN_OPACITY_KEY = "chizmaHiddenOpacity";

interface WithCustomData {
  customData?: Record<string, unknown>;
}

/**
 * Reads a block's data, filling fields added later (versions, element, question) so blocks
 * saved by an older editor keep working instead of crashing the page.
 */
export function blockDataOf(element: WithCustomData): BlockData | null {
  const raw = element.customData?.chizma;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<BlockData>;
  const html = typeof data.html === "string" ? data.html : "";
  const css = typeof data.css === "string" ? data.css : "";
  const elementId = typeof data.elementId === "string" ? data.elementId : "el_1";
  const kind = typeof data.kind === "string" ? data.kind : "box";
  const label = typeof data.label === "string" ? data.label : kind;
  const versions =
    Array.isArray(data.versions) && data.versions.length > 0 ? data.versions : [{ html, css }];
  const current =
    typeof data.current === "number"
      ? Math.min(Math.max(data.current, 0), versions.length - 1)
      : versions.length - 1;
  return {
    elementId,
    kind,
    label,
    html,
    css,
    locale: typeof data.locale === "string" ? data.locale : "ru",
    pending: data.pending === true,
    element: data.element ?? legacyElement(elementId, kind, label),
    versions,
    current,
    question: data.question ?? null,
    action: parseAction(data.action),
  };
}

function legacyElement(id: string, kind: string, label: string): SceneElement {
  return {
    id,
    kind,
    label,
    intent: label,
    bbox: { x: 0, y: 0, w: 1, h: 1 },
    confidence: 1,
    parent_id: null,
    source_shape_ids: [],
    text: null,
    style_hints: { colors: [], shape: "", notes: "" },
    alternatives: [],
  };
}

export const isBlock = (element: WithCustomData) => blockDataOf(element) !== null;

export function blockData(
  element: SceneElement,
  block: Block,
  locale: string,
  question: BlockQuestion | null = null,
): BlockData {
  return {
    elementId: element.id,
    kind: element.kind,
    label: element.label,
    html: block.html,
    css: block.css,
    locale,
    pending: true,
    element,
    versions: [{ html: block.html, css: block.css }],
    current: 0,
    question,
    action: null,
  };
}

/** A new version from an edit: later versions (after stepping back) are dropped, like undo. */
export function withNewVersion(data: BlockData, block: Block, answered = false): BlockData {
  const versions = [
    ...data.versions.slice(0, data.current + 1),
    { html: block.html, css: block.css },
  ];
  return {
    ...data,
    html: block.html,
    css: block.css,
    versions,
    current: versions.length - 1,
    question: answered ? null : data.question,
  };
}

/** Show an earlier or later version. */
export function stepVersion(data: BlockData, delta: number): BlockData {
  const current = Math.min(Math.max(data.current + delta, 0), data.versions.length - 1);
  const version = data.versions[current] ?? { html: data.html, css: data.css };
  return { ...data, current, html: version.html, css: version.css };
}
