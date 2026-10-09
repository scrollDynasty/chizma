import { describe, expect, it } from "vitest";
import { detectLanguage } from "./index";

describe("detectLanguage", () => {
  it("prefers a stored known language", () => {
    expect(detectLanguage("ru", ["en-US"])).toBe("ru");
  });

  it("maps browser Uzbek Cyrillic and Latin tags", () => {
    expect(detectLanguage(null, ["uz-Cyrl-UZ"])).toBe("uz-Cyrl");
    expect(detectLanguage(null, ["uz-UZ"])).toBe("uz-Latn");
  });

  it("ignores unknown stored values and falls back to Uzbek Latin", () => {
    expect(detectLanguage("de", ["fr-FR"])).toBe("uz-Latn");
  });
});
