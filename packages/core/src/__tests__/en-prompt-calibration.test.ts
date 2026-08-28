import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWriterSystemPrompt, buildGoldenOpeningDiscipline } from "../agents/writer-prompts.js";
import {
  PLANNER_MEMO_SYSTEM_PROMPT,
  buildGoldenOpeningGuidance,
  getPlannerMemoSystemPrompt,
} from "../agents/planner-prompts.js";
import { buildSettlerSystemPrompt } from "../agents/settler-prompts.js";
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

describe("architect English output budgets", () => {
  // The English foundation prompt is a private method, so assert on the source
  // of the English branch rather than constructing an Architect instance.
  const source = readFileSync(
    new URL("../agents/architect.ts", import.meta.url),
    "utf-8",
  );
  // Use lastIndexOf: the first occurrence is the `this.buildEnglishFoundationPrompt(...)`
  // call site, which precedes (and would otherwise pull in) the Chinese method body;
  // the second occurrence is the `private buildEnglishFoundationPrompt(` definition itself.
  const englishBranch = source.slice(source.lastIndexOf("buildEnglishFoundationPrompt"));

  it("sizes the English budgets in words", () => {
    expect(englishBranch).toContain("story_frame ≤ 2000 words");
    expect(englishBranch).toContain("pending_hooks ≤ 1300 words");
    expect(englishBranch).not.toContain("story_frame ≤ 3000 chars");
  });

  it("sizes the prose sections and payoff placement in words", () => {
    expect(englishBranch).toContain("~400-600 words each");
    expect(englishBranch).toContain("last 200 words of the chapter");
  });
});

// ---------------------------------------------------------------------------
// English-craft divergences from the Chinese prompts. Each of these is a
// deliberate asymmetry: the faithful translation produced bad English craft
// instruction, so the English branch says something the Chinese branch does not.
// These assertions exist so a later "restore parity" pass cannot silently undo
// them, and so the Chinese branch is proven untouched.
// ---------------------------------------------------------------------------

describe("English planner principle 13 forbids head-hopping; Chinese does not", () => {
  const en = getPlannerMemoSystemPrompt("en");

  it("renames the principle away from the literal center-of-circle gloss", () => {
    expect(en).toContain("13. One event, every angle:");
    expect(en).not.toContain("Center-of-circle");
    expect(en).not.toContain("multi-POV");
  });

  it("locks interiority to the POV character and bans head-hopping", () => {
    expect(en).toContain("interiority for the POV character only");
    expect(en).toContain("Never hop between heads inside a scene.");
    // The old wording promised every present character an inner reaction,
    // which is exactly what buildNarrativePersonRule's POV lock forbids.
    expect(en).not.toContain("a distinct inner reaction");
  });

  it("is consistent with the writer's narrative-person lock", () => {
    const writer = buildWriterSystemPrompt(
      BOOK,
      GENRE,
      {
        version: "1.0",
        narrativePerson: "first",
        numericalSystemOverrides: undefined,
        eraConstraints: undefined,
        prohibitions: [],
        chapterTypesOverride: [],
        fatigueWordsOverride: [],
        additionalAuditDimensions: [],
        enableFullCastTracking: false,
        allowedDeviations: [],
      },
      "", "", "", undefined, 4, "full", undefined, "en", "governed",
    );
    expect(writer).toContain("Do NOT slip into third person or an omniscient narrator");
    // The planner must not hand that writer a memo asking for other heads' interiority.
    expect(en).toContain("what the POV character observes");
  });

  it("leaves the Chinese principle 13 exactly as it was", () => {
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("13. 圆心法同场多视角：");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("**一段独立的内心反应**");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).not.toContain("hop between heads");
  });
});

describe("English planner and writer agree on the opening-economy cap", () => {
  const plannerGuidance = buildGoldenOpeningGuidance(1, "en");
  const writerDiscipline = buildGoldenOpeningDiscipline(1, "en");

  it("budgets the planner at the cap the writer actually enforces", () => {
    expect(writerDiscipline).toContain("Hard cap: two named characters");
    expect(writerDiscipline).toContain("At most two scenes in the chapter.");
    expect(plannerGuidance).toContain(
      "at most two scenes and two named characters this chapter",
    );
    // The old memo budgeted three of each, which the writer could not honor.
    expect(plannerGuidance).not.toContain("at most three scenes");
    expect(plannerGuidance).not.toContain("three named characters");
  });

  it("keeps the Chinese planner budget at three, as before", () => {
    expect(buildGoldenOpeningGuidance(1, "zh")).toContain("场景 ≤ 3 个、人物 ≤ 3 个");
  });
});

describe("English hook-ledger examples use one consistent English cast", () => {
  const planner = getPlannerMemoSystemPrompt("en");
  const writer = buildWriterSystemPrompt(
    BOOK, GENRE, null, "", "", "", undefined, 1, "full", undefined, "en", "governed",
  );

  it("drops the xianxia cast from the planner's format example", () => {
    for (const leak of ["Huzi", "Lin Qiu", "Shou-Zhuo Jue", "senior brother", "thunder rack"]) {
      expect(planner, `planner example still carries "${leak}"`).not.toContain(leak);
    }
  });

  it("shows the same Elena/Marcus ledger the writer contract shows", () => {
    expect(planner).toContain("H007 \"Marcus's IOU\"");
    expect(planner).toContain("Elena");
    expect(writer).toContain("H007 Marcus's IOU");
    // "promissory note" is contract-law register, not serial-fiction register.
    expect(writer).not.toContain("promissory note");
  });

  it("keeps the Chinese ledger example untouched", () => {
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("H007 \"胖虎借条\"");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("H009 \"守拙诀来历\"");
  });
});

describe("English settler states the real status vocabulary", () => {
  const settler = buildSettlerSystemPrompt(BOOK, GENRE, null, "en");

  it("names the closed status set the delta schema actually enforces", () => {
    expect(settler).toContain("only open / progressing / deferred / resolved");
    // The planner's narrative phase names are NOT valid here; the prompt must say so.
    expect(settler).toContain("planted, pressured, or near_payoff");
  });
});
