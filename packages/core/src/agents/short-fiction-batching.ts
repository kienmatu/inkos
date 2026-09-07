import { z } from "zod";
import type { ShortFictionLanguage } from "../prompts/short-fiction.js";

export const SHORT_FICTION_UNKNOWN_MODEL_OUTPUT_TOKENS = 10_000;
export const SHORT_FICTION_BATCH_USABLE_RATIO = 0.75;
export const SHORT_FICTION_MIN_SEMANTIC_BATCH_CHAPTERS = 2;
export const SHORT_FICTION_MAX_SEMANTIC_BATCH_CHAPTERS = 6;

export interface ShortFictionBatchCapacityInput {
  readonly modelMaxOutput?: number;
  readonly capacitySource: "live" | "static" | "unknown";
  readonly charsPerChapter: number;
  readonly language?: ShortFictionLanguage;
}

export interface ShortFictionBatchCapacity {
  readonly capacityTokens: number;
  readonly capacitySource: "live" | "static" | "fallback";
  readonly usableTokens: number;
  readonly estimatedTokensPerChapter: number;
  readonly maxChaptersPerBatch: number;
  readonly maxTokensForBatch: (chapterCount: number) => number;
}

export interface ShortFictionSemanticBatch {
  readonly from: number;
  readonly to: number;
  readonly phase: string;
  readonly reason: string;
}

export interface ResolvedSemanticChapterGroups {
  readonly source: "outline" | "capacity-resplit" | "balanced-fallback";
  readonly groups: ReadonlyArray<ReadonlyArray<number>>;
}

const SemanticBatchSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
  phase: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

const SemanticBatchPlanSchema = z.object({
  batches: z.array(SemanticBatchSchema).min(1),
});

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value > 0
    ? value
    : undefined;
}

export function resolveShortFictionBatchCapacity(
  input: ShortFictionBatchCapacityInput,
): ShortFictionBatchCapacity {
  const knownCapacity = positiveInteger(input.modelMaxOutput);
  const capacityTokens = knownCapacity ?? SHORT_FICTION_UNKNOWN_MODEL_OUTPUT_TOKENS;
  const usableTokens = Math.floor(capacityTokens * SHORT_FICTION_BATCH_USABLE_RATIO);
  const estimatedTokensPerChapter = input.language === "zh"
    ? input.charsPerChapter * 0.7
    : input.charsPerChapter * 1.3;
  const fitted = Math.floor(usableTokens / estimatedTokensPerChapter);
  const maxChaptersPerBatch = fitted < SHORT_FICTION_MIN_SEMANTIC_BATCH_CHAPTERS
    ? 1
    : Math.min(fitted, SHORT_FICTION_MAX_SEMANTIC_BATCH_CHAPTERS);

  return {
    capacityTokens,
    capacitySource: knownCapacity === undefined ? "fallback" : input.capacitySource === "unknown" ? "fallback" : input.capacitySource,
    usableTokens,
    estimatedTokensPerChapter,
    maxChaptersPerBatch,
    maxTokensForBatch: (chapterCount) => Math.min(
      capacityTokens,
      Math.max(4_096, Math.ceil(chapterCount * input.charsPerChapter * 2.2) + 4_096),
    ),
  };
}

export function parseShortFictionSemanticBatchPlan(
  rawContent: string,
): ReadonlyArray<ShortFictionSemanticBatch> | undefined {
  const marker = /^\s*===\s*SHORT_FICTION_BATCH_PLAN\s*===\s*$/im;
  const match = marker.exec(rawContent);
  if (!match) return undefined;
  const rest = rawContent.slice(match.index + match[0].length).replace(/^\s*\n/, "");
  const nextMarker = rest.search(/^\s*===\s*[A-Z0-9_ ]+\s*===\s*$/im);
  const block = (nextMarker >= 0 ? rest.slice(0, nextMarker) : rest).trim();
  try {
    return SemanticBatchPlanSchema.parse(JSON.parse(block)).batches;
  } catch {
    return undefined;
  }
}

export function resolveSemanticChapterGroups(input: {
  readonly chapterCount: number;
  readonly maxChaptersPerBatch: number;
  readonly proposed?: ReadonlyArray<ShortFictionSemanticBatch>;
}): ResolvedSemanticChapterGroups {
  const maximum = Math.max(1, Math.floor(input.maxChaptersPerBatch));
  if (!isCompleteSemanticPlan(input.proposed, input.chapterCount)) {
    return {
      source: "balanced-fallback",
      groups: partitionRange(1, input.chapterCount, maximum),
    };
  }

  const oversized = input.proposed.some((batch) => batch.to - batch.from + 1 > maximum);
  return {
    source: oversized ? "capacity-resplit" : "outline",
    groups: input.proposed.flatMap((batch) => partitionRange(batch.from, batch.to, maximum)),
  };
}

function isCompleteSemanticPlan(
  proposed: ReadonlyArray<ShortFictionSemanticBatch> | undefined,
  chapterCount: number,
): proposed is ReadonlyArray<ShortFictionSemanticBatch> {
  if (!proposed || proposed.length === 0 || chapterCount < 1) return false;
  let expected = 1;
  for (const batch of proposed) {
    const parsed = SemanticBatchSchema.safeParse(batch);
    if (!parsed.success || batch.from !== expected || batch.to < batch.from) return false;
    if (batch.to - batch.from + 1 < SHORT_FICTION_MIN_SEMANTIC_BATCH_CHAPTERS) return false;
    expected = batch.to + 1;
  }
  return expected === chapterCount + 1;
}

function partitionRange(from: number, to: number, maximum: number): number[][] {
  const length = to - from + 1;
  if (length <= 0) return [];
  const groupCount = Math.ceil(length / maximum);
  const baseSize = Math.floor(length / groupCount);
  let remainder = length % groupCount;
  let cursor = from;
  const groups: number[][] = [];
  for (let index = 0; index < groupCount; index += 1) {
    const size = baseSize + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    groups.push(Array.from({ length: size }, (_, offset) => cursor + offset));
    cursor += size;
  }
  return groups;
}
