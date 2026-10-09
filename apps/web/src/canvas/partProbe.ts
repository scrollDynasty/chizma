import { buildBlockDocument } from "@/preview/blockDocument";
import { withCsp } from "@/preview/sandbox";
import type { BlockData } from "./blocks";
import { markedBlockHtml, PART_ATTR, type PartRect } from "./parts";

/**
 * Where each part of a block is laid out, measured in an off-screen copy of the block.
 * The copy is sandboxed without allow-scripts (nothing in it can run) but with
 * allow-same-origin, so the editor can read the layout; its CSP blocks every request.
 * Blocks on the canvas keep their own script-free, cross-origin frames.
 */
const LOAD_TIMEOUT_MS = 3000;
const pending = new Map<string, Promise<PartRect[]>>();
const measured = new Map<string, PartRect[]>();

const keyOf = (data: BlockData, width: number, height: number) =>
  `${Math.round(width)}x${Math.round(height)}|${data.css}|${data.html}`;

function measure(data: BlockData, width: number, height: number): Promise<PartRect[]> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.round(width)}px;height:${Math.round(height)}px;border:0;visibility:hidden;pointer-events:none`;
    const done = (rects: PartRect[]) => {
      window.clearTimeout(timer);
      frame.remove();
      resolve(rects);
    };
    const timer = window.setTimeout(() => done([]), LOAD_TIMEOUT_MS);
    frame.addEventListener("load", () => {
      const doc = frame.contentDocument;
      if (!doc) return done([]);
      const rects = [...doc.querySelectorAll(`[${PART_ATTR}]`)].map((node) => {
        const box = node.getBoundingClientRect();
        return {
          id: node.getAttribute(PART_ATTR) as string,
          x: box.left,
          y: box.top,
          width: box.width,
          height: box.height,
        };
      });
      done(rects.filter((r) => r.width > 0 && r.height > 0));
    });
    frame.srcdoc = withCsp(buildBlockDocument(data, (html) => markedBlockHtml(html).html));
    document.body.append(frame);
  });
}

/** Part boxes of a block at its current size (measured once per html, css and size). */
export function partRects(data: BlockData, width: number, height: number): Promise<PartRect[]> {
  const key = keyOf(data, width, height);
  const known = measured.get(key);
  if (known) return Promise.resolve(known);
  let running = pending.get(key);
  if (!running) {
    running = measure(data, width, height).then((rects) => {
      pending.delete(key);
      if (measured.size > 100) measured.clear();
      measured.set(key, rects);
      return rects;
    });
    pending.set(key, running);
  }
  return running;
}

/** Already measured boxes, or undefined (and a measurement starts) — for hover feedback. */
export function cachedPartRects(data: BlockData, width: number, height: number) {
  const rects = measured.get(keyOf(data, width, height));
  if (!rects) void partRects(data, width, height);
  return rects;
}
