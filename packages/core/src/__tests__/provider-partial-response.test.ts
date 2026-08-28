import { describe, expect, it } from "vitest";
import { PartialResponseError, wrapLLMError } from "../llm/provider.js";

// Reaching wrapLLMError through chatCompletion() would require mocking the
// underlying pi-ai transport (the "openai" SDK's own HTTP client), which does
// not honor a mocked globalThis.fetch — verified by hand: even with a fully
// stubbed LLMClient and vi.spyOn(globalThis, "fetch"), the call still attempted
// a real network connection. wrapLLMError is exported (see provider.ts) so
// this test can exercise its exact classification logic directly instead.
describe("wrapLLMError", () => {
  it("keeps the class and reason when the partial length contains an HTTP-like number", () => {
    // 4001 chars: the message reads "Stream interrupted after 4001 chars: ...",
    // which contains "400" and used to be misclassified as an HTTP 400.
    const thrown = new PartialResponseError(
      "x".repeat(4001),
      new Error("model reached the output limit (length)"),
      "output-limit",
    );

    const wrapped = wrapLLMError(thrown, { baseUrl: "http://localhost:1/v1", model: "m" });

    expect(wrapped).toBe(thrown);
    expect(wrapped).toBeInstanceOf(PartialResponseError);
    expect((wrapped as PartialResponseError).reason).toBe("output-limit");
    expect(String(wrapped)).not.toContain("API 返回 400");
  });

  it("still classifies a genuine HTTP 400 as a request error", () => {
    const thrown = new Error("Request failed with status 400");

    const wrapped = wrapLLMError(thrown, { baseUrl: "http://localhost:1/v1", model: "m" });

    expect(wrapped).not.toBeInstanceOf(PartialResponseError);
    expect(String(wrapped)).toContain("400");
  });
});
