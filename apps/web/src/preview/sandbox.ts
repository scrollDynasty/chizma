import DOMPurify from "dompurify";

/**
 * The preview iframe gets `sandbox=""` (no scripts, unique origin) and this CSP, so generated
 * code cannot run scripts, reach the network, or touch the editor and its sign-in token.
 */
export const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

export function sanitizeBlockHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "foreignObject"],
    FORBID_ATTR: ["srcset", "action", "formaction"],
  });
}

export function withCsp(documentHtml: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  return documentHtml.replace(/<head>/i, `<head>\n${meta}`);
}
