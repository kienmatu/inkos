import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStudioServer } from "../api/server.js";

describe("GET /api/v1/shorts", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "short-list-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns a completed short with its trusted title and final Markdown path", async () => {
    const shortDir = join(root, "shorts", "night-ledger");
    await mkdir(join(shortDir, "final"), { recursive: true });
    await writeFile(join(shortDir, "status.json"), JSON.stringify({
      version: 1,
      kind: "short-fiction",
      id: "night-ledger",
      status: "complete",
      stage: "complete",
      artifacts: ["shorts/night-ledger/final/full.md"],
      observations: [],
      updatedAt: "2026-08-31T12:00:00.000Z",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "short-story.json"), JSON.stringify({
      storyTitle: "The Night Ledger",
      chapters: [],
      rawContent: "# The Night Ledger",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "full.md"), "# The Night Ledger", "utf-8");

    const app = createStudioServer({} as never, root);
    const response = await app.request("/api/v1/shorts");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      shorts: [{
        storyId: "night-ledger",
        title: "The Night Ledger",
        finalMarkdownPath: "shorts/night-ledger/final/full.md",
        updatedAt: "2026-08-31T12:00:00.000Z",
      }],
    });
  });

  it("falls back to the story id when completed metadata has no usable title", async () => {
    const shortDir = join(root, "shorts", "untitled-short");
    await mkdir(join(shortDir, "final"), { recursive: true });
    await writeFile(join(shortDir, "status.json"), JSON.stringify({
      version: 1,
      kind: "short-fiction",
      id: "untitled-short",
      status: "complete",
      stage: "complete",
      artifacts: ["shorts/untitled-short/final/full.md"],
      observations: [],
      updatedAt: "2026-08-31T13:00:00.000Z",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "short-story.json"), JSON.stringify({
      storyTitle: "   ",
      chapters: [],
      rawContent: "# Untitled",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "full.md"), "# Untitled", "utf-8");

    const app = createStudioServer({} as never, root);
    const response = await app.request("/api/v1/shorts");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      shorts: [{
        storyId: "untitled-short",
        title: "untitled-short",
        finalMarkdownPath: "shorts/untitled-short/final/full.md",
        updatedAt: "2026-08-31T13:00:00.000Z",
      }],
    });
  });

  it("excludes a short whose durable run status is not complete", async () => {
    const shortDir = join(root, "shorts", "unfinished-short");
    await mkdir(join(shortDir, "final"), { recursive: true });
    await writeFile(join(shortDir, "status.json"), JSON.stringify({
      version: 1,
      kind: "short-fiction",
      id: "unfinished-short",
      status: "needs-review",
      stage: "complete",
      artifacts: ["shorts/unfinished-short/final/full.md"],
      observations: [],
      updatedAt: "2026-08-31T14:00:00.000Z",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "short-story.json"), JSON.stringify({
      storyTitle: "Unfinished Short",
      chapters: [],
      rawContent: "# Unfinished Short",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "full.md"), "# Unfinished Short", "utf-8");

    const app = createStudioServer({} as never, root);
    const response = await app.request("/api/v1/shorts");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shorts: [] });
  });
});
