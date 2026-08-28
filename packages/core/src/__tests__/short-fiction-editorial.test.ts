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
import { ShortRunActionPayloadSchema } from "../interaction/action-envelope.js";
import {
  buildShortFictionDraftContinuationUserPrompt,
  buildShortFictionWriterSystemPrompt,
} from "../prompts/short-fiction.js";

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

describe("short_run envelope schema tracks the re-cut constants", () => {
  it("accepts the new minimum and default chapter counts (8, 10)", () => {
    expect(ShortRunActionPayloadSchema.safeParse({
      direction: "a short story",
      chapters: 8,
    }).success).toBe(true);
    expect(ShortRunActionPayloadSchema.safeParse({
      direction: "a short story",
      chapters: 10,
    }).success).toBe(true);
  });

  it("accepts charsPerChapter=1500 with language en (the new en maximum)", () => {
    expect(ShortRunActionPayloadSchema.safeParse({
      direction: "an office suspense story",
      language: "en",
      charsPerChapter: 1500,
    }).success).toBe(true);
  });

  it("accepts charsPerChapter=1300 with language en (previously unreachable behind the stale generic 1200 max)", () => {
    // This is the concrete case from the bug report: 1300 is inside the real
    // en range (900-1500), but the old hard-coded generic bound topped out at
    // 1200, so it never reached the per-language check at all. Widening the
    // generic bound to the true zh/en union fixes this.
    expect(ShortRunActionPayloadSchema.safeParse({
      direction: "an office suspense story",
      language: "en",
      charsPerChapter: 1300,
    }).success).toBe(true);
  });

  it("still rejects charsPerChapter=1300 with language zh, via the per-language check, not a generic zod range error", () => {
    // 1300 sits inside the widened generic union bound (900-1500) but outside
    // zh's own range (900-1200), so this is the case that actually proves the
    // per-language superRefine still does precise work after the generic
    // bound was widened to admit values that are only valid for en.
    const parsed = ShortRunActionPayloadSchema.safeParse({
      direction: "女频短篇 婚姻背叛 证据反杀",
      language: "zh",
      charsPerChapter: 1300,
    });
    expect(parsed.success).toBe(false);
    const message = JSON.stringify(!parsed.success ? parsed.error.issues : []);
    // The per-language error names the concrete range and the field in prose;
    // a generic zod "too_big" issue would say "Number must be less than or
    // equal to" instead and would not mention "Chinese shorts".
    expect(message).toMatch(/900-1200/);
    expect(message).toMatch(/Chinese shorts/);
    expect(message).not.toMatch(/too_big/);
    expect(message).not.toMatch(/less than or equal to/);
  });

  it("rejects charsPerChapter=1600 with language en (genuinely outside both the generic and en-specific bounds)", () => {
    expect(ShortRunActionPayloadSchema.safeParse({
      direction: "an office suspense story",
      language: "en",
      charsPerChapter: 1600,
    }).success).toBe(false);
  });
});

const CONTINUATION = {
  direction: "A courier discovers the parcels are evidence",
  outlineMarkdown: "## Plan\nChapter 4 is the midpoint reversal.",
  chapterCount: 10,
  charsPerChapter: 1200,
  existingDraftMarkdown: "# Parcel\n\n## Chapter 1 Intake\nprose",
  missingChapters: [4],
};

describe("batch-mode chapter shaping", () => {
  it("varies the kind of hook without ever dropping the hook", () => {
    const en = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION, mode: "batch" }, "en");
    const zh = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION, mode: "batch" }, "zh");

    // The instruction must offer alternative devices...
    expect(en).toMatch(/not only a cliffhanger/i);
    expect(zh).toContain("不是只有悬崖式断章");
    // ...while restating that a reason to read on is still mandatory.
    expect(en).toMatch(/still needs a reason to read on/i);
    expect(zh).toContain("仍然要给出继续读的理由");
  });

  it("does not contradict the writer system prompt's hook requirement", () => {
    const system = buildShortFictionWriterSystemPrompt("en");
    const batch = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION, mode: "batch" }, "en");

    // The system prompt makes a chapter-break hook mandatory. The batch
    // instruction must narrow HOW that hook is achieved, never license
    // dropping it — otherwise the model receives opposed instructions at two
    // levels of authority.
    expect(system).toMatch(/reason to keep reading at the chapter break/i);
    expect(system).toMatch(/need not be a cliffhanger/i);
    expect(batch).not.toMatch(/may (end|close) without/i);
    expect(batch).not.toMatch(/no hook/i);
  });

  it("forbids opening a chapter by recapping earlier ones", () => {
    const en = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION, mode: "batch" }, "en");
    const zh = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION, mode: "batch" }, "zh");

    expect(en).toMatch(/do not (re)?open .* by summari[sz]ing/i);
    expect(zh).toContain("不要用回顾前情开场");
  });

  it("points the batch at this chapter's own beat in the plan", () => {
    const en = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION, mode: "batch" }, "en");
    const zh = buildShortFictionDraftContinuationUserPrompt({ ...CONTINUATION, mode: "batch" }, "zh");

    expect(en).toMatch(/find (these|this) chapters? entr\w* in the story plan below/i);
    expect(zh).toContain("在下面的故事方案里找到这几章的条目");
  });

  it("leaves the repair path byte-identical", () => {
    const repairDefault = buildShortFictionDraftContinuationUserPrompt(CONTINUATION, "en");
    const repairExplicit = buildShortFictionDraftContinuationUserPrompt(
      { ...CONTINUATION, mode: "repair" }, "en",
    );
    const batch = buildShortFictionDraftContinuationUserPrompt(
      { ...CONTINUATION, mode: "batch" }, "en",
    );

    expect(repairDefault).toBe(repairExplicit);
    expect(repairDefault).not.toMatch(/not every (chapter )?break is a bang/i);
    expect(repairDefault).not.toMatch(/do not (re)?open .* by summari[sz]ing/i);
    expect(batch).not.toBe(repairDefault);
  });
});
