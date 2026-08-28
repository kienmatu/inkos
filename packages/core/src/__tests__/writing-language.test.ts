import { describe, it, expect } from "vitest";
import { toWritingLanguage } from "../utils/language.js";
import { ProjectConfigSchema } from "../models/project.js";
import { BookConfigSchema } from "../models/book.js";

describe("toWritingLanguage", () => {
  it("keeps Chinese as Chinese", () => {
    expect(toWritingLanguage("zh")).toBe("zh");
  });

  it("keeps English as English", () => {
    expect(toWritingLanguage("en")).toBe("en");
  });

  it("maps the Vietnamese UI language to English content", () => {
    expect(toWritingLanguage("vi")).toBe("en");
  });

  it("maps unknown and missing values to English", () => {
    expect(toWritingLanguage(undefined)).toBe("en");
    expect(toWritingLanguage("")).toBe("en");
    expect(toWritingLanguage("fr")).toBe("en");
  });
});

const MINIMAL_LLM = {
  provider: "openai" as const,
  service: "custom",
  configSource: "studio" as const,
  baseUrl: "https://example.com",
  model: "gpt-test",
  apiFormat: "chat" as const,
  stream: true,
};

describe("ProjectConfigSchema.language", () => {
  it("defaults to Vietnamese when no language key is present", () => {
    const parsed = ProjectConfigSchema.parse({
      name: "demo",
      version: "0.1.0",
      llm: MINIMAL_LLM,
    });
    expect(parsed.language).toBe("vi");
  });

  it("accepts vi, zh, and en", () => {
    for (const language of ["vi", "zh", "en"] as const) {
      const parsed = ProjectConfigSchema.parse({
        name: "demo",
        version: "0.1.0",
        language,
        llm: MINIMAL_LLM,
      });
      expect(parsed.language).toBe(language);
    }
  });

  it("rejects an unknown language", () => {
    expect(() =>
      ProjectConfigSchema.parse({
        name: "demo",
        version: "0.1.0",
        language: "fr",
        llm: MINIMAL_LLM,
      }),
    ).toThrow();
  });
});

describe("BookConfigSchema.language", () => {
  it("still rejects Vietnamese — books are never written in Vietnamese", () => {
    expect(() =>
      BookConfigSchema.parse({
        id: "book-1",
        title: "Demo",
        platform: "other",
        genre: "fantasy",
        status: "active",
        language: "vi",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
