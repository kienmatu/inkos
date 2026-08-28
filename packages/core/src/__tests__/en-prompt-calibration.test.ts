import { describe, expect, it } from "vitest";
import { buildWriterSystemPrompt, buildGoldenOpeningDiscipline } from "../agents/writer-prompts.js";
import { getPlannerMemoSystemPrompt } from "../agents/planner-prompts.js";
import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";

const BOOK: BookConfig = {
  id: "calibration-book",
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

describe("English length thresholds are expressed in English units", () => {
  const opening = buildGoldenOpeningDiscipline(1, "en");
  const plannerSystem = getPlannerMemoSystemPrompt("en");

  it("pegs the inciting conflict to converted word count, not the Chinese number", () => {
    expect(opening).toContain("first 500 words");
    expect(opening).not.toContain("800 words");
  });

  it("pegs the first screen to a re-derived English screen length", () => {
    expect(opening).toContain("first 150 words");
    expect(opening).not.toContain("300 words");
  });

  it("keeps the placement rule pinned to the last sentence of the first screen", () => {
    // The spec considered and declined loosening this; only the number moved.
    expect(opening).toContain("The last sentence of the first 150 words");
  });

  it("states the payoff floor as a dramatization requirement, not a bare count", () => {
    // The floor lives in the memo contract, which only appears in governed mode.
    const contract = buildWriterSystemPrompt(
      BOOK, GENRE, null, "", "", "", undefined, 1, "full", undefined, "en", "governed",
    );
    expect(contract).not.toContain("60 chars");
    expect(contract).toContain("must be dramatized on the page");
  });

  it("sizes the hook label and chapter goal in words", () => {
    // Both live in PLANNER_MEMO_SYSTEM_PROMPT_EN (planner-prompts.ts:120-222).
    expect(plannerSystem).toContain("one line, <= 20 words");
    expect(plannerSystem).not.toContain("<=30 chars");
    expect(plannerSystem).toContain("no more than 35 words");
    expect(plannerSystem).not.toContain("50 characters");
  });

  it("leaves the Chinese thresholds untouched", () => {
    const zh = buildGoldenOpeningDiscipline(1, "zh");
    expect(zh).toContain("800 字以内");
    expect(zh).toContain("前 300 字");
  });
});
