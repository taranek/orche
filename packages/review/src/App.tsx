import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  ThemeProvider,
  CodeDiffEditor,
  useReviewStore,
  type ExistingComment,
  type PaletteName,
} from '@orche/shared'

import { usePersistedTheme } from './hooks/usePersistedTheme'
import { useFileStore } from './store/fileStore'
import { buildFileTree } from './utils/buildFileTree'
import type { FileChange, SidePanel } from './types'
import { REVIEW_ID } from './types'

import { IconRail } from './components/IconRail'
import { FileTreePanel } from './components/FileTreePanel'
import { CommentsPanel } from './components/CommentsPanel'
import { ThemePanel } from './components/ThemePanel'
import { TabBar } from './components/TabBar'
import { PanelHeader } from './components/PanelHeader'
import { StatusBar } from './components/StatusBar'
import { SubmittedScreen } from './components/SubmittedScreen'

function ReviewApp({ theme, onThemeChange }: { theme: PaletteName; onThemeChange: (name: PaletteName) => void }) {
  const [changes, setChanges] = useState<FileChange[]>([])
  const selectedFile = useFileStore((s) => s.selectedFile)
  const selectFile = useFileStore((s) => s.selectFile)
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sidePanel, setSidePanel] = useState<SidePanel>('files')
  const [branch, setBranch] = useState<string | null>(null)
  const revertedFiles = useRef(new Set<string>())

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
    return window.review.onFilesChanged(setChanges)
  }, [])

  useEffect(() => {
    if (!selectedFile && changes.length > 0) {
      selectFile(changes[0].path)
    }
  }, [changes, selectedFile])

  // Reload content when file changes on disk
  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false

    const loadContent = () => {
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
    }

    loadContent()
    return () => { cancelled = true }
  }, [selectedFile, changes])

  const handleChange = useCallback(
    (content: string) => {
      if (!selectedFile) return
      revertedFiles.current.add(selectedFile)
      window.review.write(selectedFile, content)
    },
    [selectedFile]
  )

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
    const reverted = revertedFiles.current

    if (comments.length === 0 && reverted.size === 0) return

    const grouped = comments.reduce<Record<string, typeof comments>>(
      (acc, c) => {
        ;(acc[c.filePath] ??= []).push(c)
        return acc
      },
      {}
    )

    let markdown = 'Code Review:\n'

    if (reverted.size > 0) {
      markdown += '\n## Reverted changes\nThe following files had changes reverted during review — do not re-apply them:\n'
      for (const file of reverted) {
        markdown += `- ${file}\n`
      }
    }

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
    return <SubmittedScreen />
  }

  return (
    <div className="h-full flex flex-col bg-vibrancy-overlay shadow-[inset_0_0_0_0.5px_var(--app-border)] rounded-[10px] overflow-hidden">
      {/* Top drag bar */}
      <div
        className="h-6 shrink-0 bg-sidebar/60 border-b border-edge/40 flex items-center justify-end pr-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[9px] text-fg-tertiary font-mono opacity-40" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {new Date(__BUILD_TIME__).toLocaleTimeString()}
        </span>
      </div>

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
            <FileTreePanel tree={fileTree} />
          )}
          {sidePanel === 'comments' && (
            <CommentsPanel comments={pendingComments} />
          )}
          {sidePanel === 'theme' && (
            <ThemePanel theme={theme} onThemeChange={onThemeChange} />
          )}
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TabBar files={changes} />

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
                onChange={handleChange}
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

        <StatusBar
          branch={branch}
          fileCount={changes.length}
          commentCount={pendingComments.length}
          onSubmit={handleSubmit}
        />
      </div>
      </div>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = usePersistedTheme()

  return (
    <ThemeProvider paletteName={theme}>
      <ReviewApp theme={theme} onThemeChange={setTheme} />
    </ThemeProvider>
  )
}
