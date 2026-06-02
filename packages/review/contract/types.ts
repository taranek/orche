// Canonical contract types for the review backend.
//
// These are backend-agnostic: the electron adapter (electron/git-backend.ts)
// implements ReviewBackend over git.ts today, and a future Tauri/Rust adapter
// will implement the same interface. The contract test suite
// (contract/review-contract.ts) runs identical assertions against whichever
// implementation is supplied — that's what proves parity across the migration.

export type ChangeStatus = 'modified' | 'added' | 'deleted'

export interface FileChange {
  path: string
  name: string
  status: ChangeStatus
}

/**
 * What slice of history the user is reviewing.
 *  - 'all'      → base..HEAD + working tree (default)
 *  - 'working'  → working tree only (HEAD..worktree)
 *  - { kind: 'commit', sha } → just that commit (sha^..sha)
 */
export type Range =
  | { kind: 'all' }
  | { kind: 'working' }
  | { kind: 'commit'; sha: string }

export interface CommitInfo {
  sha: string
  shortSha: string
  subject: string
  author: string
  date: string
}

/**
 * The review backend surface, bound to a single worktree + base ref.
 * Every method maps onto an electron IPC handler today and a Tauri command
 * tomorrow. The contract suite depends ONLY on this interface.
 */
export interface ReviewBackend {
  getChanges(range: Range): Promise<FileChange[]>
  getCommits(): Promise<CommitInfo[]>
  getBranch(): Promise<string | null>
  /** "Before" version as UTF-8 text; null when the file didn't exist at the origin ref. */
  readOriginal(filePath: string, range: Range): Promise<string | null>
  /** "After" version as UTF-8 text; '' on failure (e.g. deleted files). */
  readModified(filePath: string, range: Range): Promise<string>
  /** Base64 of the "before" version (binary files); null on miss. */
  readOriginalBase64(filePath: string, range: Range): Promise<string | null>
  /** Base64 of the "after" version (binary files); null on miss. */
  readModifiedBase64(filePath: string, range: Range): Promise<string | null>
}

/** Constructs a backend bound to a worktree + base ref. */
export type ReviewBackendFactory = (worktreePath: string, base: string) => ReviewBackend | Promise<ReviewBackend>

/** Resolves the default base ref for a worktree (explicit override wins). */
export type BaseResolver = (worktreePath: string, explicit?: string) => string | Promise<string>

/**
 * Where a submitted review should be delivered. Resolved at startup from
 * session.json / CLI args. These fields are written verbatim into the .pending
 * file that the orche CLI watcher consumes to inject the review into the agent's
 * pane, so their names are a cross-process contract — do not rename.
 */
export interface SubmitTarget {
  multiplexer: string | null
  paneId?: string
  workspaceId?: string
}

export interface SubmitResult {
  success: boolean
  path?: string
  error?: string
}

/**
 * Persists a submitted review: writes the markdown file and a sibling .pending
 * file the CLI watches. `now` is injected (not read from the clock) so the
 * timestamped filename is deterministic and testable across backends.
 */
export type SubmitFn = (opts: {
  worktreePath: string
  markdown: string
  target: SubmitTarget
  now: number
}) => Promise<SubmitResult>

/**
 * Resolves the delivery target from <worktree>/.orche/session.json plus optional
 * tmux/cmux flags. The "first pane" rule depends on the panes map's insertion
 * order, which the backend must preserve.
 */
export type TargetResolver = (
  worktreePath: string,
  opts?: { tmuxTarget?: string; cmuxSurface?: string },
) => SubmitTarget | Promise<SubmitTarget>
