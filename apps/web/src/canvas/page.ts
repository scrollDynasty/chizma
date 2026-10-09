import { boundsOf, type DrawnElement } from "./shapes";

/**
 * The site page on the canvas: a locked white sheet as wide as a desktop screen. Everything is
 * drawn inside it; elements pushed past its sides are pulled back in, and it grows downwards
 * with the content. The phone layout is derived automatically from it ("Open as site").
 */
export const PAGE_ID = "chizma-page";
export const PAGE_WIDTH = 1280;
export const MIN_PAGE_HEIGHT = 900;
const BOTTOM_ROOM = 240;

interface PageItem extends DrawnElement {
  isDeleted?: boolean;
  locked?: boolean;
  customData?: Record<string, unknown>;
}

export const isPage = (element: { id: string; customData?: Record<string, unknown> }) =>
  element.id === PAGE_ID || element.customData?.chizmaPage === true;

/** A fresh page element (completed with defaults by Excalidraw's restoreElements). */
export function newPage(height = MIN_PAGE_HEIGHT) {
  return {
    id: PAGE_ID,
    type: "rectangle" as const,
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height,
    strokeColor: "#e7e5e4",
    backgroundColor: "#ffffff",
    fillStyle: "solid" as const,
    strokeWidth: 1,
    roughness: 0,
    roundness: null,
    opacity: 100,
    locked: true,
    customData: { chizmaPage: true },
  };
}

/** Lines and free drawings keep their shape: they are moved, never resized. */
const RESIZABLE = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
  "iframe",
  "embeddable",
  "text",
]);

export type Patch = { x?: number; width?: number; y?: number; height?: number };

/**
 * Pull elements back inside the page width and grow the page to fit its content.
 * Returns the patches to apply (by element id); empty when nothing has to change.
 */
export function fitToPage(elements: readonly PageItem[]): Map<string, Patch> {
  const patches = new Map<string, Patch>();
  const page = elements.find((e) => isPage(e) && !e.isDeleted);
  if (!page) return patches;
  const left = page.x;
  const right = page.x + page.width;
  let bottom = page.y;

  for (const element of elements) {
    if (element.isDeleted || isPage(element)) continue;
    const box = boundsOf([element]);
    if (!box) continue;
    const patch: Patch = {};
    let width = box.width;
    if (width > page.width && RESIZABLE.has(element.type)) {
      patch.width = page.width;
      width = page.width;
    }
    let shift = 0;
    if (width > page.width) {
      // Too wide to fit (a long line): align it to the left edge once, never ping-pong.
      if (Math.abs(box.x - left) > 0.5) shift = left - box.x;
    } else if (box.x < left) shift = left - box.x;
    else if (box.x + width > right) shift = right - (box.x + width);
    if (shift !== 0) patch.x = element.x + shift;
    if (box.y < page.y) patch.y = element.y + (page.y - box.y);
    if (Object.keys(patch).length > 0) patches.set(element.id, patch);
    bottom = Math.max(bottom, box.y + box.height + Math.max(0, (patch.y ?? element.y) - element.y));
  }

  const height = Math.max(MIN_PAGE_HEIGHT, Math.ceil(bottom - page.y + BOTTOM_ROOM));
  if (Math.abs(height - page.height) > 1) patches.set(page.id, { height });
  return patches;
}
