import type { Block, SceneElement } from "@/lib/scene";

/**
 * Generated blocks live on the Excalidraw canvas as "iframe" elements, so people can move,
 * resize, delete and undo them like anything else they drew. The block data is kept in
 * customData.chizma; the rendered, sanitised document in customData.generationData.
 */

export interface BlockData {
  elementId: string;
  kind: string;
  label: string;
  html: string;
  css: string;
  locale: string;
  /** True while the person decides between Accept and Back. */
  pending: boolean;
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

export function blockData(element: SceneElement, block: Block, locale: string): BlockData {
  return {
    elementId: element.id,
    kind: element.kind,
    label: element.label,
    html: block.html,
    css: block.css,
    locale,
    pending: true,
  };
}
