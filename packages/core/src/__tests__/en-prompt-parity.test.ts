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

// Widened from the brief's CJK-ideograph allowlist regex: flag any character
// outside printable ASCII except a short list of characters legitimately used
// throughout the English prompts. This catches non-CJK stray non-ASCII too,
// not just Chinese. The brief's own review named only the em dash (—, U+2014)
// and rightward arrow (→, U+2192); running the guard against the real English
// prompts also turned up "<=" / ">=" comparisons written with the Unicode
// operators ≤ (U+2264) and ≥ (U+2265) in planner-prompts.ts (hook-count caps
// and floors) — legitimate math notation, not a translation leak, so they are
// allowed here too.
const ALLOWED_NON_ASCII = new Set(["—", "→", "≤", "≥"]);

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
