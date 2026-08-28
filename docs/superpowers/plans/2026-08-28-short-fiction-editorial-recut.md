# Short Fiction Editorial Re-Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Act on the three changes an editorial review recommended: re-cut the English format to real market dimensions, stop batching from producing twelve identically-shaped chapters, and stop presenting one genre engine as neutral craft.

**Architecture:** All three are changes to constants and prompt copy. No control flow, no new modules, no architecture. The batching machinery built on this branch is untouched and already tolerates the new chapter lengths.

**Tech Stack:** TypeScript (ESM, NodeNext), vitest, pnpm workspace. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-short-fiction-editorial-review.md` — the editorial review, with sourced industry research. Read Part 4 for the verdict this plan implements, and Part 2 for the prompt criticisms Tasks 2 and 3 answer.

## Global Constraints

- **Chinese is not being re-cut.** `SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER` (1000), `SHORT_FICTION_MIN_CHARS_PER_CHAPTER` (900) and `SHORT_FICTION_MAX_CHARS_PER_CHAPTER` (1200) keep their values. The review's verdict was about English; the Chinese numbers are a faithful port of Zhihu Yanxuan's real, working format. Changing them breaks something that is currently correct.
- **The `"repair"` path of the continuation prompt must stay byte-identical.** Task 2 adds text only under `mode === "batch"`.
- Both languages must keep working. `ShortFictionLanguage = "zh" | "en"`.
- Do not change `resolveChaptersPerBatch`, `SHORT_FICTION_BATCH_OUTPUT_TOKEN_BUDGET` (1400), `SHORT_FICTION_MAX_CHAPTERS_PER_BATCH` (3), `runChapterBatches`, the halving logic, or `estimateShortFictionMaxTokens`.
- Do not change `ShortFictionSalesPackage`'s shape. `sellingPoints` stays in the type, the parser, and the on-disk output; only the prompt that fills it changes.
- Success criterion is that no existing test regresses. A fixed total test count is explicitly NOT the criterion.
- tsconfig sets `strict: true` but NOT `exactOptionalPropertyTypes` and NOT `noUncheckedIndexedAccess`. Do not add either.
- Work in the worktree `/Users/kiendinh/Documents/codes/inkos/.claude/worktrees/short-fiction-chapter-batching` on branch `worktree-short-fiction-chapter-batching`.
- Test commands run from `packages/core` unless stated: `npx vitest run <path>`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/core/src/agents/short-fiction.ts` | The English length constants and the comment explaining them | 1 |
| `packages/cli/src/commands/short-fiction.ts` | The `--chapters` help string, which hard-codes the old range | 1 |
| `packages/core/src/prompts/short-fiction.ts` | Continuation prompt batch-mode additions (2); engine naming, title examples, selling-points re-aim (3) | 2, 3 |
| `packages/core/src/__tests__/short-fiction-editorial.test.ts` | New tests for all three tasks | 1, 2, 3 |

---

## Task 1: Re-cut the English format constants

**Files:**
- Modify: `packages/core/src/agents/short-fiction.ts` — the constants block (~lines 22–33) and its explanatory comment
- Modify: `packages/cli/src/commands/short-fiction.ts:40` — the `--chapters` option description
- Test: `packages/core/src/__tests__/short-fiction-editorial.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the constants below, at these exact values. Tasks 2 and 3 do not depend on them.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/__tests__/short-fiction-editorial.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/__tests__/short-fiction-editorial.test.ts
```

Expected: FAIL on the English and chapter-count assertions; the Chinese and batching assertions already pass.

- [ ] **Step 3: Change the constants**

In `packages/core/src/agents/short-fiction.ts`, replace the chapter-count constants:

```ts
export const SHORT_FICTION_DEFAULT_CHAPTERS = 10;
export const SHORT_FICTION_MIN_CHAPTERS = 8;
export const SHORT_FICTION_MAX_CHAPTERS = 18;
```

Leave `SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER`, `SHORT_FICTION_MIN_CHARS_PER_CHAPTER` and `SHORT_FICTION_MAX_CHARS_PER_CHAPTER` exactly as they are.

- [ ] **Step 4: Replace the English constants and their justification**

The existing comment derives the English numbers from the Chinese ones via a 2/3 word ratio. **That derivation is now wrong and is the reason the values were wrong** — replace the whole comment, do not leave it above new values.

Replace this block:

```ts
// English shorts are calibrated in words, not characters. length-metrics.ts pins
// the full-length chapter defaults at zh 3000 chars ≈ en 2000 words (a 2/3 ratio),
// so the zh short range of 900/1000/1200 chars per chapter converts to
// 600/650/800 words per chapter (1000 × 2/3 ≈ 667, rounded down to 650).
export const SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER = 650;
export const SHORT_FICTION_EN_MIN_WORDS_PER_CHAPTER = 600;
export const SHORT_FICTION_EN_MAX_WORDS_PER_CHAPTER = 800;
```

with:

```ts
// English shorts are calibrated to the English market, NOT unit-converted from
// the Chinese numbers above. The old 600/650/800 range came from a 2/3 word
// conversion of the zh format, which is linguistically reasonable and
// commercially meaningless: it landed at or below the floor of every English
// platform. Royal Road runs 1,500-3,500 words per chapter, Wattpad 1,000-3,000,
// Dreame/GoodNovel 1,500-2,500; Kindle Vella allowed 600 as a hard minimum and
// shut down in 2025. A 650-word chapter is also too small to hold the staged
// scene the craft prompt demands, which forced the model into the synopsis voice
// that same prompt forbids.
// See docs/superpowers/specs/2026-08-28-short-fiction-editorial-review.md.
export const SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER = 1200;
export const SHORT_FICTION_EN_MIN_WORDS_PER_CHAPTER = 900;
export const SHORT_FICTION_EN_MAX_WORDS_PER_CHAPTER = 1500;
```

Also add a short comment above the chapter-count constants recording why they moved:

```ts
// 10 x 1200 words = ~12,000 words, which is the Kindle Short Reads / novelette
// shape this pipeline actually produces — not a serial, which is what the old
// 12-18 x 650 implied. The 18 ceiling stays for users who want a longer piece.
```

- [ ] **Step 5: Fix the CLI help string**

`packages/cli/src/commands/short-fiction.ts:40` hard-codes the old range in prose:

```ts
.option("--chapters <n>", "Complete short chapter count (12-18)", String(SHORT_FICTION_DEFAULT_CHAPTERS))
```

Change `(12-18)` to `(8-18)`. Check the surrounding options for any other hard-coded range or word count and fix those too — grep the file for `12`, `18`, `650`, `600`, `800`.

- [ ] **Step 6: Run the new test and the short-fiction suites**

```bash
npx vitest run src/__tests__/short-fiction-editorial.test.ts
npx vitest run src/__tests__/short-fiction-resume.test.ts src/__tests__/short-fiction-public.test.ts src/__tests__/short-run-length-validation.test.ts src/__tests__/short-fiction-batching.test.ts src/__tests__/short-fiction-craft.test.ts src/__tests__/short-fiction-en.test.ts
```

Expected: the new test passes. If an existing test asserted the OLD constants, update it to the new values and say so explicitly in your report — do not weaken the assertion into a range or drop it.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add packages/core/src/agents/short-fiction.ts packages/cli/src/commands/short-fiction.ts packages/core/src/__tests__/short-fiction-editorial.test.ts
git commit -m "feat(core): re-cut the English short-fiction format to market dimensions"
```

---

## Task 2: Break chapter-shape monotony in batch mode

Batching writes one chapter per call for English. Each call is independently told this chapter needs a hook at the break, so twelve calls produce twelve identically shaped chapters: cold open, one scene, escalation, cliffhanger. No chapter can end quietly because no call knows it is allowed to be the valley. Later chapters also tend to open by re-establishing what came before, a recap habit whole-draft generation never had.

**Files:**
- Modify: `packages/core/src/prompts/short-fiction.ts` — `buildShortFictionDraftContinuationUserPrompt`, batch-mode branch only
- Test: `packages/core/src/__tests__/short-fiction-editorial.test.ts`

**Interfaces:**
- Consumes: the existing `mode?: "repair" | "batch"` field.
- Produces: no new fields. Text-only change gated on `mode === "batch"`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-editorial.test.ts`:

```ts
import { buildShortFictionDraftContinuationUserPrompt } from "../prompts/short-fiction.js";

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

    expect(en).toMatch(/find (these|this) chapters? entr/i);
    expect(zh).toContain("在上面的故事方案里找到这几章的条目");
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-editorial.test.ts -t "batch-mode chapter shaping"
```

Expected: the three content tests FAIL; the repair byte-identity test passes already.

- [ ] **Step 3: Add the batch-mode shaping block**

In `buildShortFictionDraftContinuationUserPrompt`, both language branches already have a batch-mode opening line. Add a conditional block of three instructions that appears ONLY when `mode === "batch"`. Put it directly after the existing task lines and before the craft prompt, so it reads as part of the brief rather than as an afterthought.

English:

```ts
...(input.mode === "batch" ? [
  "Before writing, find these chapters' entries in the story plan above and follow them: this batch's job is that specific beat, not a generic escalation.",
  "Vary how the chapter earns its ending. Every chapter still needs a reason to read on — but that reason can be a decision just made, a question just opened, a small discovery, or dread, not only a cliffhanger. Ten consecutive cliffhangers read as exhausting rather than gripping; the hook is the reason, not the bang.",
  "Do not open by summarizing what already happened. Continue from inside the story; the reader has just read the previous chapter.",
] : []),
```

Chinese:

```ts
...(input.mode === "batch" ? [
  "动笔前先在上面的故事方案里找到这几章的条目并照着写：这一批的任务是那个具体的节拍，不是泛泛地加码。",
  "章尾的写法要有变化。每一章仍然要给出继续读的理由，但那个理由可以是刚做出的决定、刚打开的疑问、一处小发现或一股不安，不是只有悬崖式断章。连着十章都用悬崖结尾读起来只会累，不会抓人；钩子是那个理由，不是那声炸响。",
  "不要用回顾前情开场。直接从故事内部接着写，读者刚读完上一章。",
] : []),
```

Leave every other line of both branches untouched — that is what keeps the repair path byte-identical.

Also import `buildShortFictionWriterSystemPrompt` in the test file for the contradiction test.

- [ ] **Step 3b: Harmonise the writer system prompt so the two do not contradict**

This step is why the batch instruction is worded the way it is, and it must not be skipped.

`buildShortFictionWriterSystemPrompt` currently makes a chapter-break hook unconditional (`short-fiction.ts:246` English, `:255` Chinese):

> "Every chapter needs drama happening on the page: character action, dialogue or reaction, a shift in the situation, **and a reason to keep reading at the chapter break**."

That line lives in the **system** turn; Step 3's addition lives in a **user** turn. If the user turn appeared to license dropping the hook, the model would be holding two opposed instructions at two levels of authority, and the higher one usually wins — leaving Step 3 partly inert and the prose incoherent where it isn't.

The hook requirement stays mandatory. Widen only the permitted *device*, in the same sentence, so both turns agree. English — replace that clause's tail:

```ts
"This is not serialized-novel continuation and not chapter synopsis. Every chapter needs drama happening on the page: character action, dialogue or reaction, a shift in the situation, and a reason to keep reading at the chapter break — that reason need not be a cliffhanger; a decision, an opened question, a discovery or dread all qualify.",
```

Chinese:

```ts
"这不是长篇连载续写，也不是章节梗概。每章都要有当场发生的戏：人物行动、对话或反应、局面变化、章尾继续读的理由——这个理由不一定是悬崖式断章，一个决定、一个被打开的疑问、一处发现或一股不安都算。",
```

Note that Task 3 also edits this same function (adding the engine-naming line). Whichever runs second must preserve the other's change.

- [ ] **Step 4: Run the tests and the short-fiction suites**

```bash
npx vitest run src/__tests__/short-fiction-editorial.test.ts
npx vitest run src/__tests__/short-fiction-batching.test.ts src/__tests__/short-fiction-craft.test.ts src/__tests__/short-fiction-en.test.ts src/__tests__/short-fiction-public.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/prompts/short-fiction.ts packages/core/src/__tests__/short-fiction-editorial.test.ts
git commit -m "feat(core): vary chapter shape and forbid recap openings in batch mode"
```

---

## Task 3: Name the genre engine, define "platform-ready", re-aim selling points

The prompts encode one story engine — protagonist pinned down, gathers leverage, turns the tables, antagonist counterattacks, comeuppance, payoff — and present it as universal craft. It is a real and effective engine, but a user feeding in a cozy romance gets a revenge story and no prompt says so. Separately, "platform-ready title" is asserted with no register guidance or examples, and the selling-points block is a Chinese-platform artifact no English platform has a field for.

**Files:**
- Modify: `packages/core/src/prompts/short-fiction.ts` — `buildShortFictionWriterSystemPrompt`, `buildShortFictionCraftPrompt`, `buildShortFictionOutlineSystemPrompt`, `buildShortFictionPackageUserPrompt`
- Test: `packages/core/src/__tests__/short-fiction-editorial.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: no API change. `ShortFictionSalesPackage.sellingPoints` keeps its name, type, parser and on-disk output.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/short-fiction-editorial.test.ts`:

```ts
import {
  buildShortFictionWriterSystemPrompt,
  buildShortFictionOutlineSystemPrompt,
  buildShortFictionPackageUserPrompt,
} from "../prompts/short-fiction.js";

describe("genre engine is named, not implied", () => {
  it("tells the writer which engine it is running", () => {
    const en = buildShortFictionWriterSystemPrompt("en");
    const zh = buildShortFictionWriterSystemPrompt("zh");

    expect(en).toMatch(/vindication|comeuppance/i);
    expect(en).toMatch(/pinned down|suppressed/i);
    expect(zh).toContain("翻盘");
  });

  it("gives concrete English title examples instead of asserting platform-ready", () => {
    const writer = buildShortFictionWriterSystemPrompt("en");
    const outline = buildShortFictionOutlineSystemPrompt("en");
    const examples = /".+?"/g;

    expect(outline.match(examples)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(`${writer}${outline}`).toMatch(/for example|such as|e\.g\./i);
  });
});

describe("selling points are aimed at an English listing", () => {
  it("asks for description bullets, not distribution-editor selling points", () => {
    const en = buildShortFictionPackageUserPrompt({
      direction: "A courier discovers the parcels are evidence",
      outlineMarkdown: "## Plan",
      draftMarkdown: "# Parcel\n\n## Chapter 1\nprose",
      draftTitle: "Parcel",
    }, "en");

    expect(en).toMatch(/product description|listing|store page/i);
    expect(en).toContain("=== SHORT_FICTION_SELLING_POINTS ===");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/__tests__/short-fiction-editorial.test.ts -t "genre engine"
npx vitest run src/__tests__/short-fiction-editorial.test.ts -t "selling points"
```

Expected: FAIL.

- [ ] **Step 3: Name the engine in the writer system prompt**

Add one line to `buildShortFictionWriterSystemPrompt`, after the existing opening line, in both languages.

English:

```ts
"This pipeline writes one specific engine: a vindication arc — the protagonist is pinned down, accumulates leverage, turns the tables, absorbs a counterattack, and lands a comeuppance the reader has been waiting for. Write that engine deliberately rather than treating it as generic storytelling.",
```

Chinese:

```ts
"这条流水线写的是一种特定引擎：翻盘弧线——主角被压制、积累筹码、扭转局面、承受反扑，最后落下读者一直在等的那个报应。要有意识地写这个引擎，不要当成泛泛的讲故事。",
```

- [ ] **Step 4: Add title examples**

In `buildShortFictionOutlineSystemPrompt`'s English branch, wherever it asks for a platform-ready title, follow it with concrete examples:

```ts
"A platform-ready English title is concrete and promises a specific reversal — for example \"The Ledger She Kept\", \"Nine Days to Prove It\", \"What the Night Shift Saw\". Avoid abstract one-word titles and avoid literary summaries of the theme.",
```

Add the same line to `buildShortFictionWriterSystemPrompt`'s English branch. Do NOT add English examples to the Chinese branches — the Chinese register is already established in those prompts.

- [ ] **Step 5: Re-aim the selling points**

In `buildShortFictionPackageUserPrompt`'s English branch, the selling-points instruction currently reads:

```ts
"- 3 to 6 selling points, one per line",
```

Replace it with wording that produces something an English storefront can use:

```ts
"- 3 to 6 one-line hooks for the product description's bullet list, one per line — each names a concrete promise (a reversal, a stake, a question), not a genre label",
```

Update the packaging system prompt's English branch to match: it currently calls them "the selling points", which is a Chinese-platform artifact. Call them what they are — description bullets for the store listing. Leave the Chinese branch's 卖点 wording alone; it is correct for its market.

Do not change the `=== SHORT_FICTION_SELLING_POINTS ===` block marker, the parser, or `ShortFictionSalesPackage`.

- [ ] **Step 6: Run the tests and the full core suite**

```bash
npx vitest run src/__tests__/short-fiction-editorial.test.ts
npx vitest run
```

Expected: PASS. Any existing prompt test that asserted the old wording must be updated to the new wording, not weakened.

- [ ] **Step 7: Typecheck, whole-repo test, commit**

```bash
npx tsc --noEmit
```

From the repo root:

```bash
pnpm -r test
```

Then:

```bash
git add packages/core/src/prompts/short-fiction.ts packages/core/src/__tests__/short-fiction-editorial.test.ts
git commit -m "feat(core): name the genre engine, give title examples, re-aim selling points"
```

---

## Self-Review Notes

- **Spec coverage.** Editorial review's change 1 → Task 1; change 2 → Task 2; change 3 → Task 3. The review's "hold the total at 9,000–13,000 words" is asserted directly by Task 1's third test.
- **Deliberate departure from the review.** The review proposed passing each batch its own outline entry as structured data. Task 2 instead instructs the model to locate its chapters' entries in the outline that is already in the prompt. Parsing chapter entries out of model-written Markdown would fail silently whenever the outline stage drifts from the expected format, and the outline is already present in full — the cheaper instruction gets the same effect with nothing to break.
- **Deliberate departure from the review.** The review offered "drop or repurpose" the selling-points block. This plan repurposes. `sellingPoints` is in the public API, the on-disk sales package, and possibly the studio UI; dropping it would touch the type, the parser, saved files and the frontend for no gain over re-aiming the prompt.
- **Type consistency.** No new types, fields or signatures are introduced by any task. Task 2 uses the existing `mode` field; Task 3 changes only prompt strings.
- **Known interaction.** Task 1 changes `SHORT_FICTION_MIN_CHAPTERS` from 12 to 8, which loosens a validation floor. Nothing generates fewer chapters than requested, so this only widens what a user may ask for.
- **Known interaction.** Tasks 2 (Step 3b) and 3 (Step 3) both edit `buildShortFictionWriterSystemPrompt`. They touch different lines and do not conflict, but whichever runs second must preserve the other's change; the reviewer should confirm both survived.
- **Corrected before implementation.** An earlier draft of Task 2 told the model "not every break is a bang", which would have contradicted the system prompt's unconditional chapter-break hook requirement. The hook is the *reason to read on*; the cliffhanger is one *device* for supplying it. Task 2 now varies the device and Step 3b makes the system prompt say the same thing, so no turn licenses dropping the hook. The `does not contradict the writer system prompt's hook requirement` test exists specifically to keep a future editor from reintroducing that contradiction.
- **Not affected.** `SHORT_FICTION_OPENING_HOOK` — the pre-story teaser — is untouched by all three tasks.
