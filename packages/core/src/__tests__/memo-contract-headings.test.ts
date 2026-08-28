import { describe, expect, it } from "vitest";
import { buildWriterSystemPrompt } from "../agents/writer-prompts.js";
import { MEMO_SECTION_NAMES } from "../utils/chapter-memo-parser.js";
import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";

const BOOK: BookConfig = {
  id: "memo-contract-book",
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
  fatigueWords: [],
  numericalSystem: false,
  powerScaling: true,
  eraResearch: false,
  pacingRule: "",
  satisfactionTypes: [],
  auditDimensions: [],
};

function englishGovernedPrompt(): string {
  return buildWriterSystemPrompt(
    BOOK, GENRE, null, "", "", "", undefined, 1, "full", undefined, "en", "governed",
  );
}

describe("English memo contract", () => {
  it("names every section by its English heading", () => {
    const prompt = englishGovernedPrompt();
    for (const section of MEMO_SECTION_NAMES) {
      expect(prompt).toContain(section.en);
    }
  });

  it("names no section by its Chinese heading", () => {
    const prompt = englishGovernedPrompt();
    for (const section of MEMO_SECTION_NAMES) {
      expect(prompt).not.toContain(section.zh);
    }
  });

  it("keeps the hard correspondence rule attached to the hook ledger section", () => {
    const prompt = englishGovernedPrompt();
    const ledgerIndex = prompt.indexOf("## Hook ledger for this chapter");
    expect(ledgerIndex).toBeGreaterThan(-1);
    const clause = prompt.slice(ledgerIndex, ledgerIndex + 400);
    expect(clause).toContain("hard correspondence rule");
  });

  it("uses an English example, not a transliterated Chinese one", () => {
    const prompt = englishGovernedPrompt();
    expect(prompt).not.toContain("Huzi");
    expect(prompt).not.toContain("Lin Qiu");
  });
});
