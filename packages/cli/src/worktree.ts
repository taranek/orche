import { execSync, execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  symlinkSync,
  copyFileSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import path from "node:path";
import type { WorktreeIncludeMode } from "./types.js";

export interface WorktreeInfo {
  worktreePath: string;
  branchName: string;
}

export interface CreateWorktreeOptions {
  /** How `.worktreeinclude` files are placed into the worktree. Defaults to "copy". */
  includeMode?: WorktreeIncludeMode;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function ensureGitignore(repoPath: string, pattern: string): void {
  const gitignorePath = path.join(repoPath, ".gitignore");
  let content = "";
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, "utf-8");
  }
  if (!content.includes(pattern)) {
    appendFileSync(gitignorePath, `\n# Agent worktrees\n${pattern}\n`);
  }
}

function ensureGitRepo(repoPath: string): void {
  try {
    execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "ignore" });
  } catch {
    execSync(
      'git init && git add -A && git commit -m "Initial commit" --allow-empty',
      { cwd: repoPath, stdio: "ignore" }
    );
  }
}

export function createWorktree(
  repoPath: string,
  name: string,
  options: CreateWorktreeOptions = {}
): WorktreeInfo {
  ensureGitRepo(repoPath);

  const slug = slugify(name);
  const timestamp = Date.now();
  const branchName = `agent/${slug}-${timestamp}`;

  const worktreesDir = path.join(repoPath, ".orche", "worktrees");
  const worktreePath = path.join(worktreesDir, `${slug}-${timestamp}`);

  mkdirSync(worktreesDir, { recursive: true });
  ensureGitignore(repoPath, ".orche/");

  execSync(`git worktree add -b "${branchName}" "${worktreePath}"`, {
    cwd: repoPath,
    stdio: "ignore",
  });

  symlinkNodeModules(repoPath, worktreePath);
  applyWorktreeIncludes(repoPath, worktreePath, options.includeMode ?? "copy");

  console.log(`  worktree: ${worktreePath} (${branchName})`);
  return { worktreePath, branchName };
}

/**
 * Places gitignored files listed in a `.worktreeinclude` file (`.gitignore`
 * syntax) from the main checkout into the freshly created worktree. A worktree
 * is a clean checkout, so untracked files like `.env` aren't present otherwise.
 *
 * In "copy" mode (the default) each file is duplicated, so the worktree can
 * diverge freely. In "symlink" mode each file links back to the main checkout,
 * so edits are shared — handy for config you keep in lockstep, but it means a
 * worktree editing e.g. `.env` mutates the main checkout.
 *
 * Only untracked files matching a `.worktreeinclude` pattern are placed —
 * tracked files are never duplicated. The match is computed with `git ls-files
 * --others --ignored --exclude-from`: `--others` restricts to untracked files,
 * and omitting `--exclude-standard` means only the `.worktreeinclude` patterns
 * (not the repo's normal `.gitignore`) decide what matches.
 */
export function applyWorktreeIncludes(
  repoPath: string,
  worktreePath: string,
  mode: WorktreeIncludeMode = "copy"
): void {
  const includeFile = path.join(repoPath, ".worktreeinclude");
  if (!existsSync(includeFile)) return;

  let output: string;
  try {
    output = execFileSync(
      "git",
      ["ls-files", "-z", "--others", "--ignored", "--exclude-from", includeFile],
      { cwd: repoPath, encoding: "utf-8" }
    );
  } catch {
    return;
  }

  let placed = 0;
  for (const rel of output.split("\0").filter(Boolean)) {
    const src = path.join(repoPath, rel);
    const dest = path.join(worktreePath, rel);
    try {
      if (!lstatSync(src).isFile()) continue;
      if (existsSync(dest)) continue;
      mkdirSync(path.dirname(dest), { recursive: true });
      if (mode === "symlink") {
        symlinkSync(src, dest);
      } else {
        copyFileSync(src, dest);
      }
      placed++;
    } catch {
      // Skip files that vanished or can't be read; placement is best-effort.
    }
  }

  if (placed > 0) {
    const noun = placed === 1 ? "file" : "files";
    const verb = mode === "symlink" ? "symlinked" : "copied";
    console.log(`  ${verb} ${placed} gitignored ${noun} from .worktreeinclude`);
  }
}

export interface OrcheWorktree {
  worktreePath: string;
  branch: string | null;
  dirty: boolean;
}

const ORCHE_SEGMENT = `${path.sep}.orche${path.sep}worktrees${path.sep}`;

function parseWorktreeList(output: string): { worktreePath: string; branch: string | null }[] {
  const result: { worktreePath: string; branch: string | null }[] = [];
  for (const block of output.split(/\n\n+/)) {
    if (!block.trim()) continue;
    let worktreePath: string | null = null;
    let branch: string | null = null;
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) worktreePath = line.slice("worktree ".length);
      else if (line.startsWith("branch ")) branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
    if (worktreePath) result.push({ worktreePath, branch });
  }
  return result;
}

function isWorktreeDirty(worktreePath: string): boolean {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], {
      cwd: worktreePath,
      encoding: "utf-8",
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export function listOrcheWorktrees(repoPath: string): OrcheWorktree[] {
  const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoPath,
    encoding: "utf-8",
  });
  return parseWorktreeList(out)
    .filter((w) => w.worktreePath.includes(ORCHE_SEGMENT))
    .map((w) => ({
      worktreePath: w.worktreePath,
      branch: w.branch,
      dirty: isWorktreeDirty(w.worktreePath),
    }));
}

export function removeWorktree(repoPath: string, worktreePath: string, force: boolean): void {
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(worktreePath);
  execFileSync("git", args, { cwd: repoPath, stdio: "inherit" });
}

function symlinkNodeModules(repoPath: string, worktreePath: string): void {
  // Symlink root node_modules
  const rootNm = path.join(repoPath, "node_modules");
  const targetNm = path.join(worktreePath, "node_modules");
  if (existsSync(rootNm) && !existsSync(targetNm)) {
    symlinkSync(rootNm, targetNm);
  }

  // Symlink node_modules in subdirectories (monorepo packages)
  symlinkNestedNodeModules(repoPath, worktreePath, repoPath);
}

function symlinkNestedNodeModules(
  dir: string,
  worktreePath: string,
  repoPath: string
): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".orche") continue;

    const fullPath = path.join(dir, entry.name);

    // Skip symlinks
    try {
      if (lstatSync(fullPath).isSymbolicLink()) continue;
    } catch {
      continue;
    }

    const nm = path.join(fullPath, "node_modules");
    if (existsSync(nm)) {
      const rel = path.relative(repoPath, fullPath);
      const targetDir = path.join(worktreePath, rel);
      const targetNm = path.join(targetDir, "node_modules");
      if (!existsSync(targetNm) && existsSync(targetDir)) {
        symlinkSync(nm, targetNm);
      }
    }

    symlinkNestedNodeModules(fullPath, worktreePath, repoPath);
  }
}
