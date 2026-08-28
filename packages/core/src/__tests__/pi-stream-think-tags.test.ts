import type { AssistantMessage, AssistantMessageEvent, Model } from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";

const streamSimpleMock = vi.fn();

vi.mock("@mariozechner/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mariozechner/pi-ai")>();
  return { ...actual, streamSimple: (...args: unknown[]) => streamSimpleMock(...args) };
});

const { guardedPiStream } = await import("../agent/pi-stream.js");

const MODEL = {
  id: "cc/claude-opus-5",
  name: "cc/claude-opus-5",
  api: "openai-completions",
  provider: "openai",
  baseUrl: "https://gateway.invalid/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4096,
} satisfies Model<"openai-completions">;

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  } as AssistantMessage;
}

/** Replay a fixed delta sequence through the Pi transport boundary. */
async function runDeltas(deltas: ReadonlyArray<string>): Promise<AssistantMessageEvent[]> {
  const full = deltas.join("");
  streamSimpleMock.mockImplementation(() => {
    const upstream = createAssistantMessageEventStream();
    const partial = assistantMessage("");
    queueMicrotask(() => {
      upstream.push({ type: "start", partial });
      upstream.push({ type: "text_start", contentIndex: 0, partial });
      for (const delta of deltas) {
        upstream.push({ type: "text_delta", contentIndex: 0, delta, partial });
      }
      upstream.push({ type: "text_end", contentIndex: 0, content: full, partial });
      upstream.push({ type: "done", reason: "stop", message: assistantMessage(full) });
    });
    return upstream;
  });

  const events: AssistantMessageEvent[] = [];
  for await (const event of guardedPiStream(MODEL, { systemPrompt: "", messages: [], tools: [] } as never)) {
    events.push(event);
  }
  return events;
}

function emittedText(events: ReadonlyArray<AssistantMessageEvent>): string {
  return events
    .filter((event): event is Extract<AssistantMessageEvent, { type: "text_delta" }> => event.type === "text_delta")
    .map((event) => event.delta)
    .join("");
}

function finalText(events: ReadonlyArray<AssistantMessageEvent>): string {
  const done = events.find((event) => event.type === "done");
  if (done?.type !== "done") throw new Error("stream produced no done event");
  const block = done.message.content[0];
  return block?.type === "text" ? block.text : "";
}

describe("guardedPiStream think-tag stripping", () => {
  it("keeps an empty think block from gluing itself to the first heading", async () => {
    const events = await runDeltas(["<think></think>## 1. Title\n", "**The Weight of the Crown**"]);

    expect(emittedText(events)).toBe("## 1. Title\n**The Weight of the Crown**");
    expect(finalText(events)).toBe("## 1. Title\n**The Weight of the Crown**");
  });

  it("drops a think block that arrives split across deltas", async () => {
    const events = await runDeltas(["<thi", "nk>reason", "ing</thi", "nk>\n\nAnswer."]);

    expect(emittedText(events)).toBe("Answer.");
    expect(finalText(events)).toBe("Answer.");
  });

  it("leaves ordinary text untouched", async () => {
    const events = await runDeltas(["## Heading\n", "Body text."]);

    expect(emittedText(events)).toBe("## Heading\nBody text.");
    expect(finalText(events)).toBe("## Heading\nBody text.");
  });

  it("keeps an unterminated think block rather than losing the response", async () => {
    const events = await runDeltas(["<think>reasoning that never closes"]);

    expect(emittedText(events)).toBe("<think>reasoning that never closes");
    expect(finalText(events)).toBe("<think>reasoning that never closes");
  });
});
