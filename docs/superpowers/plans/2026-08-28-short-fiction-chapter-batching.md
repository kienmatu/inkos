# Short Fiction Chapter Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate short-fiction drafts 3 chapters per LLM call — halving the batch automatically when a call still hits the output cap — so the pipeline stops failing on endpoints that cap output far below what a whole 12–18 chapter story needs.

**Architecture:** A private batching loop on the short-fiction agents splits the chapter list into groups of 3. The first batch uses the existing writer prompt narrowed to a chapter range (and is the only batch that emits the story title and opening hook); every later batch reuses `buildShortFictionDraftContinuationUserPrompt` in a new `"batch"` mode, which already carries the prose so far and forbids rewriting finished chapters. If a batch throws `PartialResponseError` with `reason === "output-limit"`, the loop splits that group in half and retries each half, recursing down to a single chapter. Batch outputs have any wrapping code fence stripped, are concatenated into one `rawContent` string, and are parsed **once** at the end by the existing `parseShortFictionBatchDraft`.

**Tech Stack:** TypeScript (ESM, NodeNext), vitest, pnpm workspace. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-short-fiction-chapter-batching-design.md`

## Global Constraints

- Scope is short fiction, plus **one** narrowly-approved guard in `packages/core/src/llm/provider.ts` (Task 1). Do not otherwise modify `provider.ts`, do not modify `packages/core/src/llm/long-form-completion.ts`, and do not modify any non-short-fiction pipeline.
- `SHORT_FICTION_CHAPTERS_PER_BATCH = 3` — exact value, exported from `packages/core/src/agents/short-fiction.ts`.
- Backward compatibility: when `chapterRange` is absent and `mode` is absent, every prompt builder must produce **byte-for-byte identical** output to today. Existing prompt tests must stay green untouched.
- Never return a partial draft as success. A single-chapter batch that still hits the output limit propagates out of `writeDraft` / `reviseDraft`.
- Both languages (`"zh"` and `"en"`) must be handled in every prompt change. `ShortFictionLanguage = "zh" | "en"`.
- A one-chapter batch must read "chapter 13" / "第 13 章", never "13-13".
- All work happens in the worktree `/Users/kiendinh/Documents/codes/inkos/.claude/worktrees/short-fiction-chapter-batching` on branch `worktree-short-fiction-chapter-batching`.
- Test command, run from `packages/core`: `npx vitest run <path>`. Success criterion is **no existing test regresses** — do not assert on a fixed total count, the worktree baseline may drift.
- Do not relax `SHORT_FICTION_MIN_CHAPTERS` (12), `SHORT_FICTION_MAX_CHAPTERS` (18), or the per-chapter length constants.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/core/src/llm/provider.ts` | One guard clause so `wrapLLMError` stops destroying `PartialResponseError`. Nothing else. | Modify |
| `packages/core/src/prompts/short-fiction.ts` | Prompt text. Gains `chapterRange`, a continuation `mode`, and `revisedSoFarMarkdown`. | Modify |
| `packages/core/src/agents/short-fiction.ts` | Agent orchestration. Gains the batch constant, `chunkChapters`, `stripOuterCodeFence`, and a shared batch loop with adaptive halving. | Modify |
| `packages/core/src/pipeline/short-fiction-runner.ts` | Passes a progress callback down. Logic unchanged. | Modify |
| `packages/core/src/__tests__/provider-partial-response.test.ts` | Regression test for the Task 1 guard. | Create |
| `packages/core/src/__tests__/short-fiction-batching.test.ts` | All new tests for batching behaviour. | Create |

---

## Task 1: Stop `wrapLLMError` from destroying `PartialResponseError`

**Why this comes first:** every later task's halving logic depends on `error instanceof PartialResponseError` being true. Today it silently is not, whenever the partial content length happens to contain `400`, `401`, `403`, or `429` as a substring — e.g. `Stream interrupted after 4001 chars: …` matches `msg.includes("400")` and is replaced by a generic HTTP-400 `Error`, losing both the class and the `reason` field.

**Files:**
- Modify: `packages/core/src/llm/provider.ts:598-604`
- Test: `packages/core/src/__tests__/provider-partial-response.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PartialResponseError` instances now survive `wrapLLMError` unchanged. All later tasks rely on this.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/__tests__/provider-partial-response.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { PartialResponseError, chatCompletion } from "../llm/provider.js";

describe("PartialResponseError survives error wrapping", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("keeps the class and reason when the partial length contains an HTTP-like number", async () => {
    // 4001 chars: the message reads "Stream interrupted after 4001 chars: ...",
    // which contains "400" and used to be misclassified as an HTTP 400.
    const thrown = new PartialResponseError(
      "x".repeat(4001),
      new Error("model reached the output limit (length)"),
      "output-limit",
    );

    vi.spyOn(globalThis, "fetch").mockRejectedValue(thrown);

    const client = {
      service: "custom",
      stream: false,
      defaults: { temperature: 0.5, maxTokens: 1024, extra: {}, thinkingBudget: 0 },
      _piModel: { id: "m", name: "m", baseUrl: "http://localhost:1/v1", api: "openai-completions", provider: "custom" },
    } as never;

    const error = await chatCompletion(client, "m", [{ role: "user", content: "hi" }], { retry: false })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PartialResponseError);
    expect((error as PartialResponseError).reason).toBe("output-limit");
    expect(String(error)).not.toContain("API 返回 400");
  });

  it("still classifies a genuine HTTP 400 as a request error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Request failed with status 400"));

    const client = {
      service: "custom",
      stream: false,
      defaults: { temperature: 0.5, maxTokens: 1024, extra: {}, thinkingBudget: 0 },
      _piModel: { id: "m", name: "m", baseUrl: "http://localhost:1/v1", api: "openai-completions", provider: "custom" },
    } as never;

    const error = await chatCompletion(client, "m", [{ role: "user", content: "hi" }], { retry: false })
      .catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(PartialResponseError);
    expect(String(error)).toContain("400");
  });
});
```

- [ ] **Step 2: Run the test to verify the first case fails**

From `packages/core`:

```bash
npx vitest run src/__tests__/provider-partial-response.test.ts
```

Expected: the first test FAILS (the error is a plain `Error` with an "API 返回 400" message); the second test passes.

If the first test instead fails because the harness never reaches `wrapLLMError` (for example the mocked client shape is rejected earlier), fix the client stub until the test exercises the wrapping path — do **not** weaken the assertions.

- [ ] **Step 3: Add the guard clause**

In `packages/core/src/llm/provider.ts`, in `wrapLLMError`, insert immediately after the `ctxLine` assignment and before `if (msg.includes("400"))`:

```ts
  // A PartialResponseError already carries a precise reason. Its message embeds
  // the partial length ("...after 4001 chars..."), which can contain 400/401/
  // 403/429 and get misread as an HTTP status by the substring checks below.
  if (error instanceof PartialResponseError) return error;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/__tests__/provider-partial-response.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run the provider suite for regressions**

```bash
npx vitest run src/__tests__/provider.test.ts src/__tests__/long-form-completion.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/llm/provider.ts packages/core/src/__tests__/provider-partial-response.test.ts
git commit -m "fix(core): keep PartialResponseError intact through error wrapping"
```

---

## Task 2: Chapter-range support in the writer prompt

**Files:**
- Modify: `packages/core/src/prompts/short-fiction.ts` — `ShortFictionDraftPromptInput` (~line 28), `buildShortFictionWriterSystemPrompt` (~line 215), `buildShortFictionWriterUserPrompt` (~line 236)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ShortFictionDraftPromptInput.chapterRange?: readonly [number, number]` — inclusive 1-based chapter bounds.
  - Module-private helpers `rangeChapters(input)`, `isFirstBatch(input)`, `chapterRangeLabel(from, to)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: FAIL — `chapterRange` is not a known property, and the "one API pass" assertions fail.

- [ ] **Step 3: Add `chapterRange` to the prompt input interface**

In `packages/core/src/prompts/short-fiction.ts`, replace `ShortFictionDraftPromptInput`:

```ts
export interface ShortFictionDraftPromptInput {
  readonly direction: string;
  readonly outlineMarkdown: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
  // Inclusive 1-based chapter bounds for one batch. Absent means "the whole
  // story in one pass", which is the pre-batching behaviour.
  readonly chapterRange?: readonly [number, number];
}
```

- [ ] **Step 4: Add the shared range helpers**

Add below the interface block in the same file:

```ts
function rangeChapters(input: ShortFictionDraftPromptInput): number[] {
  const [from, to] = input.chapterRange ?? [1, input.chapterCount];
  const chapters: number[] = [];
  for (let n = from; n <= to; n += 1) chapters.push(n);
  return chapters;
}

function isFirstBatch(input: ShortFictionDraftPromptInput): boolean {
  return (input.chapterRange?.[0] ?? 1) === 1;
}

/** "4-6" for a span, "13" for a single chapter — never "13-13". */
function chapterRangeLabel(from: number, to: number): string {
  return from === to ? `${from}` : `${from}-${to}`;
}
```

- [ ] **Step 5: Neutralise the "one API pass" line in the system prompt**

In `buildShortFictionWriterSystemPrompt`, English branch — replace:

```ts
"You are an English short-fiction BatchWriter. You write the complete short story in one API pass, following the story plan.",
```

with:

```ts
"You are an English short-fiction BatchWriter. You write short-story prose following the story plan.",
```

Chinese branch — replace:

```ts
"你是中文短篇 BatchWriter。你要根据故事方案一次 API 写完整短篇正文。",
```

with:

```ts
"你是中文短篇 BatchWriter。你要根据故事方案写短篇正文。",
```

- [ ] **Step 6: Make the English writer user prompt range-aware**

In `buildShortFictionWriterUserPrompt`, English branch, replace the task line:

```ts
`Write the complete ${input.chapterCount}-chapter story in one pass, about ${input.charsPerChapter} words per chapter.`,
```

with:

```ts
input.chapterRange
  ? `Write ONLY ${input.chapterRange[0] === input.chapterRange[1] ? `chapter ${input.chapterRange[0]}` : `chapters ${chapterRangeLabel(input.chapterRange[0], input.chapterRange[1])}`}, about ${input.charsPerChapter} words each. The complete story is ${input.chapterCount} chapters — calibrate pacing to the whole story, not to this batch.`
  : `Write the complete ${input.chapterCount}-chapter story in one pass, about ${input.charsPerChapter} words per chapter.`,
```

Then replace the English Output Format region — **starting at the literal line `"## Output Format",` and ending after the closing `}),` of the `Array.from` block** — with:

```ts
"## Output Format",
...(isFirstBatch(input) ? [
  "=== SHORT_FICTION_TITLE ===",
  "The story title — plain text, platform-ready, nothing else",
  "=== SHORT_FICTION_OPENING_HOOK ===",
  "An optional pre-story hook of about 130 words; if no standalone teaser is needed, still write the small first-screen scene that opens chapter 1",
] : []),
...rangeChapters(input).map((chapter) => [
  `=== CHAPTER ${chapter} TITLE ===`,
  "Chapter title — plain text only, no #, no \"Chapter N\" prefix",
  `=== CHAPTER ${chapter} CONTENT ===`,
  `Chapter ${chapter} prose — full scenes, no synopsis, no author notes`,
].join("\n")),
```

The heading line is part of the replaced region and is re-emitted by the replacement — do not leave the original heading above it, or the no-range prompt gets two headings.

- [ ] **Step 7: Make the Chinese writer user prompt range-aware**

Replace the task line:

```ts
`一次写完整 ${input.chapterCount} 章，每章约 ${input.charsPerChapter} 字。`,
```

with:

```ts
input.chapterRange
  ? `只写第 ${chapterRangeLabel(input.chapterRange[0], input.chapterRange[1])} 章，每章约 ${input.charsPerChapter} 字。整篇共 ${input.chapterCount} 章，节奏按整篇校准，不要按这一批校准。`
  : `一次写完整 ${input.chapterCount} 章，每章约 ${input.charsPerChapter} 字。`,
```

Then replace the Chinese Output Format region — **starting at the literal line `"## 输出格式",` and ending after the closing `}),` of the `Array.from` block** — with:

```ts
"## 输出格式",
...(isFirstBatch(input) ? [
  "=== SHORT_FICTION_TITLE ===",
  "短篇标题，只写纯文本平台标题",
  "=== SHORT_FICTION_OPENING_HOOK ===",
  "可选正文前小钩子，约 200 字；如果不需要独立引子，也要写第 1 章第一屏的入局小场面",
] : []),
...rangeChapters(input).map((chapter) => [
  `=== CHAPTER ${chapter} TITLE ===`,
  "章节标题，只写纯文本，不要 #，不要第几章前缀",
  `=== CHAPTER ${chapter} CONTENT ===`,
  `第${chapter}章正文，写完整场面，不要梗概，不要作者备注`,
].join("\n")),
```

`isFirstBatch` returns `true` when `chapterRange` is absent, so the no-range path keeps emitting title and hook exactly as before.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 9: Run the existing short-fiction suites for regressions**

```bash
npx vitest run src/__tests__/short-fiction-craft.test.ts src/__tests__/short-fiction-en.test.ts src/__tests__/short-fiction-public.test.ts src/__tests__/short-run-length-validation.test.ts
```

Expected: PASS, with no edits to those files.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/prompts/short-fiction.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): chapter-range support in short-fiction writer prompt"
```

---

## Task 3: Batch mode for the continuation prompt

The continuation prompt opens by telling the model the previous draft was truncated. That is true when repairing and false on batch 2 of a normal write — priming a repair frame for most of the story's prose is a voice-drift risk.

**Files:**
- Modify: `packages/core/src/prompts/short-fiction.ts` — `ShortFictionDraftContinuationPromptInput` (~line 35), `buildShortFictionDraftContinuationUserPrompt` (~line 301)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: `chapterRangeLabel` from Task 2.
- Produces: `ShortFictionDraftContinuationPromptInput.mode?: "repair" | "batch"`, default `"repair"`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
import { buildShortFictionDraftContinuationUserPrompt } from "../prompts/short-fiction.js";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts -t "continuation prompt batch mode"
```

Expected: FAIL — `mode` is not a known property, and the truncation line is always present.

- [ ] **Step 3: Extend the continuation prompt input interface**

```ts
export interface ShortFictionDraftContinuationPromptInput extends ShortFictionDraftPromptInput {
  readonly existingDraftMarkdown: string;
  readonly missingChapters: readonly number[];
  // "repair" (default) frames this as filling gaps in a truncated draft.
  // "batch" frames it as the next batch of a normal write — same body, honest
  // opening line, so the model is not primed to write in a corrective voice.
  readonly mode?: "repair" | "batch";
}
```

- [ ] **Step 4: Branch the opening line only**

In `buildShortFictionDraftContinuationUserPrompt`, the existing first line is computed from `const missing = input.missingChapters.join(", ")`. Add below it:

```ts
  const first = input.missingChapters[0] ?? 1;
  const last = input.missingChapters[input.missingChapters.length - 1] ?? first;
  const label = chapterRangeLabel(first, last);
```

English branch — replace:

```ts
`The previous draft was truncated or skipped chapters. Write ONLY the missing chapters: ${missing}.`,
```

with:

```ts
input.mode === "batch"
  ? `Continue the same story: now write ${first === last ? `chapter ${label}` : `chapters ${label}`}, and only those.`
  : `The previous draft was truncated or skipped chapters. Write ONLY the missing chapters: ${missing}.`,
```

Chinese branch — replace:

```ts
`上一次正文被截断或漏章。现在只补写缺失章节：${missing}。`,
```

with:

```ts
input.mode === "batch"
  ? `继续同一篇的写作：现在写第 ${label} 章，只写这几章。`
  : `上一次正文被截断或漏章。现在只补写缺失章节：${missing}。`,
```

Leave every other line of both branches untouched — that is what keeps `continueDraft`'s output byte-identical.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/prompts/short-fiction.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): batch mode for the short-fiction continuation prompt"
```

---

## Task 4: Chapter-range support in the revision followup prompt

**Files:**
- Modify: `packages/core/src/prompts/short-fiction.ts` — `ShortFictionDraftRevisionPromptInput` (~line 44), `buildShortFictionDraftRevisionFollowup` (~line 413)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: `rangeChapters`, `isFirstBatch`, `chapterRangeLabel`, `chapterRange` (Task 2).
- Produces: `ShortFictionDraftRevisionPromptInput.revisedSoFarMarkdown?: string`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
import { buildShortFictionDraftRevisionFollowup } from "../prompts/short-fiction.js";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts -t "revision followup"
```

Expected: FAIL — `revisedSoFarMarkdown` is not a known property, and chapter 7 still appears in the ranged prompt.

- [ ] **Step 3: Extend the revision prompt input interface**

```ts
export interface ShortFictionDraftRevisionPromptInput extends ShortFictionDraftPromptInput {
  readonly review: string;
  // Second-version chapters already rewritten in earlier batches, rendered as
  // Markdown. Used for voice and continuity only — never rewritten.
  readonly revisedSoFarMarkdown?: string;
}
```

- [ ] **Step 4: Make the English revision followup range-aware**

Replace the first three lines of the English branch:

```ts
"Based on the review notes, write the complete second-version draft.",
"This is round two of the same story: keep what worked in the last version, fix what breaks immersion or kills the desire to keep reading.",
"Do not output a list of suggested edits, and do not patch just a few chapters — output the complete draft.",
```

with:

```ts
input.chapterRange
  ? `Based on the review notes, write the second-version prose for ${input.chapterRange[0] === input.chapterRange[1] ? `chapter ${input.chapterRange[0]}` : `chapters ${chapterRangeLabel(input.chapterRange[0], input.chapterRange[1])}`} ONLY.`
  : "Based on the review notes, write the complete second-version draft.",
"This is round two of the same story: keep what worked in the last version, fix what breaks immersion or kills the desire to keep reading.",
input.chapterRange
  ? "Do not output a list of suggested edits, and do not rewrite chapters outside this range — output the full prose of these chapters."
  : "Do not output a list of suggested edits, and do not patch just a few chapters — output the complete draft.",
```

Then replace the English Output Format region — **starting at the literal line `"## Output Format",` and ending after the closing `}),` of the `Array.from` block** — with:

```ts
...(input.revisedSoFarMarkdown ? [
  "## Second-Version Chapters Already Written (for continuity — do not rewrite)",
  input.revisedSoFarMarkdown,
  "",
] : []),
"## Output Format",
...(isFirstBatch(input) ? [
  "=== SHORT_FICTION_TITLE ===",
  "The story title — plain text, platform-ready, nothing else",
  "=== SHORT_FICTION_OPENING_HOOK ===",
  "An optional pre-story hook of about 130 words; if no standalone teaser is needed, still write the small first-screen scene that opens chapter 1",
] : []),
...rangeChapters(input).map((chapter) => [
  `=== CHAPTER ${chapter} TITLE ===`,
  "Chapter title — plain text only, no #, no \"Chapter N\" prefix",
  `=== CHAPTER ${chapter} CONTENT ===`,
  `Chapter ${chapter} prose — full scenes, no synopsis, no author notes`,
].join("\n")),
```

- [ ] **Step 5: Make the Chinese revision followup range-aware**

Replace the first three lines of the Chinese branch:

```ts
"根据审稿意见，继续写第二版完整正文。",
"这是同一篇的第二轮写作：保留上一版能打的地方，修掉会让读者出戏或不想读的问题。",
"不要只列修改建议，不要只改几章片段，输出完整正文。",
```

with:

```ts
input.chapterRange
  ? `根据审稿意见，只写第 ${chapterRangeLabel(input.chapterRange[0], input.chapterRange[1])} 章的第二版正文。`
  : "根据审稿意见，继续写第二版完整正文。",
"这是同一篇的第二轮写作：保留上一版能打的地方，修掉会让读者出戏或不想读的问题。",
input.chapterRange
  ? "不要只列修改建议，不要改这个区间以外的章节，把这几章的完整正文写出来。"
  : "不要只列修改建议，不要只改几章片段，输出完整正文。",
```

Then replace the Chinese Output Format region — **starting at the literal line `"## 输出格式",` and ending after the closing `}),` of the `Array.from` block** — with:

```ts
...(input.revisedSoFarMarkdown ? [
  "## 第二版已完成章节（只用于承接，不要重写）",
  input.revisedSoFarMarkdown,
  "",
] : []),
"## 输出格式",
...(isFirstBatch(input) ? [
  "=== SHORT_FICTION_TITLE ===",
  "短篇标题，只写纯文本平台标题",
  "=== SHORT_FICTION_OPENING_HOOK ===",
  "可选正文前小钩子，约 200 字；如果不需要独立引子，也要写第 1 章第一屏的入局小场面",
] : []),
...rangeChapters(input).map((chapter) => [
  `=== CHAPTER ${chapter} TITLE ===`,
  "章节标题，只写纯文本，不要 #，不要第几章前缀",
  `=== CHAPTER ${chapter} CONTENT ===`,
  `第${chapter}章正文，写完整场面，不要梗概，不要作者备注`,
].join("\n")),
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS (14 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/prompts/short-fiction.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): chapter-range support in short-fiction revision prompt"
```

---

## Task 5: Batch helpers + batched `writeDraft`

**Files:**
- Modify: `packages/core/src/agents/short-fiction.ts` — constants block (~lines 20–33), `ShortFictionDraftInput` (~line 90), `ShortFictionWriterAgent.writeDraft` (~line 168)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: `chapterRange` (Task 2), continuation `mode` (Task 3).
- Produces:
  - `export const SHORT_FICTION_CHAPTERS_PER_BATCH = 3`
  - `export function chunkChapters(chapters: readonly number[], size: number): number[][]`
  - `export function stripOuterCodeFence(text: string): string`
  - `export interface ShortFictionBatchProgress { readonly batch: number; readonly totalBatches: number; readonly chapters: readonly number[] }`
  - `ShortFictionDraftInput.onBatchProgress?: (info: ShortFictionBatchProgress) => void`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
import { vi } from "vitest";
import {
  ShortFictionWriterAgent,
  SHORT_FICTION_CHAPTERS_PER_BATCH,
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

describe("stripOuterCodeFence", () => {
  it("removes a wrapping fence with or without a language tag", () => {
    expect(stripOuterCodeFence("```markdown\n=== CHAPTER 1 TITLE ===\n一\n```")).toBe("=== CHAPTER 1 TITLE ===\n一");
    expect(stripOuterCodeFence("```\nplain\n```")).toBe("plain");
  });

  it("leaves unfenced text and inner fences alone", () => {
    expect(stripOuterCodeFence("=== CHAPTER 1 CONTENT ===\n正文")).toBe("=== CHAPTER 1 CONTENT ===\n正文");
    expect(stripOuterCodeFence("正文\n```js\ncode\n```\n更多正文")).toBe("正文\n```js\ncode\n```\n更多正文");
  });
});

describe("writeDraft batching", () => {
  it("uses a batch size of 3", () => {
    expect(SHORT_FICTION_CHAPTERS_PER_BATCH).toBe(3);
  });

  it("issues four calls for a 12-chapter story with non-overlapping ranges", async () => {
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

    expect(seen).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]);
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

    expect(seen).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13]]);
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

    expect(seen).toEqual(["1/4:1,2,3", "2/4:4,5,6", "3/4:7,8,9", "4/4:10,11,12"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts -t "writeDraft batching"
```

Expected: FAIL — the new exports do not exist; `chat` is called once, not four times.

- [ ] **Step 3: Add the constant and helpers**

In `packages/core/src/agents/short-fiction.ts`, after the existing `SHORT_FICTION_*` constants (immediately below `SHORT_FICTION_EN_MAX_WORDS_PER_CHAPTER`):

```ts
// One LLM call per 3 chapters. Sized so a batch stays under the output cap of
// endpoints that ignore max_tokens and enforce their own (~4k tokens observed),
// including English shorts at 800 words per chapter. This is a starting guess,
// not a load-bearing assumption: a batch that still hits the cap is split in
// half and retried, down to a single chapter.
export const SHORT_FICTION_CHAPTERS_PER_BATCH = 3;

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
  const match = /^```[a-zA-Z0-9_-]*\n([\s\S]*)\n```$/.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
}
```

- [ ] **Step 4: Add the progress callback to the draft input**

Replace `ShortFictionDraftInput`:

```ts
export interface ShortFictionDraftInput {
  readonly direction: string;
  readonly outlineMarkdown: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
  readonly language?: ShortFictionLanguage;
  readonly onBatchProgress?: (info: ShortFictionBatchProgress) => void;
}
```

- [ ] **Step 5: Add the shared batch loop to `BaseAgent`'s short-fiction subclasses**

Add this module-private function near `retryShortFictionCall` in the same file:

```ts
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

  for (const [index, chapters] of params.groups.entries()) {
    params.onBatchProgress?.({
      batch: index + 1,
      totalBatches: params.groups.length,
      chapters,
    });

    const response = await retryShortFictionCall(() =>
      params.chat(params.buildMessages(chapters, fragments), {
        temperature: params.temperature,
        maxTokens: estimateShortFictionMaxTokens(chapters.length, params.charsPerChapter),
      }), params.agentName, params.log);

    fragments.push(stripOuterCodeFence(response.content));
  }

  return fragments;
}
```

Add the value and type imports at the top of the file if absent:

```ts
import type { LLMMessage, LLMResponse } from "../llm/provider.js";
```

- [ ] **Step 6: Replace `writeDraft` with the batched version**

```ts
  async writeDraft(input: ShortFictionDraftInput): Promise<ShortFictionBatchDraft> {
    const allChapters = Array.from({ length: input.chapterCount }, (_, index) => index + 1);
    const groups = chunkChapters(allChapters, SHORT_FICTION_CHAPTERS_PER_BATCH);

    const fragments = await runChapterBatches({
      agentName: this.name,
      ...(this.log ? { log: this.log } : {}),
      groups,
      charsPerChapter: input.charsPerChapter,
      temperature: 0.58,
      chat: (messages, options) => this.chat(messages, options),
      ...(input.onBatchProgress ? { onBatchProgress: input.onBatchProgress } : {}),
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
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run the existing short-fiction suites**

```bash
npx vitest run src/__tests__/short-fiction-resume.test.ts src/__tests__/short-fiction-public.test.ts src/__tests__/short-run-length-validation.test.ts
```

Expected: PASS. `short-fiction-resume.test.ts` stubs `writeDraft` wholesale, so it is unaffected.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/agents/short-fiction.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): batch short-fiction draft generation at 3 chapters per call"
```

---

## Task 6: Adaptive halving when a batch still hits the output limit

**Files:**
- Modify: `packages/core/src/agents/short-fiction.ts` — `runChapterBatches` (added in Task 5)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: `runChapterBatches`, `PartialResponseError` (guarded in Task 1).
- Produces: `runChapterBatches` splits a failing group and recurses; behaviour is internal, no new exports.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
import { PartialResponseError } from "../llm/provider.js";

describe("adaptive batch halving", () => {
  it("splits a batch that hits the output limit and completes the story", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    const seen: number[][] = [];
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      seen.push(group);
      // Chapters 7-9 as a group of three is too big; halves succeed.
      if (group.length === 3 && group[0] === 7) {
        return Promise.reject(new PartialResponseError(
          "half", new Error("model reached the output limit (length)"), "output-limit",
        ));
      }
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    const draft = await agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    });

    expect(seen).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [7, 8], [9], [10, 11, 12]]);
    expect(draft.chapters).toHaveLength(12);
    expect(draft.chapters.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it("gives up when a single-chapter batch still hits the limit", async () => {
    const agent = writerAgent();
    const chat = spyChat(agent);
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      if (group[0]! >= 4) {
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
      if (group[0] === 4) return Promise.reject(new Error("401 unauthorized"));
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    await expect(agent.writeDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
    })).rejects.toThrow(/401/);
    // batch 1 succeeded, batch 2 failed once — no halving attempts
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts -t "adaptive batch halving"
```

Expected: FAIL — the first test rejects instead of splitting.

- [ ] **Step 3: Add the halving logic**

In `packages/core/src/agents/short-fiction.ts`, add above `runChapterBatches`:

```ts
function isOutputLimitError(error: unknown): boolean {
  return error instanceof PartialResponseError && error.reason === "output-limit";
}
```

and add the value import:

```ts
import { PartialResponseError } from "../llm/provider.js";
```

Then replace the body of the `for` loop in `runChapterBatches` so the call goes through a recursive helper. Replace:

```ts
    const response = await retryShortFictionCall(() =>
      params.chat(params.buildMessages(chapters, fragments), {
        temperature: params.temperature,
        maxTokens: estimateShortFictionMaxTokens(chapters.length, params.charsPerChapter),
      }), params.agentName, params.log);

    fragments.push(stripOuterCodeFence(response.content));
```

with:

```ts
    await runOneGroup(chapters);
```

and define `runOneGroup` inside `runChapterBatches`, above the `for` loop:

```ts
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
        `[${params.agentName}] output limit on chapters ${chapters.join(", ")}; splitting the batch.`,
      );
      await runOneGroup(chapters.slice(0, mid));
      await runOneGroup(chapters.slice(mid));
    }
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/short-fiction.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): halve a short-fiction batch that still hits the output limit"
```

---

## Task 7: Batched `reviseDraft`

**Files:**
- Modify: `packages/core/src/agents/short-fiction.ts` — `ShortFictionDraftReviserAgent.reviseDraft` (~line 234)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: `runChapterBatches`, `chunkChapters`, `SHORT_FICTION_CHAPTERS_PER_BATCH` (Tasks 5–6); `revisedSoFarMarkdown`, `chapterRange` (Task 4).
- Produces: `reviseDraft` issues one LLM call per batch and inherits halving.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
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

  it("issues four calls for a 12-chapter revision and merges into a full draft", async () => {
    const agent = reviserAgent();
    const chat = spyChat(agent);
    const seen: number[][] = [];
    chat.mockImplementation((...args: unknown[]) => {
      const group = requestedChapters(args, 12);
      seen.push(group);
      return Promise.resolve({ content: batchReply(group, group[0] === 1), usage: undefined });
    });

    const revised = await agent.reviseDraft({
      direction: "恐怖短篇", outlineMarkdown: "## 方案", chapterCount: 12, charsPerChapter: 1000,
      draft: v1, review: "第六章反扑不够",
    });

    expect(seen).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts -t "reviseDraft batching"
```

Expected: FAIL — `chat` called once, not four times.

- [ ] **Step 3: Add the progress callback to the revision input**

`ShortFictionDraftRevisionInput` already extends `ShortFictionDraftReviewInput`, which extends `ShortFictionDraftInput`, so it inherits `onBatchProgress` from Task 5. No interface change needed — verify this by reading the interface chain before proceeding.

- [ ] **Step 4: Replace `reviseDraft` with the batched version**

```ts
  async reviseDraft(input: ShortFictionDraftRevisionInput): Promise<ShortFictionBatchDraft> {
    const allChapters = Array.from({ length: input.chapterCount }, (_, index) => index + 1);
    const groups = chunkChapters(allChapters, SHORT_FICTION_CHAPTERS_PER_BATCH);
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
          { role: "user", content: buildShortFictionWriterUserPrompt({ ...input, chapterRange }, input.language) },
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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the suite that calls `reviseDraft` directly**

`packages/core/src/__tests__/short-fiction-public.test.ts:141` calls `reviseDraft` with `chapterCount: 1`, which is a single batch.

```bash
npx vitest run src/__tests__/short-fiction-public.test.ts src/__tests__/short-fiction-resume.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/agents/short-fiction.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): batch short-fiction draft revision at 3 chapters per call"
```

---

## Task 8: Chunked `continueDraft` repair path

**Files:**
- Modify: `packages/core/src/agents/short-fiction.ts` — `ShortFictionWriterAgent.continueDraft` (~line 181)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: `runChapterBatches`, `chunkChapters` (Tasks 5–6).
- Produces: `continueDraft` issues one call per 3 missing chapters and keeps `mode: "repair"`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
describe("continueDraft chunking", () => {
  it("repairs ten missing chapters in four calls, keeping the repair framing", async () => {
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

    expect(seen).toEqual([[3, 4, 5], [6, 7, 8], [9, 10, 11], [12]]);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts -t "continueDraft chunking"
```

Expected: FAIL — `chat` called once, not four times.

- [ ] **Step 3: Replace `continueDraft`**

```ts
  async continueDraft(input: ShortFictionDraftInput & { readonly draft: ShortFictionBatchDraft }): Promise<ShortFictionBatchDraft> {
    const missingChapters = findEmptyShortFictionChapters(input.draft);
    if (missingChapters.length === 0) return input.draft;

    const groups = chunkChapters(missingChapters, SHORT_FICTION_CHAPTERS_PER_BATCH);
    const baseRaw = input.draft.rawContent.trim();

    const fragments = await runChapterBatches({
      agentName: this.name,
      ...(this.log ? { log: this.log } : {}),
      groups,
      charsPerChapter: input.charsPerChapter,
      temperature: 0.68,
      chat: (messages, options) => this.chat(messages, options),
      ...(input.onBatchProgress ? { onBatchProgress: input.onBatchProgress } : {}),
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
```

Note the absence of `mode` — the repair path keeps the default `"repair"` framing, so its prompt stays byte-identical to today's.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the resume suite, which exercises `continueDraft` through the runner**

```bash
npx vitest run src/__tests__/short-fiction-resume.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/agents/short-fiction.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): chunk short-fiction continueDraft repairs at 3 chapters per call"
```

---

## Task 9: Runner progress wiring + full verification

**Files:**
- Modify: `packages/core/src/pipeline/short-fiction-runner.ts` — the `writer.writeDraft`, `writer.continueDraft`, and `reviser.reviseDraft` call sites (~lines 278–330)
- Test: `packages/core/src/__tests__/short-fiction-batching.test.ts`

**Interfaces:**
- Consumes: `ShortFictionBatchProgress` and `onBatchProgress` (Tasks 5–8).
- Produces: nothing downstream — this is the last task.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/__tests__/short-fiction-batching.test.ts`:

```ts
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

      // The outline stages must be skipped by the resume path; make it loud if not.
      const outlineGuard = new Error("outline stage must be skipped when v002.md exists");
      vi.spyOn(ShortFictionOutlineAgent.prototype, "createOutline").mockRejectedValue(outlineGuard);
      vi.spyOn(ShortFictionOutlineReviewerAgent.prototype, "reviewOutline").mockRejectedValue(outlineGuard);
      vi.spyOn(ShortFictionOutlineReviserAgent.prototype, "reviseOutline").mockRejectedValue(outlineGuard);

      vi.spyOn(ShortFictionWriterAgent.prototype, "writeDraft").mockImplementation(async (input) => {
        input.onBatchProgress?.({ batch: 2, totalBatches: 4, chapters: [4, 5, 6] });
        return draft;
      });
      vi.spyOn(ShortFictionDraftReviewerAgent.prototype, "reviewDraft").mockResolvedValue("looks fine");
      vi.spyOn(ShortFictionDraftReviserAgent.prototype, "reviseDraft").mockResolvedValue(draft);
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
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts -t "runner batch progress"
```

Expected: FAIL — no progress message mentions the batch.

- [ ] **Step 3: Add the message helper to the runner**

In `packages/core/src/pipeline/short-fiction-runner.ts`, add near the other module-level helpers:

```ts
function batchProgressMessage(stage: string, info: ShortFictionBatchProgress): string {
  const first = info.chapters[0];
  const last = info.chapters[info.chapters.length - 1];
  const range = first === last ? `${first}` : `${first}-${last}`;
  return `${stage} chapters ${range} (batch ${info.batch}/${info.totalBatches})...`;
}
```

and add `ShortFictionBatchProgress` to the existing import from `../agents/short-fiction.js`.

- [ ] **Step 4: Wire the callback into the three call sites**

Add to the `writer.writeDraft({...})` argument object:

```ts
      onBatchProgress: (info) => options.onProgress?.(batchProgressMessage("Writing", info)),
```

to the `writer.continueDraft({...})` argument object:

```ts
          onBatchProgress: (info) => options.onProgress?.(batchProgressMessage("Completing", info)),
```

and to the `reviser.reviseDraft({...})` argument object:

```ts
        onBatchProgress: (info) => options.onProgress?.(batchProgressMessage("Revising", info)),
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/__tests__/short-fiction-batching.test.ts
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run the full core suite**

```bash
npx vitest run
```

Expected: all files pass. No existing test may regress.

- [ ] **Step 8: Run every package's tests**

From the repo root:

```bash
pnpm -r test
```

Expected: all packages pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/pipeline/short-fiction-runner.ts packages/core/src/__tests__/short-fiction-batching.test.ts
git commit -m "feat(core): report short-fiction batch progress through the runner"
```

---

## Self-Review Notes

**Spec coverage.** Writer prompt `chapterRange` → Task 2. Continuation `mode` → Task 3. Revision prompt → Task 4. `SHORT_FICTION_CHAPTERS_PER_BATCH` + `chunkChapters` + `stripOuterCodeFence` + batched `writeDraft` → Task 5. Adaptive halving → Task 6. `reviseDraft` → Task 7. `continueDraft` chunking → Task 8. Runner progress → Task 9. The `wrapLLMError` guard the halving depends on → Task 1.

Acceptance criteria → tests: (1) Task 5 "four calls"; (2) Task 5 "13-chapter" and Task 2 "single chapter"; (3) Tasks 5, 7; (4) Task 5 "strips a wrapping code fence"; (5) Task 6 "splits a batch"; (6) Task 6 "gives up"; (7) Task 5 "gives later batches the earlier prose"; (8) Tasks 2, 3, 4 "is unchanged" plus the heading-count assertions; (9) Task 9 Steps 6–8.

**Type consistency.** `chapterRange: readonly [number, number]` is used identically in Tasks 2, 4, 5, 7. `mode: "repair" | "batch"` is defined in Task 3 and consumed in Tasks 5 and 8. `ShortFictionBatchProgress` is defined once in Task 5 and consumed in Tasks 7, 8, 9. `runChapterBatches` keeps one parameter shape across Tasks 5, 6, 7, 8. `chapterRangeLabel(from, to)` is defined in Task 2 and used in Tasks 3 and 4.

**Known interactions.**
- `parseShortFictionBatchDraft` is called mid-loop with `expectedChapters: chapters[0]! - 1` purely to render the prose written so far. That asks the parser for exactly the chapters completed, not the full count. Verified correct against the real parser.
- `continueDraft` parses with the **full** `chapterCount` mid-loop instead, because its base draft already spans all chapters and only some are empty.
- `retryShortFictionCall` wraps each batch and discards a failed attempt entirely, so a network retry cannot duplicate chapter blocks in the merged string. `PartialResponseError.partialContent` never reaches `fragments`.
- `onBatchProgress` fires once per *original* group, before the call. A halved retry does not emit extra progress events.
- Optional properties are spread conditionally (`...(x ? { x } : {})`) in the code blocks above. Checked: the root `tsconfig.json` sets `strict: true` but **not** `exactOptionalPropertyTypes` and **not** `noUncheckedIndexedAccess`, so passing `undefined` directly is legal here and the `!` assertions on `chapters[0]` are belt-and-braces. Implementers may write `onBatchProgress: input.onBatchProgress` and drop the `!`s; both forms typecheck. Do not add either compiler flag as part of this work.
