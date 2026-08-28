import { normalizePlatformOrOther, defaultChapterLength, toWritingLanguage, type Platform } from "@kienmatu/inkos-core";
export { waitForStudioBookReady } from "../lib/book-ready.js";
export type { StudioBookDetail, WaitForStudioBookReadyOptions } from "../lib/book-ready.js";

export interface StudioCreateBookBody {
  readonly title: string;
  readonly genre: string;
  readonly language?: string;
  readonly platform?: string;
  readonly chapterWordCount?: number;
  readonly targetChapters?: number;
  readonly blurb?: string;
}

export interface StudioBookConfigDraft {
  readonly id: string;
  readonly title: string;
  readonly platform: Platform;
  readonly genre: string;
  readonly status: "outlining";
  readonly targetChapters: number;
  readonly chapterWordCount: number;
  readonly language?: "zh" | "en";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function normalizeStudioPlatform(platform?: string): Platform {
  return normalizePlatformOrOther(platform);
}

export function buildStudioBookConfig(body: StudioCreateBookBody, now: string): StudioBookConfigDraft {
  return {
    id: body.title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 30),
    title: body.title,
    platform: normalizeStudioPlatform(body.platform),
    genre: body.genre,
    status: "outlining",
    targetChapters: body.targetChapters ?? 200,
    // body.language is a UI language ("zh"/"en"/"vi") reaching this WRITING-language
    // field. When it is genuinely OMITTED, defer to the same "zh" default the
    // (also omitted) `language` field defers to via the genre profile below --
    // do NOT run it through toWritingLanguage(undefined), which would resolve
    // to "en" and desync the two. When it IS present but unrecognized (e.g.
    // "vi"), normalize instead of dropping it, so it yields English, never a
    // silent fall-through to the Chinese-defaulting genre profile.
    chapterWordCount: body.chapterWordCount ?? defaultChapterLength(body.language === undefined ? "zh" : toWritingLanguage(body.language)),
    ...(body.language !== undefined ? { language: toWritingLanguage(body.language) } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
