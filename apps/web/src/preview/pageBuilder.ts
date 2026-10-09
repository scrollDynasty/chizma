import type { Block, SceneElement, SceneGraph } from "@/lib/scene";

/**
 * Turns a scene graph + blocks into one self-contained HTML page.
 *
 * Layout follows the drawing: elements are grouped into rows by vertical overlap, each row
 * becomes a CSS grid whose columns keep the drawn widths and horizontal gaps. Below 640 px
 * every row collapses into a single column.
 */

export interface BuildOptions {
  /** Drawing width / height, used to keep drawn proportions of pictures. */
  aspect: number;
  /** Sanitises a block's HTML fragment (DOMPurify in the browser). */
  sanitizeHtml: (html: string) => string;
}

/** Pictures keep the drawn proportions; everything else grows with its content. */
const PICTURE_KINDS = new Set([
  "illustration",
  "image",
  "icon",
  "picture",
  "photo",
  "logo",
  "map",
  "drawing",
]);

const MIN_GAP = 0.03;

function horizontalOverlap(a: SceneElement, b: SceneElement): number {
  return Math.min(a.bbox.x + a.bbox.w, b.bbox.x + b.bbox.w) - Math.max(a.bbox.x, b.bbox.x);
}

export function groupIntoRows(elements: readonly SceneElement[]): SceneElement[][] {
  const sorted = [...elements].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const rows: { top: number; bottom: number; items: SceneElement[] }[] = [];
  for (const element of sorted) {
    const top = element.bbox.y;
    const bottom = element.bbox.y + element.bbox.h;
    const row = rows.at(-1);
    if (row) {
      const overlap = Math.min(bottom, row.bottom) - Math.max(top, row.top);
      const smaller = Math.min(bottom - top, row.bottom - row.top) || 1e-6;
      // Things drawn above/below each other (a roof over walls) stack instead of sitting side by side.
      const stacked = row.items.some((item) => horizontalOverlap(item, element) > MIN_GAP);
      if (overlap / smaller > 0.3 && !stacked) {
        row.items.push(element);
        row.top = Math.min(row.top, top);
        row.bottom = Math.max(row.bottom, bottom);
        continue;
      }
    }
    rows.push({ top, bottom, items: [element] });
  }
  return rows.map((row) => row.items.sort((a, b) => a.bbox.x - b.bbox.x));
}

/** Grid columns for a row: drawn widths as fr units, with spacer columns for real gaps. */
export function rowColumns(items: readonly SceneElement[]): string[] {
  const columns: string[] = [];
  let cursor = 0;
  for (const item of items) {
    const gap = item.bbox.x - cursor;
    if (gap > MIN_GAP) columns.push(`spacer:${gap.toFixed(3)}fr`);
    columns.push(`${Math.max(item.bbox.w, 0.05).toFixed(3)}fr`);
    cursor = Math.max(cursor, item.bbox.x + item.bbox.w);
  }
  if (1 - cursor > MIN_GAP) columns.push(`spacer:${(1 - cursor).toFixed(3)}fr`);
  return columns;
}

const escapeText = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
  );

/** Block CSS is nested under its container so it cannot style the rest of the page. */
const scopeCss = (id: string, css: string) =>
  css.trim() ? `[data-el="${id}"]{${css.replace(/<\/?style/gi, "")}}` : "";

export function buildPage(
  scene: SceneGraph,
  blocks: readonly Block[],
  options: BuildOptions,
): string {
  const byId = new Map(blocks.map((block) => [block.element_id, block]));
  const elements = scene.elements.filter((element) => byId.has(element.id));
  const rows = groupIntoRows(elements);

  const rowHtml = rows.map((items, index) => {
    const columns = rowColumns(items);
    const template = columns.map((c) => c.replace("spacer:", "")).join(" ");
    let itemIndex = 0;
    const cells = columns.map((column) => {
      if (column.startsWith("spacer:")) return '<div class="chz-spacer" aria-hidden="true"></div>';
      const element = items[itemIndex++] as SceneElement;
      const block = byId.get(element.id) as Block;
      const flowing = !PICTURE_KINDS.has(element.kind.toLowerCase());
      const ratio = (element.bbox.w * options.aspect) / Math.max(element.bbox.h, 0.01);
      const style = flowing ? "" : ` style="aspect-ratio:${ratio.toFixed(3)}"`;
      return `<div class="chz-cell${flowing ? " chz-flow" : ""}" data-el="${escapeText(element.id)}"${style}>${options.sanitizeHtml(block.html)}</div>`;
    });
    return `<section class="chz-row" data-row="${index}" style="grid-template-columns:${template}">${cells.join("")}</section>`;
  });

  const blockCss = elements
    .map((element) => scopeCss(element.id, (byId.get(element.id) as Block).css))
    .join("\n");

  return `<!doctype html>
<html lang="${escapeText(scene.page.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(scene.page.title)}</title>
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1917;background:#fff;line-height:1.5}
.chz-page{max-width:1120px;margin:0 auto;padding:clamp(16px,4vw,48px);display:flex;flex-direction:column;gap:clamp(16px,3vw,40px)}
.chz-row{display:grid;gap:clamp(12px,2vw,32px);align-items:start}
.chz-cell{min-width:0;position:relative}
.chz-cell>svg{width:100%;height:100%;display:block}
/* Pictures keep drawn proportions but never dominate the screen. */
.chz-cell:not(.chz-flow){max-height:min(60vh,480px)}
@media (max-width:640px){.chz-row{grid-template-columns:1fr!important}.chz-spacer{display:none}}
${blockCss}
</style>
</head>
<body>
<main class="chz-page">
${rowHtml.join("\n")}
</main>
</body>
</html>`;
}
