// The review backend contract — a single set of assertions that any backend
// implementation must satisfy. The Rust backend (src-tauri) is validated against
// it via the contract CLI; the suite originally also ran against a TypeScript
// reference backend to drive the electron→Tauri migration at parity.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type {
  ReviewBackend,
  ReviewBackendFactory,
  BaseResolver,
  SubmitFn,
  TargetResolver,
  FileChange,
} from './types'
import {
  buildFixture,
  buildSingleBranchRepo,
  buildWorktreeLayout,
  buildSessionWorktree,
  type Fixture,
  LOGO_AT_BASE,
  LOGO_AT_WORKTREE,
} from './fixtures'

/** path→status pairs, sorted by raw path bytes — order-independent comparison. */
function asPairs(changes: FileChange[]): string[] {
  return changes
    .map((c) => `${c.path}:${c.status}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export function defineReviewContract(name: string, makeBackend: ReviewBackendFactory): void {
  describe(`review backend contract: ${name}`, () => {
    let fx: Fixture
    let all: ReviewBackend

    beforeAll(async () => {
      fx = buildFixture()
      // One backend bound to (worktree, base='master'); the Range arg selects the slice.
      all = await makeBackend(fx.repo, 'master')
    })

    afterAll(() => fx?.cleanup())

    // --- getChanges across ranges ---

    it("range 'all' lists committed + working-tree + untracked changes", async () => {
      const changes = await all.getChanges({ kind: 'all' })
      expect(asPairs(changes)).toEqual([
        'README.md:modified',
        'logo.png:modified',
        'notes.txt:added',
        'src/added-by-A.js:added',
        'src/keep.js:modified',
        'src/remove-later.js:deleted',
      ])
    })

    it("range 'working' lists only uncommitted changes", async () => {
      const changes = await all.getChanges({ kind: 'working' })
      expect(asPairs(changes)).toEqual([
        'README.md:modified',
        'logo.png:modified',
        'notes.txt:added',
      ])
    })

    it('range commit A lists only that commit’s diff (no untracked)', async () => {
      const changes = await all.getChanges({ kind: 'commit', sha: fx.commitA })
      expect(asPairs(changes)).toEqual([
        'README.md:modified',
        'src/added-by-A.js:added',
      ])
    })

    it('range commit B lists only that commit’s diff (delete + modify)', async () => {
      const changes = await all.getChanges({ kind: 'commit', sha: fx.commitB })
      expect(asPairs(changes)).toEqual([
        'src/keep.js:modified',
        'src/remove-later.js:deleted',
      ])
    })

    it('getChanges sorts by path (codepoint order, locale-independent)', async () => {
      const changes = await all.getChanges({ kind: 'all' })
      const paths = changes.map((c) => c.path)
      expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    })

    it('FileChange.name is the basename', async () => {
      const changes = await all.getChanges({ kind: 'all' })
      const added = changes.find((c) => c.path === 'src/added-by-A.js')
      expect(added?.name).toBe('added-by-A.js')
    })

    // --- getCommits ---

    it('getCommits lists base..HEAD newest-first with metadata', async () => {
      const commits = await all.getCommits()
      expect(commits).toHaveLength(2)
      expect(commits[0].sha).toBe(fx.commitB)
      expect(commits[0].subject).toBe('B: delete + modify')
      expect(commits[1].sha).toBe(fx.commitA)
      expect(commits[1].subject).toBe('A: readme v2 + add file')
      // shortSha is a prefix of the full sha
      expect(fx.commitB.startsWith(commits[0].shortSha)).toBe(true)
      expect(commits[0].author).toBe('Test')
      expect(commits[0].date).toBeTruthy()
    })

    // --- getBranch ---

    it('getBranch returns the checked-out branch', async () => {
      expect(await all.getBranch()).toBe('feature')
    })

    // --- readOriginal / readModified across ranges ---

    it("'all': original is the base version, modified is the working tree", async () => {
      expect(await all.readOriginal('README.md', { kind: 'all' })).toBe('v1\n')
      expect(await all.readModified('README.md', { kind: 'all' })).toBe('v3 wip\n')
    })

    it("'working': original is HEAD, modified is the working tree", async () => {
      expect(await all.readOriginal('README.md', { kind: 'working' })).toBe('v2\n')
      expect(await all.readModified('README.md', { kind: 'working' })).toBe('v3 wip\n')
    })

    it('commit range: original is the parent, modified is the commit', async () => {
      const range = { kind: 'commit' as const, sha: fx.commitA }
      expect(await all.readOriginal('README.md', range)).toBe('v1\n')
      expect(await all.readModified('README.md', range)).toBe('v2\n')
    })

    it('added file: original is null, modified is the new content', async () => {
      expect(await all.readOriginal('src/added-by-A.js', { kind: 'all' })).toBeNull()
      expect(await all.readModified('src/added-by-A.js', { kind: 'all' })).toBe('added in A\n')
    })

    it('deleted file: original has content, modified is empty', async () => {
      expect(await all.readOriginal('src/remove-later.js', { kind: 'all' })).toBe('will be removed\n')
      expect(await all.readModified('src/remove-later.js', { kind: 'all' })).toBe('')
    })

    // --- binary reads (base64) ---

    it('binary original/modified base64 reflect the right versions', async () => {
      const origB64 = await all.readOriginalBase64('logo.png', { kind: 'all' })
      const modB64 = await all.readModifiedBase64('logo.png', { kind: 'all' })
      expect(origB64).toBe(LOGO_AT_BASE.toString('base64'))
      expect(modB64).toBe(LOGO_AT_WORKTREE.toString('base64'))
      expect(origB64).not.toBe(modB64)
    })

    it("binary 'working' modified base64 is the working-tree blob", async () => {
      const modB64 = await all.readModifiedBase64('logo.png', { kind: 'working' })
      expect(modB64).toBe(LOGO_AT_WORKTREE.toString('base64'))
    })
  })
}

/**
 * Base-ref resolution contract. The default-base choice must match across
 * backends or users see different diffs depending on which build they run.
 */
export function defineBaseResolutionContract(name: string, resolveBase: BaseResolver): void {
  describe(`base resolution contract: ${name}`, () => {
    it('defaults to master when it is the only conventional branch', async () => {
      const { repo, cleanup } = buildSingleBranchRepo('master')
      try {
        expect(await resolveBase(repo)).toBe('master')
      } finally {
        cleanup()
      }
    })

    it('defaults to main when it is the only conventional branch', async () => {
      const { repo, cleanup } = buildSingleBranchRepo('main')
      try {
        expect(await resolveBase(repo)).toBe('main')
      } finally {
        cleanup()
      }
    })

    it('honors an explicit base that exists', async () => {
      const { repo, cleanup } = buildSingleBranchRepo('master')
      try {
        expect(await resolveBase(repo, 'master')).toBe('master')
      } finally {
        cleanup()
      }
    })

    it('falls back to HEAD when the explicit base does not exist', async () => {
      const { repo, cleanup } = buildSingleBranchRepo('master')
      try {
        expect(await resolveBase(repo, 'nope-not-a-ref')).toBe('HEAD')
      } finally {
        cleanup()
      }
    })
  })
}

/**
 * Review submission contract. The .md + .pending files and especially the
 * .pending JSON shape are consumed by the orche CLI watcher across a process
 * boundary, so they must be byte-for-byte reproducible by any backend.
 */
export function defineSubmitContract(name: string, submit: SubmitFn): void {
  describe(`submit contract: ${name}`, () => {
    it('writes the review markdown to <reviews>/<now>.md and returns its path', async () => {
      const { worktreePath, reviewsDir, cleanup } = buildWorktreeLayout()
      try {
        const result = await submit({
          worktreePath,
          markdown: '# Review\n\nLooks good.\n',
          target: { multiplexer: 'tmux', paneId: '%3', workspaceId: 'ws1' },
          now: 1234,
        })
        const expectedPath = path.join(reviewsDir, '1234.md')
        expect(result).toEqual({ success: true, path: expectedPath })
        expect(readFileSync(expectedPath, 'utf-8')).toBe('# Review\n\nLooks good.\n')
      } finally {
        cleanup()
      }
    })

    it('writes a .pending sidecar with the exact CLI-consumed shape', async () => {
      const { worktreePath, reviewsDir, cleanup } = buildWorktreeLayout()
      try {
        await submit({
          worktreePath,
          markdown: 'body',
          target: { multiplexer: 'cmux', paneId: 'surface-7', workspaceId: 'wsX' },
          now: 9999,
        })
        const pendingPath = path.join(reviewsDir, '9999.md.pending')
        const pending = JSON.parse(readFileSync(pendingPath, 'utf-8'))
        expect(pending).toEqual({
          reviewPath: path.join(reviewsDir, '9999.md'),
          multiplexer: 'cmux',
          paneId: 'surface-7',
          workspaceId: 'wsX',
        })
      } finally {
        cleanup()
      }
    })

    it('creates the reviews dir when it does not exist yet', async () => {
      const { worktreePath, reviewsDir, cleanup } = buildWorktreeLayout()
      try {
        expect(existsSync(reviewsDir)).toBe(false)
        await submit({
          worktreePath,
          markdown: 'x',
          target: { multiplexer: 'tmux', paneId: '%1' },
          now: 1,
        })
        expect(existsSync(reviewsDir)).toBe(true)
      } finally {
        cleanup()
      }
    })

    it('omits workspaceId from the sidecar when not provided', async () => {
      const { worktreePath, reviewsDir, cleanup } = buildWorktreeLayout()
      try {
        await submit({
          worktreePath,
          markdown: 'x',
          target: { multiplexer: 'tmux', paneId: '%1' },
          now: 42,
        })
        const pending = JSON.parse(readFileSync(path.join(reviewsDir, '42.md.pending'), 'utf-8'))
        expect('workspaceId' in pending).toBe(false)
        expect(pending.multiplexer).toBe('tmux')
        expect(pending.paneId).toBe('%1')
      } finally {
        cleanup()
      }
    })
  })
}

/**
 * Delivery-target resolution from session.json + tmux/cmux flags. The
 * insertion-order "first pane" rule is the subtle parity point here.
 */
export function defineTargetResolutionContract(name: string, resolve: TargetResolver): void {
  describe(`target resolution contract: ${name}`, () => {
    it('uses session.json multiplexer + first pane (insertion order) + workspaceId', async () => {
      // panes inserted z-agent then a-dev: first-by-insertion is %1, first-by-sort is %2.
      const { worktreePath, cleanup } = buildSessionWorktree({
        multiplexer: 'cmux',
        panes: { 'z-agent': '%1', 'a-dev': '%2' },
        workspaceId: 'ws-42',
      })
      try {
        expect(await resolve(worktreePath)).toEqual({
          multiplexer: 'cmux',
          paneId: '%1',
          workspaceId: 'ws-42',
        })
      } finally {
        cleanup()
      }
    })

    it('falls back to the tmux flag when session.json is absent', async () => {
      const { worktreePath, cleanup } = buildSessionWorktree(undefined)
      try {
        expect(await resolve(worktreePath, { tmuxTarget: '%9' })).toEqual({
          multiplexer: 'tmux',
          paneId: '%9',
        })
      } finally {
        cleanup()
      }
    })

    it('flag pane id wins over the session first pane', async () => {
      const { worktreePath, cleanup } = buildSessionWorktree({
        multiplexer: 'tmux',
        panes: { agent: '%1' },
      })
      try {
        const target = await resolve(worktreePath, { tmuxTarget: '%override' })
        expect(target.paneId).toBe('%override')
        expect(target.multiplexer).toBe('tmux')
      } finally {
        cleanup()
      }
    })

    it('multiplexer is null with no session and no flags', async () => {
      const { worktreePath, cleanup } = buildSessionWorktree(undefined)
      try {
        expect(await resolve(worktreePath)).toEqual({ multiplexer: null })
      } finally {
        cleanup()
      }
    })
  })
}
