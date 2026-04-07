/// <reference types="vite/client" />

declare global {
  const __BUILD_TIME__: string
  interface Window {
    review: {
      getWorktreePath: () => Promise<string>
      getTmuxTarget: () => Promise<string | null>
      getChanges: () => Promise<
        Array<{ path: string; name: string; status: 'modified' | 'added' | 'deleted' }>
      >
      readOriginal: (filePath: string) => Promise<string | null>
      read: (filePath: string) => Promise<string>
      write: (filePath: string, content: string) => Promise<void>
      getBranch: () => Promise<string | null>
      submit: (markdown: string) => Promise<{ success: boolean; path?: string; error?: string }>
      quit: () => void
    }
  }
}

export {}
