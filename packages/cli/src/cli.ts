#!/usr/bin/env node

import { readFileSync, existsSync, watch, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { createWorktree } from "./worktree.js";
import { pruneCommand } from "./prune.js";
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

function deliverReview(pendingPath: string): void {
  try {
    const pending = JSON.parse(readFileSync(pendingPath, "utf-8"));
    const { reviewPath, multiplexer, paneId, workspaceId } = pending;
    const markdown = readFileSync(reviewPath, "utf-8");

    if (multiplexer === "tmux" && paneId) {
      // Use load-buffer/paste-buffer instead of send-keys to safely handle
      // multi-line markdown with special characters
      const tmpFile = pendingPath + ".tmp";
      writeFileSync(tmpFile, markdown);
      execFileSync("tmux", ["load-buffer", tmpFile]);
      execFileSync("tmux", ["paste-buffer", "-t", paneId]);
      execFileSync("tmux", ["send-keys", "-t", paneId, "Enter"]);
      try { unlinkSync(tmpFile); } catch {}
    } else if (multiplexer === "cmux" && paneId) {
      const escaped = markdown.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      execFileSync("cmux", ["send", "--surface", paneId, ...(workspaceId ? ["--workspace", workspaceId] : []), "--", escaped]);
      execFileSync("cmux", ["send-key", "--surface", paneId, ...(workspaceId ? ["--workspace", workspaceId] : []), "enter"]);
    }

    try { unlinkSync(pendingPath); } catch {}
    console.log("[review] delivered review to agent");
  } catch (err: any) {
    console.error("[review] delivery failed:", err?.message ?? err);
  }
}

async function runReview(worktreePath: string): Promise<void> {
  const resolvedPath = path.resolve(worktreePath);

  // Refuse to run unless the target is inside a git worktree — otherwise the
  // review app may try to recursively watch enormous trees (e.g. $HOME).
  try {
    execFileSync("git", ["-C", resolvedPath, "rev-parse", "--show-toplevel"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    die(`not a git worktree: ${resolvedPath}`);
  }

  const args = ["--worktree=" + resolvedPath];

  console.log(`opening review for ${worktreePath}...`);

  // Watch for .pending files from the Electron app and deliver them
  // (Electron can't access the cmux socket — only CLI processes can)
  const repoRoot = getRepoRoot(resolvedPath);
  const worktreeName = path.basename(resolvedPath);
  const reviewsDir = path.join(repoRoot, ".orche", "reviews", worktreeName);
  mkdirSync(reviewsDir, { recursive: true });

  // CLI stays alive to watch for .pending files and deliver them via cmux/tmux
  // (Electron can't access the cmux socket — only processes started inside cmux can)
  const watcher = watch(reviewsDir, (event, filename) => {
    if (event === "rename" && filename?.endsWith(".pending")) {
      const pendingPath = path.join(reviewsDir, filename);
      deliverReview(pendingPath);
      watcher.close();
      process.exit(0);
    }
  });

  // Exit the CLI when the review app quits — otherwise the fs watcher
  // keeps the event loop alive and the user has to ctrl+c.
  const onReviewExit = (code: number | null): void => {
    try { watcher.close(); } catch {}
    process.exit(code ?? 0);
  };

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
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, VITE_DEV_SERVER_URL: undefined },
    });
    child.on("exit", onReviewExit);
    return;
  }

  const binaryPath = await getReviewBinaryPath();
  if (debug) console.error(`[review] launching: ${binaryPath} ${args.join(" ")}`);
  const child = spawn(binaryPath, args, {
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", onReviewExit);
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
  const taskName = process.argv.slice(3).find((a) => !a.startsWith("--")) || "session";

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
  orche start <task>         Start a new session for <task>
  orche review [path]        Open the review UI for a worktree
  orche prune [--all] [-f]   Remove orche worktrees (interactive multiselect)

Examples:
  orche start fix-auth       Create worktree + session for "fix-auth"
  orche review               Review changes in current directory
  orche review ./worktree    Review changes in a specific worktree
  orche prune                Pick worktrees to remove
  orche prune --all          Remove all orche worktrees
  orche prune --force        Allow removing worktrees with uncommitted changes

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

  if (subcommand === "start") {
    startSession();
  } else if (subcommand === "prune") {
    const repoRoot = getRepoRoot(process.cwd());
    await pruneCommand(repoRoot, process.argv.slice(3));
  } else if (subcommand === "review") {
    const explicitPath = process.argv[3] && !process.argv[3].startsWith("--")
      ? process.argv[3]
      : undefined;
    const worktreePath = explicitPath || process.cwd();
    await runReview(worktreePath);
  } else {
    console.error(`Unknown command: ${subcommand}\nRun "orche --help" for usage.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
