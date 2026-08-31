import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectArtifactDrawer, copyMarkdownToClipboard } from "../ProjectArtifactDrawer";

const storeState = vi.hoisted(() => ({ path: null as string | null }));

vi.mock("../../../store/chat", () => ({
  useChatStore: (selector: (state: { projectArtifactPath: string | null; closeProjectArtifact: () => void }) => unknown) => selector({
    projectArtifactPath: storeState.path,
    closeProjectArtifact: vi.fn(),
  }),
}));

describe("ProjectArtifactDrawer", () => {
  it("offers source copying for Markdown artifacts but not JSON artifacts", () => {
    storeState.path = "shorts/night-ledger/final/full.md";
    const markdownHtml = renderToStaticMarkup(createElement(ProjectArtifactDrawer));

    storeState.path = "shorts/night-ledger/final/short-story.json";
    const jsonHtml = renderToStaticMarkup(createElement(ProjectArtifactDrawer));

    expect(markdownHtml).toContain('data-testid="copy-markdown"');
    expect(jsonHtml).not.toContain('data-testid="copy-markdown"');
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
