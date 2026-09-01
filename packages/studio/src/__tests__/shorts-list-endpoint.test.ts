import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
        status: "complete",
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
        status: "complete",
        finalMarkdownPath: "shorts/untitled-short/final/full.md",
        updatedAt: "2026-08-31T13:00:00.000Z",
      }],
    });
  });

  it("returns a needs-review short when its final artifact is available", async () => {
    const shortDir = join(root, "shorts", "reviewable-short");
    await mkdir(join(shortDir, "final"), { recursive: true });
    await writeFile(join(shortDir, "status.json"), JSON.stringify({
      version: 1,
      kind: "short-fiction",
      id: "reviewable-short",
      status: "needs-review",
      stage: "complete",
      artifacts: ["shorts/reviewable-short/final/full.md"],
      observations: [{
        metric: "chapter-1-length",
        expected: { min: 655, max: 1145, unit: "en_words" },
        actual: { value: 1710, unit: "en_words" },
        severity: "blocking",
        evidence: "chapter 1",
        repairable: true,
      }],
      updatedAt: "2026-08-31T14:00:00.000Z",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "short-story.json"), JSON.stringify({
      storyTitle: "Reviewable Short",
      chapters: [],
      rawContent: "# Reviewable Short",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "full.md"), "# Reviewable Short", "utf-8");

    const app = createStudioServer({} as never, root);
    const response = await app.request("/api/v1/shorts");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      shorts: [{
        storyId: "reviewable-short",
        title: "Reviewable Short",
        status: "needs-review",
        finalMarkdownPath: "shorts/reviewable-short/final/full.md",
        updatedAt: "2026-08-31T14:00:00.000Z",
      }],
    });
  });

  it("excludes a needs-review short whose final Markdown path is not a readable file", async () => {
    const shortDir = join(root, "shorts", "broken-short");
    await mkdir(join(shortDir, "final", "full.md"), { recursive: true });
    await writeFile(join(shortDir, "status.json"), JSON.stringify({
      version: 1,
      kind: "short-fiction",
      id: "broken-short",
      status: "needs-review",
      stage: "complete",
      artifacts: ["shorts/broken-short/final/full.md"],
      observations: [],
      updatedAt: "2026-08-31T15:00:00.000Z",
    }), "utf-8");
    await writeFile(join(shortDir, "final", "short-story.json"), JSON.stringify({
      storyTitle: "Broken Short",
      chapters: [],
      rawContent: "# Broken Short",
    }), "utf-8");

    const app = createStudioServer({} as never, root);
    const response = await app.request("/api/v1/shorts");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shorts: [] });
  });
});

describe("POST /api/v1/shorts/:id/complete", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "short-complete-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("marks a needs-review short complete without discarding its review evidence", async () => {
    const shortDir = join(root, "shorts", "reviewable-short");
    const observations = [{
      metric: "chapter-1-length",
      expected: { min: 655, max: 1145, unit: "en_words" },
      actual: { value: 1710, unit: "en_words" },
      severity: "blocking",
      evidence: "chapter 1",
      repairable: true,
    }];
    await mkdir(shortDir, { recursive: true });
    await writeFile(join(shortDir, "status.json"), JSON.stringify({
      version: 1,
      kind: "short-fiction",
      id: "reviewable-short",
      status: "needs-review",
      stage: "complete",
      artifacts: ["shorts/reviewable-short/final/full.md"],
      observations,
      updatedAt: "2026-08-31T14:00:00.000Z",
    }), "utf-8");

    const app = createStudioServer({} as never, root);
    const response = await app.request("/api/v1/shorts/reviewable-short/complete", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      storyId: "reviewable-short",
      status: "complete",
    });
    const persisted = JSON.parse(await readFile(join(shortDir, "status.json"), "utf-8"));
    expect(persisted).toMatchObject({
      version: 1,
      kind: "short-fiction",
      id: "reviewable-short",
      status: "complete",
      stage: "complete",
      observations,
    });
    expect(persisted.updatedAt).not.toBe("2026-08-31T14:00:00.000Z");
  });

  it("rejects an unsafe short id before resolving its status file", async () => {
    const app = createStudioServer({} as never, root);

    const response = await app.request("/api/v1/shorts/not:safe/complete", { method: "POST" });

    expect(response.status).toBe(400);
  });
});
