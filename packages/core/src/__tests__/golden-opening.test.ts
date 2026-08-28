import { describe, expect, it } from "vitest";
import { GOLDEN_OPENING_CHAPTERS, isGoldenOpeningChapter } from "../utils/golden-opening.js";
import { buildGoldenOpeningDiscipline } from "../agents/writer-prompts.js";
import { buildGoldenOpeningGuidance } from "../agents/planner-prompts.js";

describe("golden opening window", () => {
  it("uses the same three-chapter window for both languages", () => {
    expect(GOLDEN_OPENING_CHAPTERS).toBe(3);
    for (const language of ["zh", "en"] as const) {
      expect(isGoldenOpeningChapter(language, 1)).toBe(true);
      expect(isGoldenOpeningChapter(language, 3)).toBe(true);
      expect(isGoldenOpeningChapter(language, 4)).toBe(false);
      expect(isGoldenOpeningChapter(language, 5)).toBe(false);
    }
  });

  it("treats a missing language as Chinese, matching prior behaviour", () => {
    expect(isGoldenOpeningChapter(undefined, 3)).toBe(true);
    expect(isGoldenOpeningChapter(undefined, 4)).toBe(false);
  });

  it("accepts language tags with a region suffix", () => {
    expect(isGoldenOpeningChapter("zh-CN", 2)).toBe(true);
    expect(isGoldenOpeningChapter("en-US", 2)).toBe(true);
  });

  // This is the regression the task exists to prevent: the flag and the two
  // guidance builders must agree at the boundary, in both languages.
  it("agrees with both guidance builders at the boundary", () => {
    for (const language of ["zh", "en"] as const) {
      for (const chapterNumber of [1, 2, 3, 4, 5]) {
        const flagged = isGoldenOpeningChapter(language, chapterNumber);
        expect(buildGoldenOpeningDiscipline(chapterNumber, language).length > 0).toBe(flagged);
        expect(buildGoldenOpeningGuidance(chapterNumber, language).length > 0).toBe(flagged);
      }
    }
  });
});
