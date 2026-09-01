import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "..", "..", "..", "..");
const temporaryRoots: string[] = [];

async function createReleaseFixture(version: string, scenario: string) {
  const root = await mkdtemp(join(tmpdir(), "inkos-release-flow-"));
  temporaryRoots.push(root);

  const scriptsDir = join(root, "scripts");
  const binDir = join(root, "bin");
  const commandLog = join(root, "commands.jsonl");
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  for (const script of [
    "release.mjs",
    "set-package-versions.mjs",
    "verify-no-workspace-protocol.mjs",
  ]) {
    await copyFile(resolve(workspaceRoot, "scripts", script), join(scriptsDir, script));
  }
  await copyFile(resolve(workspaceRoot, "release.sh"), join(root, "release.sh"));

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "inkos", version, private: true }, null, 2)}\n`,
  );

  for (const packageName of ["core", "studio", "cli"] as const) {
    const packageDir = join(root, "packages", packageName);
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      `${JSON.stringify(
        {
          name: packageName === "cli" ? "@kienmatu/inkos" : `@kienmatu/inkos-${packageName}`,
          version,
        },
        null,
        2,
      )}\n`,
    );
  }

  const fakeGit = `#!/bin/sh
printf '%s\\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "$@")" >> "$COMMAND_LOG"
case "$1 $2" in
  "status --porcelain") exit 0 ;;
  "rev-parse --abbrev-ref") printf '%s\\n' master; exit 0 ;;
  "rev-parse HEAD") printf '%s\\n' abc123; exit 0 ;;
  "rev-list -n") printf '%s\\n' "\${FAKE_TAG_COMMIT:-abc123}"; exit 0 ;;
  "tag --list") [ "$FAKE_TAG_EXISTS" = "true" ] && printf '%s\\n' "$3"; exit 0 ;;
  "checkout --") node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    for (const relative of ["package.json", "packages/core/package.json", "packages/studio/package.json", "packages/cli/package.json"]) {
      const manifestPath = path.join(process.env.FIXTURE_ROOT, relative);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.version = process.env.FIXTURE_VERSION;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
    }
  '; exit 0 ;;
esac
exit 0
`;

  const fakeNpm = `#!/bin/sh
printf '%s\\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "$@")" >> "$COMMAND_LOG"
if [ "$1" = "whoami" ]; then
  [ "$FAKE_NPM_SCENARIO" = "invalid-auth" ] && exit 1
  printf '%s\\n' kienmatu
  exit 0
fi
if [ "$1 $2" = "owner ls" ]; then
  [ "$FAKE_NPM_SCENARIO" = "no-access" ] && printf '%s\\n' '{"kienmatu-other":"other@example.com"}' && exit 0
  printf '%s\\n' '{"kienmatu":"owner@example.com"}'
  exit 0
fi
if [ "$1" = "view" ]; then
  spec="$2"
  field="$3"
  case "$FAKE_NPM_SCENARIO:$field:$spec" in
    success:dist-tags.latest:*) printf '%s\\n' '"1.1.0"'; exit 0 ;;
    success:version:*) printf '%s\\n' 'npm error code E404' >&2; exit 1 ;;
    local-mismatch:dist-tags.latest:*) printf '%s\\n' '"1.1.0"'; exit 0 ;;
    latest-mismatch:dist-tags.latest:*inkos-core) printf '%s\\n' '"1.1.0"'; exit 0 ;;
    latest-mismatch:dist-tags.latest:*) printf '%s\\n' '"1.0.0"'; exit 0 ;;
    version-gap:dist-tags.latest:*) printf '%s\\n' '"1.1.0"'; exit 0 ;;
    registry-drift:dist-tags.latest:*) [ -f "$REGISTRY_DRIFT_MARKER" ] && printf '%s\\n' '"1.2.0"' || printf '%s\\n' '"1.1.0"'; exit 0 ;;
    registry-drift:version:*) printf '%s\\n' 'npm error code E404' >&2; exit 1 ;;
    resume-gap:dist-tags.latest:*) printf '%s\\n' '"1.1.0"'; exit 0 ;;
    resume-gap:version:*) printf '%s\\n' 'npm error code E404' >&2; exit 1 ;;
    resume-partial:dist-tags.latest:*inkos-core) printf '%s\\n' '"1.2.0"'; exit 0 ;;
    resume-partial:dist-tags.latest:*) printf '%s\\n' '"1.1.0"'; exit 0 ;;
    resume-partial:version:*inkos-core@1.2.0) printf '%s\\n' '"1.2.0"'; exit 0 ;;
    resume-partial:version:*) printf '%s\\n' 'npm error code E404' >&2; exit 1 ;;
  esac
fi
exit 1
`;

  const fakePnpm = `#!/bin/sh
printf '%s\\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "$PWD" "$@")" >> "$COMMAND_LOG"
[ "$FAKE_NPM_SCENARIO" = "registry-drift" ] && [ "$1" = "build" ] && : > "$REGISTRY_DRIFT_MARKER"
exit 0
`;

  for (const [name, contents] of [
    ["git", fakeGit],
    ["npm", fakeNpm],
    ["pnpm", fakePnpm],
  ] as const) {
    const path = join(binDir, name);
    await writeFile(path, contents);
    await chmod(path, 0o755);
  }

  const env = {
    ...process.env,
    COMMAND_LOG: commandLog,
    FAKE_NPM_SCENARIO: scenario,
    FAKE_TAG_EXISTS: scenario.startsWith("resume-") ? "true" : "false",
    FAKE_TAG_COMMIT: "abc123",
    FIXTURE_ROOT: root,
    FIXTURE_VERSION: version,
    REGISTRY_DRIFT_MARKER: join(root, "registry-drifted"),
    PATH: `${binDir}:${process.env.PATH}`,
  };

  return { root, commandLog, env };
}

function runRelease(root: string, env: NodeJS.ProcessEnv, args: string[]) {
  return execFileSync("bash", [join(root, "release.sh"), ...args], {
    cwd: root,
    env,
    encoding: "utf-8",
    stdio: "pipe",
  });
}

async function readVersion(root: string) {
  return JSON.parse(await readFile(join(root, "package.json"), "utf-8")).version as string;
}

async function readCommands(commandLog: string) {
  const contents = await readFile(commandLog, "utf-8").catch(() => "");
  return contents
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// release.sh is a Bash entry point. Windows runs the rest of the CLI suite,
// while Unix CI exercises this wrapper with controlled POSIX command fakes.
describe.skipIf(process.platform === "win32")("release flow", () => {
  it("shows release help without pulling or changing Git state", async () => {
    const fixture = await createReleaseFixture("1.1.0", "invalid-auth");

    execFileSync("bash", [join(fixture.root, "release.sh"), "--help"], {
      cwd: fixture.root,
      env: fixture.env,
      encoding: "utf-8",
      stdio: "pipe",
    });

    expect(await readCommands(fixture.commandLog)).toEqual([]);
  });

  it("checks npm authentication before changing package versions", async () => {
    const fixture = await createReleaseFixture("1.1.0", "invalid-auth");

    expect(() => runRelease(fixture.root, fixture.env, ["patch", "--yes"])).toThrow();
    expect(await readVersion(fixture.root)).toBe("1.1.0");

    const commands = await readCommands(fixture.commandLog);
    expect(commands).toContainEqual(["whoami", "--registry", "https://registry.npmjs.org/"]);
    expect(
      commands.some(
        ([command, arg]) => command === "add" || command === "commit" || (command === "tag" && arg !== "--list"),
      ),
    ).toBe(false);
  });

  it("checks npm authentication even when publication is deferred", async () => {
    const fixture = await createReleaseFixture("1.1.0", "invalid-auth");

    expect(() => runRelease(fixture.root, fixture.env, ["patch", "--no-publish", "--yes"])).toThrow(
      /npm authentication failed/i,
    );
    expect(await readVersion(fixture.root)).toBe("1.1.0");
  });

  it("refuses when local manifests are ahead of the shared npm latest", async () => {
    const fixture = await createReleaseFixture("3.0.0", "local-mismatch");

    expect(() => runRelease(fixture.root, fixture.env, ["patch", "--yes"])).toThrow(
      /local version 3\.0\.0.*npm latest 1\.1\.0/is,
    );
    expect(await readVersion(fixture.root)).toBe("3.0.0");
  });

  it("checks package ownership before changing package versions", async () => {
    const fixture = await createReleaseFixture("1.1.0", "no-access");

    expect(() => runRelease(fixture.root, fixture.env, ["patch", "--yes"])).toThrow(
      /npm user kienmatu does not own @kienmatu\/inkos-core/i,
    );
    expect(await readVersion(fixture.root)).toBe("1.1.0");
  });

  it("refuses local package manifests that do not share one version", async () => {
    const fixture = await createReleaseFixture("1.1.0", "success");
    await writeFile(
      join(fixture.root, "packages", "studio", "package.json"),
      `${JSON.stringify({ name: "@kienmatu/inkos-studio", version: "1.0.0" }, null, 2)}\n`,
    );

    expect(() => runRelease(fixture.root, fixture.env, ["patch", "--yes"])).toThrow(
      /local package versions disagree/i,
    );
  });

  it("refuses when npm packages do not share one latest version", async () => {
    const fixture = await createReleaseFixture("1.1.0", "latest-mismatch");

    expect(() => runRelease(fixture.root, fixture.env, ["patch", "--yes"])).toThrow(
      /npm latest versions disagree/i,
    );
    expect(await readVersion(fixture.root)).toBe("1.1.0");
  });

  it("rejects an explicit version that skips the next semantic release", async () => {
    const fixture = await createReleaseFixture("1.1.0", "version-gap");

    expect(() => runRelease(fixture.root, fixture.env, ["3.0.0", "--yes"])).toThrow(
      /3\.0\.0.*1\.1\.0.*1\.1\.1.*1\.2\.0.*2\.0\.0/is,
    );
    expect(await readVersion(fixture.root)).toBe("1.1.0");
  });

  it("aborts and restores manifests if npm advances during verification", async () => {
    const fixture = await createReleaseFixture("1.1.0", "registry-drift");

    expect(() => runRelease(fixture.root, fixture.env, ["patch", "--no-test", "--yes"])).toThrow(
      /npm registry changed during verification/i,
    );
    expect(await readVersion(fixture.root)).toBe("1.1.0");

    const commands = await readCommands(fixture.commandLog);
    expect(
      commands.filter(([command, arg]) => command === "commit" || (command === "tag" && arg !== "--list")),
    ).toEqual([]);
    expect(commands.filter((args) => args[1] === "publish")).toEqual([]);
  });

  it("publishes a valid normal release through the shell entry point", async () => {
    const fixture = await createReleaseFixture("1.1.0", "success");

    runRelease(fixture.root, fixture.env, ["patch", "--no-test", "--yes"]);

    expect(await readVersion(fixture.root)).toBe("1.1.1");
    const commands = await readCommands(fixture.commandLog);
    expect(commands).toContainEqual(["commit", "-m", "chore: bump version to 1.1.1"]);
    expect(commands).toContainEqual(["tag", "-a", "v1.1.1", "-m", "Release 1.1.1"]);
    expect(commands.filter((args) => args[1] === "publish").map(([cwd]) => cwd.slice(cwd.lastIndexOf("/") + 1))).toEqual([
      "core",
      "studio",
      "cli",
    ]);
  });

  it("resumes only missing packages from a valid partial release", async () => {
    const fixture = await createReleaseFixture("1.2.0", "resume-partial");

    runRelease(fixture.root, fixture.env, ["--resume", "--no-test", "--yes"]);

    const commands = await readCommands(fixture.commandLog);
    const publishes = commands.filter((args) => args[1] === "publish");
    expect(publishes).toHaveLength(2);
    expect(publishes.map(([cwd]) => cwd.slice(cwd.lastIndexOf("/") + 1))).toEqual(["studio", "cli"]);
    expect(
      commands.filter(([command, arg]) => command === "commit" || (command === "tag" && arg !== "--list")),
    ).toEqual([]);
  });

  it("refuses resume when the release tag is missing", async () => {
    const fixture = await createReleaseFixture("1.2.0", "resume-partial");
    fixture.env.FAKE_TAG_EXISTS = "false";

    expect(() => runRelease(fixture.root, fixture.env, ["--resume", "--no-test", "--yes"])).toThrow(
      /tag v1\.2\.0 does not exist/i,
    );
  });

  it("refuses resume when the release tag does not point to HEAD", async () => {
    const fixture = await createReleaseFixture("1.2.0", "resume-partial");
    fixture.env.FAKE_TAG_COMMIT = "deadbeef";

    expect(() => runRelease(fixture.root, fixture.env, ["--resume", "--no-test", "--yes"])).toThrow(
      /v1\.2\.0 does not point to HEAD/i,
    );
  });

  it("does not let resume bypass semantic version continuity", async () => {
    const fixture = await createReleaseFixture("3.0.0", "resume-gap");

    expect(() => runRelease(fixture.root, fixture.env, ["--resume", "--no-test", "--yes"])).toThrow(
      /3\.0\.0.*1\.1\.0.*1\.1\.1.*1\.2\.0.*2\.0\.0/is,
    );

    const commands = await readCommands(fixture.commandLog);
    expect(commands.filter((args) => args[1] === "publish")).toEqual([]);
  });
});
