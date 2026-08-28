import { describe, it, expect } from "vitest";
import { resolveUiLanguage, translate } from "../hooks/use-i18n";

describe("resolveUiLanguage", () => {
  it("passes through the three known languages", () => {
    expect(resolveUiLanguage("zh")).toBe("zh");
    expect(resolveUiLanguage("en")).toBe("en");
    expect(resolveUiLanguage("vi")).toBe("vi");
  });

  it("defaults to Vietnamese for missing or unknown values", () => {
    expect(resolveUiLanguage(undefined)).toBe("vi");
    expect(resolveUiLanguage(null)).toBe("vi");
    expect(resolveUiLanguage("")).toBe("vi");
    expect(resolveUiLanguage("fr")).toBe("vi");
  });
});

describe("translate", () => {
  it("returns Chinese in zh mode", () => {
    expect(translate("common.save", "zh")).toBe("保存");
  });

  it("returns English in en mode", () => {
    expect(translate("common.save", "en")).toBe("Save");
  });

  it("falls back to English — never Chinese — for untranslated keys", () => {
    // "logs.showingRecent" is deliberately outside this pass's translation scope,
    // so it exercises the fallback both now and after Task 7.
    expect(translate("logs.showingRecent", "vi")).toBe("Showing recent log entries.");
  });
});
