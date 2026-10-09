import type { Block, SceneGraph } from "@/lib/scene";

/**
 * Lays generated blocks exactly over the drawing: every element is absolutely positioned at
 * its drawn place and size, as percentages of the visible canvas. This is the 1:1 view shown
 * in place of the sketch. (The responsive page for publishing is built by pageBuilder.)
 */

export interface OverlayOptions {
  sanitizeHtml: (html: string) => string;
  /** Canvas size in pixels at generation time. Like the canvas itself, the result keeps this
   * size and top-left anchor when the window changes instead of stretching. */
  stage?: { width: number; height: number };
}

const escapeText = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
  );

const pct = (value: number) => `${(value * 100).toFixed(3)}%`;

/** Block CSS is nested under its container so it cannot style the rest of the page. */
const scopeCss = (id: string, css: string) =>
  css.trim() ? `[data-el="${id}"]{${css.replace(/<\/?style/gi, "")}}` : "";

export function buildOverlay(
  scene: SceneGraph,
  blocks: readonly Block[],
  options: OverlayOptions,
): string {
  const byId = new Map(blocks.map((block) => [block.element_id, block]));
  // Bigger elements first so smaller ones drawn inside them stay on top.
  const elements = scene.elements
    .filter((element) => byId.has(element.id))
    .sort((a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h);

  const cells = elements.map((element, index) => {
    const block = byId.get(element.id) as Block;
    const { x, y, w, h } = element.bbox;
    const style = `left:${pct(x)};top:${pct(y)};width:${pct(w)};height:${pct(h)};animation-delay:${index * 60}ms`;
    return `<div class="chz-el" data-el="${escapeText(element.id)}" style="${style}">${options.sanitizeHtml(block.html)}</div>`;
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
html,body{margin:0;height:100%;overflow:hidden;background:#fff}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1917}
.chz-stage{position:relative;width:${options.stage ? `${Math.round(options.stage.width)}px` : "100%"};height:${options.stage ? `${Math.round(options.stage.height)}px` : "100%"}}
.chz-el{position:absolute;container-type:size;animation:chz-in .45s cubic-bezier(.2,.7,.2,1) both}
.chz-el>svg{width:100%;height:100%;display:block}
@keyframes chz-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.chz-el{animation:none}}
${blockCss}
</style>
</head>
<body>
<div class="chz-stage">
${cells.join("\n")}
</div>
</body>
</html>`;
}
