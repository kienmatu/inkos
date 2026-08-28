# Editorial review: the inkos short-fiction pipeline

> Reviewer: Fable, in a novelist/editor capacity, with web research into English-language
> serial-fiction norms. Commissioned after the chapter-batching branch was code-complete,
> because ten engineering reviews had all asked whether the code does what it says and none
> had asked whether the pipeline produces stories worth reading.
>
> Craft opinions are marked as such and distinguished from sourced claims.

## Context

`inkos` generates multi-chapter fiction. The short-fiction pipeline runs: outline → outline
review → outline revision → write draft → draft review → revise draft → sales packaging
(title, blurb, selling points, cover prompt). It targets web-serial platforms — the prompts
talk about platform-ready titles, mobile reading rhythm, and chapter-break hooks.

The current hard-coded shape is **12–18 chapters** (default 12) of **600–800 English words**
each (default 650) — a finished piece of roughly 7,000–12,000 words.

The pipeline is used in **English only**. Chinese is supported in code but is not the use case.

A branch just landed that changed how the prose is produced: instead of writing the entire
story in one LLM call, it now writes in batches, carrying the prose so far forward. For the
English configuration the resolver produces **one chapter per call** — roughly a dozen
separate calls per story.

## Problem

Two questions had never been asked of this pipeline:

1. **Are its foundational constants calibrated to anything real?** 12–18 chapters of 600–800
   words is a specific, hard-coded claim about what readers want. Nobody had checked it
   against the English market.
2. **What does batching do to the writing?** The change was reviewed for correctness ten
   times and for craft zero times.

---

## Part 1 — What the market actually looks like

### English chapter length

The evidence is consistent across every platform checked, and it is not kind to 600–800 words:

| Platform | Working range per chapter | Source |
|---|---|---|
| Royal Road | 1,500–3,500, sweet spot 2,000–3,000 | [thread 103370](https://www.royalroad.com/forums/thread/103370), [thread 148241](https://www.royalroad.com/forums/thread/148241) |
| Wattpad | 1,000–3,000; 2,000–3,000 recommended for novels; ~1,000 is the floor | [Wattpad 101](https://www.wattpad.com/62276449-wattpad-101-your-guide-to-the-world-of-wattpad-how), [chapter-length guide](https://www.wattpad.com/235498640-write-better-tips-and-tricks-chapter-length) |
| Kindle Vella (shut down Feb 2025) | Official 600–5,000; practitioner sweet spot 1,200–2,000 | [Writer Unboxed](https://writerunboxed.com/2022/11/18/two-bites-of-the-apple-on-kindle-vella/), [Medium](https://medium.com/feedium/kindle-vella-what-you-need-to-know-right-now-ebd40da2c51c), [shutdown](https://www.engadget.com/apps/amazon-is-shutting-down-its-kindle-vella-serialized-story-platform-in-february-2025-120030125.html) |
| Dreame / GoodNovel | 1,500–2,500 | [GoodNovel QA](https://www.goodnovel.com/qa/many-words-per-chapter-romance-novel), [Rest of World](https://restofworld.org/2022/china-romance-novels/) |

The pipeline's 600–800-word chapter sits **at or below the floor of every English platform**,
at roughly half the practitioner consensus. Vella's 600 was a hard minimum, not a norm — and
Vella is dead. No English platform was found where 650-word chapters are a thriving format.

**This is the single most confident finding in the report.**

### Where the shape came from

The Chinese prompts explain it. Zhihu Yanxuan's paid short-story format is: an intro hook of
≤150 characters, then a complete story of 8,000+ characters split into sections of roughly
1,000 characters, first person, fast pace ([submission guide](https://ibiling.cn/tougao/11),
[platform roundup](https://zhuanlan.zhihu.com/p/2038406725317944108)).

That is this pipeline, item for item: the opening hook, the ~1,000-char chapters, the
"complete story, not a novel starter kit", the counterattack arc, the selling-points list.
It is a real and lucrative format in China.

**The English configuration is a unit-converted port of it, and the format does not exist in
English.** The 2/3 conversion in `short-fiction.ts` (1,000 chars → 650 words) is
linguistically reasonable and commercially meaningless — nobody buys 650-word-chapter serials
in English.

### Where a 7,000–12,000-word complete story does fit

Not on serial platforms: Dreame/GoodNovel/Royal Road economics reward length — hundreds of
chapters, cliffhanger-driven unlocks ([Trends.vc](https://trends.vc/serialized-fiction-apps-cliffhanger-economics-rented-audience-werewolf-formula/)).
A 12-chapter complete story has no monetization shape there.

It fits two real markets:

- the **novelette** (7,500–20,000 words — [Kindlepreneur](https://kindlepreneur.com/how-long-short-story/)), sold to magazines or anthologies
- **Kindle Short Reads**, Amazon's browse category grouping ebooks by reading time — 45-minute reads run ~5,500–9,600 words, 90-minute reads ~12,000–18,000 ([Amazon](https://www.amazon.com/Kindle-Short-Reads/b?ie=UTF8&node=8584457011), [bootstrapindie](https://bootstrapindie.com/?p=67))

In that market the piece is sold as **one ebook**, and chapter count barely matters to the buyer.

### Retention conventions

Softer evidence — practitioner writing rather than platform-published numbers — but consistent:
readers decide within the opening screens, not opening chapters; high-retention chapters pair
"something happened" with a reason to return; chapters without movement read as filler
([ReadNovaX](https://readnovax.in/blog/how-long-should-a-webnovel-chapter-be-the-serialized-pacing-formula-en),
[tomenovel](https://tomenovel.com/blog/en/web-novel-cliffhanger-economy)).

The pipeline's focus on chapter-break hooks is directionally correct for serials — though it
matters much less for the complete-short-read format this piece actually is.

---

## Part 2 — The prompts, read as an editor

These are considerably better than average LLM fiction prompts. Credit first, because it is earned.

**What works:**

- *"Salt dissolves in the soup: values and ambition show through action, never through slogans"* — a genuinely good craft instruction, aimed at the exact way LLMs fail (characters announcing their themes).
- The **simile ration** (at most one per scene; prefer a precise verb over a figure of speech) and the **anti-AI word list** (delve, tapestry, testament; the "It wasn't X; it was Y" crutch) target real, current LLM tics with enforceable rules. Most prompt authors write "avoid clichés"; this one names them.
- *"The climax is a scene, not a recap"*, with its negative example, attacks the commonest failure of LLM fiction — summary creep at exactly the moments that must be staged.
- The word-count framing lands: *"a clearly short chapter usually means you wrote a synopsis and must add real scenes"* treats length as the symptom of a craft failure rather than a quota, which is how a good editor talks about it.
- The review prompts ("talk like a person", "never condemn a chapter just for running slightly short") set up editorial triage rather than rubric-scoring.

**Problems, in descending order of importance:**

**1. The prompts encode exactly one story, and it isn't labeled.** The recurring nouns across
every stage — *why the protagonist is pinned down, evidence/relationship/identity leverage,
turning the tables, the antagonist's counterattack, comeuppance, reversal chain, payoff* — are
the Chinese 爽文 vindication template. As structure it is real and it works, and it is far
better than a generic demand for intensity. But it is **one genre engine presented as universal
craft**. Feed the pipeline a cozy romance, a mystery, or quiet literary horror and the prompts
will bend it into a revenge story, because every checkpoint asks vindication-template questions.
*(Craft opinion, high confidence.)* The system will produce structurally competent, tonally
identical stories.

**2. The intensity instructions are monotone.** "Keep the drama dialed up… as far as readers
will still believe", plus a mandatory keep-reading hook at every chapter break, with **no
countervailing instruction anywhere** — nothing about quiet beats, aftermath, variation of
register, or ending on dread rather than a bang. Escalation with no valleys is the definition
of melodrama, and it compounds over 12 chapters. The "as far as readers will still believe"
clause is load-bearing work it cannot hold: the model has no calibrated sense of reader belief
and will read the sentence as *more*.

**3. The craft prompt and the chapter length are self-cancelling.** The prompts demand
beat-by-beat scenes, staging, dialogue, the five senses, climaxes played on the page — **in 650
words**. A genuinely staged scene runs 800–1,500. At 650 the model must compress, and
compression is exactly the synopsis-voice the prompts forbid. The predictable result is a
hybrid: synopsis with dialogue sprinkled in, or one real scene per chapter with the rest handled
in connective summary. The word-count *instruction* is well written; the word-count *value*
fights the craft instructions.

**4. "Platform-ready title" is never defined.** No register guidance, no examples, no genre
anchors. On Chinese platforms that register is culturally established; in English it will
produce either pastiche ("The CEO's Discarded Wife Strikes Back") or vague thriller copy. Three
example titles would fix this outright.

**5. Sales packaging is serviceable with one vestigial organ.** The 70–120-word synopsis spec is
correct blurb craft. The cover-prompt guidance (3:4 portrait, large title zone, strong character
emotion, one or two recognizable props, high contrast, "not a movie poster") matches actual
webnovel cover conventions. But **"selling points"** is a Chinese-platform artifact (卖点 lists
for distribution editors); no English platform has a field for them. Harmless, but nobody
downstream can use it.

---

## Part 3 — What batching does to the writing

### Pacing

The outline prompt **does** demand a chapter-granular plan — the chapter title's direction, the
key on-page scene, the characters' actions, the escalation or payoff, and the reason to keep
reading at the break — and the outline review explicitly asks whether the outline is dense
enough or the writer will run out of material in the back half. The load-bearing document
exists and the prompts ask the right things of it.

The structural consequence of one-chapter-per-call is still real: **the outline is now the only
place pacing can be decided.** Whole-draft generation could silently rebalance — steal 200 words
from a thin chapter 8 to feed chapter 9, drift a beat across a boundary. One-per-call cannot;
every chapter is an island optimizing its own 650 words. And nothing validates that the outline
actually contains 12 concrete chapter entries rather than going gestural in the back half, which
models reliably do.

**Verdict:** the architecture is defensible, but the outline stage is now the most important
stage in the pipeline and is not treated as such — same single review-revise cycle as everything
else, and no completeness check.

### Title and hook written first

Less costly than feared, because the design already contains the remedy: the revision pass's
first batch re-emits the title, and the revision followup explicitly permits re-sharpening it
from the final draft. The residual cost is that this rides on whether the review mentions the
title — and the draft-review focus does list the title first, so it usually will.

Adequately mitigated. *(Craft opinion: titles written before drafts are how most human
commercial fiction is titled anyway; the draft-informed retitle is a luxury, not a requirement.)*

### Voice across a dozen calls

Passing the full prior prose verbatim is the strongest continuity anchor available, and voice
drift per se will be mild. The failure modes specific to one-per-call are different and more
insidious:

- **Chapter-shape monotony.** Every call is independently told this chapter needs a hook at the break. Twelve calls produce twelve identically shaped chapters: cold open, one scene, escalation, cliffhanger. No chapter can end quietly, because no call knows it is allowed to be the valley.
- **Recap creep.** Continuation-prompted models stitch by summarizing — later chapters will open with "She still remembered the ledger…" re-establishment beats that whole-draft generation never needed. Nothing in the continuation prompt forbids this.
- **Escalation ratchet.** Each call sees all prior escalations and is told to keep drama dialed up; the natural gradient is to top the last chapter. Over 12 independent calls this compounds toward the absurdity ceiling faster than one authorial mind holding the whole arc would allow.
- **Length homogenization.** "Big scenes may run long and transitions short" is unactionable when each call targets ~650 for its own chapter; the variance that instruction asks for structurally cannot emerge.

### The revision pass

Structurally, it is a line-and-scene editor wearing a structural editor's title.

What it **can** do, better than the obvious reading suggests: because revised chapters are
carried forward and rewritten in order, **forward planting works** — if the review says the
chapter-9 payoff needs setup in chapter 2, the chapter-2 batch can plant it and the chapter-9
batch will see the plant.

What it **cannot** do: work backward (discover mid-revision that an earlier chapter needed
something), merge or split chapters, cut a saggy chapter, or change the chapter count — the
frame hard-codes 12 in, 12 out. So a review note like "chapters 7–9 sag and should be two
chapters" is un-actionable by the machinery that receives it, even though the review prompt
explicitly asks whether the back half sags.

**The pipeline solicits structural diagnosis it cannot treat.** No amount of prompt polish fixes
that; structural notes would have to flow back into the outline, not forward into windowed
rewrites.

---

## Part 4 — Verdict on the constants

**600–800 words per chapter — wrong for English, and it is the load-bearing error.** It sits at
the floor of the defunct Vella range and at half the Royal Road / Wattpad / Dreame consensus,
*and* it is the number that forces the craft prompts into self-contradiction. The evidence for
~1,200–2,000 words as the English mobile-serial sweet spot is as solid as anything in this space
gets.
→ **Default ~1,200 words, range 900–1,500.**

**12–18 chapters — wrong pairing with the length, not wrong in itself.** The honest question is
what the artifact *is*. It is not a serial; serial platforms want open-ended length. It is a
complete short read, and its natural home is Kindle Short Reads / novelette territory, where
total length matters and chapter count does not.
→ **Hold the total at ~9,000–13,000 words via 8–10 chapters × ~1,200 words.** Fewer, fuller
chapters give each call room for an actual scene, reduce the number of batch calls (less recap
creep, less ratchet), and land the total in the 45–90-minute Short Reads bands. The 18-chapter
ceiling can stay for users who want it.

**One revision pass — right.** The stage sequence puts its two review-revise cycles at the two
highest-leverage points, and the outline cycle is the one that matters most given batching. A
second draft revision would cost a full pipeline's worth of calls to buy line polish. Clean bill
of health on the sequence.

**The 1,400-token batch budget — unaffected.** At 1,200 words/chapter (~1,560 tokens) the
resolver still returns one chapter per call, and `estimateShortFictionMaxTokens` scales with
`charsPerChapter`, so raising the chapter length does not break the batching machinery. The
constant change is genuinely cheap.

---

## The three changes, in priority order

**1. Re-cut the English format: ~1,200 words/chapter (900–1,500), default 8–10 chapters, total
~9,000–13,000 words.** The change with evidence behind it, and it also dissolves the
scene-vs-synopsis contradiction in the craft prompt. *Cost: a handful of constants in
`agents/short-fiction.ts` and `length-metrics.ts`, plus prompt copy; the batching math already
tolerates it. Half a day including a test story.*

**2. Break the chapter-shape monotony in the continuation prompt.** Three additions: pass the
outline's entry for *this* chapter explicitly ("this is the midpoint reversal" / "this is
aftermath before the final push"); permit non-cliffhanger endings ("a chapter may end on a quiet
beat, a decision, or dread — not every break is a bang"); forbid recap openings ("do not reopen
by summarizing prior chapters; continue from inside the story"). *Cost: prompt-only, an
afternoon.* The cheapest large quality gain available, because it treats the three failure modes
batching actually introduces.

**3. Name the genre engine, and define "platform-ready" with examples.** Either own the
vindication template explicitly and add branch guidance for the other engines actually wanted
(romance, mystery), or keep the single engine but stop presenting it as neutral craft. In the
same pass, put three example English titles in the outline and writer prompts, and drop or
repurpose the selling-points block. *Cost: prompt-only, but it needs taste and a few test
generations — a day, and the highest-variance of the three.*

---

## Closing

The whole shape — plan, review the plan, draft, review the draft, revise, package — is sound,
and the craft prompts are better than most of what ships in this category.

The pipeline's real problem is simpler and older than the batching change everyone reviewed: it
is a faithful port of a Chinese commercial format into a language whose market never had that
format, and the chapter-length constant is where that shows.

---

## Accepted trade-offs

**The 1,400-token batch budget is now below the default English chapter's estimated output, and
that is accepted, not fixed.** A default English chapter at
`SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER` (1,200 words) is ~1,560 estimated output tokens —
above `SHORT_FICTION_BATCH_OUTPUT_TOKEN_BUDGET` (1,400) and inside the 1,300-2,000-token window
this document already cites as where strict endpoints cut mid-generation.
`resolveChaptersPerBatch` cannot return less than 1 chapter, and `runChapterBatches` rethrows
rather than splitting further once a group is already down to one chapter, so on the strictest
endpoints (those capping output under roughly 1,600 tokens) English generation has no adaptive
fallback left. The user considered adding error-handling or splitting machinery for this case and
declined: the operator's lever on such an endpoint is a lower `--chars` value, not a code change.
See the comment on `SHORT_FICTION_BATCH_OUTPUT_TOKEN_BUDGET` in `agents/short-fiction.ts`.

**The Chinese chapter-count floor no longer clears Zhihu Yanxuan's 8,000-character minimum in the
worst case, and that is accepted, not fixed.** `SHORT_FICTION_MIN_CHAPTERS` moved from 12 to 8 for
both languages as part of this re-cut. At the *default* Chinese chapter length (1,000 characters)
that floor is 8 x 1,000 = 8,000 characters, exactly on the Yanxuan line. But a user can configure
`charsPerChapter` down to `SHORT_FICTION_MIN_CHARS_PER_CHAPTER` (900), and the true worst case is
8 x 900 = 7,200 characters — below the 8,000-character floor. A language-aware chapter minimum
would fix this precisely, but was ruled against: it adds a new concept to the model (a chapter
floor that depends on language) for a market this deployment does not serve. The accepted move is
to document the shortfall rather than hide it behind a guard test that does not actually exercise
the configurable worst case. See the comment on `SHORT_FICTION_MIN_CHAPTERS` in
`models/short-fiction-format.ts` and the corresponding assertion in
`short-fiction-editorial.test.ts`.
