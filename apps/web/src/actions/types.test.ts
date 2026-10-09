import { describe, expect, it } from "vitest";
import { isSafeUrl, isValidAction } from "./types";

describe("isSafeUrl", () => {
  it("allows web, email and phone links only", () => {
    expect(isSafeUrl("https://instagram.com/cafe")).toBe(true);
    expect(isSafeUrl("mailto:hi@cafe.uz")).toBe(true);
    expect(isSafeUrl("tel:+998 90 123 45 67")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,x")).toBe(false);
    expect(isSafeUrl("//evil.example")).toBe(false);
  });
});

describe("isValidAction", () => {
  const blocks = new Set(["b2"]);

  it("needs an existing target for toggle and scroll", () => {
    expect(isValidAction({ type: "toggle", target_id: "b2", start_hidden: true }, blocks)).toBe(
      true,
    );
    expect(isValidAction({ type: "scroll", target_id: "gone" }, blocks)).toBe(false);
  });

  it("needs a title for windows and at least one field for forms", () => {
    expect(isValidAction({ type: "modal", title: " ", text: "", form: null }, blocks)).toBe(false);
    const empty = { fields: [], submit_label: "OK", success_text: "Thanks" };
    expect(isValidAction({ type: "modal", title: "Book", text: "", form: empty }, blocks)).toBe(
      false,
    );
  });
});
