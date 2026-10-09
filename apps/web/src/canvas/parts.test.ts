import { describe, expect, it } from "vitest";
import { annotateParts, blockParts, hitPart, markedBlockHtml, remapPartActions } from "./parts";

const NAV =
  '<nav><a href="#">Главная</a><a href="#">Услуги</a><button type="button">Связаться</button></nav>';

describe("annotateParts", () => {
  it("marks links and buttons in order and lists them", () => {
    const { html, parts } = annotateParts(NAV);

    expect(parts).toEqual([
      { id: "p1", label: "Главная" },
      { id: "p2", label: "Услуги" },
      { id: "p3", label: "Связаться" },
    ]);
    expect(html).toContain('data-chz-part="p3"');
  });

  it("is idempotent and replaces stray marks", () => {
    const once = annotateParts(NAV).html;
    expect(annotateParts(once).html).toBe(once);
    expect(annotateParts('<span data-chz-part="p9">x</span>').html).not.toContain("p9");
  });
});

describe("markedBlockHtml", () => {
  it("sanitises first: model-made marks and scripts never survive", () => {
    const raw = `<a href="https://evil.example" data-chz-part="p7" onclick="x()">Go</a><script>x()</script>`;
    const { html, parts } = markedBlockHtml(raw);

    expect(parts).toEqual([{ id: "p1", label: "Go" }]);
    expect(html).not.toContain("p7");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("script");
    expect(html).not.toContain("evil");
    expect(blockParts(raw)).toEqual(parts);
  });
});

describe("remapPartActions", () => {
  const action = { type: "scroll" as const, target_id: "b2" };

  it("keeps actions on parts with the same text after a regeneration", () => {
    const before = [
      { id: "p1", label: "Главная" },
      { id: "p2", label: "Связаться" },
    ];
    const after = [
      { id: "p1", label: "Меню" },
      { id: "p2", label: "Главная" },
      { id: "p3", label: "Связаться" },
    ];

    expect(remapPartActions(before, { p2: action }, after)).toEqual({ p3: action });
  });

  it("matches repeated texts in order and drops parts that are gone", () => {
    const before = [
      { id: "p1", label: "Ещё" },
      { id: "p2", label: "Ещё" },
    ];
    const after = [{ id: "p1", label: "Ещё" }];

    expect(remapPartActions(before, { p2: action }, after)).toEqual({});
    expect(remapPartActions(before, { p1: action }, after)).toEqual({ p1: action });
  });
});

describe("hitPart", () => {
  const rects = [
    { id: "p1", x: 0, y: 0, width: 400, height: 60 },
    { id: "p2", x: 300, y: 10, width: 80, height: 30 },
  ];

  it("picks the smallest part under the point", () => {
    expect(hitPart(rects, 320, 20)).toBe("p2");
    expect(hitPart(rects, 100, 20)).toBe("p1");
    expect(hitPart(rects, 100, 200)).toBeNull();
  });
});
