import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import type { ChatStore } from "../../types";
import { initialChatState } from "../../initialState";
import { createCreateSlice } from "./action";

function createTestStore() {
  return createStore<ChatStore>()((...args) => ({
    ...initialChatState,
    ...createCreateSlice(...args),
  } as ChatStore));
}

describe("project artifact actions", () => {
  it("keeps short review context with the opened artifact and clears both on close", () => {
    const store = createTestStore();
    const context = { storyId: "reviewable-short", status: "needs-review" };

    Reflect.apply(store.getState().openProjectArtifact, store.getState(), [
      "shorts/reviewable-short/final/full.md",
      context,
    ]);

    expect(store.getState()).toMatchObject({
      projectArtifactPath: "shorts/reviewable-short/final/full.md",
      projectArtifactShortContext: context,
    });

    store.getState().closeProjectArtifact();
    expect(store.getState()).toMatchObject({
      projectArtifactPath: null,
      projectArtifactShortContext: null,
    });
  });

  it("marks only the matching open short complete when requests resolve out of order", () => {
    const store = createTestStore();
    const first = { storyId: "first-short", status: "needs-review" };
    const second = { storyId: "second-short", status: "needs-review" };
    Reflect.apply(store.getState().openProjectArtifact, store.getState(), ["shorts/first-short/final/full.md", first]);
    Reflect.apply(store.getState().openProjectArtifact, store.getState(), ["shorts/second-short/final/full.md", second]);
    const markComplete = Reflect.get(store.getState(), "markProjectArtifactShortComplete");

    expect(typeof markComplete).toBe("function");
    Reflect.apply(markComplete, store.getState(), ["first-short"]);
    expect(store.getState()).toMatchObject({ projectArtifactShortContext: second });

    Reflect.apply(markComplete, store.getState(), ["second-short"]);
    expect(store.getState()).toMatchObject({
      projectArtifactShortContext: { storyId: "second-short", status: "complete" },
    });
  });
});
