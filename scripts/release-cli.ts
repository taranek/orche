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

// Check for uncommitted changes
const status = execSync("git status --porcelain").toString().trim();
if (status) {
  console.error("error: uncommitted changes — commit or stash before releasing");
  process.exit(1);
}

// Write bumped version
console.log(`${pkg.version} → ${newVersion}`);
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Build, commit, publish
execSync("pnpm --filter @orche/cli build", { stdio: "inherit" });
execSync(`git add "${pkgPath}"`, { stdio: "inherit" });
execSync(`git commit -m "release: cli v${newVersion}"`, { stdio: "inherit" });
execSync(`git tag cli-v${newVersion}`, { stdio: "inherit" });

console.log(`publishing @orche/cli@${newVersion} to npm...`);
execSync("npm publish --access public", { cwd: path.dirname(pkgPath), stdio: "inherit" });

console.log("pushing...");
execSync(`git push origin HEAD cli-v${newVersion}`, { stdio: "inherit" });

console.log(`\ndone — @orche/cli@${newVersion} published to npm`);
