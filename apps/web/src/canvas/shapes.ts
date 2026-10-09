/**
 * Simplified vector description of the drawing, sent to the API next to the PNG.
 * Coordinates are relative to the drawing's bounding box so the model sees a stable frame.
 */
export interface SketchShape {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string | null;
  text: string | null;
}

export interface SketchBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The subset of an Excalidraw element we read. Kept structural so tests need no Excalidraw. */
export interface DrawnElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  text?: string;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function visibleElements<T extends DrawnElement>(elements: readonly T[]): T[] {
  return elements.filter((element) => !element.isDeleted);
}

export function boundsOf(elements: readonly DrawnElement[]): SketchBounds | null {
  if (elements.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const element of elements) {
    // Lines and arrows can have negative width/height relative to their origin.
    const x1 = Math.min(element.x, element.x + element.width);
    const y1 = Math.min(element.y, element.y + element.height);
    const x2 = Math.max(element.x, element.x + element.width);
    const y2 = Math.max(element.y, element.y + element.height);
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function simplifyShapes(elements: readonly DrawnElement[]): {
  bounds: SketchBounds | null;
  shapes: SketchShape[];
} {
  const visible = visibleElements(elements);
  const bounds = boundsOf(visible);
  if (!bounds) return { bounds: null, shapes: [] };
  const shapes = visible.map((element) => {
    const x = Math.min(element.x, element.x + element.width);
    const y = Math.min(element.y, element.y + element.height);
    const fill = element.backgroundColor;
    return {
      id: element.id,
      type: element.type,
      x: round(x - bounds.x),
      y: round(y - bounds.y),
      width: round(Math.abs(element.width)),
      height: round(Math.abs(element.height)),
      stroke: element.strokeColor ?? "#000000",
      fill: fill && fill !== "transparent" ? fill : null,
      text: element.type === "text" && element.text ? element.text : null,
    };
  });
  return { bounds, shapes };
}
