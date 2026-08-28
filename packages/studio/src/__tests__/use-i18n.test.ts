import { describe, it, expect } from "vitest";
import { resolveUiLanguage, translate, strings } from "../hooks/use-i18n";
import type { StringKey } from "../hooks/use-i18n";

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

  it("falls back to English — never Chinese — for any key without Vietnamese", () => {
    // Every shipped key now carries `vi`, so this set is currently empty and the
    // assertion is self-maintaining: it starts checking the moment someone adds a
    // key without a Vietnamese value. The fallback mechanism itself is exercised
    // directly against `tr` in app-language.test.ts and `pick` in
    // api/__tests__/studio-language.test.ts, which share the same `vi ?? en` shape.
    const withoutVi = Object.entries(strings).filter(([, v]) => !("vi" in v));
    for (const [key, value] of withoutVi) {
      const en = (value as { en: string }).en;
      expect(translate(key as StringKey, "vi")).toBe(en);
    }
  });

  it("returns Vietnamese in vi mode for a translated key", () => {
    expect(translate("common.save", "vi")).toBe("Lưu");
  });
});

const TRANSLATED_PREFIXES = ["nav.", "bread.", "dash.", "book.", "chapter.", "reader.", "create.", "common."];

describe("Vietnamese coverage", () => {
  it("every high-traffic key has Vietnamese copy", () => {
    const missing = Object.entries(strings)
      .filter(([key]) => TRANSLATED_PREFIXES.some((p) => key.startsWith(p)))
      .filter(([, value]) => !("vi" in value))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("out-of-scope keys still resolve, via English fallback", () => {
    for (const key of Object.keys(strings) as Array<keyof typeof strings>) {
      expect(translate(key, "vi")).toBeTruthy();
    }
  });
});
