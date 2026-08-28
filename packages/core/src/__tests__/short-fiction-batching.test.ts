import { describe, expect, it } from "vitest";
import {
  buildShortFictionWriterSystemPrompt,
  buildShortFictionWriterUserPrompt,
} from "../prompts/short-fiction.js";

const BASE = {
  direction: "恐怖短篇：电梯多一层",
  outlineMarkdown: "## 方案\n完整方案",
  chapterCount: 12,
  charsPerChapter: 1000,
};

describe("writer prompt chapter range", () => {
  it("asks for only the ranged chapters and keeps the whole-story calibration (zh)", () => {
    const prompt = buildShortFictionWriterUserPrompt({ ...BASE, chapterRange: [1, 3] }, "zh");

    expect(prompt).toContain("=== CHAPTER 3 CONTENT ===");
    expect(prompt).not.toContain("=== CHAPTER 4 CONTENT ===");
    expect(prompt).not.toContain("=== CHAPTER 12 CONTENT ===");
    expect(prompt).toContain("整篇共 12 章");
  });

  it("emits title and opening hook only for the first batch", () => {
    const first = buildShortFictionWriterUserPrompt({ ...BASE, chapterRange: [1, 3] }, "zh");
    const later = buildShortFictionWriterUserPrompt({ ...BASE, chapterRange: [4, 6] }, "zh");

    expect(first).toContain("=== SHORT_FICTION_TITLE ===");
    expect(later).not.toContain("=== SHORT_FICTION_TITLE ===");
    expect(later).not.toContain("=== SHORT_FICTION_OPENING_HOOK ===");
    expect(later).toContain("=== CHAPTER 4 CONTENT ===");
    expect(later).toContain("=== CHAPTER 6 CONTENT ===");
    expect(later).not.toContain("=== CHAPTER 3 CONTENT ===");
  });

  it("restricts the ranged chapters in English too", () => {
    const prompt = buildShortFictionWriterUserPrompt({ ...BASE, chapterRange: [10, 12] }, "en");

    expect(prompt).toContain("=== CHAPTER 10 CONTENT ===");
    expect(prompt).toContain("=== CHAPTER 12 CONTENT ===");
    expect(prompt).not.toContain("=== CHAPTER 9 CONTENT ===");
    expect(prompt).toContain("The complete story is 12 chapters");
  });

  it("reads as a single chapter, not a degenerate range, for a one-chapter batch", () => {
    const zh = buildShortFictionWriterUserPrompt({ ...BASE, chapterCount: 13, chapterRange: [13, 13] }, "zh");
    const en = buildShortFictionWriterUserPrompt({ ...BASE, chapterCount: 13, chapterRange: [13, 13] }, "en");

    expect(zh).toContain("只写第 13 章");
    expect(zh).not.toContain("13-13");
    expect(en).toContain("Write ONLY chapter 13");
    expect(en).not.toContain("13-13");
  });

  it("is unchanged when no chapterRange is given", () => {
    for (const language of ["zh", "en"] as const) {
      const prompt = buildShortFictionWriterUserPrompt(BASE, language);
      expect(prompt).toContain("=== SHORT_FICTION_TITLE ===");
      expect(prompt).toContain("=== SHORT_FICTION_OPENING_HOOK ===");
      expect(prompt).toContain("=== CHAPTER 1 CONTENT ===");
      expect(prompt).toContain("=== CHAPTER 12 CONTENT ===");
      // exactly one Output Format heading, no duplication from the rewrite
      const heading = language === "en" ? "## Output Format" : "## 输出格式";
      expect(prompt.split(heading)).toHaveLength(2);
    }
  });

  it("no longer claims the story is written in one API pass", () => {
    expect(buildShortFictionWriterSystemPrompt("zh")).not.toContain("一次 API");
    expect(buildShortFictionWriterSystemPrompt("en")).not.toContain("in one API pass");
  });
});
