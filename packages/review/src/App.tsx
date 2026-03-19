import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ThemeProvider,
  CodeDiffEditor,
  useReviewStore,
  palettes,
  ButtonPill,
  type ExistingComment,
  type PaletteName,
} from '@orche/shared'

// --- Persisted theme ---

const THEME_KEY = 'orche-review-theme'

function usePersistedTheme(): [PaletteName, (name: PaletteName) => void] {
  const [theme, setTheme] = useState<PaletteName>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return (stored && stored in palettes) ? stored as PaletteName : 'obsidian'
  })
  const set = useCallback((name: PaletteName) => {
    setTheme(name)
    localStorage.setItem(THEME_KEY, name)
  }, [])
  return [theme, set]
}

// --- Types ---

interface FileChange {
  path: string
  name: string
  status: 'modified' | 'added' | 'deleted'
}

const REVIEW_ID = 'review-session'

// --- File tree builder (same as main Orche app) ---

interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: 'modified' | 'added' | 'deleted'
  children?: FileTreeNode[]
}

interface BuildNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: 'modified' | 'added' | 'deleted'
  children?: { [key: string]: BuildNode }
}

function buildFileTree(files: { path: string; name: string; status?: 'modified' | 'added' | 'deleted' }[]): FileTreeNode[] {
  const root: { [key: string]: BuildNode } = {}

  files.forEach((file) => {
    const parts = file.path.split('/')
    let current = root

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      const currentPath = parts.slice(0, index + 1).join('/')

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          status: isFile ? file.status : undefined,
          children: isFile ? undefined : {},
        }
      }

      if (!isFile && current[part].children) {
        current = current[part].children!
      }
    })
  })

  const convertToArray = (obj: { [key: string]: BuildNode }): FileTreeNode[] => {
    return Object.values(obj).map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      status: node.status,
      children: node.children ? convertToArray(node.children) : undefined,
    })).sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'folder') return 1
      return a.name.localeCompare(b.name)
    })
  }

  return convertToArray(root)
}

const paletteLabels: Record<PaletteName, string> = {
  obsidian: 'Obsidian',
  porcelain: 'Porcelain',
  sandstone: 'Sandstone',
  arctic: 'Arctic',
}

// --- Icons (22px default, thinner strokes for elegance) ---

function IconFiles({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

function IconComment({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  )
}

function IconPalette({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" />
    </svg>
  )
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  )
}

function IconSend({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11Z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  )
}

function IconFileDoc({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

function SwatchPair({ bg, accent, size = 12 }: { bg: string; accent: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 rounded-sm overflow-hidden border border-edge"
      style={{ width: size, height: size }}
    >
      <span style={{ background: bg, width: '50%', height: '100%' }} />
      <span style={{ background: accent, width: '50%', height: '100%' }} />
    </span>
  )
}

// --- Icon Rail ---

type SidePanel = 'files' | 'comments' | 'theme'

function IconRail({ active, onChange, commentCount }: {
  active: SidePanel
  onChange: (panel: SidePanel) => void
  commentCount: number
}) {
  const topItems: { id: SidePanel; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: 'files', icon: <IconFiles />, label: 'Changed Files' },
    { id: 'comments', icon: <IconComment />, label: 'Comments', badge: commentCount || undefined },
  ]

  const bottomItem = { id: 'theme' as SidePanel, icon: <IconPalette />, label: 'Theme' }

  return (
    <div className="w-12 shrink-0 flex flex-col items-center pt-2 pb-3 gap-2 bg-sidebar/60 border-r border-edge/50">
      {topItems.map(({ id, icon, label, badge }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`relative w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer border-none transition-all duration-200 ${
            active === id
              ? 'bg-hover text-fg'
              : 'bg-transparent text-fg-secondary hover:text-fg hover:bg-hover/40'
          }`}
          title={label}
        >
          {icon}
          {badge != null && badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-accent text-base rounded-full px-1 leading-none shadow-sm">
              {badge}
            </span>
          )}
          {active === id && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-5 bg-accent rounded-r-full" />
          )}
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => onChange(bottomItem.id)}
        className={`relative w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer border-none transition-all duration-200 ${
          active === bottomItem.id
            ? 'bg-hover text-fg'
            : 'bg-transparent text-fg-secondary hover:text-fg hover:bg-hover/40'
        }`}
        title={bottomItem.label}
      >
        {bottomItem.icon}
        {active === bottomItem.id && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-5 bg-accent rounded-r-full" />
        )}
      </button>
    </div>
  )
}

// --- File Tree (same recursive tree as main Orche app) ---

function FileTreeItem({
  node,
  selectedFile,
  onFileSelect,
  depth = 0,
}: {
  node: FileTreeNode
  selectedFile: string | null
  onFileSelect: (path: string) => void
  depth?: number
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const isSelected = node.path === selectedFile

  const statusColor = node.status
    ? { modified: 'text-status-amber', added: 'text-status-green', deleted: 'text-status-red' }[node.status]
    : undefined

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 text-left text-[12px] text-fg hover:bg-hover rounded border-none bg-transparent cursor-pointer font-[inherit]"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <svg
            width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-fg-secondary/60">
            <path d="M1.5 2h4.586a1 1 0 01.707.293l.914.914a1 1 0 00.707.293H14.5a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1V3a1 1 0 011-1z" />
          </svg>
          <span className="font-medium">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onFileSelect(node.path)}
      className={`flex items-center gap-1.5 w-full px-2 py-1.5 text-left text-[12px] font-mono rounded border-none cursor-pointer font-[inherit] transition-colors ${
        isSelected
          ? 'bg-accent-dim text-fg'
          : 'text-fg-secondary hover:text-fg hover:bg-hover'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {node.status ? (
        <span className={`${statusColor} text-[10px]`}>
          {node.status === 'modified' && '~'}
          {node.status === 'added' && '+'}
          {node.status === 'deleted' && '-'}
        </span>
      ) : (
        <span className="w-[8px]" />
      )}
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-fg-secondary/60 shrink-0">
        <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="truncate">{node.name}</span>
    </button>
  )
}

function FileTreePanel({ tree, selectedFile, onSelect }: {
  tree: FileTreeNode[]
  selectedFile: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1 pb-3 pt-1">
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            selectedFile={selectedFile}
            onFileSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

// --- Comments Panel ---

function CommentsPanel({ comments, onClickComment }: {
  comments: { id: string; filePath: string; lineNumber: number; text: string }[]
  onClickComment: (filePath: string) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {comments.length === 0 ? (
          <div className="px-3 py-12 text-center text-[12px] text-fg-secondary leading-relaxed">
            Click on lines in the diff<br />to add review comments.
          </div>
        ) : (
          comments.map(c => (
            <button
              key={c.id}
              onClick={() => onClickComment(c.filePath)}
              className="w-full text-left px-3 py-2.5 mb-1 rounded-lg bg-surface-low/60 hover:bg-surface border-none cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono font-medium text-accent">{c.filePath.split('/').pop()}</span>
                <span className="text-[10px] text-fg-secondary">:{c.lineNumber}</span>
              </div>
              <div className="text-[12px] text-fg-secondary leading-snug">{c.text}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// --- Theme Panel ---

function ThemePanel({ theme, onThemeChange }: {
  theme: PaletteName
  onThemeChange: (name: PaletteName) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-1">
        {(Object.keys(palettes) as PaletteName[]).map((name) => {
          const p = palettes[name]
          const isActive = name === theme
          return (
            <button
              key={name}
              className={`flex items-center gap-3 w-full px-3 py-3 text-left text-[13px] transition-all duration-100 cursor-pointer border-none font-[inherit] rounded-lg mb-0.5 ${
                isActive
                  ? 'bg-accent-dim text-accent'
                  : 'bg-transparent text-fg hover:bg-hover/60'
              }`}
              onClick={() => onThemeChange(name)}
            >
              <SwatchPair bg={p.bg.base} accent={p.accent.base} size={14} />
              <span className="flex-1">{paletteLabels[name]}</span>
              {isActive && <IconCheck />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// --- File Tab Bar ---

function TabBar({ files, selected, onSelect }: {
  files: FileChange[]
  selected: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div className="h-[38px] shrink-0 flex items-end bg-surface-low/50 overflow-x-auto scrollbar-none">
      {files.map(f => {
        const isActive = f.path === selected
        const fileName = f.path.split('/').pop() ?? f.path
        return (
          <button
            key={f.path}
            onClick={() => onSelect(f.path)}
            className={`group relative flex items-center gap-2 px-4 h-[36px] text-[12px] whitespace-nowrap cursor-pointer border-none font-[inherit] shrink-0 transition-all duration-100 ${
              isActive
                ? 'bg-base text-fg rounded-t-lg tab-notch'
                : 'bg-transparent text-fg-secondary hover:text-fg'
            }`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <IconFileDoc size={13} />
            <span>{fileName}</span>
            {isActive && (
              <span
                className="ml-1 w-4 h-4 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-hover transition-all text-fg-tertiary"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 1l6 6M7 1l-6 6" />
                </svg>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// --- Panel Header ---

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="px-3 pt-2 pb-1.5">
      <span className="text-[11px] font-semibold text-fg tracking-[0.06em] uppercase">{title}</span>
    </div>
  )
}

// --- Main Review App ---

function ReviewApp({ theme, onThemeChange }: { theme: PaletteName; onThemeChange: (name: PaletteName) => void }) {
  const [changes, setChanges] = useState<FileChange[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sidePanel, setSidePanel] = useState<SidePanel>('files')
  const [branch, setBranch] = useState<string | null>(null)

  const {
    addComment,
    removeComment,
    commentsByAgent,
    submitReview,
    clearSubmitted,
  } = useReviewStore()

  const pendingComments = (commentsByAgent[REVIEW_ID] ?? []).filter(
    c => c.status === 'pending'
  )
  const commentsForFile: ExistingComment[] = pendingComments
    .filter(c => c.filePath === selectedFile)
    .map(c => ({ id: c.id, lineNumber: c.lineNumber, text: c.text }))

  const fileTree = useMemo(() => buildFileTree(changes), [changes])

  useEffect(() => {
    window.review.getChanges().then(setChanges)
    window.review.getBranch().then(setBranch)
  }, [])

  useEffect(() => {
    if (!selectedFile && changes.length > 0) {
      setSelectedFile(changes[0].path)
    }
  }, [changes, selectedFile])

  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false
    setOriginal('')
    setModified('')

    Promise.all([
      window.review.readOriginal(selectedFile),
      window.review.read(selectedFile),
    ]).then(([orig, mod]) => {
      if (cancelled) return
      setOriginal(orig ?? '')
      setModified(mod)
    }).catch(err => {
      console.error('Failed to load file:', selectedFile, err)
    })

    return () => { cancelled = true }
  }, [selectedFile])

  const handleComment = useCallback(
    (line: number, text: string) => {
      if (!selectedFile) return
      addComment(REVIEW_ID, selectedFile, line, text)
    },
    [selectedFile, addComment]
  )

  const handleDeleteComment = useCallback(
    (id: string) => removeComment(REVIEW_ID, id),
    [removeComment]
  )

  const handleSubmit = useCallback(async () => {
    const comments = submitReview(REVIEW_ID)
    if (comments.length === 0) return

    const grouped = comments.reduce<Record<string, typeof comments>>(
      (acc, c) => {
        ;(acc[c.filePath] ??= []).push(c)
        return acc
      },
      {}
    )

    let markdown = 'Code Review:\n'
    for (const [file, fileComments] of Object.entries(grouped)) {
      markdown += `\n## ${file}\n`
      for (const c of fileComments.sort((a, b) => a.lineNumber - b.lineNumber)) {
        markdown += `- Line ${c.lineNumber}: ${c.text}\n`
      }
    }
    markdown += '\nPlease address these review comments.\n'

    await window.review.submit(markdown)
    clearSubmitted(REVIEW_ID)
    setSubmitted(true)
    setTimeout(() => window.review.quit(), 1000)
  }, [submitReview, clearSubmitted])

  if (submitted) {
    return (
      <div className="h-full flex items-center justify-center bg-vibrancy-overlay rounded-[10px]">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-status-green/10 flex items-center justify-center text-status-green">
            <IconCheck size={24} />
          </div>
          <div className="text-base font-medium text-fg">Review submitted</div>
          <p className="text-fg-secondary text-xs">Comments sent to the agent.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-vibrancy-overlay shadow-[inset_0_0_0_0.5px_var(--app-border)] rounded-[10px] overflow-hidden">
      {/* Top drag bar — uniform background for traffic lights */}
      <div
        className="h-6 shrink-0 bg-sidebar/60 border-b border-edge/40"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <div className="flex-1 flex min-h-0">
      {/* Icon rail */}
      <IconRail active={sidePanel} onChange={setSidePanel} commentCount={pendingComments.length} />

      {/* Side panel */}
      <div className="w-56 shrink-0 border-r border-edge/60 bg-sidebar/50 flex flex-col">
        <PanelHeader title={
          sidePanel === 'files' ? 'Changed Files' :
          sidePanel === 'comments' ? 'Comments' : 'Appearance'
        } />

        <div className="flex-1 min-h-0">
          {sidePanel === 'files' && (
            <FileTreePanel
              tree={fileTree}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
          )}
          {sidePanel === 'comments' && (
            <CommentsPanel
              comments={pendingComments}
              onClickComment={setSelectedFile}
            />
          )}
          {sidePanel === 'theme' && (
            <ThemePanel theme={theme} onThemeChange={onThemeChange} />
          )}
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TabBar
          files={changes}
          selected={selectedFile}
          onSelect={setSelectedFile}
        />

        {/* Diff viewer */}
        <div className="flex-1 min-h-0 relative bg-base overflow-hidden">
          <div className="absolute inset-0">
            {selectedFile && (original !== '' || modified !== '') ? (
              <CodeDiffEditor
                key={selectedFile}
                original={original}
                modified={modified}
                mode="split"
                filePath={selectedFile}
                reviewMode={true}
                existingComments={commentsForFile}
                onComment={handleComment}
                onDeleteComment={handleDeleteComment}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-fg-secondary text-sm">
                Select a file to review
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="h-11 shrink-0 flex items-center justify-between px-3 border-t border-edge/60 bg-sidebar/60">
          <div className="flex items-center gap-3 text-[11px] text-fg">
            {branch && (
              <>
                <div className="flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  <span className="opacity-80">{branch}</span>
                </div>
                <span className="opacity-25">·</span>
              </>
            )}
            <span>{changes.length} file{changes.length !== 1 ? 's' : ''}</span>
            <span className="opacity-25">·</span>
            <span>{pendingComments.length} comment{pendingComments.length !== 1 ? 's' : ''}</span>
          </div>
          {pendingComments.length > 0 && (
            <ButtonPill variant="accent" onClick={handleSubmit}>
              <IconSend /> Submit Review ({pendingComments.length})
            </ButtonPill>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

// --- Root ---

export default function App() {
  const [theme, setTheme] = usePersistedTheme()

  return (
    <ThemeProvider paletteName={theme}>
      <ReviewApp theme={theme} onThemeChange={setTheme} />
    </ThemeProvider>
  )
}
