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
import { EngineToggle } from './components/EngineToggle'
import { ResizablePanel } from './components/ResizablePanel'
import { SubmitReviewButton } from './components/SubmitReviewButton'
import { GitBranch } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
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

  // Cmd/Ctrl+Enter to submit review
  useHotkeys('mod+enter', () => {
    if (pendingComments.length > 0) handleSubmit()
  }, { enableOnFormTags: true }, [handleSubmit, pendingComments.length])

  if (submitted) {
    return <SubmittedScreen />
  }

  return (
    <div className="h-full flex flex-col bg-base rounded-[10px] overflow-hidden">
      {/* Top bar — macOS-style drag region with centered title */}
      <div
        className="h-9 shrink-0 relative z-30 flex items-center justify-center"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[11px] font-medium text-fg-tertiary tracking-wide" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {branch ? `${branch}` : 'orche review'}
        </span>
      </div>

      <div className="flex-1 flex min-h-0 p-2 gap-1.5">
        {/* Sidebar card — icon rail + panel */}
        <ResizablePanel className="bg-surface rounded-lg overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_1px_2px_-1px_rgba(0,0,0,0.3),0_2px_6px_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.15)]">
          <div className="flex h-full">
            <IconRail active={sidePanel} onChange={setSidePanel} commentCount={pendingComments.length} />
            <div className="flex-1 flex flex-col min-w-0">
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
          </div>
        </ResizablePanel>

        {/* Main diff area — rounded card */}
        <div className="flex-1 min-w-0 flex flex-col bg-surface-low rounded-lg overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_1px_2px_-1px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.12)]">
          <EngineToggle engine={diffEngine} onEngineChange={setDiffEngine} />

          {/* Diff viewer — virtualized multi-file scroll */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
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

          {/* Bottom status bar */}
          <div className="h-12 shrink-0 flex items-center justify-between px-4 bg-base shadow-[0_-1px_0_var(--border)]">
            <div className="flex items-center gap-3 text-[11px] text-fg tabular-nums">
              {branch && (
                <>
                  <div className="flex items-center gap-1.5">
                    <GitBranch size={11} className="opacity-60" />
                    <span className="opacity-80 font-mono">{branch}</span>
                  </div>
                  <span className="opacity-25">·</span>
                </>
              )}
              <span>{changes.length} file{changes.length !== 1 ? 's' : ''}</span>
              <span className="opacity-25">·</span>
              <span>{pendingComments.length} comment{pendingComments.length !== 1 ? 's' : ''}</span>
            </div>
            {pendingComments.length > 0 ? <SubmitReviewButton onClick={handleSubmit} /> : null}
          </div>
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
