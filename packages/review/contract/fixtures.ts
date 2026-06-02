// Real git fixture repos for the contract suite. No mocking — the contract is
// "given this actual repo state, the backend produces these results", which is
// exactly the spec a Rust backend must satisfy.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function write(repo: string, rel: string, contents: string | Buffer): void {
  const full = path.join(repo, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, contents)
}

export interface Fixture {
  repo: string
  /** SHA of feature commit A (README v2 + added file). */
  commitA: string
  /** SHA of feature commit B (delete + modify). */
  commitB: string
  cleanup(): void
}

/** Distinct binary blobs so base64 reads can be told apart. */
export const LOGO_AT_BASE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])
export const LOGO_AT_WORKTREE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xaa, 0xbb, 0xcc, 0xdd])

/**
 * Builds a repo with this shape:
 *
 *   master (base):
 *     README.md            "v1"
 *     src/keep.js          "keep"
 *     src/remove-later.js  "will be removed"
 *     logo.png             LOGO_AT_BASE
 *   feature commit A:  README.md → "v2",  + src/added-by-A.js
 *   feature commit B:  delete src/remove-later.js,  src/keep.js → "keep modified"
 *   working tree (uncommitted):
 *     README.md            → "v3 wip"
 *     logo.png             → LOGO_AT_WORKTREE
 *     notes.txt            (untracked, new)
 *
 * This single fixture exercises added/modified/deleted/untracked across the
 * 'all', 'working', and per-commit ranges, plus binary reads.
 */
export function buildFixture(): Fixture {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'orche-contract-'))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.email', 'test@test.com')
  git(repo, 'config', 'user.name', 'Test')
  git(repo, 'checkout', '-q', '-b', 'master')

  write(repo, 'README.md', 'v1\n')
  write(repo, 'src/keep.js', 'keep\n')
  write(repo, 'src/remove-later.js', 'will be removed\n')
  write(repo, 'logo.png', LOGO_AT_BASE)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'init')

  git(repo, 'checkout', '-q', '-b', 'feature')

  write(repo, 'README.md', 'v2\n')
  write(repo, 'src/added-by-A.js', 'added in A\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'A: readme v2 + add file')
  const commitA = git(repo, 'rev-parse', 'HEAD')

  rmSync(path.join(repo, 'src/remove-later.js'))
  write(repo, 'src/keep.js', 'keep modified\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'B: delete + modify')
  const commitB = git(repo, 'rev-parse', 'HEAD')

  // Uncommitted working-tree state.
  write(repo, 'README.md', 'v3 wip\n')
  write(repo, 'logo.png', LOGO_AT_WORKTREE)
  write(repo, 'notes.txt', 'scratch\n')

  return {
    repo,
    commitA,
    commitB,
    cleanup: () => rmSync(repo, { recursive: true, force: true }),
  }
}

/**
 * Mimics the orche on-disk layout for submit tests:
 *   <root>/.orche/worktrees/<name>   ← the worktree the review app runs against
 *   <root>/.orche/reviews/<name>     ← where submit writes (and the CLI watches)
 * Returns the worktree path plus the reviews dir submit is expected to target.
 */
export function buildWorktreeLayout(name = 'feature'): {
  worktreePath: string
  reviewsDir: string
  cleanup(): void
} {
  const root = mkdtempSync(path.join(os.tmpdir(), 'orche-submit-'))
  const worktreePath = path.join(root, '.orche', 'worktrees', name)
  mkdirSync(worktreePath, { recursive: true })
  const reviewsDir = path.join(root, '.orche', 'reviews', name)
  return {
    worktreePath,
    reviewsDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

/** Minimal repo with a single branch of the given name and one commit. */
export function buildSingleBranchRepo(branch: string): { repo: string; cleanup(): void } {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'orche-base-'))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.email', 'test@test.com')
  git(repo, 'config', 'user.name', 'Test')
  git(repo, 'checkout', '-q', '-b', branch)
  write(repo, 'file.txt', 'hello\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'init')
  return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) }
}
