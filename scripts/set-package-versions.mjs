import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const [version, ...rest] = argv;
  // Every argv position that is not a known flag is read as the version, so an
  // unrecognized flag would otherwise be stamped into every manifest as one.
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(
      `Invalid version: ${version ?? "(missing)"}\n`
      + "Usage: node scripts/set-package-versions.mjs <version> [--root <path>] [--keep-workspace-protocol]",
    );
  }

  let root = process.cwd();
  let keepWorkspaceProtocol = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--root") {
      root = rest[i + 1];
      i += 1;
    } else if (rest[i] === "--keep-workspace-protocol") {
      keepWorkspaceProtocol = true;
    }
  }

  return { version, root: resolve(root), keepWorkspaceProtocol };
}

async function loadWorkspacePackages(root) {
  const packagesDir = join(root, "packages");
  const entries = await readdir(packagesDir);
  const packages = [];

  for (const entry of entries) {
    try {
      const dir = join(packagesDir, entry);
      const packageJsonPath = join(dir, "package.json");
      const pkg = JSON.parse(await readFile(packageJsonPath, "utf-8"));
      packages.push({ dir, packageJsonPath, pkg });
    } catch {
      // ignore non-package directories
    }
  }

  return packages;
}

function rewriteDependencyVersions(pkg, workspacePackageNames, version, keepWorkspaceProtocol) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
    const deps = pkg[field];
    if (!deps) continue;

    for (const name of Object.keys(deps)) {
      if (!workspacePackageNames.has(name)) continue;

      // A local release commits this tree, and the committed source is meant to keep
      // workspace:* — the prepack hook resolves it at pack time. Only a throwaway
      // publish tree (CI) wants the specifier pinned to a concrete version here.
      if (keepWorkspaceProtocol && typeof deps[name] === "string" && deps[name].startsWith("workspace:")) {
        continue;
      }

      deps[name] = version;
    }
  }
}

async function main() {
  const { version, root, keepWorkspaceProtocol } = parseArgs(process.argv.slice(2));
  const workspacePackages = await loadWorkspacePackages(root);
  const workspacePackageNames = new Set(workspacePackages.map(({ pkg }) => pkg.name));

  const rootPackageJsonPath = join(root, "package.json");
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf-8"));
  rootPackageJson.version = version;
  await writeFile(rootPackageJsonPath, `${JSON.stringify(rootPackageJson, null, 2)}\n`, "utf-8");

  for (const workspacePackage of workspacePackages) {
    workspacePackage.pkg.version = version;
    rewriteDependencyVersions(workspacePackage.pkg, workspacePackageNames, version, keepWorkspaceProtocol);
    await writeFile(
      workspacePackage.packageJsonPath,
      `${JSON.stringify(workspacePackage.pkg, null, 2)}\n`,
      "utf-8",
    );
  }
}

await main();
