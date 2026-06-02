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
const baseArg = process.argv.find(a => a.startsWith('--base='))?.split('=')[1]

// Resolve the base ref to diff against. CLI flag wins; otherwise probe common defaults.
// We keep the raw ref (not a SHA) so `git show <base>:path` and `git diff <base>` stay readable.
function resolveBase(cwd: string, explicit: string | undefined): string {
  const candidates = explicit ? [explicit] : []
  if (!explicit) {
    try {
      const head = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', { cwd, encoding: 'utf-8' }).trim()
      // e.g. "origin/main" -> "main"
      if (head.startsWith('origin/')) candidates.push(head.slice('origin/'.length))
      else candidates.push(head)
    } catch (err) {
      console.log('[review] no origin/HEAD symbolic ref, falling through to main/master probe:', (err as Error).message)
    }
    candidates.push('main', 'master')
  }
  for (const ref of candidates) {
    try {
      execSync(`git rev-parse --verify --quiet ${ref}`, { cwd, stdio: 'ignore' })
      return ref
    } catch (err) {
      console.log(`[review] base candidate "${ref}" not found:`, (err as Error).message)
    }
  }
  console.warn('[review] no base ref resolved, falling back to HEAD (committed changes will not appear in diff)')
  return 'HEAD'
}

const baseRef = worktreePath ? resolveBase(worktreePath, baseArg) : (baseArg ?? 'HEAD')
console.log('[review] baseRef:', baseRef)

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
    // Packaged builds use the bundle's .icns/.ico (set via electron-builder).
    // In dev the bundled icon isn't applied, so point at the PNG so Linux/Windows
    // taskbars and the dev dock show the right thing.
    icon: path.join(__dirname, '../build/icon.png'),
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

type ChangeStatus = 'modified' | 'added' | 'deleted'

/**
 * Range describes what slice of history the user wants to review.
 *  - 'all'      → base..HEAD + working tree (default)
 *  - 'working'  → working tree only (HEAD..worktree)
 *  - { kind: 'commit', sha } → just that commit (sha^..sha)
 */
type Range = { kind: 'all' } | { kind: 'working' } | { kind: 'commit'; sha: string }

/**
 * Translate a Range into the two endpoints we need:
 *  - `diffArg`: what to pass to `git diff <diffArg>` to list changed files
 *  - `originRef`: what to pass to `git show <originRef>:path` to get the "before" version
 *  - `includeUntracked`: whether to also walk untracked files (only true when working tree is in scope)
 */
function resolveRange(
  range: Range,
  base: string,
): { diffArg: string; originRef: string; modifiedRef: string | null; includeUntracked: boolean } {
  if (range.kind === 'commit') {
    // Modified side is the commit itself; original is its parent.
    return { diffArg: `${range.sha}^..${range.sha}`, originRef: `${range.sha}^`, modifiedRef: range.sha, includeUntracked: false }
  }
  if (range.kind === 'working') {
    // Modified side is the working tree on disk (null sentinel).
    return { diffArg: 'HEAD', originRef: 'HEAD', modifiedRef: null, includeUntracked: true }
  }
  // 'all'
  return { diffArg: base, originRef: base, modifiedRef: null, includeUntracked: true }
}

async function getChangedFiles(cwd: string, base: string, range: Range) {
  const byPath = new Map<string, ChangeStatus>()
  const { diffArg, includeUntracked } = resolveRange(range, base)

  // Tracked changes — `git diff <diffArg>` combines committed + staged + unstaged when diffArg is a ref,
  // or shows just the commit's own diff when diffArg is "sha^ sha".
  try {
    const { stdout } = await execAsync(`git diff --name-status ${diffArg}`, { cwd })
    for (const line of stdout.split('\n')) {
      if (!line) continue
      const parts = line.split('\t')
      const code = parts[0]
      // Renames produce "R100\told\tnew" — show the new path as modified for now.
      const filePath = parts[parts.length - 1]
      if (!filePath) continue
      const status: ChangeStatus = code.startsWith('A')
        ? 'added'
        : code.startsWith('D')
          ? 'deleted'
          : 'modified'
      byPath.set(filePath, status)
    }
  } catch (err) {
    console.error(`[review] git diff --name-status ${diffArg} failed:`, err)
  }

  // Untracked files (not yet `git add`-ed) — only relevant when working tree is in scope.
  if (includeUntracked) {
    try {
      const { stdout } = await execAsync('git ls-files --others --exclude-standard', { cwd })
      for (const line of stdout.split('\n')) {
        const filePath = line.trim()
        if (!filePath) continue
        if (!byPath.has(filePath)) byPath.set(filePath, 'added')
      }
    } catch (err) {
      console.error('[review] git ls-files --others failed:', err)
    }
  }

  return Array.from(byPath, ([filePath, status]) => ({
    path: filePath,
    name: filePath.split('/').pop() || filePath,
    status,
  })).sort((a, b) => a.path.localeCompare(b.path))
}

interface CommitInfo { sha: string; shortSha: string; subject: string; author: string; date: string }

async function getCommits(cwd: string, base: string): Promise<CommitInfo[]> {
  try {
    // %H sha, %h short, %s subject, %an author, %ai ISO date
    // null byte between fields, newline between commits (commits w/ newlines in subject are still safe via -z would be ideal,
    // but %s strips newlines anyway, so a normal newline separator is fine here).
    const { stdout } = await execAsync(`git log --format=%H%x00%h%x00%s%x00%an%x00%ai ${base}..HEAD`, { cwd })
    return stdout.split('\n').filter(Boolean).map(line => {
      const [sha, shortSha, subject, author, date] = line.split('\0')
      return { sha, shortSha, subject, author, date }
    })
  } catch (err) {
    console.error(`[review] git log ${base}..HEAD failed:`, err)
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
  } catch (err) {
    console.error('[review] git rev-parse failed:', err)
    return null
  }
})
ipcMain.handle('review:getTmuxTarget', () => tmuxTarget ?? null)

// --- IPC: file operations ---

ipcMain.handle('files:getChanges', async (_event, payload?: { range?: Range }) => {
  if (!worktreePath) return []
  const range = payload?.range ?? { kind: 'all' as const }
  return getChangedFiles(worktreePath, baseRef, range)
})

ipcMain.handle('review:getCommits', async () => {
  if (!worktreePath) return []
  return getCommits(worktreePath, baseRef)
})

ipcMain.handle('files:readOriginal', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  if (!worktreePath) return null
  const { originRef } = resolveRange(range ?? { kind: 'all' }, baseRef)
  try {
    const { stdout } = await execAsync(`git show ${originRef}:"${filePath}"`, {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024,
    })
    return stdout
  } catch (err) {
    // Expected when the file didn't exist at originRef (added files). Logged at .log so it's debuggable but not alarming.
    console.log(`[review] git show ${originRef}:${filePath} returned no content:`, (err as Error).message)
    return null
  }
})

ipcMain.handle('files:read', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  if (!worktreePath) return ''
  const { modifiedRef } = resolveRange(range ?? { kind: 'all' }, baseRef)
  if (modifiedRef) {
    // Modified side is at a specific commit, not on disk — read from git.
    try {
      const { stdout } = await execAsync(`git show ${modifiedRef}:"${filePath}"`, {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024,
      })
      return stdout
    } catch (err) {
      console.log(`[review] git show ${modifiedRef}:${filePath} returned no content:`, (err as Error).message)
      return ''
    }
  }
  const fullPath = path.join(worktreePath, filePath)
  try {
    const { statSync } = await import('node:fs')
    if (statSync(fullPath).isDirectory()) return ''
    return await readFile(fullPath, 'utf-8')
  } catch (err) {
    // Expected for deleted files (no longer on disk).
    console.log(`[review] read ${filePath} failed:`, (err as Error).message)
    return ''
  }
})

ipcMain.handle('files:readBase64', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  if (!worktreePath) return null
  const { modifiedRef } = resolveRange(range ?? { kind: 'all' }, baseRef)
  if (modifiedRef) {
    try {
      const { stdout } = await execAsync(`git show ${modifiedRef}:"${filePath}"`, {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'buffer',
      })
      return (stdout as unknown as Buffer).toString('base64')
    } catch (err) {
      console.log(`[review] git show ${modifiedRef}:${filePath} (binary) returned no content:`, (err as Error).message)
      return null
    }
  }
  const fullPath = path.join(worktreePath, filePath)
  try {
    const buf = await readFile(fullPath)
    return buf.toString('base64')
  } catch (err) {
    console.log(`[review] readBase64 ${filePath} failed:`, (err as Error).message)
    return null
  }
})

ipcMain.handle('files:readOriginalBase64', async (_event, { filePath, range }: { filePath: string; range?: Range }) => {
  if (!worktreePath) return null
  const { originRef } = resolveRange(range ?? { kind: 'all' }, baseRef)
  try {
    const { stdout } = await execAsync(`git show ${originRef}:"${filePath}"`, {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'buffer',
    })
    return (stdout as unknown as Buffer).toString('base64')
  } catch (err) {
    console.log(`[review] git show ${originRef}:${filePath} (binary) returned no content:`, (err as Error).message)
    return null
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
