import { BaseAgent } from "./base.js";
import type { LLMMessage, LLMResponse } from "../llm/provider.js";
import { PartialResponseError } from "../llm/provider.js";
import { countChapterLength, resolveLengthCountingMode } from "../utils/length-metrics.js";
import {
  type ShortFictionLanguage,
  buildShortFictionDraftReviewSystemPrompt,
  buildShortFictionDraftReviewUserPrompt,
  buildShortFictionDraftContinuationUserPrompt,
  buildShortFictionDraftRevisionFollowup,
  buildShortFictionOutlineReviewSystemPrompt,
  buildShortFictionOutlineReviewUserPrompt,
  buildShortFictionOutlineRevisionFollowup,
  buildShortFictionOutlineSystemPrompt,
  buildShortFictionOutlineUserPrompt,
  buildShortFictionPackageSystemPrompt,
  buildShortFictionPackageUserPrompt,
  buildShortFictionWriterSystemPrompt,
  buildShortFictionWriterUserPrompt,
} from "../prompts/short-fiction.js";
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
} from "../models/short-fiction-format.js";

// Re-exported so existing importers of this module (agent-tools.ts,
// interaction/action-envelope.ts, the pipeline runner, tests) keep working
// unchanged. The canonical definitions and their comments live in
// models/short-fiction-format.ts, which both this file and
// prompts/short-fiction.ts import from — this file cannot re-export the
// constants FROM there and also have prompts/short-fiction.ts import them
// from here, because this file already imports prompt builders from
// prompts/short-fiction.ts, which would make that an import cycle.
export {
  SHORT_FICTION_DEFAULT_CHAPTERS,
  SHORT_FICTION_MIN_CHAPTERS,
  SHORT_FICTION_MAX_CHAPTERS,
  SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER,
  SHORT_FICTION_MIN_CHARS_PER_CHAPTER,
  SHORT_FICTION_MAX_CHARS_PER_CHAPTER,
  SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER,
  SHORT_FICTION_EN_MIN_WORDS_PER_CHAPTER,
  SHORT_FICTION_EN_MAX_WORDS_PER_CHAPTER,
};

// Conservative per-call output budget. Endpoints that ignore max_tokens and
// enforce their own have been observed cutting at roughly 1,300-2,000 tokens.
// Sizing below that keeps the common case single-shot; adaptive halving in
// runChapterBatches covers any endpoint stricter than this.
//
// Accepted trade-off (2026-08-28 editorial re-cut): a default English chapter
// is now SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER (1,200) words, which is
// ~1,560 estimated output tokens at ~1.3 tokens/word — ABOVE this 1,400
// budget and inside the 1,300-2,000 window cited above as where strict
// endpoints cut. resolveChaptersPerBatch cannot return less than 1 chapter,
// and runChapterBatches (below) rethrows rather than splitting further once a
// group is already down to one chapter, so on the strictest endpoints English
// generation has no fallback left below that point. This was considered and
// the decision was to keep 1,200 words rather than add further error-handling
// or splitting machinery. On an endpoint that caps output under roughly 1,600
// tokens, the operator's lever is a lower `--chars` value, not a code change.
// See "Accepted trade-offs" in
// docs/superpowers/specs/2026-08-28-short-fiction-editorial-review.md.
const SHORT_FICTION_BATCH_OUTPUT_TOKEN_BUDGET = 1_400;

// Upper clamp. Never batch more than this many chapters even when they are
// short enough to fit, so one failed batch never costs too much rework.
// Currently unreachable: with the re-cut constants the largest value
// resolveChaptersPerBatch can return is 2 (zh at its 900-character minimum),
// so this clamp of 3 never actually triggers. It stays as a backstop in case
// the length constants move again and chapters get short enough to fit 3+
// per batch.
export const SHORT_FICTION_MAX_CHAPTERS_PER_BATCH = 3;

// zh chapters are measured in characters (~1.44 chars/token), en chapters in
// words (~1.3 tokens/word). See length-metrics.ts for the units.
//
// Deliberately NOT part of the "language defaults to en" cleanup
// (2026-08-28): this default selects a batching-math constant, not
// language-specific output text, so a forgotten argument here cannot "silently
// emit Chinese into an English path" the way a prompt-builder default can.
// It is also never reached with an undefined language in production — every
// caller (ShortFictionWriterAgent methods) is invoked from
// short-fiction-runner.ts's produceShort(), which always resolves and passes
// an explicit language first. resolveChaptersPerBatch(1000) is pinned to this
// default by a dedicated test (short-fiction-batching.test.ts).
export function resolveChaptersPerBatch(
  charsPerChapter: number,
  language: ShortFictionLanguage = "zh",
): number {
  const tokensPerChapter = language === "en"
    ? charsPerChapter * 1.3
    : charsPerChapter * 0.7;
  const fitted = Math.floor(SHORT_FICTION_BATCH_OUTPUT_TOKEN_BUDGET / tokensPerChapter);
  return Math.min(Math.max(fitted, 1), SHORT_FICTION_MAX_CHAPTERS_PER_BATCH);
}

export interface ShortFictionBatchProgress {
  readonly batch: number;
  readonly totalBatches: number;
  readonly chapters: readonly number[];
}

export function chunkChapters(chapters: readonly number[], size: number): number[][] {
  const groups: number[][] = [];
  for (let index = 0; index < chapters.length; index += size) {
    groups.push(chapters.slice(index, index + size));
  }
  return groups;
}

// A batch reply wrapped in ```markdown ... ``` would otherwise leave the closing
// fence glued to the batch's last chapter once fragments are concatenated —
// sanitizeChapterContent only strips a fence at the very end of the whole string.
export function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split("\n");
  if (lines.length < 2) return trimmed;

  // The opening line must be a fence of 3+ backticks (an optional language tag
  // allowed); the closing line must be a BARE fence of the exact same length.
  const openMatch = /^(`{3,})[a-zA-Z0-9_-]*$/.exec(lines[0]!);
  if (!openMatch) return trimmed;
  const fenceLength = openMatch[1]!.length;
  if (lines[lines.length - 1] !== "`".repeat(fenceLength)) return trimmed;

  const middle = lines.slice(1, -1);
  // Only accept this as a genuine single wrapper if no interior line opens or
  // closes a fence of the SAME OR LONGER run length — that's the standard,
  // unambiguous way to nest a fenced block inside another (the outer fence
  // must use more backticks than anything nested inside it). Without that,
  // "first line is a fence, last line is a fence" is not enough to tell a real
  // wrapper apart from an unwrapped fragment that merely opens with one fenced
  // block and closes with an unrelated later one (see the regression test).
  const hasAmbiguousInnerFence = middle.some((line) => {
    const innerRun = /^`{3,}/.exec(line)?.[0].length;
    return innerRun !== undefined && innerRun >= fenceLength;
  });
  if (hasAmbiguousInnerFence) return trimmed;

  return middle.join("\n").trim();
}

export type { ShortFictionLanguage } from "../prompts/short-fiction.js";

export interface ShortFictionOutline {
  readonly storyTitle: string;
  readonly rawContent: string;
}

export interface ShortFictionChapter {
  readonly number: number;
  readonly title: string;
  readonly content: string;
  readonly charCount: number;
}

export interface ShortFictionBatchDraft {
  readonly storyTitle: string;
  readonly openingHook?: string;
  readonly chapters: ReadonlyArray<ShortFictionChapter>;
  readonly rawContent: string;
}

export interface ShortFictionSalesPackage {
  readonly title: string;
  readonly intro: string;
  readonly sellingPoints: ReadonlyArray<string>;
  readonly coverPrompt: string;
  readonly rawContent: string;
}

export interface ShortFictionReference {
  readonly path?: string;
  readonly text: string;
}

export interface ShortFictionOutlineInput {
  readonly direction: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
  readonly reference?: ShortFictionReference;
  readonly language?: ShortFictionLanguage;
}

export interface ShortFictionOutlineReviewInput {
  readonly direction: string;
  readonly outline: ShortFictionOutline;
  readonly reference?: ShortFictionReference;
  readonly language?: ShortFictionLanguage;
}

export interface ShortFictionOutlineRevisionInput extends ShortFictionOutlineReviewInput {
  readonly review: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
}

export interface ShortFictionDraftInput {
  readonly direction: string;
  readonly outlineMarkdown: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
  readonly language?: ShortFictionLanguage;
  readonly onBatchProgress?: (info: ShortFictionBatchProgress) => void;
}

export interface ShortFictionDraftReviewInput extends ShortFictionDraftInput {
  readonly draft: ShortFictionBatchDraft;
}

export interface ShortFictionDraftRevisionInput extends ShortFictionDraftReviewInput {
  readonly review: string;
}

export interface ShortFictionPackageInput {
  readonly direction: string;
  readonly outlineMarkdown: string;
  readonly draft: ShortFictionBatchDraft;
  readonly language?: ShortFictionLanguage;
}

export class ShortFictionOutlineAgent extends BaseAgent {
  get name(): string {
    return "short-fiction-outline";
  }

  async createOutline(input: ShortFictionOutlineInput): Promise<ShortFictionOutline> {
    const response = await retryShortFictionCall(() =>
      this.chat([
        { role: "system", content: buildShortFictionOutlineSystemPrompt(input.language) },
        { role: "user", content: buildShortFictionOutlineUserPrompt(input, input.language) },
      ], { temperature: 0.55, maxTokens: 16_384 }), this.name, this.log);

    return parseShortFictionOutline(response.content, input.language);
  }
}

export class ShortFictionOutlineReviewerAgent extends BaseAgent {
  get name(): string {
    return "short-fiction-outline-reviewer";
  }

  async reviewOutline(input: ShortFictionOutlineReviewInput): Promise<string> {
    const response = await retryShortFictionCall(() =>
      this.chat([
        { role: "system", content: buildShortFictionOutlineReviewSystemPrompt(input.language) },
        { role: "user", content: buildShortFictionOutlineReviewUserPrompt(input, input.language) },
      ], { temperature: 0.3, maxTokens: 4096 }), this.name, this.log);

    return response.content.trim();
  }
}

export class ShortFictionOutlineReviserAgent extends BaseAgent {
  get name(): string {
    return "short-fiction-outline-reviser";
  }

  async reviseOutline(input: ShortFictionOutlineRevisionInput): Promise<ShortFictionOutline> {
    const response = await retryShortFictionCall(() =>
      this.chat([
        { role: "system", content: buildShortFictionOutlineSystemPrompt(input.language) },
        { role: "user", content: buildShortFictionOutlineUserPrompt(input, input.language) },
        { role: "assistant", content: input.outline.rawContent.trim() },
        { role: "user", content: buildShortFictionOutlineRevisionFollowup(input, input.language) },
      ], { temperature: 0.45, maxTokens: 16_384 }), this.name, this.log);

    return parseShortFictionOutline(response.content, input.language);
  }
}

export class ShortFictionWriterAgent extends BaseAgent {
  get name(): string {
    return "short-fiction-writer";
  }

  async writeDraft(input: ShortFictionDraftInput): Promise<ShortFictionBatchDraft> {
    const allChapters = Array.from({ length: input.chapterCount }, (_, index) => index + 1);
    const groups = chunkChapters(allChapters, resolveChaptersPerBatch(input.charsPerChapter, input.language));

    const fragments = await runChapterBatches({
      agentName: this.name,
      log: this.log,
      groups,
      charsPerChapter: input.charsPerChapter,
      temperature: 0.58,
      chat: (messages, options) => this.chat(messages, options),
      onBatchProgress: input.onBatchProgress,
      buildMessages: (chapters, fragmentsSoFar) => {
        const system = { role: "system" as const, content: buildShortFictionWriterSystemPrompt(input.language) };

        // The first batch establishes title, hook and voice. Later batches use
        // the continuation prompt in batch mode, which carries the prose so far
        // and forbids rewriting finished chapters.
        if (chapters[0] === 1) {
          return [system, {
            role: "user" as const,
            content: buildShortFictionWriterUserPrompt({
              ...input,
              chapterRange: [chapters[0]!, chapters[chapters.length - 1]!],
            }, input.language),
          }];
        }

        const soFar = parseShortFictionBatchDraft(fragmentsSoFar.join("\n\n"), {
          expectedChapters: chapters[0]! - 1,
          language: input.language,
        });
        return [system, {
          role: "user" as const,
          content: buildShortFictionDraftContinuationUserPrompt({
            direction: input.direction,
            outlineMarkdown: input.outlineMarkdown,
            chapterCount: input.chapterCount,
            charsPerChapter: input.charsPerChapter,
            existingDraftMarkdown: renderShortFictionDraftMarkdown(soFar, input.language),
            missingChapters: chapters,
            mode: "batch",
          }, input.language),
        }];
      },
    });

    return parseShortFictionBatchDraft(fragments.join("\n\n"), {
      expectedChapters: input.chapterCount,
      language: input.language,
    });
  }

  async continueDraft(input: ShortFictionDraftInput & { readonly draft: ShortFictionBatchDraft }): Promise<ShortFictionBatchDraft> {
    const missingChapters = findEmptyShortFictionChapters(input.draft);
    if (missingChapters.length === 0) return input.draft;

    const groups = chunkChapters(missingChapters, resolveChaptersPerBatch(input.charsPerChapter, input.language));
    const baseRaw = input.draft.rawContent.trim();

    const fragments = await runChapterBatches({
      agentName: this.name,
      log: this.log,
      groups,
      charsPerChapter: input.charsPerChapter,
      temperature: 0.68,
      chat: (messages, options) => this.chat(messages, options),
      onBatchProgress: input.onBatchProgress,
      buildMessages: (chapters, fragmentsSoFar) => {
        const soFar = parseShortFictionBatchDraft([baseRaw, ...fragmentsSoFar].join("\n\n"), {
          expectedChapters: input.chapterCount,
          language: input.language,
        });
        return [
          { role: "system", content: buildShortFictionWriterSystemPrompt(input.language) },
          { role: "user", content: buildShortFictionDraftContinuationUserPrompt({
            direction: input.direction,
            outlineMarkdown: input.outlineMarkdown,
            chapterCount: input.chapterCount,
            charsPerChapter: input.charsPerChapter,
            existingDraftMarkdown: renderShortFictionDraftMarkdown(soFar, input.language),
            missingChapters: chapters,
          }, input.language) },
        ];
      },
    });

    return parseShortFictionBatchDraft([baseRaw, ...fragments].join("\n\n"), {
      expectedChapters: input.chapterCount,
      language: input.language,
    });
  }
}

export class ShortFictionDraftReviewerAgent extends BaseAgent {
  get name(): string {
    return "short-fiction-draft-reviewer";
  }

  async reviewDraft(input: ShortFictionDraftReviewInput): Promise<string> {
    const response = await retryShortFictionCall(() =>
      this.chat([
        { role: "system", content: buildShortFictionDraftReviewSystemPrompt(input.language) },
        { role: "user", content: buildShortFictionDraftReviewUserPrompt({
          ...input,
          draftMarkdown: renderShortFictionDraftMarkdown(input.draft, input.language),
        }, input.language) },
      ], { temperature: 0.3, maxTokens: 8192 }), this.name, this.log);

    return response.content.trim();
  }
}

export class ShortFictionDraftReviserAgent extends BaseAgent {
  get name(): string {
    return "short-fiction-draft-reviser";
  }

  // The batch chapter-shaping instructions (hook variety, no-recap-opening,
  // "find this chapter's entry in the plan") deliberately do not reach this
  // pass — see buildShortFictionDraftRevisionFollowup, which this method
  // calls instead of buildShortFictionDraftContinuationUserPrompt. This
  // rewrites against the v1 draft, which already carries the batch shape, and
  // the followup prompt already carries the writer system prompt, v1, the
  // revised-so-far prose, and the review notes — adding the shaping block on
  // top would be redundant instruction, not new information.
  async reviseDraft(input: ShortFictionDraftRevisionInput): Promise<ShortFictionBatchDraft> {
    const allChapters = Array.from({ length: input.chapterCount }, (_, index) => index + 1);
    const groups = chunkChapters(allChapters, resolveChaptersPerBatch(input.charsPerChapter, input.language));
    const v1Markdown = input.draft.rawContent.trim()
      || renderShortFictionDraftMarkdown(input.draft, input.language);

    const fragments = await runChapterBatches({
      agentName: this.name,
      ...(this.log ? { log: this.log } : {}),
      groups,
      charsPerChapter: input.charsPerChapter,
      temperature: 0.45,
      chat: (messages, options) => this.chat(messages, options),
      ...(input.onBatchProgress ? { onBatchProgress: input.onBatchProgress } : {}),
      buildMessages: (chapters, fragmentsSoFar) => {
        const chapterRange: readonly [number, number] = [chapters[0]!, chapters[chapters.length - 1]!];
        const revisedSoFarMarkdown = fragmentsSoFar.length === 0
          ? undefined
          : renderShortFictionDraftMarkdown(
              parseShortFictionBatchDraft(fragmentsSoFar.join("\n\n"), {
                expectedChapters: chapters[0]! - 1,
                language: input.language,
              }),
              input.language,
            );

        return [
          { role: "system", content: buildShortFictionWriterSystemPrompt(input.language) },
          // Unranged, matching the whole-story v1Markdown assistant turn below —
          // a ranged seed here would show the model, in its own context, that
          // the range constraint issued in the followup is one it may ignore.
          { role: "user", content: buildShortFictionWriterUserPrompt(input, input.language) },
          { role: "assistant", content: v1Markdown },
          { role: "user", content: buildShortFictionDraftRevisionFollowup({
            ...input,
            chapterRange,
            ...(revisedSoFarMarkdown ? { revisedSoFarMarkdown } : {}),
          }, input.language) },
        ];
      },
    });

    return parseShortFictionBatchDraft(fragments.join("\n\n"), {
      expectedChapters: input.chapterCount,
      language: input.language,
    });
  }
}

export class ShortFictionPackagingAgent extends BaseAgent {
  get name(): string {
    return "short-fiction-packaging";
  }

  async generatePackage(input: ShortFictionPackageInput): Promise<ShortFictionSalesPackage> {
    const response = await retryShortFictionCall(() =>
      this.chat([
        { role: "system", content: buildShortFictionPackageSystemPrompt(input.language) },
        { role: "user", content: buildShortFictionPackageUserPrompt({
          direction: input.direction,
          outlineMarkdown: input.outlineMarkdown,
          draftMarkdown: renderShortFictionDraftMarkdown(input.draft, input.language),
          draftTitle: input.draft.storyTitle,
        }, input.language) },
      ], { temperature: 0.45, maxTokens: 4096 }), this.name, this.log);

    return parseShortFictionSalesPackage(response.content, input.draft.storyTitle);
  }
}

export function parseShortFictionOutline(
  rawContent: string,
  language: ShortFictionLanguage = "en",
): ShortFictionOutline {
  const fallbackTitle = untitledShortTitle(language);
  const storyTitle = normalizeTitle(
    extractTaggedBlock(rawContent, "SHORT_FICTION_PLAN_TITLE")
    || extractTaggedBlock(rawContent, "SHORT_FICTION_TITLE")
    || extractFirstHeading(rawContent)
    || fallbackTitle,
  ) || fallbackTitle;
  return { storyTitle, rawContent: rawContent.trim() };
}

export function parseShortFictionBatchDraft(
  rawContent: string,
  options?: { readonly expectedChapters?: number; readonly language?: ShortFictionLanguage },
): ShortFictionBatchDraft {
  const expectedChapters = options?.expectedChapters ?? SHORT_FICTION_DEFAULT_CHAPTERS;
  // Deliberately NOT flipped to "en" (2026-08-28 language-default cleanup):
  // this is a parser, not a generator — it extracts a language from text
  // already produced, it does not choose which language new text is written
  // in, so it cannot cause the "forgotten argument silently emits Chinese
  // into an English path" failure the AGENTS.md rule targets. Every
  // production call site (agents/short-fiction.ts's own writeDraft /
  // continueDraft / reviseDraft) passes its own resolved language explicitly.
  // Flipping this default would also have broken a large existing suite of
  // Chinese-fixture tests (short-fiction-batching.test.ts,
  // short-fiction-resume.test.ts, short-fiction-public.test.ts) that
  // intentionally omit language and rely on this default while parsing
  // Chinese draft fixtures — out of proportion to this task's scope.
  const language = options?.language ?? "zh";
  const countingMode = resolveLengthCountingMode(language);
  const fallbackTitle = untitledShortTitle(language);
  const storyTitle = normalizeTitle(
    extractTaggedBlock(rawContent, "SHORT_FICTION_TITLE")
    || extractFirstHeading(rawContent)
    || fallbackTitle,
  ) || fallbackTitle;
  const openingHook = extractTaggedBlock(rawContent, "SHORT_FICTION_OPENING_HOOK")
    || extractTaggedBlock(rawContent, "OPENING_HOOK");

  const chapters: ShortFictionChapter[] = [];
  for (let number = 1; number <= expectedChapters; number += 1) {
    const title = normalizeChapterTitle(
      extractTaggedBlock(rawContent, `CHAPTER ${number} TITLE`)
      || extractMarkdownChapterTitle(rawContent, number)
      || fallbackChapterTitle(number, language),
      number,
      language,
    );
    const content = sanitizeChapterContent(
      extractLastNonEmptyTaggedBlock(rawContent, `CHAPTER ${number} CONTENT`)
      || extractDuplicateTitleTaggedChapterContent(rawContent, number)
      || extractMarkdownChapterContent(rawContent, number)
      || "",
    );
    chapters.push({
      number,
      title,
      content,
      // charCount is in the language's native counting unit: zh characters or en words.
      charCount: countChapterLength(content, countingMode),
    });
  }

  return {
    storyTitle,
    openingHook: openingHook.trim() || undefined,
    chapters,
    rawContent,
  };
}

export function validateShortFictionDraftForFinal(
  draft: ShortFictionBatchDraft,
  options?: { readonly expectedChapters?: number },
): void {
  if (options?.expectedChapters !== undefined && draft.chapters.length !== options.expectedChapters) {
    throw new Error(`Short-hit draft is incomplete; expected ${options.expectedChapters} chapters, got ${draft.chapters.length}.`);
  }

  const emptyChapters = findEmptyShortFictionChapters(draft);
  if (emptyChapters.length > 0) {
    throw new Error(`Short-hit draft is incomplete; empty chapters: ${emptyChapters.join(", ")}.`);
  }
}

export function findEmptyShortFictionChapters(draft: ShortFictionBatchDraft): number[] {
  return draft.chapters
    .filter((chapter) => !chapter.content.trim())
    .map((chapter) => chapter.number);
}

export function renderShortFictionDraftMarkdown(
  draft: ShortFictionBatchDraft,
  language: ShortFictionLanguage = "en",
): string {
  const hookHeading = language === "en" ? "## Opening Hook" : "## 开篇钩子";
  return [
    `# ${draft.storyTitle}`,
    draft.openingHook ? `${hookHeading}\n\n${draft.openingHook}` : "",
    ...draft.chapters.map((chapter) => [
      `## ${formatShortFictionChapterHeading(chapter.number, chapter.title, language)}`,
      "",
      chapter.content,
    ].join("\n")),
  ].filter(Boolean).join("\n\n");
}

export function parseShortFictionSalesPackage(rawContent: string, fallbackTitle = "未命名短篇"): ShortFictionSalesPackage {
  const title = normalizeTitle(
    extractTaggedBlock(rawContent, "SHORT_FICTION_PACKAGE_TITLE")
    || extractTaggedBlock(rawContent, "SHORT_FICTION_TITLE")
    || fallbackTitle,
  ) || fallbackTitle;
  const intro = extractTaggedBlock(rawContent, "SHORT_FICTION_INTRO")
    || extractTaggedBlock(rawContent, "INTRO")
    || "";
  const sellingRaw = extractTaggedBlock(rawContent, "SHORT_FICTION_SELLING_POINTS")
    || extractTaggedBlock(rawContent, "SELLING_POINTS")
    || "";
  const coverPrompt = extractTaggedBlock(rawContent, "SHORT_FICTION_COVER_PROMPT")
    || extractTaggedBlock(rawContent, "COVER_PROMPT")
    || "";
  return {
    title,
    intro: intro.trim(),
    sellingPoints: sellingRaw
      .split(/\n+/)
      .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
      .filter(Boolean),
    coverPrompt: coverPrompt.trim(),
    rawContent: rawContent.trim(),
  };
}

function extractTaggedBlock(raw: string, tag: string): string {
  return extractTaggedBlocks(raw, tag)[0] ?? "";
}

function extractLastNonEmptyTaggedBlock(raw: string, tag: string): string {
  return extractTaggedBlocks(raw, tag)
    .map((block) => block.trim())
    .filter(Boolean)
    .at(-1) ?? "";
}

function extractTaggedBlocks(raw: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`^\\s*===\\s*${escaped}\\s*===\\s*$`, "gim");
  const nextTagPattern = /^\s*===\s*[A-Z0-9_ ]+\s*===\s*$/gim;
  const blocks: string[] = [];
  for (const match of raw.matchAll(tagPattern)) {
    if (match.index === undefined) continue;
    const start = match.index + match[0].length;
    const rest = raw.slice(start).replace(/^\s*\n/, "");
    nextTagPattern.lastIndex = 0;
    const next = nextTagPattern.exec(rest);
    blocks.push((next ? rest.slice(0, next.index) : rest).trim());
  }
  return blocks;
}

function extractFirstHeading(raw: string): string {
  return raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function extractMarkdownChapterTitle(raw: string, number: number): string {
  const pattern = new RegExp(`^##\\s*(?:${markdownChapterPrefixPattern(number)})?(.+)$`, "m");
  return pattern.exec(raw)?.[1]?.trim() ?? "";
}

function extractMarkdownChapterContent(raw: string, number: number): string {
  const pattern = new RegExp(`^##\\s*(?:${markdownChapterPrefixPattern(number)})?.*$\\n([\\s\\S]*?)(?=^##\\s*(?:${markdownChapterPrefixPattern(number + 1)})?.*$|(?![\\s\\S]))`, "m");
  return pattern.exec(raw)?.[1]?.trim() ?? "";
}

// Matches a zh "第N章" or en "Chapter N" heading prefix inside markdown fallbacks.
function markdownChapterPrefixPattern(number: number): string {
  return `第\\s*${number}\\s*章\\s*|Chapter\\s*${number}\\s*[:：.\\-–—]?\\s*`;
}

function extractDuplicateTitleTaggedChapterContent(raw: string, number: number): string {
  const escapedTag = `CHAPTER ${number} TITLE`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titlePattern = new RegExp(`^\\s*===\\s*${escapedTag}\\s*===\\s*$`, "gim");
  const matches = Array.from(raw.matchAll(titlePattern));
  const duplicateTitle = matches[1];
  if (!duplicateTitle || duplicateTitle.index === undefined) return "";

  const start = duplicateTitle.index + duplicateTitle[0].length;
  const rest = raw.slice(start).replace(/^\s*\n/, "");
  const nextTag = rest.search(/^\s*===\s*(?:CHAPTER\s+\d+\s+(?:TITLE|CONTENT)|SHORT_FICTION_[A-Z0-9_ ]+)\s*===\s*$/im);
  return (nextTag >= 0 ? rest.slice(0, nextTag) : rest).trim();
}

function sanitizeChapterContent(raw: string): string {
  return raw
    .replace(/^```(?:md|markdown)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^===\s*[A-Z0-9_ ]+\s*===\s*$/gim, "")
    .trim();
}

function normalizeTitle(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean)
    ?.replace(/^《(.+)》$/, "$1")
    .trim() ?? "";
}

function normalizeChapterTitle(raw: string, number: number, language: ShortFictionLanguage = "en"): string {
  const prefixPattern = language === "en"
    ? new RegExp(`^Chapter\\s*${number}\\s*[:：.\\-–—]?\\s*`, "i")
    : new RegExp(`^第\\s*${number}\\s*章\\s*`);
  const title = normalizeTitle(raw).replace(prefixPattern, "").trim();
  return title || fallbackChapterTitle(number, language);
}

export function formatShortFictionChapterHeading(
  number: number,
  title: string,
  language: ShortFictionLanguage = "en",
): string {
  const trimmed = title.trim();
  if (!trimmed) return fallbackChapterTitle(number, language);
  if (language === "en") {
    if (new RegExp(`^Chapter\\s*${number}\\b`, "i").test(trimmed)) return trimmed;
    return `Chapter ${number}: ${trimmed}`;
  }
  if (new RegExp(`^第\\s*${number}\\s*章`).test(trimmed)) return trimmed;
  return `第${number}章 ${trimmed}`;
}

function untitledShortTitle(language: ShortFictionLanguage): string {
  return language === "en" ? "Untitled Short Story" : "未命名短篇";
}

function fallbackChapterTitle(number: number, language: ShortFictionLanguage): string {
  return language === "en" ? `Chapter ${number}` : `第${number}章`;
}

// charsPerChapter is the language's native unit (zh chars / en words). The 2.2
// multiplier is calibrated for zh chars (~1-1.5 tokens each); for en words
// (~1.3-1.5 tokens each) it simply leaves extra headroom, which is safe for a cap.
// The `4096` floor is currently unreachable: the smallest input this function
// receives is 1 chapter at SHORT_FICTION_EN_MIN_WORDS_PER_CHAPTER (900),
// giving ceil(900 * 2.2) + 4096 = 6,076, already above the floor. It stays as
// a backstop in case the length constants shrink again.
function estimateShortFictionMaxTokens(chapterCount: number, charsPerChapter: number): number {
  return Math.max(4096, Math.ceil(chapterCount * charsPerChapter * 2.2) + 4096);
}

function isOutputLimitError(error: unknown): boolean {
  return error instanceof PartialResponseError && error.reason === "output-limit";
}

/**
 * Run one batch per group and return the raw fragments in chapter order.
 * `buildMessages` receives the group and the fragments completed so far, so a
 * continuation-style prompt can carry the prose already written.
 */
async function runChapterBatches(params: {
  readonly agentName: string;
  readonly log?: { warn(message: string): void };
  readonly groups: ReadonlyArray<readonly number[]>;
  readonly charsPerChapter: number;
  readonly temperature: number;
  readonly chat: (messages: ReadonlyArray<LLMMessage>, options: { temperature: number; maxTokens: number }) => Promise<LLMResponse>;
  readonly buildMessages: (chapters: readonly number[], fragmentsSoFar: readonly string[]) => LLMMessage[];
  readonly onBatchProgress?: (info: ShortFictionBatchProgress) => void;
}): Promise<string[]> {
  const fragments: string[] = [];

  // A group that still hits the output cap is split in half and retried, down to
  // a single chapter. Completed fragments are never regenerated.
  const runOneGroup = async (chapters: readonly number[]): Promise<void> => {
    try {
      const response = await retryShortFictionCall(() =>
        params.chat(params.buildMessages(chapters, fragments), {
          temperature: params.temperature,
          maxTokens: estimateShortFictionMaxTokens(chapters.length, params.charsPerChapter),
        }), params.agentName, params.log);

      fragments.push(stripOuterCodeFence(response.content));
    } catch (error) {
      if (!isOutputLimitError(error) || chapters.length <= 1) throw error;
      const mid = Math.ceil(chapters.length / 2);
      params.log?.warn(
        `[${params.agentName}] output limit on chapters ${chapters.join(", ")}; splitting the batch: ${String(error)}`,
      );
      await runOneGroup(chapters.slice(0, mid));
      await runOneGroup(chapters.slice(mid));
    }
  };

  for (const [index, chapters] of params.groups.entries()) {
    params.onBatchProgress?.({
      batch: index + 1,
      totalBatches: params.groups.length,
      chapters,
    });

    await runOneGroup(chapters);
  }

  return fragments;
}

async function retryShortFictionCall<T>(
  operation: () => Promise<T>,
  label: string,
  logger?: { warn(message: string): void },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation();
    } catch (e) {
      lastError = e;
      if (attempt >= 2 || !isTransientShortFictionError(e)) throw e;
      logger?.warn(`[${label}] transient LLM interruption, retrying once: ${String(e)}`);
    }
  }
  throw lastError;
}

function isTransientShortFictionError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes("unexpected eof")
    || message.includes("econnreset")
    || message.includes("socket hang up")
    || message.includes("terminated")
    || message.includes("fetch failed");
}
