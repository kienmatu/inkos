import { describe, expect, it } from "vitest";
import {
  parseShortFictionSemanticBatchPlan,
  resolveSemanticChapterGroups,
  resolveShortFictionBatchCapacity,
} from "../agents/short-fiction-batching.js";

describe("resolveShortFictionBatchCapacity", () => {
  it.each([
    [128_000, "live", 6, "live"],
    [8_000, "static", 3, "static"],
    [5_000, "static", 2, "static"],
  ] as const)("maps %d %s tokens to a safe English chapter ceiling", (modelMaxOutput, source, expected, expectedSource) => {
    expect(resolveShortFictionBatchCapacity({
      modelMaxOutput,
      capacitySource: source,
      charsPerChapter: 1_200,
      language: "en",
    })).toMatchObject({
      capacityTokens: modelMaxOutput,
      capacitySource: expectedSource,
      maxChaptersPerBatch: expected,
    });
  });

  it("uses a 10k fallback and four English chapters for unknown models", () => {
    const policy = resolveShortFictionBatchCapacity({
      capacitySource: "unknown",
      charsPerChapter: 1_200,
      language: "en",
    });

    expect(policy).toMatchObject({
      capacityTokens: 10_000,
      capacitySource: "fallback",
      usableTokens: 7_500,
      estimatedTokensPerChapter: 1_560,
      maxChaptersPerBatch: 4,
    });
    expect(policy.maxTokensForBatch(4)).toBe(10_000);
    expect(policy.maxTokensForBatch(2)).toBe(9_376);
  });

  it("allows one chapter only when two cannot fit", () => {
    expect(resolveShortFictionBatchCapacity({
      modelMaxOutput: 3_000,
      capacitySource: "static",
      charsPerChapter: 1_200,
      language: "en",
    }).maxChaptersPerBatch).toBe(1);
  });
});

describe("semantic chapter groups", () => {
  const semanticPlan = [
    { from: 1, to: 5, phase: "Pressure", reason: "Chapter 6 begins the counterattack." },
    { from: 6, to: 8, phase: "Payoff", reason: "Keep the counterattack and payoff together." },
  ];

  it("preserves a model-authored phase boundary before chapter 6", () => {
    expect(resolveSemanticChapterGroups({
      chapterCount: 8,
      maxChaptersPerBatch: 6,
      proposed: semanticPlan,
    })).toEqual({
      source: "outline",
      groups: [[1, 2, 3, 4, 5], [6, 7, 8]],
    });
  });

  it("re-splits oversized ranges without erasing existing phase boundaries", () => {
    expect(resolveSemanticChapterGroups({
      chapterCount: 8,
      maxChaptersPerBatch: 3,
      proposed: semanticPlan,
    })).toEqual({
      source: "capacity-resplit",
      groups: [[1, 2, 3], [4, 5], [6, 7, 8]],
    });
  });

  it("balances fallback ranges without a singleton tail", () => {
    expect(resolveSemanticChapterGroups({ chapterCount: 13, maxChaptersPerBatch: 6 })).toEqual({
      source: "balanced-fallback",
      groups: [[1, 2, 3, 4, 5], [6, 7, 8, 9], [10, 11, 12, 13]],
    });
  });

  it("rejects a plan with a coverage gap", () => {
    expect(resolveSemanticChapterGroups({
      chapterCount: 8,
      maxChaptersPerBatch: 6,
      proposed: [
        { from: 1, to: 4, phase: "Setup", reason: "Opening phase." },
        { from: 6, to: 8, phase: "Payoff", reason: "Ending phase." },
      ],
    }).source).toBe("balanced-fallback");
  });

  it("parses the tagged JSON plan from an outline", () => {
    const raw = [
      "=== SHORT_FICTION_PLAN_TITLE ===",
      "The Ledger",
      "=== SHORT_FICTION_BATCH_PLAN ===",
      JSON.stringify({ batches: semanticPlan }),
    ].join("\n");

    expect(parseShortFictionSemanticBatchPlan(raw)).toEqual(semanticPlan);
  });
});
