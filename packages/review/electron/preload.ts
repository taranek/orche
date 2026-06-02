import { ipcRenderer, contextBridge } from 'electron'

type Range = { kind: 'all' } | { kind: 'working' } | { kind: 'commit'; sha: string }

contextBridge.exposeInMainWorld('review', {
  getWorktreePath: (): Promise<string> =>
    ipcRenderer.invoke('review:getWorktreePath'),

  getTmuxTarget: (): Promise<string | null> =>
    ipcRenderer.invoke('review:getTmuxTarget'),

  getChanges: (range?: Range): Promise<
    Array<{ path: string; name: string; status: 'modified' | 'added' | 'deleted' }>
  > => ipcRenderer.invoke('files:getChanges', { range }),

  getCommits: (): Promise<
    Array<{ sha: string; shortSha: string; subject: string; author: string; date: string }>
  > => ipcRenderer.invoke('review:getCommits'),

  readOriginal: (filePath: string, range?: Range): Promise<string | null> =>
    ipcRenderer.invoke('files:readOriginal', { filePath, range }),

  read: (filePath: string, range?: Range): Promise<string> =>
    ipcRenderer.invoke('files:read', { filePath, range }),

  readBase64: (filePath: string, range?: Range): Promise<string | null> =>
    ipcRenderer.invoke('files:readBase64', { filePath, range }),

  readOriginalBase64: (filePath: string, range?: Range): Promise<string | null> =>
    ipcRenderer.invoke('files:readOriginalBase64', { filePath, range }),

  write: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('files:write', { filePath, content }),

  getBranch: (): Promise<string | null> =>
    ipcRenderer.invoke('review:getBranch'),

  submit: (markdown: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('review:submit', { markdown }),

  quit: (): void => ipcRenderer.send('review:quit'),
})
