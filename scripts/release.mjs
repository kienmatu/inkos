/**
 * Release driver — validate registry state, bump, build, test, commit, tag, publish.
 *
 *   node scripts/release.mjs                 # patch
 *   node scripts/release.mjs minor           # minor
 *   node scripts/release.mjs major           # major
 *   node scripts/release.mjs 1.2.0           # explicit next semantic release
 *   node scripts/release.mjs --resume        # finish an existing tagged release
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org/";
const PUBLISH_PACKAGES = [
  { dir: "core", name: "@kienmatu/inkos-core" },
  { dir: "studio", name: "@kienmatu/inkos-studio" },
  { dir: "cli", name: "@kienmatu/inkos" },
];

const USAGE = `Release driver — validate registry state, bump, build, test, commit, tag, publish.

Usage
  node scripts/release.mjs [patch|minor|major|<version>] [flags]
  ./release.sh [patch|minor|major|<version>] [flags]
  ./release.sh --resume [flags]

Version argument (default: patch)
  patch        publish the next patch after npm latest
  minor        publish the next minor after npm latest
  major        publish the next major after npm latest
  <version>    one of those exact next versions

Flags
  --dry-run     bump, build and test, then revert — no commit, tag or publish
  --no-publish  bump, build, test, commit and tag, but skip npm publish
  --no-test     skip \`pnpm test\`
  --resume      publish packages missing from the release tagged at HEAD
  --push        push the commit and tag to origin after a successful publish
  -y, --yes     skip the confirmation prompt
  -h, --help    show this help

Steps
  1. preflight   clean tree, npm registry continuity, authentication and access
  2. bump        root + every package manifest (internal deps stay workspace:*)
  3. verify      pnpm build, pnpm test, publish-manifest check
  4. commit      "chore: bump version to X.Y.Z" + tag vX.Y.Z
  5. publish     core -> studio -> cli; --resume skips versions already present

Examples
  ./release.sh minor --dry-run
  ./release.sh minor --push -y
  ./release.sh 1.2.0 --no-publish
  ./release.sh --resume --push -y
`;

function parseArgs(argv) {
  const options = {
    bump: "patch",
    bumpProvided: false,
    dryRun: false,
    publish: true,
    test: true,
    resume: false,
    push: false,
    yes: false,
    help: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--dry-run": options.dryRun = true; break;
      case "--no-publish": options.publish = false; break;
      case "--no-test": options.test = false; break;
      case "--resume": options.resume = true; break;
      case "--push": options.push = true; break;
      case "--yes":
      case "-y": options.yes = true; break;
      case "--help":
      case "-h": options.help = true; break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}\nRun with --help for usage.`);
        if (options.bumpProvided) throw new Error(`Multiple version arguments: ${options.bump} and ${arg}`);
        options.bump = arg;
        options.bumpProvided = true;
    }
  }
  return options;
}

function run(command, args, { cwd = root, allowFailure = false } = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Command failed (exit ${result.status}): ${command} ${args.join(" ")}`);
  }
  return result.status ?? 1;
}

function captureResult(command, args, { cwd = root } = {}) {
  return spawnSync(command, args, { cwd, encoding: "utf-8" });
}

function capture(command, args, { cwd = root } = {}) {
  const result = captureResult(command, args, { cwd });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stderr ?? ""}`);
  }
  return result.stdout.trim();
}

function parseJsonOutput(output, description) {
  try {
    return JSON.parse(output.trim());
  } catch {
    throw new Error(`Could not parse ${description}: ${output.trim() || "empty output"}`);
  }
}

function containsExactJsonValue(value, expected) {
  if (typeof value === "string") return value === expected;
  if (Array.isArray(value)) return value.some((item) => containsExactJsonValue(item, expected));
  if (value && typeof value === "object") {
    return Object.hasOwn(value, expected) || Object.values(value).some((item) => containsExactJsonValue(item, expected));
  }
  return false;
}

function allowedNextVersions(current) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`npm latest is not a stable semantic version: ${current}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  return [`${major}.${minor}.${patch + 1}`, `${major}.${minor + 1}.0`, `${major + 1}.0.0`];
}

function nextVersion(current, bump) {
  const [patchVersion, minorVersion, majorVersion] = allowedNextVersions(current);
  if (/^\d+\.\d+\.\d+$/.test(bump)) {
    const allowed = [patchVersion, minorVersion, majorVersion];
    if (!allowed.includes(bump)) {
      throw new Error(
        `Requested version ${bump} is not the next semantic release after npm latest ${current}. ` +
          `Allowed: ${allowed.join(", ")}.`,
      );
    }
    return bump;
  }
  switch (bump) {
    case "patch": return patchVersion;
    case "minor": return minorVersion;
    case "major": return majorVersion;
    default: throw new Error(`Unknown bump: ${bump} (use patch | minor | major | <version>)`);
  }
}

async function readLocalRelease() {
  const manifests = [
    { label: "root", path: join(root, "package.json") },
    ...PUBLISH_PACKAGES.map(({ dir, name }) => ({ label: name, path: join(root, "packages", dir, "package.json") })),
  ];
  const versions = [];
  for (const manifest of manifests) {
    const parsed = JSON.parse(await readFile(manifest.path, "utf-8"));
    versions.push({ label: manifest.label, version: parsed.version });
  }
  const unique = [...new Set(versions.map(({ version }) => version))];
  if (unique.length !== 1) {
    throw new Error(`Local package versions disagree: ${versions.map(({ label, version }) => `${label}=${version}`).join(", ")}`);
  }
  return unique[0];
}

function verifyNpmAccess() {
  let identity;
  try {
    identity = capture("npm", ["whoami", "--registry", REGISTRY]);
  } catch {
    throw new Error(`npm authentication failed. Run: npm login --registry=${REGISTRY}`);
  }

  for (const { name } of PUBLISH_PACKAGES) {
    let output;
    try {
      output = capture("npm", ["owner", "ls", name, "--json", "--registry", REGISTRY]);
    } catch {
      throw new Error(`npm user ${identity} cannot verify ownership of ${name}.`);
    }
    const owners = parseJsonOutput(output, `npm owners for ${name}`);
    if (!containsExactJsonValue(owners, identity)) {
      throw new Error(`npm user ${identity} does not own ${name}.`);
    }
  }
}

function npmLatest(name) {
  const output = capture("npm", ["view", name, "dist-tags.latest", "--json", "--registry", REGISTRY]);
  const version = parseJsonOutput(output, `npm latest for ${name}`);
  if (typeof version !== "string") throw new Error(`npm latest for ${name} is not a version string.`);
  return version;
}

function npmHasVersion(name, version) {
  const result = captureResult("npm", ["view", `${name}@${version}`, "version", "--json", "--registry", REGISTRY]);
  if (result.status === 0) return true;
  const error = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/E404|404 Not Found/i.test(error)) return false;
  throw new Error(`Could not check ${name}@${version} on npm:\n${error.trim()}`);
}

function registryState(target) {
  return PUBLISH_PACKAGES.map((pkg) => ({
    ...pkg,
    latest: npmLatest(pkg.name),
    targetPublished: target ? npmHasVersion(pkg.name, target) : false,
  }));
}

function sharedVersion(states, field, description) {
  const values = [...new Set(states.map((state) => state[field]))];
  if (values.length !== 1) {
    throw new Error(`${description} disagree: ${states.map((state) => `${state.name}=${state[field]}`).join(", ")}`);
  }
  return values[0];
}

function planResume(localVersion, states) {
  for (const state of states) {
    if (state.targetPublished && state.latest !== localVersion) {
      throw new Error(`${state.name}@${localVersion} exists, but its latest tag is ${state.latest}.`);
    }
    if (!state.targetPublished && state.latest === localVersion) {
      throw new Error(`${state.name} reports latest ${localVersion}, but that exact version is missing.`);
    }
  }

  const unfinished = states.filter(({ latest }) => latest !== localVersion);
  if (unfinished.length > 0) {
    const base = sharedVersion(unfinished, "latest", "Unfinished packages' npm latest versions");
    nextVersion(base, localVersion);
  }
  return states.filter(({ targetPublished }) => !targetPublished);
}

function planNewRelease(baseVersion, targetVersion) {
  const states = registryState(targetVersion);
  const latest = sharedVersion(states, "latest", "npm latest versions");
  if (latest !== baseVersion) {
    throw new Error(
      `npm registry changed during verification: expected latest ${baseVersion}, found ${latest}. Restart the release.`,
    );
  }
  const existing = states.filter(({ targetPublished }) => targetPublished);
  if (existing.length > 0) {
    throw new Error(`${targetVersion} already exists for ${existing.map(({ name }) => name).join(", ")}; use --resume.`);
  }
  return states;
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (options.resume && options.bumpProvided) throw new Error(`--resume does not accept a version argument.`);
  if (options.resume && !options.publish) throw new Error(`--resume cannot be combined with --no-publish.`);
  if (options.resume && options.dryRun) throw new Error(`--resume cannot be combined with --dry-run.`);

  const status = capture("git", ["status", "--porcelain"]);
  if (status) throw new Error(`Working tree is not clean. Commit or stash first:\n${status}`);

  const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const current = await readLocalRelease();
  verifyNpmAccess();

  let version;
  let baseVersion;
  let packagesToPublish;
  if (options.resume) {
    version = current;
    const resumeTag = `v${version}`;
    if (!capture("git", ["tag", "--list", resumeTag])) {
      throw new Error(`Cannot resume: tag ${resumeTag} does not exist.`);
    }
    const tagCommit = capture("git", ["rev-list", "-n", "1", resumeTag]);
    const headCommit = capture("git", ["rev-parse", "HEAD"]);
    if (tagCommit !== headCommit) throw new Error(`Cannot resume: ${resumeTag} does not point to HEAD.`);
    packagesToPublish = planResume(version, registryState(version));
  } else {
    const latest = sharedVersion(registryState(), "latest", "npm latest versions");
    if (current !== latest) {
      throw new Error(`Refusing release: local version ${current} does not match npm latest ${latest}.`);
    }
    baseVersion = latest;
    version = nextVersion(latest, options.bump);
    packagesToPublish = planNewRelease(baseVersion, version);
  }

  const tag = `v${version}`;
  if (!options.resume && capture("git", ["tag", "--list", tag])) {
    throw new Error(`Tag ${tag} already exists.`);
  }

  console.log(`\nRelease plan`);
  console.log(`  branch    ${branch}`);
  console.log(`  version   ${options.resume ? `${version} (resume)` : `${current} -> ${version}`}`);
  console.log(`  build     pnpm build`);
  console.log(`  test      ${options.test ? "pnpm test" : "skipped"}`);
  console.log(`  commit    ${options.resume ? "existing commit and tag" : `chore: bump version to ${version}  (+ tag ${tag})`}`);
  console.log(`  publish   ${options.publish ? packagesToPublish.map(({ dir }) => `packages/${dir}`).join(", ") || "nothing missing" : "skipped"}`);
  console.log(`  push      ${options.push ? `origin ${branch} + ${tag}` : "skipped"}`);
  if (options.dryRun) console.log(`  MODE      dry run — no commit, no tag, no publish`);

  if (!options.yes && !(await confirm("\nProceed?"))) {
    console.log("Aborted.");
    process.exit(1);
  }

  if (!options.resume) {
    run("node", [join(root, "scripts", "set-package-versions.mjs"), version, "--root", root, "--keep-workspace-protocol"]);
  }

  try {
    run("pnpm", ["build"]);
    if (options.test) run("pnpm", ["test"]);
    run("node", [join(root, "scripts", "verify-no-workspace-protocol.mjs"), "packages/core", "packages/cli", "packages/studio"]);
    verifyNpmAccess();
    packagesToPublish = options.resume
      ? planResume(version, registryState(version))
      : planNewRelease(baseVersion, version);
  } catch (error) {
    if (!options.resume) {
      console.error("\nBuild/test failed — reverting the version bump.");
      run("git", ["checkout", "--", "package.json", "packages"], { allowFailure: true });
    }
    throw error;
  }

  if (options.dryRun) {
    console.log(`\nDry run complete. Reverting the version bump.`);
    run("git", ["checkout", "--", "package.json", "packages"], { allowFailure: true });
    return;
  }

  if (!options.resume) {
    run("git", ["add", "package.json", "packages"]);
    run("git", ["commit", "-m", `chore: bump version to ${version}`]);
    run("git", ["tag", "-a", tag, "-m", `Release ${version}`]);
  }

  if (options.publish) {
    for (const pkg of PUBLISH_PACKAGES) {
      const stillMissing = planResume(version, registryState(version));
      if (!stillMissing.some(({ name }) => name === pkg.name)) continue;
      run("pnpm", ["publish", "--access", "public", "--no-git-checks"], {
        cwd: join(root, "packages", pkg.dir),
      });
    }
  }

  if (options.push) {
    run("git", ["push", "origin", branch]);
    run("git", ["push", "origin", tag]);
  }

  console.log(`\nDone: ${version}${options.resume ? " resumed" : " committed"}${options.publish ? " and published" : ""}${options.push ? " and pushed" : ""}.`);
  if (!options.push) console.log(`Remember: git push origin ${branch} && git push origin ${tag}`);
}

await main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
