import { describe, expect, it } from "vitest";
import {
  SHORT_FICTION_DEFAULT_CHAPTERS,
  SHORT_FICTION_MIN_CHAPTERS,
  SHORT_FICTION_MAX_CHAPTERS,
  SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER,
  SHORT_FICTION_MIN_CHARS_PER_CHAPTER,
  SHORT_FICTION_MAX_CHARS_PER_CHAPTER,
  SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER,
  SHORT_FICTION_EN_MIN_WORDS_PER_CHAPTER,
  SHORT_FICTION_EN_MAX_WORDS_PER_CHAPTER,
  resolveChaptersPerBatch,
} from "../agents/short-fiction.js";

describe("English format re-cut", () => {
  it("puts English chapters in the range real platforms use", () => {
    expect(SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER).toBe(1200);
    expect(SHORT_FICTION_EN_MIN_WORDS_PER_CHAPTER).toBe(900);
    expect(SHORT_FICTION_EN_MAX_WORDS_PER_CHAPTER).toBe(1500);
  });

  it("lowers the chapter count so total length lands in the Short Reads bands", () => {
    expect(SHORT_FICTION_DEFAULT_CHAPTERS).toBe(10);
    expect(SHORT_FICTION_MIN_CHAPTERS).toBe(8);
    expect(SHORT_FICTION_MAX_CHAPTERS).toBe(18);
  });

  it("produces a default English story of about 12,000 words", () => {
    const total = SHORT_FICTION_DEFAULT_CHAPTERS * SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER;
    expect(total).toBe(12_000);
    // Kindle Short Reads 90-minute band is roughly 12,000-18,000 words.
    expect(total).toBeGreaterThanOrEqual(9_000);
    expect(total).toBeLessThanOrEqual(13_000);
  });

  it("leaves the Chinese format untouched", () => {
    expect(SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER).toBe(1000);
    expect(SHORT_FICTION_MIN_CHARS_PER_CHAPTER).toBe(900);
    expect(SHORT_FICTION_MAX_CHARS_PER_CHAPTER).toBe(1200);
    // Zhihu Yanxuan's paid short format wants 8,000+ characters total; the new
    // minimum chapter count must still clear that floor.
    expect(SHORT_FICTION_MIN_CHAPTERS * SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER)
      .toBeGreaterThanOrEqual(8_000);
  });

  it("still batches one English chapter per call across the whole new range", () => {
    for (const words of [900, 1200, 1500]) {
      expect(resolveChaptersPerBatch(words, "en")).toBe(1);
    }
  });

  it("still batches Chinese as before", () => {
    expect(resolveChaptersPerBatch(900, "zh")).toBe(2);
    expect(resolveChaptersPerBatch(1000, "zh")).toBe(2);
    expect(resolveChaptersPerBatch(1200, "zh")).toBe(1);
  });
});
