import { describe, expect, it } from "vitest";
import {
  buildWriterSystemPrompt,
  buildGoldenOpeningDiscipline,
  buildFullCastTracking,
  buildGenreRules,
  buildProtagonistRules,
  buildBookRulesBody,
  buildStyleGuide,
  buildStyleFingerprint,
  type FanficContext,
} from "../agents/writer-prompts.js";
import { buildGoldenOpeningGuidance, getPlannerMemoSystemPrompt, getPlannerMemoUserTemplate } from "../agents/planner-prompts.js";
import { buildSettlerSystemPrompt, buildSettlerUserPrompt } from "../agents/settler-prompts.js";
import {
  buildFanficCanonSection,
  buildCharacterVoiceProfiles,
  buildFanficModeInstructions,
} from "../agents/fanfic-prompt-sections.js";
import {
  buildShortFictionOutlineSystemPrompt,
  buildShortFictionOutlineUserPrompt,
  buildShortFictionOutlineReviewSystemPrompt,
  buildShortFictionOutlineReviewUserPrompt,
  buildShortFictionOutlineRevisionFollowup,
  buildShortFictionWriterSystemPrompt,
  buildShortFictionWriterUserPrompt,
  buildShortFictionDraftContinuationUserPrompt,
  buildShortFictionDraftReviewSystemPrompt,
  buildShortFictionDraftReviewUserPrompt,
  buildShortFictionDraftRevisionFollowup,
  buildShortFictionPackageSystemPrompt,
  buildShortFictionPackageUserPrompt,
} from "../prompts/short-fiction.js";
import {
  parseShortFictionOutline,
  renderShortFictionDraftMarkdown,
  formatShortFictionChapterHeading,
  type ShortFictionBatchDraft,
} from "../agents/short-fiction.js";
import type { BookConfig, FanficMode } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import type { BookRules } from "../models/book-rules.js";

const BOOK: BookConfig = {
  id: "parity-book",
  title: "The Ledger",
  platform: "other",
  genre: "cultivation",
  status: "active",
  targetChapters: 20,
  chapterWordCount: 2000,
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

const GENRE: GenreProfile = {
  id: "cultivation",
  name: "English Cultivation",
  language: "en",
  chapterTypes: ["Training"],
  fatigueWords: ["delve"],
  numericalSystem: false,
  powerScaling: true,
  eraResearch: false,
  pacingRule: "Training alternates with application",
  satisfactionTypes: ["Stage Breakthrough"],
  auditDimensions: [1, 10],
};

// Variant of GENRE with the numeric/resource system turned on, to exercise the
// settler system prompt's numericalBlock branch (the "opening + delta = closing"
// arithmetic rule), which the plain GENRE fixture above never renders.
const GENRE_NUMERIC: GenreProfile = {
  ...GENRE,
  numericalSystem: true,
};

// Book rules with full-cast tracking enabled, to exercise the settler system
// prompt's fullCastBlock branch ("Full-cast tracking" section), which is absent
// when bookRules is null.
const BOOK_RULES_FULL_CAST: BookRules = {
  version: "1.0",
  numericalSystemOverrides: undefined,
  eraConstraints: undefined,
  prohibitions: [],
  chapterTypesOverride: [],
  fatigueWordsOverride: [],
  additionalAuditDimensions: [],
  enableFullCastTracking: true,
  allowedDeviations: [],
};

// Book rules populated across every field buildProtagonistRules() and the
// writer system prompt's other book-rules-gated branches read: a protagonist
// with a personality lock, behavioral constraints, and a genre-lock forbidden
// list; book-level prohibitions; and full-cast tracking. Every one of these
// fields, when non-empty, used to make buildWriterSystemPrompt("en") render a
// Chinese-only heading (buildProtagonistRules, buildFullCastTracking) — this
// fixture exists to keep that regression caught.
const BOOK_RULES_WRITER_FULL: BookRules = {
  version: "1.0",
  protagonist: {
    name: "Lian Feng",
    personalityLock: ["stubborn", "loyal"],
    behavioralConstraints: ["never abandons an ally mid-fight"],
  },
  genreLock: {
    primary: "cultivation",
    forbidden: ["modern slang", "sci-fi tech"],
  },
  // Exercises buildNarrativePersonRule's non-empty branch, which every other
  // fixture in this file leaves unset (and which therefore always returned ""
  // before this entry existed).
  narrativePerson: "first",
  numericalSystemOverrides: undefined,
  eraConstraints: undefined,
  prohibitions: ["no on-page character death before chapter 10"],
  chapterTypesOverride: [],
  fatigueWordsOverride: [],
  additionalAuditDimensions: [],
  enableFullCastTracking: true,
  allowedDeviations: [],
};

const BOOK_RULES_BODY_EN = "## Extra notes\n\nKeep the tone hopeful even during setbacks.";
const STYLE_GUIDE_EN = "Favor short declarative sentences. Avoid semicolons.";
const STYLE_FINGERPRINT_EN = "Clipped dialogue tags, frequent one-line paragraphs for emphasis.";

// A fanfic_canon.md body, in the format FanficCanonImporter actually produces
// (fanfic-canon-importer.ts): the document itself is generated entirely in
// Chinese today regardless of the book's language — there is no language
// parameter anywhere in that importer. buildCharacterVoiceProfiles() searches
// for the literal Chinese heading "## 角色档案" and a Chinese-shaped header row
// ("| 角色 | ...") to extract the character table; this is unchanged in both
// its "zh" and "en" branches, by design (see the comment on that function).
// This fixture reproduces that real shape so the extraction path actually
// fires under buildWriterSystemPrompt("en") rather than early-returning "".
const FANFIC_CANON_EN_BOOK = `# Fanfic Canon (Sample Source)

## World Rules
Magic draws from the Ninth Star.

## 角色档案

| 角色 | 身份 | 性格底色 | 语癖/口头禅 | 说话风格 | 行为模式 | 关键关系 | 信息边界 |
|------|------|----------|-------------|----------|----------|----------|----------|
| Lian Feng | protagonist | stubborn | "I don't quit." | clipped, direct | acts before thinking | Mentor: complicated | knows only what he witnessed |
`;

// Every fanfic mode, not just "canon": MODE_PREAMBLES_EN (fanfic-prompt-sections.ts
// ~26) and MODE_CHECKS_EN (~169) are keyed by mode, so a single-mode fixture leaves
// three of the four bodies of each record unrendered and therefore unguarded.
const FANFIC_MODES = ["canon", "au", "ooc", "cp"] as const satisfies ReadonlyArray<FanficMode>;

function buildFanficContextEn(mode: FanficMode): FanficContext {
  return {
    fanficCanon: FANFIC_CANON_EN_BOOK,
    fanficMode: mode,
    allowedDeviations: ["Protagonist may have an original sibling not in canon"],
  };
}

/**
 * Substrings that legitimately contain CJK inside an English prompt. Each entry
 * must name why it is not a leak. Keep this list as short as the truth allows —
 * an entry added to silence a failure defeats the guard.
 */
const CJK_ALLOWLIST: ReadonlyArray<{ readonly text: string; readonly why: string }> = [
  {
    text: "roles/主要角色/",
    why: "Real on-disk directory name, constructed in code at architect.ts:829 (ArchitectAgent.buildCharacterMatrixShim). Renaming it is a storage migration, not a translation fix. Pre-emptive entry: no fixture in this file builds an architect prompt today, so this substring never actually appears in any ENGLISH_PROMPTS output and this entry is currently inert. Kept here (rather than deleted) so a future extender who adds an architect-prompt fixture sees the precedent immediately instead of rediscovering it, and so they know this is one of two allowlist mechanisms in this file (this substring list, and NON_ASCII_ALLOWLIST below for individual characters) rather than assuming only one exists.",
  },
  {
    text: "## 角色档案\n\n| 角色 | 身份 | 性格底色 | 语癖/口头禅 | 说话风格 | 行为模式 | 关键关系 | 信息边界 |\n|------|------|----------|-------------|----------|----------|----------|----------|",
    why: "This is test-fixture data (FANFIC_CANON_EN_BOOK below), reproducing the real shape of fanfic_canon.md as generated by FanficCanonImporter (fanfic-canon-importer.ts), which has no language parameter and always emits this heading and header row in Chinese, regardless of the book's language. buildCharacterVoiceProfiles() in fanfic-prompt-sections.ts deliberately keeps matching this exact Chinese marker in both its zh and en branches (see the comment on that function) because the importer never produces an English-headed table to match against instead. Fixing the importer itself is out of scope for this guard — flagged as a follow-up in the task-7 report.",
  },
];

/**
 * Individual non-ASCII characters that legitimately appear inside English
 * prompts. Each entry names why it is not a leak — same discipline as
 * CJK_ALLOWLIST above. Keep this list as short as the truth allows.
 *
 * Widened from the brief's CJK-ideograph allowlist regex (which only caught
 * CJK ideographs and fullwidth forms) to flag ANY character outside printable
 * ASCII except what's explicitly allowed here, so stray non-CJK non-ASCII is
 * caught too, not just Chinese.
 */
const NON_ASCII_ALLOWLIST: ReadonlyArray<{ readonly char: string; readonly why: string }> = [
  {
    char: "—",
    why: "Em dash (U+2014), used throughout the English prompts as a sentence-break punctuation mark — a deliberate stylistic choice, not a translation artifact.",
  },
  {
    char: "→",
    why: "Rightward arrow (U+2192), used throughout the English prompts to denote a mapping/transition (e.g. '[passage location] -> [function]'), not a translation artifact.",
  },
  {
    char: "≤",
    why: "Less-than-or-equal sign (U+2264), used in planner-prompts.ts English hook-ledger rules for numeric caps, e.g. \"the ≤ 2 new hooks cap still applies\" (line ~139) and \"cap ≤ 2\" (line ~195). Verified: genuine mathematical operator embedded in English prose comparing chapter/hook counts, not a fullwidth variant and not the tail of an untranslated Chinese phrase — the surrounding text on each line is fully English.",
  },
  {
    char: "≥",
    why: "Greater-than-or-equal sign (U+2265), used in planner-prompts.ts English hook-ledger rules, e.g. \"open ≥ resolve\" (line ~139/195) and \"has not advanced in ≥ 5 chapters\" (line ~208). Verified: genuine mathematical operator embedded in English prose, not a fullwidth variant and not the tail of an untranslated Chinese phrase — the surrounding text on each line is fully English.",
  },
];

const ALLOWED_NON_ASCII = new Set(NON_ASCII_ALLOWLIST.map((entry) => entry.char));

function hasDisallowedNonAscii(line: string): boolean {
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code > 0x7e) {
      if (!ALLOWED_NON_ASCII.has(ch)) return true;
    }
  }
  return false;
}

function stripAllowlisted(text: string): string {
  return CJK_ALLOWLIST.reduce((acc, entry) => acc.split(entry.text).join(""), text);
}

/**
 * The English prompt surfaces this guard actually covers: the writer, planner and
 * settler builders, plus the fanfic sections the writer prompt pulls in.
 *
 * KNOWN-UNGUARDED — English builders that are deliberately NOT in this list, and
 * whose English branches are therefore not checked for untranslated content by
 * anything in this file. They are tracked as follow-up work, not oversights:
 *   - agents/observer-prompts.ts
 *   - agents/continuity.ts (dimension notes)
 *   - agents/chapter-analyzer.ts
 *   - agents/reviser.ts
 *   - agents/composer.ts
 *   - agents/polisher.ts
 *   - agents/state-validator.ts
 *   - agents/foundation-reviewer.ts
 *   - agents/architect.ts
 * Adding one here is the right way to close a gap; do not read this list's
 * absence of a builder as evidence that builder is clean.
 */
const ENGLISH_PROMPTS: ReadonlyArray<{ readonly name: string; readonly build: () => string }> = [
  {
    name: "writer system prompt (governed)",
    build: () => buildWriterSystemPrompt(
      BOOK, GENRE, null, "", "", "", undefined, 1, "full", undefined, "en", "governed",
    ),
  },
  {
    name: "writer system prompt (legacy)",
    build: () => buildWriterSystemPrompt(
      BOOK, GENRE, null, "", "", "", undefined, 7, "full", undefined, "en", "legacy",
    ),
  },
  {
    name: "writer system prompt (protagonist rules, book-rules body, style guide, fingerprint, full-cast)",
    build: () => buildWriterSystemPrompt(
      BOOK,
      GENRE,
      BOOK_RULES_WRITER_FULL,
      BOOK_RULES_BODY_EN,
      "",
      STYLE_GUIDE_EN,
      STYLE_FINGERPRINT_EN,
      4,
      "full",
      undefined,
      "en",
      "governed",
    ),
  },
  ...FANFIC_MODES.map((mode) => ({
    name: `writer system prompt (fanfic context, mode "${mode}": canon section, mode instructions, character voice profiles)`,
    build: () => buildWriterSystemPrompt(
      BOOK,
      GENRE,
      null,
      "",
      "",
      "",
      undefined,
      4,
      "full",
      buildFanficContextEn(mode),
      "en",
      "governed",
    ),
  })),
  // mode "creative" — every other writer fixture here passes "full", so
  // buildEnglishCreativeOutputFormat (writer-prompts.ts ~574) was never rendered.
  {
    name: "writer system prompt (creative mode output format)",
    build: () => buildWriterSystemPrompt(
      BOOK, GENRE, null, "", "", "", undefined, 4, "creative", undefined, "en", "governed",
    ),
  },
  // numericalSystem: true — every other writer fixture here uses GENRE, whose
  // numericalSystem is false, so buildEnglishOutputFormat's numeric branch
  // (POST_SETTLEMENT resource-ledger rows + UPDATED_LEDGER) was never rendered.
  {
    name: "writer system prompt (numeric genre output format)",
    build: () => buildWriterSystemPrompt(
      BOOK, GENRE_NUMERIC, null, "", "", "", undefined, 4, "full", undefined, "en", "governed",
    ),
  },
  { name: "golden opening discipline", build: () => buildGoldenOpeningDiscipline(1, "en") },
  { name: "golden opening guidance", build: () => buildGoldenOpeningGuidance(1, "en") },
  { name: "planner memo system prompt", build: () => getPlannerMemoSystemPrompt("en") },
  { name: "planner memo user template", build: () => getPlannerMemoUserTemplate("en") },
  { name: "settler system prompt", build: () => buildSettlerSystemPrompt(BOOK, GENRE, null, "en") },
  {
    name: "settler system prompt (numeric system)",
    build: () => buildSettlerSystemPrompt(BOOK, GENRE_NUMERIC, null, "en"),
  },
  {
    name: "settler system prompt (full-cast tracking)",
    build: () => buildSettlerSystemPrompt(BOOK, GENRE, BOOK_RULES_FULL_CAST, "en"),
  },
  {
    name: "settler user prompt (optional blocks populated)",
    // chapterSummaries/subplotBoard/emotionalArcs/characterMatrix must NOT be
    // the "(文件尚未创建)" sentinel — buildSettlerUserPrompt treats that exact
    // string as "file absent" (settler-prompts.ts ~347/353/359/365) and skips
    // rendering the corresponding block entirely. Passing it here would leave
    // "## Existing chapter summaries" / "## Current subplot board" /
    // "## Current emotional arcs" / "## Current character interaction matrix"
    // unexercised while the fixture's name claims "optional blocks
    // populated" — ordinary content is required so each block actually renders.
    build: () => buildSettlerUserPrompt({
      language: "en",
      chapterNumber: 12,
      title: "The Reckoning",
      content: "The protagonist confronts the mentor.",
      currentState: "State: stable.",
      ledger: "Spirit stones: 40",
      hooks: "hook-mentor-oath: active",
      chapterSummaries: "Chapter 11: the mentor first hinted at the oath.",
      subplotBoard: "Subplot A: the missing ledger page, last active chapter 9.",
      emotionalArcs: "Lian Feng: guarded trust, rising toward chapter 12.",
      characterMatrix: "Lian Feng knows the oath exists but not its terms.",
      volumeOutline: "Volume 1 outline: rising conflict.",
      observations: "The mentor revealed a hidden scar.",
      selectedEvidenceBlock: "Chapter 3: the mentor first mentioned the oath.",
      validationFeedback: "Contradiction: ledger shows 40 stones but prose implies 30.",
    }),
  },
];

describe("English writer / planner / settler prompts carry no untranslated content", () => {
  for (const { name, build } of ENGLISH_PROMPTS) {
    it(`${name} contains no non-ASCII leaks`, () => {
      const offending = stripAllowlisted(build())
        .split("\n")
        .filter((line) => hasDisallowedNonAscii(line));
      expect(offending, `untranslated / stray non-ASCII lines in ${name}`).toEqual([]);
    });

    it(`${name} does not size English text in characters`, () => {
      const offending = build()
        .split("\n")
        .filter((line) => /\d\s*(chars|characters)\b/i.test(line));
      expect(offending, `character-counted lengths in ${name}`).toEqual([]);
    });
  }
});

// A fixture that silently makes its builder return "" passes every check above
// while guarding nothing — that is exactly how eight defects survived on this
// branch. These assertions pin the marker text of each conditional branch the
// fixtures above exist to reach, so a fixture that stops reaching it fails here.
describe("parity fixtures actually render the branches they claim", () => {
  const byName = (name: string): string => {
    const entry = ENGLISH_PROMPTS.find((p) => p.name === name);
    if (!entry) throw new Error(`no ENGLISH_PROMPTS entry named "${name}"`);
    return entry.build();
  };

  const MODE_MARKERS: Record<FanficMode, ReadonlyArray<string>> = {
    canon: ["canon-compliant fanfic", "Canon compliance check"],
    au: ["AU (alternate-universe) fanfic", "AU deviation list"],
    ooc: ["OOC fanfic", "OOC deviation log"],
    cp: ["ship-centric fanfic", "Ship interaction check"],
  };

  for (const mode of FANFIC_MODES) {
    it(`fanfic mode "${mode}" renders its preamble and its self-check`, () => {
      const prompt = byName(
        `writer system prompt (fanfic context, mode "${mode}": canon section, mode instructions, character voice profiles)`,
      );
      for (const marker of MODE_MARKERS[mode]) {
        expect(prompt, `mode "${mode}" marker missing`).toContain(marker);
      }
    });
  }

  it("creative mode renders buildEnglishCreativeOutputFormat", () => {
    const prompt = byName("writer system prompt (creative mode output format)");
    expect(prompt).toContain("=== PRE_WRITE_CHECK ===");
    expect(prompt).toContain(
      "Output only the three blocks above (PRE_WRITE_CHECK, CHAPTER_TITLE, CHAPTER_CONTENT)",
    );
    // The full-mode blocks must be absent, otherwise the fixture took the wrong branch.
    expect(prompt).not.toContain("=== UPDATED_STATE ===");
  });

  it("numeric genre renders the numeric branch of buildEnglishOutputFormat", () => {
    const prompt = byName("writer system prompt (numeric genre output format)");
    expect(prompt).toContain("=== UPDATED_LEDGER ===");
    expect(prompt).toContain("| Resource ledger |");
  });
});

// AGENTS.md "Language defaults in code": a function that takes a language and
// can be called without one must default to "en". These builders in
// writer-prompts.ts and fanfic-prompt-sections.ts used to default to "zh"; a
// forgotten argument at any call site would have silently emitted Chinese into
// an English path. These tests call each affected builder with the language
// argument omitted and assert the output is actually English (no CJK, or a
// known English marker) — not a source-grep for "= \"en\"", which would pass
// even for a builder that ignores its own default.
describe("prompt builders default their omitted language argument to English", () => {
  it("buildFullCastTracking() defaults to English", () => {
    const prompt = buildFullCastTracking();
    expect(prompt).toContain("## Full-cast tracking");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildGenreRules(gp, genreBody) defaults to English", () => {
    const prompt = buildGenreRules(GENRE, "Extra genre body text.");
    expect(prompt).toContain("## Genre conventions");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildProtagonistRules(bookRules) defaults to English", () => {
    const prompt = buildProtagonistRules(BOOK_RULES_WRITER_FULL);
    expect(prompt).toContain("## Protagonist hard rules");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildBookRulesBody(body) defaults to English", () => {
    const prompt = buildBookRulesBody(BOOK_RULES_BODY_EN);
    expect(prompt).toContain("## Book-specific rules");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildStyleGuide(styleGuide) defaults to English", () => {
    const prompt = buildStyleGuide(STYLE_GUIDE_EN);
    expect(prompt).toContain("## Style guide");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildStyleFingerprint(fingerprint) defaults to English", () => {
    const prompt = buildStyleFingerprint(STYLE_FINGERPRINT_EN);
    expect(prompt).toContain("## Style fingerprint");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildFanficCanonSection(canon, mode) defaults to English", () => {
    const prompt = buildFanficCanonSection(FANFIC_CANON_EN_BOOK, "canon");
    expect(prompt).toContain("## Fanfic Canon Reference");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildCharacterVoiceProfiles(canon) defaults to English", () => {
    const prompt = buildCharacterVoiceProfiles(FANFIC_CANON_EN_BOOK);
    expect(prompt).toContain("## Character Voice Reference");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });

  it("buildFanficModeInstructions(mode, allowedDeviations) defaults to English", () => {
    const prompt = buildFanficModeInstructions("canon", ["Protagonist may have an original sibling not in canon"]);
    expect(prompt).toContain("## Fanfic Self-Check");
    expect(stripAllowlisted(prompt).split("\n").some(hasDisallowedNonAscii)).toBe(false);
  });
});

// packages/core/src/prompts/short-fiction.ts (2026-08-28 cleanup): the 14
// short-fiction prompt builders, plus renderShortFictionDraftMarkdown,
// parseShortFictionOutline and formatShortFictionChapterHeading in
// agents/short-fiction.ts, used to default their `language` parameter to
// "zh" — the exact pattern this file's rule targets. The short-fiction
// pipeline's real user runs it English-only, so a forgotten `language`
// argument at any call site (e.g. agents/short-fiction.ts's own agent
// classes, which always forward `input.language` — undefined unless the
// caller set it) used to silently emit Chinese into an English run.
//
// resolveChaptersPerBatch's `language` default and parseShortFictionBatchDraft's
// options.language default were deliberately left at "zh" — see the comments
// at their definitions in agents/short-fiction.ts for why (batching math, and
// a parser respectively, neither of which chooses the language of newly
// generated text).
const SHORT_FICTION_OUTLINE_INPUT = {
  direction: "a courier discovers the parcels are evidence",
  chapterCount: 10,
  charsPerChapter: 1200,
};

const SHORT_FICTION_DRAFT_INPUT = {
  direction: "a courier discovers the parcels are evidence",
  outlineMarkdown: "## Plan\nChapter 1: the setup scene",
  chapterCount: 10,
  charsPerChapter: 1200,
};

const SHORT_FICTION_ENGLISH_PROMPTS: ReadonlyArray<{ readonly name: string; readonly build: () => string }> = [
  { name: "short-fiction outline system prompt", build: () => buildShortFictionOutlineSystemPrompt() },
  { name: "short-fiction outline user prompt", build: () => buildShortFictionOutlineUserPrompt(SHORT_FICTION_OUTLINE_INPUT) },
  { name: "short-fiction outline review system prompt", build: () => buildShortFictionOutlineReviewSystemPrompt() },
  {
    name: "short-fiction outline review user prompt",
    build: () => buildShortFictionOutlineReviewUserPrompt({
      direction: SHORT_FICTION_OUTLINE_INPUT.direction,
      outline: { rawContent: "the plan body" },
    }),
  },
  {
    name: "short-fiction outline revision followup",
    build: () => buildShortFictionOutlineRevisionFollowup({
      direction: SHORT_FICTION_OUTLINE_INPUT.direction,
      outline: { rawContent: "the plan body" },
      review: "the back half sags",
      chapterCount: 10,
      charsPerChapter: 1200,
    }),
  },
  { name: "short-fiction writer system prompt", build: () => buildShortFictionWriterSystemPrompt() },
  { name: "short-fiction writer user prompt", build: () => buildShortFictionWriterUserPrompt(SHORT_FICTION_DRAFT_INPUT) },
  {
    name: "short-fiction draft continuation user prompt",
    build: () => buildShortFictionDraftContinuationUserPrompt({
      ...SHORT_FICTION_DRAFT_INPUT,
      existingDraftMarkdown: "# Existing Draft",
      missingChapters: [3, 4],
    }),
  },
  { name: "short-fiction draft review system prompt", build: () => buildShortFictionDraftReviewSystemPrompt() },
  {
    name: "short-fiction draft review user prompt",
    build: () => buildShortFictionDraftReviewUserPrompt({
      ...SHORT_FICTION_DRAFT_INPUT,
      draftMarkdown: "# The Draft Body",
    }),
  },
  {
    name: "short-fiction draft revision followup",
    build: () => buildShortFictionDraftRevisionFollowup({
      ...SHORT_FICTION_DRAFT_INPUT,
      review: "fix the timeline in chapter 4",
    }),
  },
  { name: "short-fiction package system prompt", build: () => buildShortFictionPackageSystemPrompt() },
  {
    name: "short-fiction package user prompt",
    build: () => buildShortFictionPackageUserPrompt({
      direction: SHORT_FICTION_OUTLINE_INPUT.direction,
      outlineMarkdown: "the plan",
      draftMarkdown: "the draft",
      draftTitle: "The Extra Floor",
    }),
  },
];

describe("short-fiction prompt builders default their omitted language argument to English", () => {
  for (const { name, build } of SHORT_FICTION_ENGLISH_PROMPTS) {
    it(`${name} contains no non-ASCII leaks when language is omitted`, () => {
      const offending = build()
        .split("\n")
        .filter((line) => hasDisallowedNonAscii(line));
      expect(offending, `untranslated / stray non-ASCII lines in ${name}`).toEqual([]);
    });
  }

  it("parseShortFictionOutline(rawContent) falls back to an English title when language is omitted", () => {
    expect(parseShortFictionOutline("no tags here").storyTitle).toBe("Untitled Short Story");
  });

  it("formatShortFictionChapterHeading(number, title) uses the English 'Chapter N:' form when language is omitted", () => {
    expect(formatShortFictionChapterHeading(1, "The Setup")).toBe("Chapter 1: The Setup");
  });

  it("renderShortFictionDraftMarkdown(draft) renders the English 'Opening Hook' heading when language is omitted", () => {
    const draft: ShortFictionBatchDraft = {
      storyTitle: "The Extra Floor",
      openingHook: "The elevator stopped on a floor that does not exist.",
      chapters: [{ number: 1, title: "The Thirteenth Button", content: "prose", charCount: 1 }],
      rawContent: "",
    };
    const markdown = renderShortFictionDraftMarkdown(draft);
    expect(markdown).toContain("## Opening Hook");
    expect(markdown).toContain("## Chapter 1: The Thirteenth Button");
    expect(markdown).not.toMatch(/[一-鿿]/);
  });
});
