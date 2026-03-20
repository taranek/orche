import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  symlinkSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import path from "node:path";

export interface WorktreeInfo {
  worktreePath: string;
  branchName: string;
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

export function createWorktree(repoPath: string, name: string): WorktreeInfo {
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
  symlinkEnvFiles(repoPath, worktreePath);

  console.log(`  worktree: ${worktreePath} (${branchName})`);
  return { worktreePath, branchName };
}

function symlinkEnvFiles(repoPath: string, worktreePath: string): void {
  let entries;
  try {
    entries = readdirSync(repoPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(".env")) continue;
    const src = path.join(repoPath, entry.name);
    const dest = path.join(worktreePath, entry.name);
    if (!existsSync(dest)) {
      symlinkSync(src, dest);
    }
  }
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
