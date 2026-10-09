import type { Action } from "@/actions/types";
import { sanitizeBlockHtml } from "@/preview/sandbox";

/**
 * Clickable parts inside a generated block (links and buttons of a navigation bar, say).
 * Ids are assigned by us after sanitising, in document order (p1, p2, ...); model output can
 * never set them (DOMPurify drops data-* and the server rejects data-chz*). Parsing uses an
 * inert DOMParser document: nothing executes and nothing is fetched.
 */
export const PART_ATTR = "data-chz-part";
const PART_SELECTOR = 'a, button, [role="button"], input[type="submit"], input[type="button"]';
const MAX_PARTS = 40;
export const PART_ID = /^p([1-9]|[1-3]\d|40)$/;

export interface Part {
  id: string;
  label: string;
}

const labelOf = (node: Element) =>
  (node.textContent || node.getAttribute("aria-label") || node.getAttribute("value") || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

/** Mark every clickable part of already sanitised html with its id. Idempotent. */
export function annotateParts(html: string): { html: string; parts: Part[] } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const parts: Part[] = [];
  for (const node of doc.body.querySelectorAll(`[${PART_ATTR}]`)) node.removeAttribute(PART_ATTR);
  doc.body.querySelectorAll(PART_SELECTOR).forEach((node, index) => {
    if (index >= MAX_PARTS) return;
    const id = `p${index + 1}`;
    node.setAttribute(PART_ATTR, id);
    parts.push({ id, label: labelOf(node) || id });
  });
  return { html: doc.body.innerHTML, parts };
}

const cache = new Map<string, { html: string; parts: Part[] }>();

/** Sanitised block html with its parts marked (cached: blocks are re-rendered often). */
export function markedBlockHtml(raw: string): { html: string; parts: Part[] } {
  let result = cache.get(raw);
  if (!result) {
    result = annotateParts(sanitizeBlockHtml(raw));
    if (cache.size > 300) cache.clear();
    cache.set(raw, result);
  }
  return result;
}

export const blockParts = (raw: string) => markedBlockHtml(raw).parts;

/**
 * After a block changes (new or earlier version), keep each part action on the part with the
 * same text; repeated texts ("More", "More") are matched in order.
 */
export function remapPartActions(
  previous: readonly Part[],
  actions: Readonly<Record<string, Action>>,
  next: readonly Part[],
): Record<string, Action> {
  const queues = new Map<string, string[]>();
  for (const part of previous) {
    const key = part.label.toLowerCase();
    queues.set(key, [...(queues.get(key) ?? []), part.id]);
  }
  const result: Record<string, Action> = {};
  for (const part of next) {
    const oldId = queues.get(part.label.toLowerCase())?.shift();
    const action = oldId ? actions[oldId] : undefined;
    if (action) result[part.id] = action;
  }
  return result;
}

/** A part's box inside its block, in block units (canvas px at zoom 1). */
export interface PartRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part under a point of the block (smallest box wins; a few px of slack for thin links). */
export function hitPart(rects: readonly PartRect[], x: number, y: number, slack = 4) {
  let best: PartRect | null = null;
  for (const rect of rects) {
    const inside =
      x >= rect.x - slack &&
      x <= rect.x + rect.width + slack &&
      y >= rect.y - slack &&
      y <= rect.y + rect.height + slack;
    if (inside && (!best || rect.width * rect.height < best.width * best.height)) best = rect;
  }
  return best?.id ?? null;
}
