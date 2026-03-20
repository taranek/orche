#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { createWorktree } from "./worktree.js";
import { getMultiplexer } from "./multiplexer.js";
import { buildLayout } from "./layout.js";
import { getReviewBinaryPath } from "./review-manager.js";
import type { AgentsConfig, MultiplexerType } from "./types.js";

const CONFIG_NAME = ".orche.json";
const CONFIG_LOCAL_NAME = ".orche.local.json";

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}


function loadConfig(cwd: string): AgentsConfig {
  const localPath = path.join(cwd, CONFIG_LOCAL_NAME);
  const configPath = path.join(cwd, CONFIG_NAME);

  if (existsSync(localPath)) {
    const raw = readFileSync(localPath, "utf-8");
    return JSON.parse(raw) as AgentsConfig;
  }

  if (!existsSync(configPath)) {
    die(`no ${CONFIG_NAME} found in ${cwd}`);
  }
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as AgentsConfig;
}

async function runReview(worktreePath: string): Promise<void> {
  const args = ["--worktree=" + path.resolve(worktreePath)];

  console.log(`opening review for ${worktreePath}...`);

  // Dev mode: launch electron from local monorepo
  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  const localReviewDir = path.resolve(cliDir, "../../review");
  const devReviewPath = process.env.ORCHE_REVIEW_DEV ||
    (existsSync(path.join(localReviewDir, "package.json")) ? localReviewDir : undefined);
  const debug = !!process.env.ORCHE_DEBUG;
  if (devReviewPath) {
    const electronBin = path.join(devReviewPath, "node_modules/.bin/electron");
    if (debug) console.error(`[review] launching: ${electronBin} ${[devReviewPath, ...args].join(" ")}`);
    const child = spawn(electronBin, [devReviewPath, ...args], {
      stdio: debug ? ["ignore", "inherit", "inherit"] : "ignore",
      detached: !debug,
      env: { ...process.env, VITE_DEV_SERVER_URL: undefined },
    });
    if (!debug) child.unref();
    return;
  }

  const binaryPath = await getReviewBinaryPath();
  if (debug) console.error(`[review] launching: ${binaryPath} ${args.join(" ")}`);
  const child = spawn(binaryPath, args, {
    stdio: debug ? ["ignore", "inherit", "inherit"] : "ignore",
    detached: !debug,
  });
  child.unref();
}

function getRepoRoot(cwd: string): string {
  // If we're inside an orche worktree, walk up to the real repo
  const orcheIdx = cwd.indexOf("/.orche/worktrees/");
  if (orcheIdx !== -1) {
    return cwd.slice(0, orcheIdx);
  }
  return cwd;
}

function startSession(): void {
  const cwd = getRepoRoot(process.cwd());
  const repoName = path.basename(cwd);
  const taskName = process.argv.slice(2).find((a) => !a.startsWith("--")) || "session";

  const config = loadConfig(cwd);
  const muxFlag: MultiplexerType | undefined =
    process.argv.includes("--tmux") ? "tmux" :
    process.argv.includes("--cmux") ? "cmux" :
    undefined;
  const mux = getMultiplexer(muxFlag ?? config.multiplexer);

  // 1. Create worktree
  console.log(`creating worktree for "${taskName}"...`);
  const { worktreePath } = createWorktree(cwd, taskName);

  // 2. Create session
  const sessionName = `${repoName}-${taskName}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  );

  mux.createSession(sessionName, worktreePath);
  console.log(`${mux.name} session: ${sessionName}`);

  // 3. Build pane layout
  buildLayout(mux, sessionName, config.layout, worktreePath);

  // 4. Attach
  mux.attach(sessionName);
}

function printUsage(): void {
  console.log(`
orche — orchestrate agents across git worktrees

Usage:
  orche <task>                Start a new session for <task>
  orche review [path]        Open the review UI for a worktree
    --tmux=<pane>            Send review back to a tmux pane

Examples:
  orche fix-auth             Create worktree + tmux session for "fix-auth"
  orche review               Review changes in current directory
  orche review ./worktree    Review changes in a specific worktree

Requires a ${CONFIG_NAME} file in the current directory.
Use ${CONFIG_LOCAL_NAME} for local overrides (not committed).
See .orche.example.json for the config format.
`);
}

async function main(): Promise<void> {
  const subcommand = process.argv[2];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printUsage();
    process.exit(0);
  }

  if (subcommand === "review") {
    const explicitPath = process.argv[3] && !process.argv[3].startsWith("--")
      ? process.argv[3]
      : undefined;
    const worktreePath = explicitPath || process.cwd();
    await runReview(worktreePath);
  } else {
    startSession();
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
