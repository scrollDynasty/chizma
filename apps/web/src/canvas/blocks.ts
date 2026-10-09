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
}

/** Saved on a sketch shape while it is hidden behind a pending result. */
export const HIDDEN_OPACITY_KEY = "chizmaHiddenOpacity";

interface WithCustomData {
  customData?: Record<string, unknown>;
}

export function blockDataOf(element: WithCustomData): BlockData | null {
  const data = element.customData?.chizma;
  return data && typeof data === "object" ? (data as BlockData) : null;
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
