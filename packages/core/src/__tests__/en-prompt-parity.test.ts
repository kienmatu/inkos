import { describe, expect, it } from "vitest";
import { buildWriterSystemPrompt, buildGoldenOpeningDiscipline, type FanficContext } from "../agents/writer-prompts.js";
import { buildGoldenOpeningGuidance, getPlannerMemoSystemPrompt, getPlannerMemoUserTemplate } from "../agents/planner-prompts.js";
import { buildSettlerSystemPrompt, buildSettlerUserPrompt } from "../agents/settler-prompts.js";
import type { BookConfig } from "../models/book.js";
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

const FANFIC_CONTEXT_EN: FanficContext = {
  fanficCanon: FANFIC_CANON_EN_BOOK,
  fanficMode: "canon",
  allowedDeviations: ["Protagonist may have an original sibling not in canon"],
};

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
  {
    name: "writer system prompt (fanfic context: canon section, mode instructions, character voice profiles)",
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
      FANFIC_CONTEXT_EN,
      "en",
      "governed",
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

describe("English prompts carry no untranslated content", () => {
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
