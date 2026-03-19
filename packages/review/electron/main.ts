import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// CLI args
const worktreePath = process.argv.find(a => a.startsWith('--worktree='))?.split('=')[1]
  ?? process.argv[process.argv.length - 1]
const tmuxTarget = process.argv.find(a => a.startsWith('--tmux='))?.split('=')[1]

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

app.on('window-all-closed', () => {
  app.quit()
  win = null
})

app.whenReady().then(createWindow)

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
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: worktreePath })
    return stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const status = line.slice(0, 2).trim()
        const filePath = line.slice(3)
        return {
          path: filePath,
          name: filePath.split('/').pop() || filePath,
          status:
            status === 'M' || status === 'MM'
              ? 'modified'
              : status === 'A' || status === '??' || status === 'AM'
                ? 'added'
                : 'deleted',
        }
      })
  } catch {
    return []
  }
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
  return readFile(fullPath, 'utf-8')
})

// --- IPC: submit review ---

ipcMain.handle('review:submit', async (_event, { markdown }: { markdown: string }) => {
  if (!worktreePath) return { success: false, error: 'No worktree path' }

  // Write review file
  const reviewsDir = path.join(worktreePath, '..', '..', '.orche', 'reviews')
  await mkdir(reviewsDir, { recursive: true })
  const filename = `${Date.now()}.md`
  const reviewPath = path.join(reviewsDir, filename)
  await writeFile(reviewPath, markdown, 'utf-8')

  // If tmux target specified, paste review into the pane
  if (tmuxTarget) {
    try {
      // Write to a temp file, load into tmux buffer, paste into target pane
      const tmpFile = path.join(reviewsDir, `.tmp-${Date.now()}`)
      await writeFile(tmpFile, markdown, 'utf-8')
      await execAsync(`tmux load-buffer "${tmpFile}"`)
      await execAsync(`tmux paste-buffer -t "${tmuxTarget}"`)
      await execAsync(`tmux send-keys -t "${tmuxTarget}" Enter`)
      await import('node:fs').then(fs => fs.promises.unlink(tmpFile)).catch(() => {})
    } catch (err) {
      console.error('[review] tmux paste failed:', err)
    }
  }

  return { success: true, path: reviewPath }
})
