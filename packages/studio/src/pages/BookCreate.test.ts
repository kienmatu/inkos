import { describe, expect, it } from "vitest";
import { defaultBookCreateForm, platformOptionsForLanguage, resolveProjectWritingLanguage } from "./BookCreate";

describe("project language never leaks Chinese into the Book Create page", () => {
  it("resolves a vi project language to English, matching toWritingLanguage's contract", () => {
    expect(resolveProjectWritingLanguage("vi")).toBe("en");
    expect(resolveProjectWritingLanguage("zh")).toBe("zh");
    expect(resolveProjectWritingLanguage("en")).toBe("en");
    expect(resolveProjectWritingLanguage(undefined)).toBe("en");
  });

  it("gives a vi project English platform options and English defaults, never the Chinese branch", () => {
    const language = resolveProjectWritingLanguage("vi");
    expect(platformOptionsForLanguage(language)).toEqual(platformOptionsForLanguage("en"));
    expect(defaultBookCreateForm(language)).toEqual(defaultBookCreateForm("en"));
  });
});
