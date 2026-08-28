import { describe, expect, it } from "vitest";
import { buildSettlerSystemPrompt, buildSettlerUserPrompt } from "../agents/settler-prompts.js";
import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";

const BOOK: BookConfig = {
  id: "settler-en-book",
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

const CJK = /[一-鿿]/;

describe("settler English branch", () => {
  it("emits no Chinese in the English system prompt", () => {
    const prompt = buildSettlerSystemPrompt(BOOK, GENRE, null, "en");
    expect(prompt).not.toMatch(CJK);
  });

  it("keeps the JSON contract keys unchanged", () => {
    const prompt = buildSettlerSystemPrompt(BOOK, GENRE, null, "en");
    for (const key of ["hookOps", "upsert", "mention", "newHookCandidates", "lastAdvancedChapter"]) {
      expect(prompt).toContain(key);
    }
  });

  it("keeps the tag markers untranslated", () => {
    const prompt = buildSettlerSystemPrompt(BOOK, GENRE, null, "en");
    expect(prompt).toContain("=== POST_SETTLEMENT ===");
    expect(prompt).toContain("=== RUNTIME_STATE_DELTA ===");
  });

  it("states the mention-is-not-an-advance rule in English", () => {
    const prompt = buildSettlerSystemPrompt(BOOK, GENRE, null, "en");
    expect(prompt).toContain("Hard rule");
    expect(prompt).toMatch(/is NOT an advance/i);
  });

  it("disambiguates hook from the opening-hook sense", () => {
    const prompt = buildSettlerSystemPrompt(BOOK, GENRE, null, "en");
    expect(prompt).toContain("not the chapter-opening grab");
  });

  it("emits no Chinese in the English user prompt", () => {
    const prompt = buildSettlerUserPrompt({
      language: "en",
      chapterNumber: 12,
      title: "The Ledger",
      content: "Elena opened the drawer.",
      currentState: "state",
      ledger: "",
      hooks: "hooks",
      chapterSummaries: "(not created yet)",
      subplotBoard: "(not created yet)",
      emotionalArcs: "(not created yet)",
      characterMatrix: "(not created yet)",
      volumeOutline: "outline",
    });
    expect(prompt).not.toMatch(CJK);
    expect(prompt).toContain("=== TAG ===");
  });

  it("defaults to the English user prompt when language is omitted", () => {
    const params = {
      chapterNumber: 12,
      title: "The Ledger",
      content: "Elena opened the drawer.",
      currentState: "state",
      ledger: "",
      hooks: "hooks",
      chapterSummaries: "(not created yet)",
      subplotBoard: "(not created yet)",
      emotionalArcs: "(not created yet)",
      characterMatrix: "(not created yet)",
      volumeOutline: "outline",
    } as const;
    const omitted = buildSettlerUserPrompt(params);
    expect(omitted).not.toMatch(CJK);
    expect(omitted).toBe(buildSettlerUserPrompt({ ...params, language: "en" }));
    expect(omitted).not.toBe(buildSettlerUserPrompt({ ...params, language: "zh" }));
  });

  it("leaves the Chinese system prompt byte-identical", () => {
    const prompt = buildSettlerSystemPrompt(BOOK, { ...GENRE, language: "zh" }, null, "zh");
    expect(prompt).toContain("## 伏笔追踪规则（严格执行）");
    expect(prompt).toContain("**铁律**");
  });
});
