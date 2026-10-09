import DOMPurify from "dompurify";

/**
 * The preview iframe gets `sandbox=""` (no scripts, unique origin) and this CSP, so generated
 * code cannot run scripts, reach the network, or touch the editor and its sign-in token.
 */
export const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

// Links inside blocks never navigate: behaviour comes only from the action registry.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.hasAttribute("href") && !node.getAttribute("href")?.startsWith("#")) {
    node.setAttribute("href", "#");
  }
  node.removeAttribute("target");
});

export function sanitizeBlockHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "foreignObject"],
    FORBID_ATTR: ["srcset", "action", "formaction"],
  });
}

/** Block CSS with unbalanced braces could escape its scope; drop it entirely. */
export function safeCss(css: string): string {
  let depth = 0;
  for (const char of css) {
    if (char === "{") depth++;
    if (char === "}" && --depth < 0) return "";
  }
  return depth === 0 ? css.replace(/<\/?style/gi, "") : "";
}

export function withCsp(documentHtml: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  return documentHtml.replace(/<head>/i, `<head>\n${meta}`);
}
