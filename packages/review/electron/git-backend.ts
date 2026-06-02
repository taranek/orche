// Electron adapter: implements the backend-agnostic ReviewBackend contract
// over the git.ts functions. This is the implementation the contract suite
// validates today. The future Tauri backend will provide its own object
// satisfying the same interface, and the same contract suite will validate it.

import type { ReviewBackend } from '../contract/types'
import {
  getChangedFiles,
  getCommits,
  getBranch,
  readOriginal,
  readModified,
  readOriginalBase64,
  readModifiedBase64,
  resolveBase,
} from './git'

// Returns a concrete ReviewBackend (synchronous). It's still assignable to the
// ReviewBackendFactory the contract expects, and main.ts gets a non-Promise type.
export function createGitBackend(worktreePath: string, base: string): ReviewBackend {
  return {
    getChanges: (range) => getChangedFiles(worktreePath, base, range),
    getCommits: () => getCommits(worktreePath, base),
    getBranch: () => getBranch(worktreePath),
    readOriginal: (filePath, range) => readOriginal(worktreePath, base, range, filePath),
    readModified: (filePath, range) => readModified(worktreePath, base, range, filePath),
    readOriginalBase64: (filePath, range) => readOriginalBase64(worktreePath, base, range, filePath),
    readModifiedBase64: (filePath, range) => readModifiedBase64(worktreePath, base, range, filePath),
  }
}

// The electron base resolver, matching the BaseResolver contract signature.
export { resolveBase as resolveBaseElectron }
