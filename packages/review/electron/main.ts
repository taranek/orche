import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const execAsync = promisify(exec)
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

// Read session.json for pane targets (written by orche CLI at session creation)
interface SessionInfo { multiplexer: string; panes: Record<string, string>; workspaceId?: string }
let sessionInfo: SessionInfo | null = null
try {
  const sessionPath = path.join(worktreePath ?? '', '.orche', 'session.json')
  sessionInfo = JSON.parse(readFileSync(sessionPath, 'utf-8'))
} catch (e) {
  console.log('[review] session.json read error:', e)
}

// Resolve the agent target: explicit flag > session.json first pane > nothing
const agentMultiplexer = sessionInfo?.multiplexer ?? (tmuxTarget ? 'tmux' : cmuxSurface ? 'cmux' : null)
const agentPaneId = tmuxTarget ?? cmuxSurface ?? (sessionInfo ? Object.values(sessionInfo.panes)[0] : undefined)

console.log('[review] argv:', process.argv)
console.log('[review] session.json:', sessionInfo)
console.log('[review] agentMultiplexer:', agentMultiplexer, 'agentPaneId:', agentPaneId)

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
    title: `Review — ${path.basename(worktreePath ?? '')}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// --- File watcher ---

async function getChangedFiles(cwd: string) {
  try {
    // -uall expands untracked directories into individual files
    const { stdout } = await execAsync('git status --porcelain -uall', { cwd })
    return stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const status = line.slice(0, 2).trim()
        const filePath = line.slice(3).trim()
        return { status, filePath }
      })
      .filter(({ filePath }) => filePath.length > 0)
      .map(({ status, filePath }) => ({
        path: filePath,
        name: filePath.split('/').pop() || filePath,
        status:
          status === 'M' || status === 'MM'
            ? 'modified'
            : status === 'A' || status === '??' || status === 'AM'
              ? 'added'
              : 'deleted' as const,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  } catch {
    return []
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

ipcMain.handle('review:getBranch', async () => {
  if (!worktreePath) return null
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath })
    return stdout.trim()
  } catch {
    return null
  }
})
ipcMain.handle('review:getTmuxTarget', () => tmuxTarget ?? null)

// --- IPC: file operations ---

ipcMain.handle('files:getChanges', async () => {
  if (!worktreePath) return []
  return getChangedFiles(worktreePath)
})

ipcMain.handle('files:readOriginal', async (_event, { filePath }) => {
  if (!worktreePath) return null
  try {
    const { stdout } = await execAsync(`git show HEAD:"${filePath}"`, {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024,
    })
    return stdout
  } catch {
    return null
  }
})

ipcMain.handle('files:read', async (_event, { filePath }) => {
  if (!worktreePath) return ''
  const fullPath = path.join(worktreePath, filePath)
  try {
    const { statSync } = await import('node:fs')
    if (statSync(fullPath).isDirectory()) return ''
    return await readFile(fullPath, 'utf-8')
  } catch {
    return ''
  }
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

  const worktreeName = path.basename(worktreePath)
  const reviewsDir = path.join(worktreePath, '..', '..', 'reviews', worktreeName)
  await mkdir(reviewsDir, { recursive: true })
  const filename = `${Date.now()}.md`
  const reviewPath = path.join(reviewsDir, filename)
  await writeFile(reviewPath, markdown, 'utf-8')
  console.log('[review] saved to:', reviewPath)

  // Write a .pending file for the CLI watcher to pick up
  const pendingPath = path.join(reviewsDir, `${filename}.pending`)
  await writeFile(pendingPath, JSON.stringify({
    reviewPath,
    multiplexer: agentMultiplexer,
    paneId: agentPaneId,
    workspaceId: sessionInfo?.workspaceId,
  }), 'utf-8')
  console.log('[review] pending file written:', pendingPath)

  return { success: true, path: reviewPath }
})
