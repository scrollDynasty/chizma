import { describe, expect, it } from "vitest";
import { fitToPage, MIN_PAGE_HEIGHT, newPage, PAGE_ID } from "./page";

const page = { ...newPage(), isDeleted: false };
const item = (id: string, type: string, x: number, y: number, width: number, height: number) => ({
  id,
  type,
  x,
  y,
  width,
  height,
  isDeleted: false,
});

describe("fitToPage", () => {
  it("leaves content inside the page alone", () => {
    expect(fitToPage([page, item("a", "rectangle", 100, 100, 200, 100)]).size).toBe(0);
  });

  it("pulls elements that stick out back inside the page width", () => {
    const patches = fitToPage([
      page,
      item("right", "rectangle", 1200, 100, 300, 100),
      item("left", "ellipse", -80, 100, 100, 100),
    ]);

    expect(patches.get("right")).toEqual({ x: 980 });
    expect(patches.get("left")).toEqual({ x: 0 });
  });

  it("never lets a block be wider than the page", () => {
    const patches = fitToPage([page, item("huge", "iframe", -5000, 100, 99999, 300)]);

    expect(patches.get("huge")).toEqual({ width: 1280, x: 0 });
  });

  it("moves free drawings instead of distorting them", () => {
    const patches = fitToPage([page, item("scribble", "freedraw", 1250, 100, 100, 40)]);

    expect(patches.get("scribble")).toEqual({ x: 1180 });
  });

  it("grows the page downwards with the content and keeps a minimum height", () => {
    const patches = fitToPage([page, item("low", "rectangle", 100, 2000, 200, 100)]);

    expect(patches.get(PAGE_ID)?.height).toBe(2340);
    expect(fitToPage([{ ...page, height: 3000 }]).get(PAGE_ID)?.height).toBe(MIN_PAGE_HEIGHT);
  });

  it("settles strokes wider than the page instead of moving them back and forth", () => {
    const first = fitToPage([page, item("line", "line", 100, 100, 1500, 0)]);
    expect(first.get("line")).toEqual({ x: 0 });

    expect(fitToPage([page, item("line", "line", 0, 100, 1500, 0)]).get("line")).toBeUndefined();
  });
});
