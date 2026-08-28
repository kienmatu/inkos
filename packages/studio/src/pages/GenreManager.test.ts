import { describe, expect, it } from "vitest";
import { filterGenresForLanguage, type GenreInfo } from "./GenreManager";

const GENRES: ReadonlyArray<GenreInfo> = [
  { id: "xuanhuan", name: "玄幻", source: "builtin", language: "zh" },
  { id: "progression", name: "Progression Fantasy", source: "builtin", language: "en" },
  { id: "custom", name: "Custom", source: "project", language: "zh" },
];

describe("filterGenresForLanguage (CRITICAL 2)", () => {
  it("returns the English built-in genres for a Vietnamese UI language, never an empty list", () => {
    // "vi" is a UI-only language; genres are only ever "zh" or "en". A Vietnamese
    // project must still see the English built-in genres, not nothing at all.
    const result = filterGenresForLanguage(GENRES, "vi");

    expect(result.length).toBeGreaterThan(0);
    expect(result.map((g) => g.id)).toContain("progression");
    expect(result.map((g) => g.id)).not.toContain("xuanhuan");
  });

  it("still includes project genres regardless of UI language", () => {
    const result = filterGenresForLanguage(GENRES, "vi");
    expect(result.map((g) => g.id)).toContain("custom");
  });

  it("keeps existing zh/en behavior unchanged", () => {
    expect(filterGenresForLanguage(GENRES, "zh").map((g) => g.id)).toEqual(["xuanhuan", "custom"]);
    expect(filterGenresForLanguage(GENRES, "en").map((g) => g.id)).toEqual(["progression", "custom"]);
  });
});
