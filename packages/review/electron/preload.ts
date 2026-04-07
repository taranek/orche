import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('review', {
  getWorktreePath: (): Promise<string> =>
    ipcRenderer.invoke('review:getWorktreePath'),

  getTmuxTarget: (): Promise<string | null> =>
    ipcRenderer.invoke('review:getTmuxTarget'),

  getChanges: (): Promise<
    Array<{ path: string; name: string; status: 'modified' | 'added' | 'deleted' }>
  > => ipcRenderer.invoke('files:getChanges'),

  readOriginal: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('files:readOriginal', { filePath }),

  read: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('files:read', { filePath }),

  write: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('files:write', { filePath, content }),

  getBranch: (): Promise<string | null> =>
    ipcRenderer.invoke('review:getBranch'),

  submit: (markdown: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('review:submit', { markdown }),

  quit: (): void => ipcRenderer.send('review:quit'),
})
