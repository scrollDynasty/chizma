import type { Action } from "@/actions/types";
import { RUNTIME_JS } from "./runtime";

/**
 * Builds a real, responsive web page from the blocks on the site sheet.
 *
 * Desktop: rows follow the sheet (things drawn side by side share a row, things drawn above
 * each other stack), widths and gaps keep the drawn proportions, the page scales with the
 * window. Phones: one column, each block at most its drawn width, text blocks never shrink
 * below a readable height. Only our runtime script may run (CSP nonce).
 */

export interface SiteBlock {
  id: string;
  kind: string;
  label: string;
  html: string;
  css: string;
  x: number;
  y: number;
  width: number;
  height: number;
  action: Action | null;
}

export interface SiteOptions {
  pageWidth: number;
  title: string;
  locale: string;
  sanitizeHtml: (html: string) => string;
  /** CSP nonce allowing only the runtime script. */
  nonce: string;
  /** Where forms are sent: the API (published site) or the editor window (preview). */
  submit: { mode: "api"; apiUrl: string } | { mode: "parent" };
}

const PICTURES = new Set([
  "illustration",
  "image",
  "icon",
  "picture",
  "photo",
  "logo",
  "map",
  "drawing",
]);
const MIN_GAP = 12;

const escapeText = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
  );

const overlapX = (a: SiteBlock, b: SiteBlock) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);

/** Group blocks into rows: vertical overlap joins a row unless they also overlap horizontally. */
export function siteRows(blocks: readonly SiteBlock[]) {
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { top: number; bottom: number; items: SiteBlock[] }[] = [];
  for (const block of sorted) {
    const row = rows.at(-1);
    if (row) {
      const overlap = Math.min(block.y + block.height, row.bottom) - Math.max(block.y, row.top);
      const smaller = Math.min(block.height, row.bottom - row.top) || 1;
      const stacked = row.items.some((item) => overlapX(item, block) > MIN_GAP);
      if (overlap / smaller > 0.3 && !stacked) {
        row.items.push(block);
        row.top = Math.min(row.top, block.y);
        row.bottom = Math.max(row.bottom, block.y + block.height);
        continue;
      }
    }
    rows.push({ top: block.y, bottom: block.y + block.height, items: [block] });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

/** Grid columns in drawn pixels (as fr), with spacer columns for real gaps. */
export function columnsFor(items: readonly SiteBlock[], pageWidth: number): string[] {
  const columns: string[] = [];
  let cursor = 0;
  for (const item of items) {
    const gap = item.x - cursor;
    if (gap > MIN_GAP) columns.push(`spacer:${Math.round(gap)}fr`);
    columns.push(`${Math.max(Math.round(item.width), 1)}fr`);
    cursor = Math.max(cursor, item.x + item.width);
  }
  if (pageWidth - cursor > MIN_GAP) columns.push(`spacer:${Math.round(pageWidth - cursor)}fr`);
  return columns;
}

/** Targets of "show/hide" actions that start hidden. */
function hiddenAtStart(blocks: readonly SiteBlock[]) {
  const hidden = new Set<string>();
  for (const block of blocks) {
    if (block.action?.type === "toggle" && block.action.start_hidden) {
      hidden.add(block.action.target_id);
    }
  }
  return hidden;
}

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;background:#fff}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1917;line-height:1.4}
.chz-row{display:grid;align-items:start}
.chz-cell{position:relative;min-width:0;container-type:size;overflow:hidden}
.chz-cell[hidden]{display:none}
.chz-cell[data-chz-action]{cursor:pointer}
.chz-cell[data-chz-action]:focus-visible{outline:2px solid #f59e0b;outline-offset:2px}
.chz-cell>svg{width:100%;height:100%;display:block}
.chz-modal{border:0;border-radius:16px;padding:24px;max-width:min(92vw,440px);width:100%;box-shadow:0 20px 60px rgb(0 0 0/.2)}
.chz-modal::backdrop{background:rgb(0 0 0/.35)}
.chz-modal h2{margin:0 32px 8px 0;font-size:20px}
.chz-text{white-space:pre-line;color:#57534e}
.chz-close{position:absolute;top:12px;right:12px;border:0;background:none;font-size:22px;cursor:pointer}
.chz-form{display:flex;flex-direction:column;gap:6px;margin-top:12px}
.chz-form input,.chz-form textarea{font:inherit;padding:10px 12px;border:1px solid #d6d3d1;border-radius:10px}
.chz-form textarea{min-height:90px}
.chz-submit{margin-top:8px;font:inherit;font-weight:600;padding:12px;border:0;border-radius:999px;background:#1c1917;color:#fff;cursor:pointer}
.chz-success{color:#16a34a;font-weight:600}
.chz-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
@media (max-width:700px){
  .chz-page{padding:16px 16px 40px}
  .chz-row{grid-template-columns:1fr!important;margin-top:16px!important;gap:16px}
  .chz-spacer{display:none}
  .chz-cell{width:min(100%,var(--w));justify-self:center;min-height:calc(var(--h)*var(--keep))}
}`;

export function buildSite(blocks: readonly SiteBlock[], options: SiteOptions): string {
  const rows = siteRows(blocks);
  const hidden = hiddenAtStart(blocks);
  let previousBottom = 0;

  const rowHtml = rows.map((row) => {
    const columns = columnsFor(row.items, options.pageWidth);
    const gap = Math.max(0, row.top - previousBottom);
    previousBottom = row.bottom;
    const marginTop = ((gap / options.pageWidth) * 100).toFixed(3);
    let index = 0;
    const cells = columns.map((column) => {
      if (column.startsWith("spacer:")) return '<div class="chz-spacer" aria-hidden="true"></div>';
      const block = row.items[index++] as SiteBlock;
      const picture = PICTURES.has(block.kind.toLowerCase());
      const style = [
        `aspect-ratio:${Math.round(block.width)}/${Math.max(Math.round(block.height), 1)}`,
        `--w:${Math.round(block.width)}px`,
        `--h:${Math.round(block.height)}px`,
        `--keep:${picture ? 0 : 0.7}`,
      ].join(";");
      const action = block.action
        ? ` data-chz-action="${escapeText(JSON.stringify(block.action))}" role="button" tabindex="0"`
        : "";
      const hide = hidden.has(block.id) ? " hidden" : "";
      return `<div class="chz-cell" data-el="${escapeText(block.id)}" style="${style}"${action}${hide}>${options.sanitizeHtml(block.html)}</div>`;
    });
    const template = columns.map((c) => c.replace("spacer:", "")).join(" ");
    return `<section class="chz-row" style="grid-template-columns:${template};margin-top:${marginTop}%">${cells.join("")}</section>`;
  });

  const blockCss = blocks
    .filter((b) => b.css.trim())
    .map((b) => `[data-el="${b.id}"]{${b.css.replace(/<\/?style/gi, "")}}`)
    .join("\n");
  const submit =
    options.submit.mode === "api"
      ? `data-chz-submit="api" data-chz-api="${escapeText(options.submit.apiUrl)}"`
      : 'data-chz-submit="parent"';
  const connect = options.submit.mode === "api" ? escapeText(options.submit.apiUrl) : "'none'";
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    `script-src 'nonce-${options.nonce}'`,
    `connect-src ${connect}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");

  return `<!doctype html>
<html lang="${escapeText(options.locale)}" ${submit}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${escapeText(options.title)}</title>
<style>${BASE_CSS}
.chz-page{width:100%;max-width:${options.pageWidth}px;margin:0 auto;padding-bottom:48px}
${blockCss}
</style>
</head>
<body>
<main class="chz-page">
${rowHtml.join("\n")}
</main>
<script nonce="${options.nonce}">${RUNTIME_JS}</script>
</body>
</html>`;
}
