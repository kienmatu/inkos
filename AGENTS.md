# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Language policy

**English is the target language of this project.** The ultimate purpose of InkOS is
writing in English: English prose, English genres, English-facing product surfaces,
English docs, and English commit messages, plans, and specs.

Chinese is **read-only legacy**. It is kept so existing Chinese material stays readable
and existing Chinese users are not broken, but it is **no longer maintained**:

- Do **not** write new Chinese docs, prompts, or UI strings. Exception: an existing
  trilingual label table keyed by language (e.g. `TOOL_LABELS` in
  `packages/studio/src/store/chat/slices/message/runtime.ts`) must keep every entry
  filled for every language it declares, since a missing slot ships a broken label
  rather than an English one — new surfaces should not add Chinese, but existing
  tables are maintained as-is.
- Do **not** translate new English content into Chinese "for parity" — `README.zh.md`,
  `CHANGELOG.zh.md`, and other `*.zh.*` files are frozen and may drift.
- Do **not** answer, plan, or write specs in Chinese. Use English.
- Existing Chinese code paths, genre profiles, and prompt packs keep working; fix them
  only when they are actually broken, and write the fix and its docs in English.
- When touching a file that mixes both, keep the Chinese as-is and add new content in
  English rather than expanding the Chinese side.

### Language defaults in code

The policy above governs prose. This governs signatures, and it is the rule most easily
broken while following the other one.

**A function that takes a language and can be called without one must default to `"en"`.**
A `"zh"` default means a forgotten argument silently emits Chinese into an English path —
the failure mode that produced the parity work in `packages/core/src/agents/*-prompts.ts`,
where nine prompt builders were Chinese-only while being called from the English branch.

`packages/core/src/utils/language.ts` already states the invariant:

```ts
// Anything that is not exactly "zh" resolves to "en", so an unrecognised value
// can never silently fall through to Chinese.
export function toWritingLanguage(lang: string | undefined): WritingLanguage {
  return lang === "zh" ? "zh" : "en";
}
```

Vietnamese is a UI language only — `toWritingLanguage("vi") === "en"` — so a Vietnamese
interface writes English prose, and the English path is not a niche one.

The one deliberate exception is `inferLanguage()` in the same file, which **guesses** a
language from free text and defaults to `"zh"` to preserve behaviour for existing Chinese
briefs. The distinction is guessing versus narrowing: a function handed a language it must
merely narrow has no license to fall back to Chinese, while a function inferring one from
ambiguous input does.

Every language parameter with a default in `agents/writer-prompts.ts` and
`agents/fanfic-prompt-sections.ts` now defaults to `"en"`. Other modules across
`packages/core/src/` (for example `utils/length-metrics.ts`, `agents/planner-prompts.ts`,
`agents/post-write-validator.ts`, `agents/architect.ts`, `utils/narrative-control.ts`,
`prompts/short-fiction.ts`, and `state/state-projections.ts`) still default to `"zh"` and
are follow-up work, not sanctioned exceptions; `inferLanguage()` is the sole intentional
`"zh"` default, kept for the guessing-versus-narrowing reason above.

### Prompt parity

Prompts in `packages/core/src/agents/` branch on language. When adding or fixing an
English branch:

- The Chinese branch must remain **byte-identical in what it renders**. Add an English
  branch; never edit Chinese text to make room for one.
- Do not convert Chinese character counts into English word counts by copying the number.
  The conversion, documented at `utils/length-metrics.ts`, is 3000 Chinese characters ≈
  2000 English words. A threshold pegged to something physical — a phone screen, a scene —
  should be re-derived for English rather than scaled.
- English craft may diverge from the Chinese doctrine where the Chinese convention would
  produce prose English readers reject. Say so in the commit message when it does.
- `__tests__/en-prompt-parity.test.ts` renders the English prompt builders and fails on
  CJK or on lengths expressed in characters. It does not cover every builder; the ones it
  misses are named in a comment above `ENGLISH_PROMPTS`. Extend it rather than working
  around it.

## Answer structure

Answer technical questions with a visible line of reasoning, not a pile of near-synonymous
restatements.

1. **Classify first** — group the problem into a few categories and say what core tension
   each one resolves.
2. **Then build the chain** — explain along `problem context -> key data structures ->
   execution steps -> resulting impact`.
3. **Back claims with evidence** — cite the concrete function, field, call chain, or file
   path so the conclusion can be verified.
4. **Explain causality** — say why a design produces its effect, and what failure it
   triggers when it is missing.
5. **Avoid empty comparisons** — a comparison can be a conclusion, never the proof.
6. **Control density** — each layer carries only what supports the current conclusion.

## TypeScript practice

When writing or reviewing TypeScript, explain how data moves from *untrusted input* to
*trusted domain object*. Every decision should answer four things: which illegal state it
removes; which type, schema, or function guarantees that; what precondition downstream
code gains; and what failure occurs without it.

### Categories

1. **Boundary narrowing** — external input is untrusted. Files, network, JSON, database
   rows, and third-party return values may start as `unknown`, but must be narrowed at the
   module boundary by a schema, parser, or type guard.
2. **Domain modeling** — business states must be distinguishable. When the field set
   changes with `role`, `type`, or `kind`, use a discriminated union rather than a wide
   interface of optional fields.
3. **Legal-state constraints have an owner** — rules a single object can check itself
   belong in the type or schema; rules that need event order, context, or external state
   belong in a clearly named validate / transform / clean function.
4. **Evolution safety** — new branches must not be silently dropped. Handle unions
   exhaustively and cover illegal states with tests.

### Reasoning chain

```text
Problem context:    which inputs are untrusted, or which business states blur together.
Key data structures: what raw input, validated event, domain message, cleaned message are.
Execution steps:     which function reads, which narrows, which validates legality,
                     which returns the trusted result.
Resulting impact:    what downstream no longer re-checks; where illegal state explodes
                     without this design.
```

### Code rules

1. Wide types stop at the boundary: `unknown`, `any`, and `Record<string, unknown>` do not
   reach core business flow.
2. Model mutually exclusive states as unions, not a swarm of optional fields.
3. Implement legal-state constraints in one place instead of scattering ad hoc `if`s.
4. Type assertions need evidence: an `as SomeType` must sit behind a schema, parser, or
   guard.
5. Handle branches exhaustively — `switch`, explicit narrowing, and `assertNever`.
6. Function names carry trust level: `parse*` may fail, `normalize*` reshapes, `clean*`
   repairs legality.
7. Test illegal states: restore, migration, IO, LLM messages, and tool loops must cover bad
   data, missing fields, uncommitted requests, orphaned `toolResult`, empty assistant
   messages, and trailing thinking.
