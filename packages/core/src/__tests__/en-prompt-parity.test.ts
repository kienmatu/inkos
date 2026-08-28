import { describe, expect, it } from "vitest";
import { buildWriterSystemPrompt, buildGoldenOpeningDiscipline } from "../agents/writer-prompts.js";
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

/**
 * Substrings that legitimately contain CJK inside an English prompt. Each entry
 * must name why it is not a leak. Keep this list as short as the truth allows —
 * an entry added to silence a failure defeats the guard.
 */
const CJK_ALLOWLIST: ReadonlyArray<{ readonly text: string; readonly why: string }> = [
  {
    text: "roles/主要角色/",
    why: "Real on-disk directory name, constructed in code at architect.ts:829. Renaming it is a storage migration, not a translation fix.",
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
    build: () => buildSettlerUserPrompt({
      language: "en",
      chapterNumber: 12,
      title: "The Reckoning",
      content: "The protagonist confronts the mentor.",
      currentState: "State: stable.",
      ledger: "Spirit stones: 40",
      hooks: "hook-mentor-oath: active",
      chapterSummaries: "(文件尚未创建)",
      subplotBoard: "(文件尚未创建)",
      emotionalArcs: "(文件尚未创建)",
      characterMatrix: "(文件尚未创建)",
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
