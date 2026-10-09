import { describe, expect, it } from "vitest";
import { buildBlockDocument } from "./blockDocument";

describe("buildBlockDocument", () => {
  const doc = buildBlockDocument(
    { html: "<svg></svg>", css: ".roof{fill:red}", locale: "ru", label: "дом <1>" },
    (html) => html,
  );

  it("fills the frame and nests the block CSS under its container", () => {
    expect(doc).toContain(".chz-el{width:100%;height:100%;container-type:size}");
    expect(doc).toContain(".chz-el{.roof{fill:red}}");
    expect(doc).toContain('<div class="chz-el"><svg></svg></div>');
  });

  it("keeps a transparent background so the canvas shows through", () => {
    expect(doc).toContain("background:transparent");
  });

  it("escapes the title and sets the language", () => {
    expect(doc).toContain("<title>дом &lt;1&gt;</title>");
    expect(doc).toContain('<html lang="ru">');
  });

  it("outlines wired and selected parts, ignoring unsafe ids", () => {
    const marked = buildBlockDocument(
      { html: "", css: "", locale: "ru", label: "nav" },
      (html) => html,
      { wired: ["p1", "p2", "x}body{"], selected: "p2" },
    );
    expect(marked).toContain('[data-chz-part="p1"]{outline:2px dashed');
    expect(marked).toContain('[data-chz-part="p2"]{outline:3px solid');
    expect(marked).not.toContain("x}body{");
  });
});
