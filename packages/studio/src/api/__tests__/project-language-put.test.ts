import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStudioServer } from "../server.js";

const INKOS_CONFIG = JSON.stringify({
  name: "test-project",
  version: "0.1.0",
  language: "zh",
  llm: { model: "test-model", provider: "anthropic" },
  notify: [],
});

describe("PUT /api/v1/project language", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-studio-project-put-"));
    await writeFile(join(root, "inkos.json"), INKOS_CONFIG, "utf-8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("persists a switch to Vietnamese", async () => {
    const app = createStudioServer({} as never, root);

    const res = await app.request("/api/v1/project", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "vi" }),
    });
    expect(res.status).toBe(200);

    const persisted = JSON.parse(await readFile(join(root, "inkos.json"), "utf-8"));
    expect(persisted.language).toBe("vi");

    const getRes = await app.request("/api/v1/project");
    const getJson = await getRes.json() as { language: string };
    expect(getJson.language).toBe("vi");
  });

  it("still persists zh and en (legacy behavior preserved)", async () => {
    const app = createStudioServer({} as never, root);

    await app.request("/api/v1/project", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "en" }),
    });
    let persisted = JSON.parse(await readFile(join(root, "inkos.json"), "utf-8"));
    expect(persisted.language).toBe("en");

    await app.request("/api/v1/project", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "zh" }),
    });
    persisted = JSON.parse(await readFile(join(root, "inkos.json"), "utf-8"));
    expect(persisted.language).toBe("zh");
  });
});
