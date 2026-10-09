import { describe, expect, it } from "vitest";
import { boundsOf, simplifyShapes } from "./shapes";

const rect = {
  id: "r1",
  type: "rectangle",
  x: 100,
  y: 50,
  width: 200,
  height: 120,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
};
const sun = {
  id: "s1",
  type: "ellipse",
  x: 400,
  y: 20,
  width: 80,
  height: 80,
  strokeColor: "#f08c00",
  backgroundColor: "#ffec99",
};

describe("simplifyShapes", () => {
  it("returns nothing for an empty or fully deleted drawing", () => {
    expect(simplifyShapes([])).toEqual({ bounds: null, shapes: [] });
    expect(simplifyShapes([{ ...rect, isDeleted: true }]).shapes).toEqual([]);
  });

  it("makes coordinates relative to the drawing and keeps colours", () => {
    const { bounds, shapes } = simplifyShapes([rect, sun]);

    expect(bounds).toEqual({ x: 100, y: 20, width: 380, height: 150 });
    expect(shapes).toEqual([
      {
        id: "r1",
        type: "rectangle",
        x: 0,
        y: 30,
        width: 200,
        height: 120,
        stroke: "#1e1e1e",
        fill: null,
        text: null,
      },
      {
        id: "s1",
        type: "ellipse",
        x: 300,
        y: 0,
        width: 80,
        height: 80,
        stroke: "#f08c00",
        fill: "#ffec99",
        text: null,
      },
    ]);
  });

  it("keeps handwritten text and normalises lines drawn right-to-left", () => {
    const line = { id: "l1", type: "line", x: 50, y: 50, width: -40, height: -10 };
    const label = { id: "t1", type: "text", x: 0, y: 0, width: 60, height: 20, text: "Menu" };

    expect(boundsOf([line])).toEqual({ x: 10, y: 40, width: 40, height: 10 });
    expect(simplifyShapes([label]).shapes[0]?.text).toBe("Menu");
  });
});
