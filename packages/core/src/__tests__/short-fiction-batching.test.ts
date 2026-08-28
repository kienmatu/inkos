import { describe, expect, it } from "vitest";
import {
  buildShortFictionWriterSystemPrompt,
  buildShortFictionWriterUserPrompt,
  buildShortFictionDraftContinuationUserPrompt,
  buildShortFictionDraftRevisionFollowup,
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

const CONTINUATION_BASE = {
  ...BASE,
  existingDraftMarkdown: "# 电梯多一层\n\n## 第1章 入局\n第一章正文",
  missingChapters: [4, 5, 6],
};

describe("continuation prompt batch mode", () => {
  it("does not claim a truncation in batch mode", () => {
    const zh = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION_BASE, mode: "batch" }, "zh");
    const en = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION_BASE, mode: "batch" }, "en");

    expect(zh).not.toContain("被截断");
    expect(zh).toContain("继续同一篇的写作");
    expect(zh).toContain("第 4-6 章");
    expect(en).not.toContain("was truncated");
    expect(en).toContain("Continue the same story");
    expect(en).toContain("chapters 4-6");
  });

  it("keeps the repair framing by default", () => {
    const zh = buildShortFictionDraftContinuationUserPrompt(CONTINUATION_BASE, "zh");
    const explicit = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION_BASE, mode: "repair" }, "zh");

    expect(zh).toContain("被截断");
    expect(zh).toBe(explicit);
  });

  it("still carries the existing prose and the do-not-rewrite guard in batch mode", () => {
    const zh = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION_BASE, mode: "batch" }, "zh");

    expect(zh).toContain("第一章正文");
    expect(zh).toContain("不要重写已完成章节");
    expect(zh).toContain("=== CHAPTER 4 CONTENT ===");
    expect(zh).toContain("=== CHAPTER 6 CONTENT ===");
    expect(zh).not.toContain("=== CHAPTER 7 CONTENT ===");
  });

  it("reads as a single chapter for a one-chapter batch", () => {
    const zh = buildShortFictionDraftContinuationUserPrompt(
      { ...CONTINUATION_BASE, missingChapters: [12], mode: "batch" }, "zh",
    );
    const en = buildShortFictionDraftContinuationUserPrompt(
      { ...CONTINUATION_BASE, missingChapters: [12], mode: "batch" }, "en",
    );

    expect(zh).toContain("第 12 章");
    expect(zh).not.toContain("12-12");
    expect(en).toContain("chapter 12");
    expect(en).not.toContain("12-12");
  });
});

const REVISION_BASE = { ...BASE, review: "第六章反扑不够" };

describe("revision followup chapter range", () => {
  it("revises only the ranged chapters", () => {
    const prompt = buildShortFictionDraftRevisionFollowup(
      { ...REVISION_BASE, chapterRange: [4, 6] }, "zh",
    );

    expect(prompt).toContain("=== CHAPTER 4 CONTENT ===");
    expect(prompt).toContain("=== CHAPTER 6 CONTENT ===");
    expect(prompt).not.toContain("=== CHAPTER 7 CONTENT ===");
    expect(prompt).not.toContain("=== SHORT_FICTION_TITLE ===");
    expect(prompt).toContain("第六章反扑不够");
  });

  it("includes the already-revised chapters for continuity on later batches", () => {
    const withPrior = buildShortFictionDraftRevisionFollowup(
      { ...REVISION_BASE, chapterRange: [4, 6], revisedSoFarMarkdown: "## 第1章 电梯\n第二版第一章正文" }, "zh",
    );
    const withoutPrior = buildShortFictionDraftRevisionFollowup(
      { ...REVISION_BASE, chapterRange: [4, 6] }, "zh",
    );

    expect(withPrior).toContain("第二版第一章正文");
    expect(withPrior).toContain("第二版已完成章节");
    expect(withoutPrior).not.toContain("第二版已完成章节");
  });

  it("keeps title and hook on the first revision batch only", () => {
    const first = buildShortFictionDraftRevisionFollowup({ ...REVISION_BASE, chapterRange: [1, 3] }, "en");
    const later = buildShortFictionDraftRevisionFollowup({ ...REVISION_BASE, chapterRange: [4, 6] }, "en");

    expect(first).toContain("=== SHORT_FICTION_TITLE ===");
    expect(first).toContain("=== CHAPTER 3 CONTENT ===");
    expect(first).not.toContain("=== CHAPTER 4 CONTENT ===");
    expect(later).not.toContain("=== SHORT_FICTION_TITLE ===");
  });

  it("is unchanged when no chapterRange is given", () => {
    for (const language of ["zh", "en"] as const) {
      const prompt = buildShortFictionDraftRevisionFollowup(REVISION_BASE, language);
      expect(prompt).toContain("=== SHORT_FICTION_TITLE ===");
      expect(prompt).toContain("=== CHAPTER 12 CONTENT ===");
      const heading = language === "en" ? "## Output Format" : "## 输出格式";
      expect(prompt.split(heading)).toHaveLength(2);
    }
  });
});
