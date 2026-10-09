import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

describe("safeNext", () => {
  it("keeps in-app paths", () => {
    expect(safeNext("/new?draft=1")).toBe("/new?draft=1");
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(safeNext("https://evil.example")).toBe("/new");
    expect(safeNext("//evil.example")).toBe("/new");
    const backslash = String.fromCharCode(92);
    expect(safeNext(`/${backslash}evil.example`)).toBe("/new");
    expect(safeNext(null)).toBe("/new");
  });
});
