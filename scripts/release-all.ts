#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bump = process.argv[2] || "--patch";

if (!["--major", "--minor", "--patch"].includes(bump)) {
  console.error("usage: release [--major | --minor | --patch] (default: --patch)");
  process.exit(1);
}

// Check for uncommitted changes
const status = execSync("git status --porcelain").toString().trim();
if (status) {
  console.error("error: uncommitted changes — commit or stash before releasing");
  process.exit(1);
}

function bumpVersion(currentVersion: string): string {
  const [major, minor, patch] = currentVersion.split(".").map(Number);
  return bump === "--major" ? `${major + 1}.0.0` :
    bump === "--minor" ? `${major}.${minor + 1}.0` :
    `${major}.${minor}.${patch + 1}`;
}

// Bump both packages
const packages = [
  { name: "cli", dir: "packages/cli" },
  { name: "review", dir: "packages/review" },
];

const versions: Record<string, string> = {};

for (const pkg of packages) {
  const pkgPath = path.resolve(__dirname, "..", pkg.dir, "package.json");
  const pkgJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const newVersion = bumpVersion(pkgJson.version);
  console.log(`${pkg.name}: ${pkgJson.version} → ${newVersion}`);
  pkgJson.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
  versions[pkg.name] = newVersion;
}

// Build CLI
execSync("pnpm --filter @orche/cli build", { stdio: "inherit" });

// Single commit with both bumps
execSync("git add packages/cli/package.json packages/review/package.json", { stdio: "inherit" });
execSync(`git commit -m "release: cli v${versions.cli} + review v${versions.review}"`, { stdio: "inherit" });

// Tag both
execSync(`git tag cli-v${versions.cli}`, { stdio: "inherit" });
execSync(`git tag review-v${versions.review}`, { stdio: "inherit" });

// Publish CLI to npm
console.log(`\npublishing @orche/cli@${versions.cli} to npm...`);
execSync("npm publish --access public", {
  cwd: path.resolve(__dirname, "../packages/cli"),
  stdio: "inherit",
});

// Push commit + both tags (review tag triggers GH Actions)
console.log("pushing...");
execSync(`git push origin HEAD cli-v${versions.cli} review-v${versions.review}`, { stdio: "inherit" });

console.log(`\ndone:`);
console.log(`  cli    → npm @orche/cli@${versions.cli}`);
console.log(`  review → GitHub Actions building review-v${versions.review}`);
console.log(`  https://github.com/taranek/orche/actions`);
