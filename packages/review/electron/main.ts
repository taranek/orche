import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { resolveBase, type Range } from './git'
import { createGitBackend } from './git-backend'
import { submitReview } from './submit'
import { resolveSubmitTarget } from './session'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// CLI args
const rawWorktreePath = process.argv.find(a => a.startsWith('--worktree='))?.split('=')[1]
  ?? process.argv[process.argv.length - 1]
// Git reports paths relative to the repo toplevel regardless of cwd, so resolve
// the passed-in path to the git toplevel to keep filesystem reads consistent.
// Works for worktrees, regular clones, and subdirectories of either.
const worktreePath = (() => {
  if (!rawWorktreePath) return rawWorktreePath
  try {
    const resolved = execSync('git rev-parse --show-toplevel', { cwd: rawWorktreePath, encoding: 'utf-8' }).trim()
    if (resolved !== rawWorktreePath) {
      console.log(`[review] resolved worktree path ${rawWorktreePath} -> ${resolved}`)
    }
    return resolved
  } catch (err) {
    console.error(`[review] failed to resolve git toplevel for ${rawWorktreePath}, falling back to raw path:`, err)
    return rawWorktreePath
  }
})()
const tmuxTarget = process.argv.find(a => a.startsWith('--tmux='))?.split('=')[1]
const cmuxSurface = process.argv.find(a => a.startsWith('--surface='))?.split('=')[1]
const baseArg = process.argv.find(a => a.startsWith('--base='))?.split('=')[1]

// Base ref to diff against — see git.ts resolveBase for the precedence rules.
const baseRef = worktreePath ? resolveBase(worktreePath, baseArg) : (baseArg ?? 'HEAD')
console.log('[review] baseRef:', baseRef)

// The single backend instance the IPC handlers delegate to. This is the exact
// same adapter the contract tests validate (git-backend.contract.test.ts), so
// the tested behavior IS the production behavior.
const backend = worktreePath ? createGitBackend(worktreePath, baseRef) : null

// Resolve where submitted reviews are delivered (session.json + tmux/cmux flags).
// See session.ts — contract-tested and mirrored by the Rust backend.
const submitTarget = worktreePath
  ? resolveSubmitTarget(worktreePath, { tmuxTarget, cmuxSurface })
  : { multiplexer: null }

console.log('[review] argv:', process.argv)
console.log('[review] submitTarget:', submitTarget)

let win: BrowserWindow | null

function createWindow() {
  console.log('[review] worktreePath:', worktreePath)
  console.log('[review] argv:', process.argv)

  win = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 1200,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 7, y: 4 },
    vibrancy: 'fullscreen-ui',
    transparent: true,
    // Avoid the blank-window flash: stay hidden until the renderer has painted its first frame.
    show: false,
    title: `Review — ${path.basename(worktreePath ?? '')}`,
    // Packaged builds use the bundle's .icns/.ico (set via electron-builder).
    // In dev the bundled icon isn't applied, so point at the PNG so Linux/Windows
    // taskbars and the dev dock show the right thing.
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.once('ready-to-show', () => win?.show())

  if (VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  app.quit()
  win = null
})

app.whenReady().then(() => {
  createWindow()
})

// --- IPC: pass worktree path to renderer ---

ipcMain.on('review:quit', () => app.quit())

ipcMain.handle('review:getWorktreePath', () => worktreePath)

ipcMain.handle('review:getBranch', async () => backend?.getBranch() ?? null)
ipcMain.handle('review:getTmuxTarget', () => tmuxTarget ?? null)

// --- IPC: file operations ---
// All git-backed reads delegate to `backend` (the contract-tested git adapter).

const DEFAULT_RANGE: Range = { kind: 'all' }

ipcMain.handle('files:getChanges', async (_event, payload?: { range?: Range }) => {
  return backend?.getChanges(payload?.range ?? DEFAULT_RANGE) ?? []
})

ipcMain.handle('review:getCommits', async () => backend?.getCommits() ?? [])

ipcMain.handle('files:readOriginal', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  return backend?.readOriginal(filePath, range ?? DEFAULT_RANGE) ?? null
})

ipcMain.handle('files:read', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  return backend?.readModified(filePath, range ?? DEFAULT_RANGE) ?? ''
})

ipcMain.handle('files:readBase64', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  return backend?.readModifiedBase64(filePath, range ?? DEFAULT_RANGE) ?? null
})

ipcMain.handle('files:readOriginalBase64', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  return backend?.readOriginalBase64(filePath, range ?? DEFAULT_RANGE) ?? null
})

ipcMain.handle('files:write', async (_event, { filePath, content }: { filePath: string; content: string }) => {
  if (!worktreePath) return
  const fullPath = path.join(worktreePath, filePath)
  await writeFile(fullPath, content, 'utf-8')
})

// --- IPC: submit review ---
// Electron cannot access the cmux socket (only processes started inside cmux can).
// Write a .pending file that the CLI process (which IS inside cmux) watches and delivers.

ipcMain.handle('review:submit', async (_event, { markdown }: { markdown: string }) => {
  console.log('[review] submit called')
  if (!worktreePath) return { success: false, error: 'No worktree path' }

  const result = await submitReview({
    worktreePath,
    markdown,
    target: submitTarget,
    now: Date.now(),
  })
  console.log('[review] saved to:', result.path)
  return result
})
