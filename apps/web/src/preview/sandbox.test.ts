import { describe, expect, it } from "vitest";
import { PREVIEW_CSP, sanitizeBlockHtml, withCsp } from "./sandbox";

describe("sanitizeBlockHtml", () => {
  it("removes scripts and event handlers but keeps SVG", () => {
    const html =
      '<svg viewBox="0 0 10 10"><circle r="4"/></svg><img src="x" onerror="alert(1)"><script>alert(2)</script>';

    const clean = sanitizeBlockHtml(html);

    expect(clean).toContain("<circle");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("<script");
  });
});

describe("withCsp", () => {
  it("adds a policy that blocks scripts and network access", () => {
    const doc = withCsp("<!doctype html><html><head><title>x</title></head><body></body></html>");

    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`);
    expect(PREVIEW_CSP).toContain("default-src 'none'");
    expect(PREVIEW_CSP).not.toContain("script-src");
  });
});
