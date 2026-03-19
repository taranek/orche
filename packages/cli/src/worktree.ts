import { execSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
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

  console.log(`  worktree: ${worktreePath} (${branchName})`);
  return { worktreePath, branchName };
}
