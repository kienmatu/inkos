import { describe, expect, it } from "vitest";
import { EN_AI_TELL_WORDS } from "../agents/post-write-validator.js";

describe("English AI-tell word list", () => {
  it("contains the English tells and no Chinese ones", () => {
    expect(EN_AI_TELL_WORDS).toContain("delve");
    expect(EN_AI_TELL_WORDS).toContain("tapestry");
    for (const word of EN_AI_TELL_WORDS) {
      expect(word).not.toMatch(/[一-鿿]/);
    }
  });
});
