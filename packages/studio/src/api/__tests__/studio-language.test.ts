import { describe, it, expect } from "vitest";
import { normalizeStudioLanguage, pick } from "../server";

describe("normalizeStudioLanguage", () => {
  it("passes through the three known languages", () => {
    expect(normalizeStudioLanguage("zh")).toBe("zh");
    expect(normalizeStudioLanguage("en")).toBe("en");
    expect(normalizeStudioLanguage("vi")).toBe("vi");
  });

  it("defaults to Vietnamese for missing or unknown values", () => {
    expect(normalizeStudioLanguage(undefined)).toBe("vi");
    expect(normalizeStudioLanguage("fr")).toBe("vi");
  });
});

describe("pick", () => {
  it("selects by language", () => {
    expect(pick("zh", "保存", "Save", "Lưu")).toBe("保存");
    expect(pick("en", "保存", "Save", "Lưu")).toBe("Save");
    expect(pick("vi", "保存", "Save", "Lưu")).toBe("Lưu");
  });

  it("falls back to English — never Chinese — when Vietnamese is missing", () => {
    expect(pick("vi", "保存", "Save")).toBe("Save");
  });
});
