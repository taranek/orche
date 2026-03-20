import { create } from 'zustand'

interface FileState {
  selectedFile: string | null
  selectFile: (path: string | null) => void
}

export const useFileStore = create<FileState>()((set) => ({
  selectedFile: null,
  selectFile: (path) => set({ selectedFile: path }),
}))
