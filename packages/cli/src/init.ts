import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import pc from "picocolors";

const CONFIG_NAME = ".orche.json";
const GITIGNORE_NAME = ".gitignore";
const GITIGNORE_ENTRY = ".orche/";

const DEFAULT_CONFIG = {
  multiplexer: "auto",
  layout: {
    direction: "horizontal",
    panes: [
      { name: "agent", command: "claude" },
      { name: "dev", command: "" },
    ],
  },
};

interface InitOptions {
  force: boolean;
}

function parseOptions(argv: string[]): InitOptions {
  return {
    force: argv.includes("--force") || argv.includes("-f"),
  };
}

function isAvailable(bin: string): boolean {
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch (err) {
    // command -v exits nonzero when the binary is missing — expected, not an error.
    console.log(`[init] ${bin} not found:`, (err as Error).message);
    return false;
  }
}

function ensureGitRepo(cwd: string): void {
  try {
    execSync("git rev-parse --show-toplevel", { cwd, stdio: "ignore" });
  } catch (err) {
    console.error(pc.red("error:"), "not inside a git repository");
    console.error("run `git init` first, then `orche init`");
    console.log(`[init] git rev-parse failed:`, (err as Error).message);
    process.exit(1);
  }
}

function ensureMultiplexer(): "tmux" | "cmux" | "both" {
  const tmux = isAvailable("tmux");
  const cmux = isAvailable("cmux");
  if (tmux && cmux) return "both";
  if (cmux) return "cmux";
  if (tmux) return "tmux";

  console.error(pc.red("error:"), "neither tmux nor cmux is installed");
  console.error("orche needs a terminal multiplexer to drive multiple panes. install one:");
  console.error(`  ${pc.cyan("tmux")}: brew install tmux   (or your package manager)`);
  console.error(`  ${pc.cyan("cmux")}: https://cmux.com`);
  process.exit(1);
}

/** Write .orche.json. Refuses to overwrite unless force=true. */
function writeConfig(cwd: string, force: boolean): boolean {
  const configPath = path.join(cwd, CONFIG_NAME);
  if (existsSync(configPath) && !force) {
    console.log(pc.dim(`skipped ${CONFIG_NAME} (already exists — pass --force to overwrite)`));
    return false;
  }
  writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  console.log(`${pc.green("✓")} wrote ${pc.bold(CONFIG_NAME)}`);
  return true;
}

/** Append .orche/ to .gitignore if not present. Creates the file if missing. */
function ensureGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, GITIGNORE_NAME);
  let contents = "";
  if (existsSync(gitignorePath)) {
    contents = readFileSync(gitignorePath, "utf-8");
    const lines = contents.split(/\r?\n/).map((l) => l.trim());
    // Match either ".orche/" or ".orche" (no trailing slash) — both ignore the dir.
    if (lines.includes(GITIGNORE_ENTRY) || lines.includes(".orche")) {
      console.log(pc.dim(`skipped ${GITIGNORE_NAME} (already ignores .orche)`));
      return;
    }
  }
  const prefix = contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  writeFileSync(gitignorePath, contents + prefix + GITIGNORE_ENTRY + "\n");
  console.log(`${pc.green("✓")} added ${pc.bold(GITIGNORE_ENTRY)} to ${pc.bold(GITIGNORE_NAME)}`);
}

function printNextSteps(mux: "tmux" | "cmux" | "both"): void {
  const muxNote =
    mux === "both" ? pc.dim("(tmux + cmux both detected — using cmux first via 'auto')") :
    mux === "cmux" ? pc.dim("(cmux detected)") :
    pc.dim("(tmux detected)");

  console.log("");
  console.log(pc.bold("Next:"));
  console.log(`  1. Edit ${pc.cyan(CONFIG_NAME)} — set the panes you want (agent, dev server, etc.)`);
  console.log(`  2. Run ${pc.cyan("orche start <task-name>")} to spin up a worktree + session`);
  console.log(`  3. ${pc.cyan("orche review")} inside a worktree to open the diff UI`);
  console.log("");
  console.log(`  ${muxNote}`);
}

export function initCommand(argv: string[]): void {
  const opts = parseOptions(argv);
  const cwd = process.cwd();

  ensureGitRepo(cwd);
  const mux = ensureMultiplexer();
  writeConfig(cwd, opts.force);
  ensureGitignore(cwd);
  printNextSteps(mux);
}
