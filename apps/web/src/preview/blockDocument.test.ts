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
});
