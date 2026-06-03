// Single seam between the renderer and the Tauri backend. The UI calls
// reviewClient.* and never touches the Tauri invoke bridge directly.
//
// Uses the global __TAURI__ bridge (app.withGlobalTauri = true) so no
// @tauri-apps/api dependency is needed in the renderer bundle. Command names
// and arg keys map onto the #[tauri::command] wrappers in src-tauri; Tauri
// converts camelCase JS arg keys (filePath) to snake_case params (file_path).

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

interface TauriBridge {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> }
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = (window as unknown as { __TAURI__?: TauriBridge }).__TAURI__
  if (!bridge) return Promise.reject(new Error('Tauri bridge unavailable — the review app must run under Tauri'))
  return bridge.core.invoke<T>(cmd, args)
}

export const reviewClient: ReviewClient = {
  getChanges: (range = DEFAULT_RANGE) => invoke('get_changes', { range }),
  getCommits: () => invoke('get_commits'),
  getBranch: () => invoke('get_branch'),
  read: (filePath, range = DEFAULT_RANGE) => invoke('read_modified', { filePath, range }),
  readOriginal: (filePath, range = DEFAULT_RANGE) => invoke('read_original', { filePath, range }),
  readBase64: (filePath, range = DEFAULT_RANGE) => invoke('read_modified_base64', { filePath, range }),
  readOriginalBase64: (filePath, range = DEFAULT_RANGE) => invoke('read_original_base64', { filePath, range }),
  write: (filePath, content) => invoke('write_file', { filePath, content }),
  submit: (markdown) => invoke('submit_review', { markdown }),
  quit: () => { void invoke('quit') },
}
