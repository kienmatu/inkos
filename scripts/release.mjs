/**
 * Release driver — bump version, build, test, commit, tag, publish.
 *
 *   node scripts/release.mjs                 # patch: 0.1.3 -> 0.1.4
 *   node scripts/release.mjs minor           # minor: 0.1.3 -> 0.2.0
 *   node scripts/release.mjs major           # major: 0.1.3 -> 1.0.0
 *   node scripts/release.mjs 0.4.0           # explicit version
 *
 * Flags:
 *   --dry-run      run every step except commit/tag/publish, print what would happen
 *   --no-publish   bump + build + test + commit + tag, skip npm publish
 *   --no-test      skip `pnpm test`
 *   --push         push the commit and tag to origin after a successful publish
 *   --yes          skip the confirmation prompt
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Publish order matters: dependents must find the new core on the registry.
const PUBLISH_ORDER = ["core", "studio", "cli"];

const USAGE = `Release driver — bump version, build, test, commit, tag, publish.

Usage
  node scripts/release.mjs [patch|minor|major|<version>] [flags]
  ./release.sh [patch|minor|major|<version>] [flags]

Version argument (default: patch)
  patch        0.1.3 -> 0.1.4
  minor        0.1.3 -> 0.2.0
  major        0.1.3 -> 1.0.0
  <version>    an explicit version, e.g. 0.4.0

Flags
  --dry-run     bump, build and test, then revert — no commit, tag or publish
  --no-publish  bump, build, test, commit and tag, but skip npm publish
  --no-test     skip \`pnpm test\`
  --push        push the commit and tag to origin after a successful publish
  -y, --yes     skip the confirmation prompt
  -h, --help    show this help

Steps
  1. preflight   clean working tree, unused tag, print the plan, confirm
  2. bump        root + every package manifest (internal deps stay workspace:*)
  3. verify      pnpm build, pnpm test, publish-manifest check
                 (a failure here reverts the bump)
  4. commit      "chore: bump version to X.Y.Z" + tag vX.Y.Z
  5. publish     core -> studio -> cli, so dependents resolve the new core

Examples
  ./release.sh minor --dry-run
  ./release.sh minor --push -y
  ./release.sh 0.4.0 --no-publish
`;

function parseArgs(argv) {
  const options = {
    bump: "patch",
    dryRun: false,
    publish: true,
    test: true,
    push: false,
    yes: false,
    help: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--dry-run": options.dryRun = true; break;
      case "--no-publish": options.publish = false; break;
      case "--no-test": options.test = false; break;
      case "--push": options.push = true; break;
      case "--yes":
      case "-y": options.yes = true; break;
      case "--help":
      case "-h": options.help = true; break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}\nRun with --help for usage.`);
        options.bump = arg;
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

function capture(command, args, { cwd = root } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stderr ?? ""}`);
  }
  return result.stdout.trim();
}

function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bump)) return bump;

  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(current);
  if (!match) throw new Error(`Cannot parse current version: ${current}`);
  const [major, minor, patch] = match.slice(1).map(Number);

  switch (bump) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
    default: throw new Error(`Unknown bump: ${bump} (use patch | minor | major | <version>)`);
  }
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

  // 1. Preflight — a dirty tree would get swept into the version commit.
  const status = capture("git", ["status", "--porcelain"]);
  if (status) {
    throw new Error(`Working tree is not clean. Commit or stash first:\n${status}`);
  }

  const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
  const current = rootPkg.version;
  const version = nextVersion(current, options.bump);
  const tag = `v${version}`;

  if (capture("git", ["tag", "--list", tag])) {
    throw new Error(`Tag ${tag} already exists.`);
  }

  console.log(`\nRelease plan`);
  console.log(`  branch    ${branch}`);
  console.log(`  version   ${current} -> ${version}`);
  console.log(`  build     pnpm build`);
  console.log(`  test      ${options.test ? "pnpm test" : "skipped"}`);
  console.log(`  commit    chore: bump version to ${version}  (+ tag ${tag})`);
  console.log(`  publish   ${options.publish ? PUBLISH_ORDER.map((p) => `packages/${p}`).join(", ") : "skipped"}`);
  console.log(`  push      ${options.push ? "origin " + branch + " + " + tag : "skipped"}`);
  if (options.dryRun) console.log(`  MODE      dry run — no commit, no tag, no publish`);

  if (!options.yes && !(await confirm("\nProceed?"))) {
    console.log("Aborted.");
    process.exit(1);
  }

  // 2. Bump every manifest. Internal deps keep workspace:* — this tree gets committed,
  //    and prepack resolves the specifier at publish time.
  run("node", [join(root, "scripts", "set-package-versions.mjs"), version, "--root", root,
    "--keep-workspace-protocol"]);

  // 3. Build and test against the bumped versions. On failure, roll the bump back.
  try {
    run("pnpm", ["build"]);
    if (options.test) run("pnpm", ["test"]);
    run("node", [join(root, "scripts", "verify-no-workspace-protocol.mjs"),
      "packages/core", "packages/cli", "packages/studio"]);
  } catch (error) {
    console.error("\nBuild/test failed — reverting the version bump.");
    run("git", ["checkout", "--", "package.json", "packages"], { allowFailure: true });
    throw error;
  }

  if (options.dryRun) {
    console.log(`\nDry run complete. Reverting the version bump.`);
    run("git", ["checkout", "--", "package.json", "packages"], { allowFailure: true });
    return;
  }

  // 4. Commit and tag the bump before anything reaches the registry.
  run("git", ["add", "package.json", "packages"]);
  run("git", ["commit", "-m", `chore: bump version to ${version}`]);
  run("git", ["tag", "-a", tag, "-m", `Release ${version}`]);

  // 5. Publish. prepack rewrites workspace:* to the real version, postpack restores it.
  if (options.publish) {
    for (const pkg of PUBLISH_ORDER) {
      run("pnpm", ["publish", "--access", "public", "--no-git-checks"], {
        cwd: join(root, "packages", pkg),
      });
    }
  }

  if (options.push) {
    run("git", ["push", "origin", branch]);
    run("git", ["push", "origin", tag]);
  }

  console.log(`\nDone: ${version} committed${options.publish ? " and published" : ""}${options.push ? " and pushed" : ""}.`);
  if (!options.push) console.log(`Remember: git push origin ${branch} && git push origin ${tag}`);
}

await main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
