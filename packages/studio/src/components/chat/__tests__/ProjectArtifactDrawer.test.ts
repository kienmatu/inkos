import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectArtifactDrawer, copyMarkdownToClipboard } from "../ProjectArtifactDrawer";
import { setAppLanguage } from "../../../lib/app-language";

const storeState = vi.hoisted(() => ({
  path: null as string | null,
  shortContext: null as null | { storyId: string; status: "complete" | "needs-review" },
}));

vi.mock("../../../store/chat", () => ({
  useChatStore: (selector: (state: {
    projectArtifactPath: string | null;
    projectArtifactShortContext: null | { storyId: string; status: "complete" | "needs-review" };
    closeProjectArtifact: () => void;
  }) => unknown) => selector({
    projectArtifactPath: storeState.path,
    projectArtifactShortContext: storeState.shortContext,
    closeProjectArtifact: vi.fn(),
  }),
}));

describe("ProjectArtifactDrawer", () => {
  beforeEach(() => {
    storeState.path = null;
    storeState.shortContext = null;
    setAppLanguage("vi");
  });

  it("offers source copying for Markdown artifacts but not JSON artifacts", () => {
    storeState.path = "shorts/night-ledger/final/full.md";
    const markdownHtml = renderToStaticMarkup(createElement(ProjectArtifactDrawer));

    storeState.path = "shorts/night-ledger/final/short-story.json";
    const jsonHtml = renderToStaticMarkup(createElement(ProjectArtifactDrawer));

    expect(markdownHtml).toContain('data-testid="copy-markdown"');
    expect(jsonHtml).not.toContain('data-testid="copy-markdown"');
  });

  it("shows the Đã xong action only for a short that still needs review", () => {
    storeState.path = "shorts/reviewable-short/final/full.md";
    storeState.shortContext = { storyId: "reviewable-short", status: "needs-review" };
    const reviewHtml = renderToStaticMarkup(createElement(ProjectArtifactDrawer));

    storeState.shortContext = { storyId: "reviewable-short", status: "complete" };
    const completeHtml = renderToStaticMarkup(createElement(ProjectArtifactDrawer));

    expect(reviewHtml).toContain('data-testid="mark-short-done"');
    expect(reviewHtml).toContain("Đã xong");
    expect(completeHtml).not.toContain('data-testid="mark-short-done"');
  });

  it("copies the exact raw Markdown source", async () => {
    let copied = "";

    const result = await copyMarkdownToClipboard("# Title\n\n**raw**", {
      writeText: async (text) => {
        copied = text;
      },
    });

    expect(result).toBe(true);
    expect(copied).toBe("# Title\n\n**raw**");
  });

  it("reports clipboard rejection without throwing", async () => {
    const result = await copyMarkdownToClipboard("# Title", {
      writeText: async () => {
        throw new Error("clipboard denied");
      },
    });

    expect(result).toBe(false);
  });
});
