import type { BlockData } from "@/canvas/blocks";
import { safeCss } from "./sandbox";

/**
 * One self-contained document for one block. The block fills its frame exactly; the frame is a
 * size container so text can be sized with cqh/cqw to fit the drawn box.
 */
const escapeText = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
  );

export function buildBlockDocument(
  block: Pick<BlockData, "html" | "css" | "locale" | "label">,
  sanitizeHtml: (html: string) => string,
): string {
  const css = safeCss(block.css);
  return `<!doctype html>
<html lang="${escapeText(block.locale)}">
<head>
<meta charset="utf-8">
<title>${escapeText(block.label)}</title>
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1917}
.chz-el{width:100%;height:100%;container-type:size}
.chz-el>svg{width:100%;height:100%;display:block}
.chz-el{${css}}
</style>
</head>
<body><div class="chz-el">${sanitizeHtml(block.html)}</div></body>
</html>`;
}
