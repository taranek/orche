// All git-backed review logic lives here, deliberately free of any electron
// imports. main.ts wires these into IPC handlers; git.test.ts pins their
// behavior against real fixture repos.
//
// Keeping this module electron-free serves two goals:
//   1. it's unit-testable with plain vitest (no electron harness), and
//   2. it's the behavior spec a future Tauri/Rust backend must replicate —
//      each function maps cleanly onto a Tauri command.

import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import path from 'node:path'
import type { ChangeStatus, FileChange, Range, CommitInfo } from '../contract/types'

// Re-export the contract types so main.ts only needs to import from git.ts.
export type { ChangeStatus, FileChange, Range, CommitInfo } from '../contract/types'

const execAsync = promisify(exec)

/** 10 MiB — generous ceiling for `git show` of a single blob. */
const MAX_BUFFER = 10 * 1024 * 1024

/**
 * The endpoints a Range maps onto:
 *  - `diffArg`: passed to `git diff <diffArg>` to list changed files
 *  - `originRef`: passed to `git show <originRef>:path` for the "before" version
 *  - `modifiedRef`: ref for the "after" version, or null when it's the working tree on disk
 *  - `includeUntracked`: whether to also walk untracked files (only when the working tree is in scope)
 *
 * Pure — no IO. This is the single source of truth for "which git refs does
 * each view mode touch", and the easiest function to port verbatim.
 */
export function resolveRange(
  range: Range,
  base: string,
): { diffArg: string; originRef: string; modifiedRef: string | null; includeUntracked: boolean } {
  if (range.kind === 'commit') {
    // Modified side is the commit itself; original is its parent.
    return { diffArg: `${range.sha}^..${range.sha}`, originRef: `${range.sha}^`, modifiedRef: range.sha, includeUntracked: false }
  }
  if (range.kind === 'working') {
    // Modified side is the working tree on disk (null sentinel).
    return { diffArg: 'HEAD', originRef: 'HEAD', modifiedRef: null, includeUntracked: true }
  }
  // 'all'
  return { diffArg: base, originRef: base, modifiedRef: null, includeUntracked: true }
}

/**
 * Resolve the base ref to diff against. Explicit wins; otherwise probe
 * origin/HEAD, then main, then master. Falls back to HEAD (working-tree-only)
 * when nothing resolves. Kept as a ref name (not a SHA) so downstream
 * `git show <base>:path` and `git diff <base>` stay readable.
 */
export function resolveBase(cwd: string, explicit?: string): string {
  const candidates = explicit ? [explicit] : []
  if (!explicit) {
    try {
      const head = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', { cwd, encoding: 'utf-8' }).toString().trim()
      // e.g. "origin/main" -> "main"
      if (head.startsWith('origin/')) candidates.push(head.slice('origin/'.length))
      else candidates.push(head)
    } catch (err) {
      console.log('[review] no origin/HEAD symbolic ref, falling through to main/master probe:', (err as Error).message)
    }
    candidates.push('main', 'master')
  }
  for (const ref of candidates) {
    try {
      execSync(`git rev-parse --verify --quiet ${ref}`, { cwd, stdio: 'ignore' })
      return ref
    } catch (err) {
      console.log(`[review] base candidate "${ref}" not found:`, (err as Error).message)
    }
  }
  console.warn('[review] no base ref resolved, falling back to HEAD (committed changes will not appear in diff)')
  return 'HEAD'
}

/**
 * List changed files for the given range. Combines tracked changes
 * (`git diff --name-status`) with untracked files (`git ls-files --others`)
 * when the working tree is in scope. Returns alphabetically sorted.
 */
export async function getChangedFiles(cwd: string, base: string, range: Range): Promise<FileChange[]> {
  const byPath = new Map<string, ChangeStatus>()
  const { diffArg, includeUntracked } = resolveRange(range, base)

  // Tracked changes — `git diff <diffArg>` combines committed + staged + unstaged when diffArg is a ref,
  // or shows just the commit's own diff when diffArg is "sha^..sha".
  try {
    const { stdout } = await execAsync(`git diff --name-status ${diffArg}`, { cwd })
    for (const line of stdout.split('\n')) {
      if (!line) continue
      const parts = line.split('\t')
      const code = parts[0]
      // Renames produce "R100\told\tnew" — show the new path as modified for now.
      const filePath = parts[parts.length - 1]
      if (!filePath) continue
      const status: ChangeStatus = code.startsWith('A')
        ? 'added'
        : code.startsWith('D')
          ? 'deleted'
          : 'modified'
      byPath.set(filePath, status)
    }
  } catch (err) {
    console.error(`[review] git diff --name-status ${diffArg} failed:`, err)
  }

  // Untracked files (not yet `git add`-ed) — only relevant when working tree is in scope.
  if (includeUntracked) {
    try {
      const { stdout } = await execAsync('git ls-files --others --exclude-standard', { cwd })
      for (const line of stdout.split('\n')) {
        const filePath = line.trim()
        if (!filePath) continue
        if (!byPath.has(filePath)) byPath.set(filePath, 'added')
      }
    } catch (err) {
      console.error('[review] git ls-files --others failed:', err)
    }
  }

  return Array.from(byPath, ([filePath, status]) => ({
    path: filePath,
    name: filePath.split('/').pop() || filePath,
    status,
  })).sort((a, b) => a.path.localeCompare(b.path))
}

/** List commits in base..HEAD, newest first. */
export async function getCommits(cwd: string, base: string): Promise<CommitInfo[]> {
  try {
    // %H sha, %h short, %s subject, %an author, %ai ISO date — null byte between
    // fields. %s strips newlines so a plain newline record separator is safe.
    const { stdout } = await execAsync(`git log --format=%H%x00%h%x00%s%x00%an%x00%ai ${base}..HEAD`, { cwd })
    return stdout.split('\n').filter(Boolean).map(line => {
      const [sha, shortSha, subject, author, date] = line.split('\0')
      return { sha, shortSha, subject, author, date }
    })
  } catch (err) {
    console.error(`[review] git log ${base}..HEAD failed:`, err)
    return []
  }
}

/** Current branch name, or null when detached / not a repo. */
export async function getBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd })
    return stdout.trim()
  } catch (err) {
    console.error('[review] git rev-parse failed:', err)
    return null
  }
}

/**
 * "Before" version of a file for the given range, as UTF-8 text.
 * Returns null when the file didn't exist at the origin ref (added files).
 */
export async function readOriginal(cwd: string, base: string, range: Range, filePath: string): Promise<string | null> {
  const { originRef } = resolveRange(range, base)
  try {
    const { stdout } = await execAsync(`git show ${originRef}:"${filePath}"`, { cwd, maxBuffer: MAX_BUFFER })
    return stdout
  } catch (err) {
    // Expected when the file didn't exist at originRef (added files).
    console.log(`[review] git show ${originRef}:${filePath} returned no content:`, (err as Error).message)
    return null
  }
}

/**
 * "After" version of a file for the given range, as UTF-8 text.
 * For 'all'/'working' this is the working tree on disk; for a commit range it's
 * the file at that commit. Returns '' on failure (e.g. deleted files).
 */
export async function readModified(cwd: string, base: string, range: Range, filePath: string): Promise<string> {
  const { modifiedRef } = resolveRange(range, base)
  if (modifiedRef) {
    // Modified side is at a specific commit, not on disk — read from git.
    try {
      const { stdout } = await execAsync(`git show ${modifiedRef}:"${filePath}"`, { cwd, maxBuffer: MAX_BUFFER })
      return stdout
    } catch (err) {
      console.log(`[review] git show ${modifiedRef}:${filePath} returned no content:`, (err as Error).message)
      return ''
    }
  }
  const fullPath = path.join(cwd, filePath)
  try {
    if (statSync(fullPath).isDirectory()) return ''
    return await readFile(fullPath, 'utf-8')
  } catch (err) {
    // Expected for deleted files (no longer on disk).
    console.log(`[review] read ${filePath} failed:`, (err as Error).message)
    return ''
  }
}

/** Base64 of the "before" version (for binary files like images). Null on miss. */
export async function readOriginalBase64(cwd: string, base: string, range: Range, filePath: string): Promise<string | null> {
  const { originRef } = resolveRange(range, base)
  try {
    const { stdout } = await execAsync(`git show ${originRef}:"${filePath}"`, {
      cwd,
      maxBuffer: MAX_BUFFER,
      encoding: 'buffer',
    })
    return (stdout as unknown as Buffer).toString('base64')
  } catch (err) {
    console.log(`[review] git show ${originRef}:${filePath} (binary) returned no content:`, (err as Error).message)
    return null
  }
}

/** Base64 of the "after" version (for binary files like images). Null on miss. */
export async function readModifiedBase64(cwd: string, base: string, range: Range, filePath: string): Promise<string | null> {
  const { modifiedRef } = resolveRange(range, base)
  if (modifiedRef) {
    try {
      const { stdout } = await execAsync(`git show ${modifiedRef}:"${filePath}"`, {
        cwd,
        maxBuffer: MAX_BUFFER,
        encoding: 'buffer',
      })
      return (stdout as unknown as Buffer).toString('base64')
    } catch (err) {
      console.log(`[review] git show ${modifiedRef}:${filePath} (binary) returned no content:`, (err as Error).message)
      return null
    }
  }
  const fullPath = path.join(cwd, filePath)
  try {
    const buf = await readFile(fullPath)
    return buf.toString('base64')
  } catch (err) {
    console.log(`[review] readBase64 ${filePath} failed:`, (err as Error).message)
    return null
  }
}
