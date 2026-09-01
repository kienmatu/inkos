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
});
