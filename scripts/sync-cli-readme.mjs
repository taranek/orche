#!/usr/bin/env node

// Generates packages/cli/README.md from the repo-root README at publish time.
//
// Why this exists: the published npm tarball needs a real README.md file —
// npm-packlist does NOT follow symlinks, so a symlinked README is silently
// dropped from the tarball and npmjs.com shows "no README". Rather than keep
// two copies in sync by hand, the root README is the single source of truth and
// this script writes a real copy into packages/cli before `npm pack`/`npm publish`
// (wired up as the cli package's `prepack` script).
//
// It also rewrites relative asset paths (e.g. assets/orche.svg) to absolute
// raw.githubusercontent URLs, since relative image paths don't resolve on npm.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootReadme = path.resolve(__dirname, "../README.md");
const cliReadme = path.resolve(__dirname, "../packages/cli/README.md");

const RAW_BASE = "https://raw.githubusercontent.com/taranek/orche/master/";

const src = readFileSync(rootReadme, "utf-8");
const rewritten = src.replace(/src="assets\//g, `src="${RAW_BASE}assets/`);

writeFileSync(cliReadme, rewritten);
console.log(`synced ${path.relative(process.cwd(), rootReadme)} -> ${path.relative(process.cwd(), cliReadme)}`);
