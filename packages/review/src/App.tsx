import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ThemeProvider,
  CodeDiffEditor,
  useReviewStore,
  type ExistingComment,
  type PaletteName,
} from '@orche/shared'

import { usePersistedTheme } from './hooks/usePersistedTheme'
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
    return <SubmittedScreen />
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
