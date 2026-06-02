/// <reference types="vite/client" />

import type { ReviewCommit, ReviewRange } from './types'

declare global {
  const __BUILD_TIME__: string
  interface Window {
    review: {
      getWorktreePath: () => Promise<string>
      getTmuxTarget: () => Promise<string | null>
      getChanges: (range?: ReviewRange) => Promise<
        Array<{ path: string; name: string; status: 'modified' | 'added' | 'deleted' }>
      >
      getCommits: () => Promise<ReviewCommit[]>
      readOriginal: (filePath: string, range?: ReviewRange) => Promise<string | null>
      read: (filePath: string, range?: ReviewRange) => Promise<string>
      readBase64: (filePath: string, range?: ReviewRange) => Promise<string | null>
      readOriginalBase64: (filePath: string, range?: ReviewRange) => Promise<string | null>
      write: (filePath: string, content: string) => Promise<void>
      getBranch: () => Promise<string | null>
      submit: (markdown: string) => Promise<{ success: boolean; path?: string; error?: string }>
      quit: () => void
    }
  }
}

export {}
