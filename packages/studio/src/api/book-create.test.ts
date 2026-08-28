import { describe, expect, it, vi } from "vitest";
import { defaultChapterLength } from "@actalk/inkos-core";
import { buildStudioBookConfig, normalizeStudioPlatform, waitForStudioBookReady } from "./book-create";

describe("normalizeStudioPlatform", () => {
  it("keeps supported chinese platform ids and folds unsupported values to other", () => {
    expect(normalizeStudioPlatform("tomato")).toBe("tomato");
    expect(normalizeStudioPlatform("番茄小说")).toBe("tomato");
    expect(normalizeStudioPlatform("qidian")).toBe("qidian");
    expect(normalizeStudioPlatform("feilu")).toBe("feilu");
    expect(normalizeStudioPlatform("royal-road")).toBe("other");
    expect(normalizeStudioPlatform(undefined)).toBe("other");
  });
});

describe("buildStudioBookConfig", () => {
  it("preserves supported platform selections from studio create requests", () => {
    const config = buildStudioBookConfig(
      {
        title: "测试书",
        genre: "xuanhuan",
        platform: "qidian",
        language: "zh",
        chapterWordCount: 2500,
        targetChapters: 120,
      },
      "2026-03-30T00:00:00.000Z",
    );

    expect(config).toMatchObject({
      title: "测试书",
      genre: "xuanhuan",
      platform: "qidian",
      language: "zh",
      chapterWordCount: 2500,
      targetChapters: 120,
    });
  });

  it("normalizes unsupported platform ids to other for storage", () => {
    const config = buildStudioBookConfig(
      {
        title: "English Book",
        genre: "other",
        platform: "royal-road",
        language: "en",
      },
      "2026-03-30T00:00:00.000Z",
    );

    expect(config.platform).toBe("other");
    expect(config.language).toBe("en");
    expect(config.id).toBe("english-book");
  });

  it("normalizes a Vietnamese UI language to English, never Chinese (CRITICAL 1)", () => {
    // "vi" is a UI-only language; no book is ever written in Vietnamese.
    // toWritingLanguage maps anything that isn't "zh" (including "vi") to "en".
    const config = buildStudioBookConfig(
      {
        title: "Vietnamese UI Book",
        genre: "other",
        language: "vi",
      },
      "2026-03-30T00:00:00.000Z",
    );

    expect(config.language).toBe("en");
    expect(config.language).not.toBe("vi");
    expect(config.language).not.toBe("zh");
    // The chapter-length default must also follow English, not fall back to Chinese.
    expect(config.chapterWordCount).toBe(defaultChapterLength("en"));
  });

  describe("language/chapterWordCount consistency (regression)", () => {
    // When body.language is genuinely OMITTED, the language field is deferred
    // to the genre profile (which defaults to "zh"), so chapterWordCount must
    // defer to the SAME default -- not silently flip to the English default
    // just because toWritingLanguage(undefined) resolves to "en".
    it("omitted language: defers chapterWordCount to the Chinese default and sets no language field", () => {
      const config = buildStudioBookConfig(
        { title: "No Language Book", genre: "other" },
        "2026-03-30T00:00:00.000Z",
      );

      expect(config.language).toBeUndefined();
      expect(config.chapterWordCount).toBe(defaultChapterLength("zh"));
      expect(config.chapterWordCount).toBe(3000);
    });

    it('language: "vi": normalizes to "en" language and the English chapterWordCount default', () => {
      const config = buildStudioBookConfig(
        { title: "Vi Book", genre: "other", language: "vi" },
        "2026-03-30T00:00:00.000Z",
      );

      expect(config.language).toBe("en");
      expect(config.chapterWordCount).toBe(defaultChapterLength("en"));
      expect(config.chapterWordCount).toBe(2000);
    });

    it('language: "zh": keeps "zh" language and the Chinese chapterWordCount default', () => {
      const config = buildStudioBookConfig(
        { title: "Zh Book", genre: "other", language: "zh" },
        "2026-03-30T00:00:00.000Z",
      );

      expect(config.language).toBe("zh");
      expect(config.chapterWordCount).toBe(defaultChapterLength("zh"));
      expect(config.chapterWordCount).toBe(3000);
    });

    it('language: "en": keeps "en" language and the English chapterWordCount default', () => {
      const config = buildStudioBookConfig(
        { title: "En Book", genre: "other", language: "en" },
        "2026-03-30T00:00:00.000Z",
      );

      expect(config.language).toBe("en");
      expect(config.chapterWordCount).toBe(defaultChapterLength("en"));
      expect(config.chapterWordCount).toBe(2000);
    });

    it("an explicit chapterWordCount always overrides the default, in every language case", () => {
      for (const language of [undefined, "vi", "zh", "en"] as const) {
        const config = buildStudioBookConfig(
          { title: `Override Book ${String(language)}`, genre: "other", language, chapterWordCount: 4242 },
          "2026-03-30T00:00:00.000Z",
        );
        expect(config.chapterWordCount).toBe(4242);
      }
    });
  });
});

describe("waitForStudioBookReady", () => {
  it("retries until the created book becomes readable", async () => {
    let bookDetailCalls = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/create-status")) {
        return new Response(JSON.stringify({ error: "Book status not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      bookDetailCalls += 1;
      if (bookDetailCalls === 1) {
        return new Response(JSON.stringify({ error: "Book not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        book: { id: "new-book" },
        chapters: [],
        nextChapter: 1,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const wait = vi.fn(async () => {});

    const result = await waitForStudioBookReady("new-book", {
      fetchImpl,
      wait,
      maxAttempts: 2,
      retryDelayMs: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      book: { id: "new-book" },
      nextChapter: 1,
    });
  });

  it("waits on create-status while async LLM book creation is still running", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/create-status")) {
          const statusCall = fetchImpl.mock.calls.filter(([called]) => String(called).endsWith("/create-status")).length;
          return new Response(JSON.stringify({ status: statusCall < 3 ? "creating" : "ready" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/books/new-book")) {
          return new Response(JSON.stringify({
            book: { id: "new-book" },
            chapters: [],
            nextChapter: 1,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
      });
    const wait = vi.fn(async () => {});

    const result = await waitForStudioBookReady("new-book", {
      fetchImpl,
      wait,
      maxAttempts: 4,
      retryDelayMs: 1,
    });

    expect(wait).toHaveBeenCalledTimes(2);
    expect(result.book.id).toBe("new-book");
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v1/books/new-book/create-status",
      "/api/v1/books/new-book/create-status",
      "/api/v1/books/new-book/create-status",
      "/api/v1/books/new-book",
    ]);
  });

  it("throws a clear error when the book never becomes readable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Book not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(waitForStudioBookReady("missing-book", {
      fetchImpl,
      wait: async () => {},
      maxAttempts: 2,
      retryDelayMs: 1,
    })).rejects.toThrow('Book "missing-book" was not ready after 2 attempts.');
  });
});
