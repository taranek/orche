#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { createWorktree } from "./worktree.js";
import { buildLayout } from "./tmux.js";
import type { AgentsConfig } from "./types.js";

const CONFIG_NAME = ".orche.json";
const CONFIG_LOCAL_NAME = ".orche.local.json";

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function ensureTmux(): void {
  try {
    execSync("which tmux", { stdio: "ignore" });
  } catch {
    die("tmux is required — brew install tmux");
  }
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

function resolveReviewPackage(): string {
  // Resolve the review package relative to this CLI package
  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  const reviewDir = path.resolve(cliDir, "../../review");
  if (!existsSync(path.join(reviewDir, "package.json"))) {
    die(`@orche/review package not found at ${reviewDir}. Run pnpm install in the monorepo.`);
  }
  return reviewDir;
}

function runReview(worktreePath: string, tmuxTarget?: string): void {
  const reviewDir = resolveReviewPackage();

  // Try to find the built electron app, fall back to dev mode
  const args = ["--worktree=" + path.resolve(worktreePath)];
  if (tmuxTarget) {
    args.push("--tmux=" + tmuxTarget);
  }

  console.log(`opening review for ${worktreePath}...`);

  // Launch via electron directly (dev mode)
  const electronBin = path.join(reviewDir, "node_modules/.bin/electron");
  const child = spawn(electronBin, [reviewDir, ...args], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, VITE_DEV_SERVER_URL: undefined },
  });
  child.unref();
}

function startSession(): void {
  ensureTmux();

  const cwd = process.cwd();
  const repoName = path.basename(cwd);
  const taskName = process.argv[2] || "session";

  const config = loadConfig(cwd);

  // 1. Create worktree
  console.log(`creating worktree for "${taskName}"...`);
  const { worktreePath } = createWorktree(cwd, taskName);

  // 2. Create tmux session
  const sessionName = `${repoName}-${taskName}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  );

  // Kill existing session with same name
  try {
    execSync(`tmux kill-session -t "${sessionName}"`, { stdio: "ignore" });
  } catch {
    // no existing session, fine
  }

  execSync(
    `tmux new-session -d -s "${sessionName}" -c "${worktreePath}"`,
    { stdio: "ignore" }
  );

  // Enable mouse for pane resizing
  execSync(`tmux set-option -t "${sessionName}" mouse on`, {
    stdio: "ignore",
  });

  console.log(`tmux session: ${sessionName}`);

  // 3. Build pane layout
  buildLayout(sessionName, config.layout, worktreePath);

  // 4. Attach
  if (process.env.TMUX) {
    execSync(`tmux switch-client -t "${sessionName}"`, { stdio: "inherit" });
  } else {
    execSync(`tmux attach-session -t "${sessionName}"`, { stdio: "inherit" });
  }
}

function detectAgentPane(): string | undefined {
  // If inside a tmux session, find the first pane (where the agent typically runs)
  if (!process.env.TMUX) return undefined;
  try {
    const sessionName = execSync("tmux display-message -p '#S'")
      .toString()
      .trim();
    // Get the first pane ID of the current session
    const paneId = execSync(
      `tmux list-panes -t "${sessionName}" -F "#{pane_id}" | head -1`
    )
      .toString()
      .trim();
    if (paneId) return paneId;
  } catch {
    // not in tmux or failed
  }
  return undefined;
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

function main(): void {
  const subcommand = process.argv[2];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printUsage();
    process.exit(0);
  }

  if (subcommand === "review") {
    // orche review [worktree-path] [--tmux=<pane>]
    // argv[3] is the first arg after "review", use cwd if not provided
    const explicitPath = process.argv[3] && !process.argv[3].startsWith("--")
      ? process.argv[3]
      : undefined;
    const worktreePath = explicitPath || process.cwd();
    const tmuxTarget =
      process.argv.find((a) => a.startsWith("--tmux="))?.split("=")[1] ||
      detectAgentPane();
    runReview(worktreePath, tmuxTarget);
  } else {
    startSession();
  }
}

main();
