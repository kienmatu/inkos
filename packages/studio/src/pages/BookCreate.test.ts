import { describe, expect, it } from "vitest";
import {
  DRAFT_STAGE_LABELS,
  PAGE_COPY,
  defaultBookCreateForm,
  platformOptionsForLanguage,
  resolveProjectWritingLanguage,
} from "./BookCreate";

describe("project language never leaks Chinese into the Book Create page", () => {
  it("resolves a vi project language to English, matching toWritingLanguage's contract", () => {
    expect(resolveProjectWritingLanguage("vi")).toBe("en");
    expect(resolveProjectWritingLanguage("zh")).toBe("zh");
    expect(resolveProjectWritingLanguage("en")).toBe("en");
    expect(resolveProjectWritingLanguage(undefined)).toBe("en");
  });

  it("gives a vi project English platform options and English defaults, never the Chinese branch", () => {
    const language = resolveProjectWritingLanguage("vi");
    expect(platformOptionsForLanguage(language)).toEqual(platformOptionsForLanguage("en"));
    expect(defaultBookCreateForm(language)).toEqual(defaultBookCreateForm("en"));
  });
});

describe("Book Create page copy has a Vietnamese entry (page must not crash for a vi UI)", () => {
  it("defines PAGE_COPY.vi with every field the zh/en entries define", () => {
    expect(PAGE_COPY.vi).toBeDefined();
    const enKeys = Object.keys(PAGE_COPY.en).sort();
    expect(Object.keys(PAGE_COPY.vi).sort()).toEqual(enKeys);
    for (const key of enKeys) {
      const value = PAGE_COPY.vi[key as keyof typeof PAGE_COPY.vi];
      if (Array.isArray(value)) {
        expect(value.length).toBeGreaterThan(0);
        for (const item of value) {
          expect(typeof item).toBe("string");
          expect((item as string).length).toBeGreaterThan(0);
        }
      } else {
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("defines DRAFT_STAGE_LABELS.vi with every field the zh/en entries define", () => {
    expect(DRAFT_STAGE_LABELS.vi).toBeDefined();
    const enKeys = Object.keys(DRAFT_STAGE_LABELS.en).sort();
    expect(Object.keys(DRAFT_STAGE_LABELS.vi).sort()).toEqual(enKeys);
    for (const key of enKeys) {
      expect(DRAFT_STAGE_LABELS.vi[key]).toBeTruthy();
    }
  });
});
