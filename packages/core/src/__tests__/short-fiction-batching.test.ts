import { describe, expect, it } from "vitest";
import {
  buildShortFictionWriterSystemPrompt,
  buildShortFictionWriterUserPrompt,
  buildShortFictionDraftContinuationUserPrompt,
  buildShortFictionDraftRevisionFollowup,
  buildShortFictionPackageUserPrompt,
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

    expect(zh).toContain("只写第 13 章，每章约 1000 字。整篇共 13 章");
    expect(zh).not.toContain("13-13");
    // Pins the full clause, not just "chapter 13" — the old wording put "each"
    // outside the singular/plural ternary, so a single-chapter batch rendered
    // "Write ONLY chapter 13, about 1000 words each." This assertion fails
    // against that wording because it requires the sentence to end right
    // after "words", with no "each" and no space before the period.
    expect(en).toContain("Write ONLY chapter 13, about 1000 words. The complete story is 13 chapters");
    expect(en).not.toContain("13-13");
    expect(en).not.toContain("words each. The complete story is 13 chapters");
  });

  it("renders the plural case with 'each' intact (en)", () => {
    const en = buildShortFictionWriterUserPrompt({ ...BASE, chapterRange: [1, 3] }, "en");

    expect(en).toContain("Write ONLY chapters 1-3, about 1000 words each. The complete story is 12 chapters");
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
    expect(zh).toContain("继续同一篇的写作：现在写第 4-6 章，只写这几章。");
    expect(en).not.toContain("was truncated");
    expect(en).toContain("Continue the same story: now write chapters 4-6, and only those.");
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

    // Pins the full clause, not just "chapter 12" — the old wording used a
    // plural pronoun ("and only those") outside the singular/plural ternary,
    // so a single-chapter batch rendered "现在写第 12 章，只写这几章。" (zh)
    // and "now write chapter 12, and only those." (en). These assertions
    // fail against that old wording because they require the singular
    // pronoun ("只写这一章" / "and only that one.").
    expect(zh).toContain("继续同一篇的写作：现在写第 12 章，只写这一章。");
    expect(zh).not.toContain("12-12");
    expect(en).toContain("Continue the same story: now write chapter 12, and only that one.");
    expect(en).not.toContain("12-12");
  });
});

describe("opening hook and synopsis word counts", () => {
  it("asks for a ~240-word en opening hook, proportional to the 1,200-word chapter it precedes, in both the writer and revision prompts", () => {
    const writer = buildShortFictionWriterUserPrompt({ ...BASE, chapterRange: [1, 3] }, "en");
    const revision = buildShortFictionDraftRevisionFollowup(
      { ...BASE, review: "note", chapterRange: [1, 3] }, "en",
    );

    expect(writer).toContain("An optional pre-story hook of about 240 words");
    expect(revision).toContain("An optional pre-story hook of about 240 words");
  });

  it("keeps the zh opening hook at its own ~200-character figure, unconverted", () => {
    const writer = buildShortFictionWriterUserPrompt({ ...BASE, chapterRange: [1, 3] }, "zh");

    expect(writer).toContain("约 200 字");
  });

  it("asks for a 100-150 word en synopsis, anchored to storefront descriptions rather than converted from the zh figure", () => {
    const prompt = buildShortFictionPackageUserPrompt(
      { direction: "revenge", outlineMarkdown: "## plan", draftMarkdown: "prose", draftTitle: "Title" }, "en",
    );

    expect(prompt).toContain("A 100-150 word platform synopsis");
  });

  it("keeps the zh synopsis at its own 100-180-character figure, unconverted", () => {
    const prompt = buildShortFictionPackageUserPrompt(
      { direction: "复仇", outlineMarkdown: "## 方案", draftMarkdown: "正文", draftTitle: "标题" }, "zh",
    );

    expect(prompt).toContain("100-180字平台简介");
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

import { vi } from "vitest";
import {
  ShortFictionWriterAgent,
  resolveChaptersPerBatch,
  SHORT_FICTION_MAX_CHAPTERS_PER_BATCH,
  chunkChapters,
  stripOuterCodeFence,
} from "../agents/short-fiction.js";

function writerAgent() {
  return new ShortFictionWriterAgent({
    client: { provider: "openai" } as never,
    model: "fake",
    projectRoot: "/tmp/does-not-matter",
  });
}

function spyChat(agent: object) {
  return vi.spyOn(
    agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> },
    "chat",
  );
}

function batchReply(chapters: readonly number[], withHeader: boolean): string {
  return [
    ...(withHeader ? ["=== SHORT_FICTION_TITLE ===", "电梯多一层"] : []),
    ...chapters.map((n) => [
      `=== CHAPTER ${n} TITLE ===`,
      `第${n}章`,
      `=== CHAPTER ${n} CONTENT ===`,
      "深夜的电梯停在不存在的十三层，门开了。".repeat(20),
    ].join("\n")),
  ].join("\n");
}

/** Read the user-turn text out of the messages array passed to chat(). */
function userText(call: unknown[]): string {
  const messages = call[0] as ReadonlyArray<{ role: string; content: string }>;
  return messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
}

/** Which chapters is this call being asked to write? */
function requestedChapters(call: unknown[], upTo = 18): number[] {
  const text = userText(call);
  const chapters: number[] = [];
  for (let n = 1; n <= upTo; n += 1) if (text.includes(`=== CHAPTER ${n} CONTENT ===`)) chapters.push(n);
  return chapters;
}

describe("chunkChapters", () => {
  it("splits into fixed-size groups with a short final group", () => {
    expect(chunkChapters([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunkChapters([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(chunkChapters([], 3)).toEqual([]);
  });
});

describe("resolveChaptersPerBatch", () => {
  // Pins the derivation against a conservative ~1,400-token-per-call budget,
  // across the legal chapter-length ranges. See the short-fiction batching
  // task brief for the reasoning: the endpoint's real output cap was
  // recomputed at ~1,300-2,000 tokens for English, not the ~4,096 the fixed
  // batch-of-3 constant used to assume.
  it.each([
    ["zh", 900, 2],
    ["zh", 1000, 2],
    ["zh", 1200, 1],
    ["en", 600, 1],
    ["en", 650, 1],
    ["en", 800, 1],
  ] as const)("%s at %d chars/words per chapter batches %d at a time", (language, charsPerChapter, expected) => {
    expect(resolveChaptersPerBatch(charsPerChapter, language)).toBe(expected);
  });

  it("defaults to zh when no language is given", () => {
    expect(resolveChaptersPerBatch(1000)).toBe(2);
  });

  it("clamps to the maximum even when chapters are short enough to fit more", () => {
    // At 100 chars/chapter, tokensPerChapter ~= 70, which would otherwise fit
    // 20 chapters in one call — but no legal chapter length ever reaches the
    // clamp, so this deliberately illegal short length is what exercises it.
    expect(resolveChaptersPerBatch(100, "zh")).toBe(SHORT_FICTION_MAX_CHAPTERS_PER_BATCH);
    expect(SHORT_FICTION_MAX_CHAPTERS_PER_BATCH).toBe(3);
  });

  it("never returns less than one chapter per batch", () => {
    expect(resolveChaptersPerBatch(100_000, "en")).toBe(1);
  });
});

describe("stripOuterCodeFence", () => {
  it("removes a wrapping fence with or without a language tag", () => {
    expect(stripOuterCodeFence("```markdown\n=== CHAPTER 1 TITLE ===\n一\n```")).toBe("=== CHAPTER 1 TITLE ===\n一");
    expect(stripOuterCodeFence("```\nplain\n```")).toBe("plain");
  });

  it("leaves unfenced text and inner fences alone", () => {
    expect(stripOuterCodeFence("=== CHAPTER 1 CONTENT ===\n正文")).toBe("=== CHAPTER 1 CONTENT ===\n正文");
    expect(stripOuterCodeFence("正文\n```js\ncode\n```\n更多正文")).toBe("正文\n```js\ncode\n```\n更多正文");
  });

  it("strips an outer wrapper that legitimately contains its own inner fenced block", () => {
    // The outer fence uses 4 backticks — the standard, unambiguous way to nest
    // a 3-backtick fenced block inside another — so only the wrapper is removed.
    const wrapped = [
      "````markdown",
      "=== CHAPTER 1 CONTENT ===",
      "```js",
      "code",
      "```",
      "=== CHAPTER 2 CONTENT ===",
      "````",
    ].join("\n");

    expect(stripOuterCodeFence(wrapped)).toBe(
      ["=== CHAPTER 1 CONTENT ===", "```js", "code", "```", "=== CHAPTER 2 CONTENT ==="].join("\n"),
    );
  });

  it("does not corrupt an unwrapped fragment that merely opens and closes with two separate fences", () => {
    // Not a wrapper at all: a complete fenced block, then prose, then another
    // complete fenced block. Greedily matching first-line-to-last-line would
    // eat the first fence's opener and leave a stray closing fence mid-chapter.
    const unwrapped = "```js\ncode\n```\n正文\n```py\nmore\n```";

    expect(stripOuterCodeFence(unwrapped)).toBe(unwrapped);
  });
});

describe("writeDraft batching", () => {
  it("issues six calls for a 12-chapter story with non-overlapping ranges", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    const seen: number[][] = [];
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      seen.push(group);
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    const draft = await agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    });

    expect(seen).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]);
    expect(draft.chapters).toHaveLength(12);
    expect(draft.chapters.every((c) => c.content.trim().length > 0)).toBe(true);
    expect(draft.storyTitle).toBe("电梯多一层");
  });

  it("ends a 13-chapter story with a one-chapter batch", async () => {
    const agent = writerAgent();
    const seen: number[][] = [];
    spyChat(agent).mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 13);
      seen.push(group);
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    await agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 13, charsPerChapter: 1000,
    });

    expect(seen).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13]]);
  });

  it("gives later batches the earlier prose without asking to rewrite it, and without claiming a truncation", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    await agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    });

    const secondCall = userText(chat.mock.calls[1] as unknown[]);
    expect(secondCall).toContain("深夜的电梯停在不存在的十三层");   // chapters 1-3 prose is present
    expect(secondCall).toContain("不要重写已完成章节");              // do-not-rewrite guard
    expect(secondCall).toContain("继续同一篇的写作");                // batch framing, not repair
    expect(secondCall).not.toContain("被截断");
  });

  it("strips a wrapping code fence so no chapter ends with a stray fence", async () => {
    const agent = writerAgent();
    spyChat(agent).mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      return Promise.resolve({
        content: "```markdown\n" + batchReply(group, group[0] === 1) + "\n```",
        usage: undefined,
      });
    });

    const draft = await agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    });

    expect(draft.chapters.every((c) => !c.content.includes("```"))).toBe(true);
    expect(draft.chapters.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it("reports progress per batch", async () => {
    const agent = writerAgent();
    spyChat(agent).mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });
    const seen: string[] = [];

    await agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
      onBatchProgress: (info) => seen.push(`${info.batch}/${info.totalBatches}:${info.chapters.join(",")}`),
    });

    expect(seen).toEqual([
      "1/6:1,2", "2/6:3,4", "3/6:5,6", "4/6:7,8", "5/6:9,10", "6/6:11,12",
    ]);
  });
});

import { PartialResponseError } from "../llm/provider.js";

describe("adaptive batch halving", () => {
  it("splits a batch that hits the output limit and completes the story", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    const seen: number[][] = [];
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      seen.push(group);
      // Chapters 5-6 as a group of two is too big; halves succeed.
      if (group.length === 2 && group[0] === 5) {
        return Promise.reject(new PartialResponseError(
          "half", new Error("model reached the output limit (length)"), "output-limit",
        ));
      }
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    const draft = await agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    });

    expect(seen).toEqual([[1, 2], [3, 4], [5, 6], [5], [6], [7, 8], [9, 10], [11, 12]]);
    expect(draft.chapters).toHaveLength(12);
    expect(draft.chapters.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it("gives up when a single-chapter batch still hits the limit", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      if (group[0]! >= 3) {
        return Promise.reject(new PartialResponseError(
          "half", new Error("model reached the output limit (length)"), "output-limit",
        ));
      }
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    await expect(agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    })).rejects.toThrow(/output limit/);
  });

  it("does not split a non-output-limit failure", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      if (group[0] === 3) return Promise.reject(new Error("401 unauthorized"));
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    await expect(agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    })).rejects.toThrow(/401/);
    // batch 1 succeeded, batch 2 failed once — no halving attempts
    expect(chat).toHaveBeenCalledTimes(2);
  });
});

import { ShortFictionDraftReviserAgent, parseShortFictionBatchDraft } from "../agents/short-fiction.js";

function fullDraftMarkdown(chapterCount: number): string {
  return [
    "=== SHORT_FICTION_TITLE ===",
    "电梯多一层",
    ...Array.from({ length: chapterCount }, (_, i) => [
      `=== CHAPTER ${i + 1} TITLE ===`,
      `第${i + 1}章`,
      `=== CHAPTER ${i + 1} CONTENT ===`,
      "第一版正文，电梯停在十三层。".repeat(20),
    ].join("\n")),
  ].join("\n");
}

describe("reviseDraft batching", () => {
  const v1 = parseShortFictionBatchDraft(fullDraftMarkdown(12), { expectedChapters: 12 });

  function reviserAgent() {
    return new ShortFictionDraftReviserAgent({
      client: { provider: "openai" } as never, model: "fake", projectRoot: "/tmp/does-not-matter",
    });
  }

  it("issues six calls for a 12-chapter revision and merges into a full draft", async () => {
    const agent = reviserAgent();
    const chat = spyChat(agent);
    const seen: number[][] = [];
    const seedRanges: number[][] = [];
    chat.mockImplementation((...args: unknown[]) => {
      const messages = (args[0] as unknown[]) as ReadonlyArray<{ role: string; content: string }>;
      // The followup turn is the last user message — it alone carries the
      // per-batch chapterRange. The seed writer turn (second message) must be
      // unranged so it matches the whole-story v1Markdown assistant turn it is
      // paired with; if it were ranged too, `requestedChapters` on the joined
      // text could no longer distinguish that from the followup being ranged.
      const userMessages = messages.filter((m) => m.role === "user");
      const followupText = userMessages[userMessages.length - 1]!.content;
      const group: number[] = [];
      for (let n = 1; n <= 12; n += 1) if (followupText.includes(`=== CHAPTER ${n} CONTENT ===`)) group.push(n);
      seen.push(group);

      const seedText = userMessages[0]!.content;
      const seedRange: number[] = [];
      for (let n = 1; n <= 12; n += 1) if (seedText.includes(`=== CHAPTER ${n} CONTENT ===`)) seedRange.push(n);
      seedRanges.push(seedRange);

      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    const revised = await agent.reviseDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
      draft: v1, review: "第六章反扑不够",
    });

    expect(seen).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]);
    // The seed writer prompt is never ranged — every batch asks for all 12
    // chapters in that turn, matching the unranged v1Markdown assistant turn.
    expect(seedRanges).toEqual([
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ]);
    expect(revised.chapters).toHaveLength(12);
    expect(revised.chapters.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it("sends the v1 draft on every batch and the revised-so-far prose from batch two", async () => {
    const agent = reviserAgent();
    const chat = spyChat(agent);
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    await agent.reviseDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
      draft: v1, review: "第六章反扑不够",
    });

    const secondMessages = (chat.mock.calls[1] as unknown[])[0] as ReadonlyArray<{ role: string; content: string }>;
    expect(secondMessages.some((m) => m.role === "assistant" && m.content.includes("第一版正文"))).toBe(true);
    expect(userText(chat.mock.calls[1] as unknown[])).toContain("第二版已完成章节");
    expect(userText(chat.mock.calls[0] as unknown[])).not.toContain("第二版已完成章节");
  });

  it("propagates a single-chapter output-limit failure instead of returning a partial revision", async () => {
    const agent = reviserAgent();
    spyChat(agent).mockRejectedValue(new PartialResponseError(
      "half", new Error("model reached the output limit (length)"), "output-limit",
    ));

    await expect(agent.reviseDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
      draft: v1, review: "第六章反扑不够",
    })).rejects.toThrow(/output limit/);
  });
});

describe("continueDraft chunking", () => {
  it("repairs ten missing chapters in five calls, keeping the repair framing", async () => {
    const partial = parseShortFictionBatchDraft(
      [
        "=== SHORT_FICTION_TITLE ===",
        "电梯多一层",
        ...[1, 2].map((n) => [
          `=== CHAPTER ${n} TITLE ===`,
          `第${n}章`,
          `=== CHAPTER ${n} CONTENT ===`,
          "第一版正文，电梯停在十三层。".repeat(20),
        ].join("\n")),
      ].join("\n"),
      { expectedChapters: 12 },
    );
    const agent = writerAgent();
    const chat = spyChat(agent);
    const seen: number[][] = [];
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      seen.push(group);
      return Promise.resolve({ content: batchReply(group, false), usage: undefined });
    });

    const repaired = await agent.continueDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
      draft: partial,
    });

    expect(seen).toEqual([[3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]);
    expect(repaired.chapters.every((c) => c.content.trim().length > 0)).toBe(true);
    expect(userText(chat.mock.calls[0] as unknown[])).toContain("被截断");
  });

  it("returns the draft untouched when nothing is missing", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    const complete = parseShortFictionBatchDraft(fullDraftMarkdown(12), { expectedChapters: 12 });

    const result = await agent.continueDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
      draft: complete,
    });

    expect(chat).not.toHaveBeenCalled();
    expect(result).toBe(complete);
  });
});

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ShortFictionOutlineAgent,
  ShortFictionOutlineReviewerAgent,
  ShortFictionOutlineReviserAgent,
  ShortFictionDraftReviewerAgent,
  ShortFictionPackagingAgent,
} from "../agents/short-fiction.js";
import { runShortFictionProduction } from "../pipeline/short-fiction-runner.js";

describe("runner batch progress", () => {
  it("reports each draft batch through onProgress", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkos-shortbatch-"));
    try {
      await mkdir(join(root, "shorts", "elevator", "outline"), { recursive: true });
      await writeFile(join(root, "shorts", "elevator", "outline", "v002.md"), "## 既有大纲\n12章完整方案", "utf-8");

      const draft = parseShortFictionBatchDraft(fullDraftMarkdown(12), { expectedChapters: 12 });
      // One empty chapter so continueDraft (and its "Completing" progress) runs.
      const partialDraft = {
        ...draft,
        chapters: draft.chapters.map((c) => (c.number === 5 ? { ...c, content: "" } : c)),
      };

      // The outline stages must be skipped by the resume path; make it loud if not.
      const outlineGuard = new Error("outline stage must be skipped when v002.md exists");
      vi.spyOn(ShortFictionOutlineAgent.prototype, "createOutline").mockRejectedValue(outlineGuard);
      vi.spyOn(ShortFictionOutlineReviewerAgent.prototype, "reviewOutline").mockRejectedValue(outlineGuard);
      vi.spyOn(ShortFictionOutlineReviserAgent.prototype, "reviseOutline").mockRejectedValue(outlineGuard);

      vi.spyOn(ShortFictionWriterAgent.prototype, "writeDraft").mockImplementation(async (input) => {
        input.onBatchProgress?.({ batch: 2, totalBatches: 4, chapters: [4, 5, 6] });
        return partialDraft;
      });
      vi.spyOn(ShortFictionWriterAgent.prototype, "continueDraft").mockImplementation(async (input) => {
        input.onBatchProgress?.({ batch: 1, totalBatches: 1, chapters: [5] });
        return draft;
      });
      vi.spyOn(ShortFictionDraftReviewerAgent.prototype, "reviewDraft").mockResolvedValue("looks fine");
      vi.spyOn(ShortFictionDraftReviserAgent.prototype, "reviseDraft").mockImplementation(async (input) => {
        input.onBatchProgress?.({ batch: 1, totalBatches: 4, chapters: [1, 2, 3] });
        return draft;
      });
      vi.spyOn(ShortFictionPackagingAgent.prototype, "generatePackage").mockResolvedValue({
        title: "电梯多一层", intro: "钩子", sellingPoints: ["反转"], coverPrompt: "", rawContent: "",
      });

      const runtime = { client: { provider: "openai" } as never, model: "fake", projectRoot: root };
      const messages: string[] = [];
      await runShortFictionProduction({
        projectRoot: root, direction: "恐怖短篇", storyId: "elevator",
        chapterCount: 12, charsPerChapter: 1000, cover: false,
        runtimes: {
          planner: runtime, outlineReview: runtime, writer: runtime,
          draftReview: runtime, revise: runtime, package: runtime,
        },
        onProgress: (message) => messages.push(message),
      });

      expect(messages).toContain("Writing chapters 4-6 (batch 2/4)...");
      expect(messages).toContain("Completing chapters 5 (batch 1/1)...");
      expect(messages).toContain("Revising chapters 1-3 (batch 1/4)...");
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });
});
