// Single seam between the renderer and the backend. The UI calls reviewClient.*
// and never touches window.review or Tauri invoke directly — so swapping the
// electron backend for Tauri is this one file, not a sweep across components.
//
// Runtime detection: Tauri injects window.__TAURI__ (with app.withGlobalTauri),
// electron exposes window.review via the preload bridge.

import type { ReviewRange, ReviewCommit, FileChange } from '../types'

export interface ReviewClient {
  getChanges(range?: ReviewRange): Promise<FileChange[]>
  getCommits(): Promise<ReviewCommit[]>
  getBranch(): Promise<string | null>
  read(filePath: string, range?: ReviewRange): Promise<string>
  readOriginal(filePath: string, range?: ReviewRange): Promise<string | null>
  readBase64(filePath: string, range?: ReviewRange): Promise<string | null>
  readOriginalBase64(filePath: string, range?: ReviewRange): Promise<string | null>
  write(filePath: string, content: string): Promise<void>
  submit(markdown: string): Promise<{ success: boolean; path?: string; error?: string }>
  quit(): void
}

const DEFAULT_RANGE: ReviewRange = { kind: 'all' }

// --- electron backend (current) ---

const electronClient: ReviewClient = {
  getChanges: (range) => window.review.getChanges(range),
  getCommits: () => window.review.getCommits(),
  getBranch: () => window.review.getBranch(),
  read: (filePath, range) => window.review.read(filePath, range),
  readOriginal: (filePath, range) => window.review.readOriginal(filePath, range),
  readBase64: (filePath, range) => window.review.readBase64(filePath, range),
  readOriginalBase64: (filePath, range) => window.review.readOriginalBase64(filePath, range),
  write: (filePath, content) => window.review.write(filePath, content),
  submit: (markdown) => window.review.submit(markdown),
  quit: () => window.review.quit(),
}

// --- Tauri backend (migration target) ---
// Uses the global __TAURI__ bridge (app.withGlobalTauri = true) so no
// @tauri-apps/api dependency is needed in the renderer bundle. Command names
// and arg keys map onto the #[tauri::command] wrappers in src-tauri; Tauri
// converts camelCase JS arg keys to snake_case Rust params automatically.

interface TauriBridge {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> }
}

function tauri(): TauriBridge {
  return (window as unknown as { __TAURI__: TauriBridge }).__TAURI__
}

const tauriClient: ReviewClient = {
  getChanges: (range = DEFAULT_RANGE) => tauri().core.invoke('get_changes', { range }),
  getCommits: () => tauri().core.invoke('get_commits'),
  getBranch: () => tauri().core.invoke('get_branch'),
  read: (filePath, range = DEFAULT_RANGE) => tauri().core.invoke('read_modified', { filePath, range }),
  readOriginal: (filePath, range = DEFAULT_RANGE) => tauri().core.invoke('read_original', { filePath, range }),
  readBase64: (filePath, range = DEFAULT_RANGE) => tauri().core.invoke('read_modified_base64', { filePath, range }),
  readOriginalBase64: (filePath, range = DEFAULT_RANGE) => tauri().core.invoke('read_original_base64', { filePath, range }),
  write: (filePath, content) => tauri().core.invoke('write_file', { filePath, content }),
  submit: (markdown) => tauri().core.invoke('submit_review', { markdown }),
  quit: () => { void tauri().core.invoke('quit') },
}

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

export const reviewClient: ReviewClient = isTauri ? tauriClient : electronClient
