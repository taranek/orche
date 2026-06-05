import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  lstatSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { createWorktree } from "./worktree.js";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function initRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "orche-wt-test-"));
  git(dir, "init");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  // A tracked file so the repo has a real HEAD to branch from.
  writeFileSync(path.join(dir, "README.md"), "# repo\n");
  git(dir, "add", "README.md");
  git(dir, "commit", "-m", "init");
  return dir;
}

describe("createWorktree .worktreeinclude", () => {
  let repo: string;

  beforeEach(() => {
    repo = initRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("copies gitignored files matching .worktreeinclude into the worktree", () => {
    writeFileSync(path.join(repo, ".gitignore"), ".env\nconfig/\n");
    writeFileSync(path.join(repo, ".worktreeinclude"), ".env\nconfig/secrets.json\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=abc\n");
    mkdirSync(path.join(repo, "config"));
    writeFileSync(path.join(repo, "config", "secrets.json"), '{"k":"v"}\n');

    const { worktreePath } = createWorktree(repo, "feature");

    const env = path.join(worktreePath, ".env");
    const secrets = path.join(worktreePath, "config", "secrets.json");
    expect(existsSync(env)).toBe(true);
    expect(lstatSync(env).isSymbolicLink()).toBe(false);
    expect(readFileSync(env, "utf-8")).toBe("SECRET=abc\n");
    expect(existsSync(secrets)).toBe(true);
    expect(readFileSync(secrets, "utf-8")).toBe('{"k":"v"}\n');
  });

  it("defaults to copy mode (independent files)", () => {
    writeFileSync(path.join(repo, ".gitignore"), ".env\n");
    writeFileSync(path.join(repo, ".worktreeinclude"), ".env\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=abc\n");

    const { worktreePath } = createWorktree(repo, "feature");
    const env = path.join(worktreePath, ".env");

    expect(lstatSync(env).isSymbolicLink()).toBe(false);
    // Editing the main checkout's copy does not affect the worktree's.
    writeFileSync(path.join(repo, ".env"), "SECRET=changed\n");
    expect(readFileSync(env, "utf-8")).toBe("SECRET=abc\n");
  });

  it("symlinks files when includeMode is 'symlink' (shared with main checkout)", () => {
    writeFileSync(path.join(repo, ".gitignore"), ".env\n");
    writeFileSync(path.join(repo, ".worktreeinclude"), ".env\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=abc\n");

    const { worktreePath } = createWorktree(repo, "feature", { includeMode: "symlink" });
    const env = path.join(worktreePath, ".env");

    expect(lstatSync(env).isSymbolicLink()).toBe(true);
    // Editing the main checkout propagates through the symlink.
    writeFileSync(path.join(repo, ".env"), "SECRET=changed\n");
    expect(readFileSync(env, "utf-8")).toBe("SECRET=changed\n");
  });

  it("does not copy gitignored files that aren't listed in .worktreeinclude", () => {
    writeFileSync(path.join(repo, ".gitignore"), ".env\n.env.local\n");
    writeFileSync(path.join(repo, ".worktreeinclude"), ".env\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=abc\n");
    writeFileSync(path.join(repo, ".env.local"), "LOCAL=1\n");

    const { worktreePath } = createWorktree(repo, "feature");

    expect(existsSync(path.join(worktreePath, ".env"))).toBe(true);
    expect(existsSync(path.join(worktreePath, ".env.local"))).toBe(false);
  });

  it("ignores patterns that match tracked files (never duplicated via copy)", () => {
    // README.md is tracked; even if listed it shouldn't be copied by the include logic.
    writeFileSync(path.join(repo, ".worktreeinclude"), "README.md\n.env\n");
    writeFileSync(path.join(repo, ".gitignore"), ".env\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=abc\n");

    const { worktreePath } = createWorktree(repo, "feature");

    // README.md is present because git checked it out, .env because we copied it.
    expect(existsSync(path.join(worktreePath, "README.md"))).toBe(true);
    expect(existsSync(path.join(worktreePath, ".env"))).toBe(true);
  });

  it("is a no-op when .worktreeinclude is absent", () => {
    writeFileSync(path.join(repo, ".gitignore"), ".env\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=abc\n");

    const { worktreePath } = createWorktree(repo, "feature");

    expect(existsSync(path.join(worktreePath, ".env"))).toBe(false);
  });
});
