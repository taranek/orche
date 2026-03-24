#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, "../packages/cli/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

const bump = process.argv[2] || "--patch";

if (!["--major", "--minor", "--patch"].includes(bump)) {
  console.error("usage: release-cli [--major | --minor | --patch] (default: --patch)");
  process.exit(1);
}

// Bump version
const [major, minor, patch] = pkg.version.split(".").map(Number);
const newVersion =
  bump === "--major" ? `${major + 1}.0.0` :
  bump === "--minor" ? `${major}.${minor + 1}.0` :
  `${major}.${minor}.${patch + 1}`;

const tag = `cli-v${newVersion}`;

// Check for uncommitted changes
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

// Build, commit, tag
execSync("pnpm --filter @taranek/orche build", { stdio: "inherit" });
execSync(`git add "${pkgPath}"`, { stdio: "inherit" });
execSync(`git commit -m "release: cli v${newVersion}"`, { stdio: "inherit" });
execSync(`git tag ${tag}`, { stdio: "inherit" });

console.log(`pushing ${tag}...`);
execSync(`git push origin HEAD ${tag}`, { stdio: "inherit" });

console.log(`\ndone — ${tag} pushed, GitHub Actions will publish to npm`);
console.log(`  https://github.com/taranek/orche/actions`);
console.log(`  https://www.npmjs.com/package/@taranek/orche`);
