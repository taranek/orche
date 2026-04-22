import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  ThemeProvider,
  useReviewStore,
  useTheme,
  type ExistingComment,
  type PaletteName,
} from '@orche/shared'

import { usePersistedTheme } from './hooks/usePersistedTheme'
import { useFileStore } from './store/fileStore'
// buildFileTree no longer needed — @pierre/trees handles tree construction from flat paths
import type { FileChange, SidePanel } from './types'
import { REVIEW_ID } from './types'

import { IconRail } from './components/IconRail'
import { FileTreePanel } from './components/FileTreePanel'
import { CommentsPanel } from './components/CommentsPanel'
import { ThemePanel } from './components/ThemePanel'
import { PanelHeader } from './components/PanelHeader'
import { StatusBar } from './components/StatusBar'
import { EngineToggle } from './components/EngineToggle'
import { SubmittedScreen } from './components/SubmittedScreen'
import { PierreDiffView, type PierreDiffViewHandle } from './components/PierreDiffView'
import { CodeMirrorDiffView, type CodeMirrorDiffViewHandle } from './components/CodeMirrorDiffView'

function ReviewApp({ theme, onThemeChange }: { theme: PaletteName; onThemeChange: (name: PaletteName) => void }) {
  const [changes, setChanges] = useState<FileChange[]>([])
  const selectedFile = useFileStore((s) => s.selectedFile)
  const selectFile = useFileStore((s) => s.selectFile)
  const [submitted, setSubmitted] = useState(false)
  const [sidePanel, setSidePanel] = useState<SidePanel>('files')
  const [branch, setBranch] = useState<string | null>(null)
  const [diffEngine, setDiffEngine] = useState<'pierre' | 'codemirror'>('codemirror')
  const revertedFiles = useRef(new Set<string>())
  const diffViewRef = useRef<PierreDiffViewHandle>(null)
  const cmDiffViewRef = useRef<CodeMirrorDiffViewHandle>(null)

  const { palette } = useTheme()

  const {
    addComment,
    removeComment,
    relocateComments,
    markUserEdited,
    getUserEditedFiles,
    clearUserEdits,
    commentsByAgent,
    submitReview,
    clearSubmitted,
  } = useReviewStore()

  const pendingComments = (commentsByAgent[REVIEW_ID] ?? []).filter(
    c => c.status === 'pending'
  )

  // Group comments by file for PierreDiffView
  const commentsByFile = useMemo(() => {
    const grouped: Record<string, ExistingComment[]> = {}
    for (const c of pendingComments) {
      ;(grouped[c.filePath] ??= []).push({
        id: c.id,
        lineNumber: c.lineNumber,
        text: c.text,
      })
    }
    return grouped
  }, [pendingComments])


  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of pendingComments) {
      counts[c.filePath] = (counts[c.filePath] ?? 0) + 1
    }
    return counts
  }, [pendingComments])

  useEffect(() => {
    window.review.getChanges().then(setChanges)
    window.review.getBranch().then(setBranch)
  }, [])

  const activeFile = selectedFile ?? (changes.length > 0
    ? changes.reduce((a, b) => a.path.localeCompare(b.path) <= 0 ? a : b).path
    : null
  )

  const handleChange = useCallback(
    (filePath: string, content: string) => {
      revertedFiles.current.add(filePath)
      markUserEdited(REVIEW_ID, filePath)
      window.review.write(filePath, content)
    },
    [markUserEdited]
  )

  const handleComment = useCallback(
    (filePath: string, line: number, text: string) => {
      addComment(REVIEW_ID, filePath, line, text)
    },
    [addComment]
  )

  const handleDeleteComment = useCallback(
    (id: string) => removeComment(REVIEW_ID, id),
    [removeComment]
  )

  const handleRelocateComments = useCallback(
    (moves: Array<{ id: string; lineNumber: number }>) => relocateComments(REVIEW_ID, moves),
    [relocateComments]
  )

  const handleSubmit = useCallback(async () => {
    const comments = submitReview(REVIEW_ID)
    const reverted = revertedFiles.current
    const userEdited = getUserEditedFiles(REVIEW_ID)

    if (comments.length === 0 && reverted.size === 0 && userEdited.length === 0) return

    const grouped = comments.reduce<Record<string, typeof comments>>(
      (acc, c) => {
        ;(acc[c.filePath] ??= []).push(c)
        return acc
      },
      {}
    )

    // Read file contents to include code context with each comment
    const fileContents: Record<string, string[]> = {}
    for (const file of Object.keys(grouped)) {
      try {
        const content = await window.review.read(file)
        fileContents[file] = content.split('\n')
      } catch {
        // If we can't read the file, we'll skip code context
      }
    }

    const CONTEXT_LINES = 5

    let markdown = 'Code Review:\n'
    markdown += '\nRead each file mentioned below in full before making changes. '
    markdown += 'The review comments reference specific lines but may require changes to surrounding code. '
    markdown += 'Understand the broader context before editing.\n'

    if (reverted.size > 0) {
      markdown += '\n## Reverted changes\nThe following files had changes reverted during review — do not re-apply them:\n'
      for (const file of reverted) {
        markdown += `- ${file}\n`
      }
    }

    if (userEdited.length > 0) {
      markdown += '\n## User-edited files\nThe following files were manually edited by the user in the review UI. These changes are intentional — do not overwrite or revert them:\n'
      for (const file of userEdited) {
        markdown += `- ${file}\n`
      }
    }

    for (const [file, fileComments] of Object.entries(grouped)) {
      markdown += `\n## ${file}\n`
      const lines = fileContents[file]

      for (const c of fileComments.sort((a, b) => a.lineNumber - b.lineNumber)) {
        markdown += `\n### Comment on line ${c.lineNumber}\n`
        markdown += `${c.text}\n`

        if (lines) {
          const start = Math.max(0, c.lineNumber - CONTEXT_LINES - 1)
          const end = Math.min(lines.length, c.lineNumber + CONTEXT_LINES)
          const snippet = lines.slice(start, end)
            .map((line, i) => {
              const lineNum = start + i + 1
              const marker = lineNum === c.lineNumber ? '>' : ' '
              return `${marker} ${lineNum} | ${line}`
            })
            .join('\n')
          markdown += `\n\`\`\`\n${snippet}\n\`\`\`\n`
        }
      }
    }
    markdown += '\nPlease read each referenced file in full and address these review comments.\n'

    await window.review.submit(markdown)

    clearSubmitted(REVIEW_ID)
    clearUserEdits(REVIEW_ID)
    setSubmitted(true)
    setTimeout(() => window.review.quit(), 1000)
  }, [submitReview, clearSubmitted, getUserEditedFiles, clearUserEdits])

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
            <FileTreePanel changes={changes} onFileClick={(path) => (diffEngine === 'pierre' ? diffViewRef : cmDiffViewRef).current?.scrollToFile(path)} commentCounts={commentCounts} />
          )}
          {sidePanel === 'comments' && (
            <CommentsPanel
              comments={pendingComments}
              onCommentClick={(filePath) => (diffEngine === 'pierre' ? diffViewRef : cmDiffViewRef).current?.scrollToFile(filePath)}
            />
          )}
          {sidePanel === 'theme' && (
            <ThemePanel theme={theme} onThemeChange={onThemeChange} />
          )}
        </div>
      </div>

      {/* Main diff area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <EngineToggle engine={diffEngine} onEngineChange={setDiffEngine} />

        {/* Diff viewer — virtualized multi-file scroll */}
        <div className="flex-1 min-h-0 relative bg-base overflow-hidden">
          <div className="absolute inset-0">
            {diffEngine === 'pierre' ? (
              <PierreDiffView
                ref={diffViewRef}
                changes={changes}
                commentsByFile={commentsByFile}
                onComment={handleComment}
                onDeleteComment={handleDeleteComment}
                onChange={handleChange}
                activeFile={activeFile}
                onActiveFileChange={selectFile}
                theme={palette.mode}
              />
            ) : (
              <CodeMirrorDiffView
                ref={cmDiffViewRef}
                changes={changes}
                commentsByFile={commentsByFile}
                onComment={handleComment}
                onDeleteComment={handleDeleteComment}
                onRelocateComments={handleRelocateComments}
                onChange={handleChange}
                activeFile={activeFile}
                onActiveFileChange={selectFile}
                theme={palette.mode}
              />
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
