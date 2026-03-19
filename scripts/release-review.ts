#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, "../packages/review/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

const bump = process.argv[2] || "--patch";

if (!["--major", "--minor", "--patch"].includes(bump)) {
  console.error("usage: release-review [--major | --minor | --patch] (default: --patch)");
  process.exit(1);
}

// Bump version
const [major, minor, patch] = pkg.version.split(".").map(Number);
const newVersion =
  bump === "--major" ? `${major + 1}.0.0` :
  bump === "--minor" ? `${major}.${minor + 1}.0` :
  `${major}.${minor}.${patch + 1}`;

const tag = `review-v${newVersion}`;

// Check for uncommitted changes (besides the bump we're about to make)
const status = execSync("git status --porcelain").toString().trim();
if (status) {
  console.error("error: uncommitted changes — commit or stash before releasing");
  process.exit(1);
}

// Check tag doesn't already exist
try {
  execSync(`git rev-parse ${tag}`, { stdio: "ignore" });
  console.error(`error: tag ${tag} already exists`);
  process.exit(1);
} catch {
  // tag doesn't exist, good
}

// Write bumped version
console.log(`${pkg.version} → ${newVersion}`);
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Commit and tag
execSync(`git add "${pkgPath}"`, { stdio: "inherit" });
execSync(`git commit -m "release: review app ${tag}"`, { stdio: "inherit" });
execSync(`git tag ${tag}`, { stdio: "inherit" });

console.log(`pushing ${tag}...`);
execSync(`git push origin HEAD ${tag}`, { stdio: "inherit" });

console.log(`\ndone — ${tag} pushed, GitHub Actions will build the binaries`);
console.log(`https://github.com/taranek/orche/actions`);
