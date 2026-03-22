import { useEffect, useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { MultiFileDiff, Virtualizer, useVirtualizer } from '@pierre/diffs/react'
import type {
  FileContents,
  DiffLineAnnotation,
} from '@pierre/diffs'
import type { SelectedLineRange, OnDiffLineClickProps, AnnotationSide } from '@pierre/diffs'
import { InlineComment, CommentInput, type ExistingComment } from '@orche/shared'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { FileChange } from '../types'

interface CommentAnnotation {
  comment?: ExistingComment
  isInput?: boolean
}

interface FileData {
  oldFile: FileContents
  newFile: FileContents
}

export interface PierreDiffViewHandle {
  scrollToFile: (path: string) => void
}

interface PierreDiffViewProps {
  changes: FileChange[]
  commentsByFile: Record<string, ExistingComment[]>
  onComment: (filePath: string, line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onChange: (filePath: string, content: string) => void
  activeFile: string | null
  onActiveFileChange: (path: string) => void
  theme: 'dark' | 'light'
}

export const PierreDiffView = forwardRef<PierreDiffViewHandle, PierreDiffViewProps>(
function PierreDiffView({
  changes,
  commentsByFile,
  onComment,
  onDeleteComment,
  onChange: _onChange,
  activeFile: _activeFile,
  onActiveFileChange,
  theme,
}, ref) {
  const [fileDataMap, setFileDataMap] = useState<Record<string, FileData>>({})
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({})
  const [commentInputs, setCommentInputs] = useState<Record<string, { line: number; side: AnnotationSide } | null>>({})
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useImperativeHandle(ref, () => ({
    scrollToFile: (path: string) => {
      const el = fileRefs.current[path]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
  }))

  // Reload file contents whenever the file list updates (polls every 2s + chokidar)
  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const entries = await Promise.all(
        changes.map(async (change) => {
          try {
            const [orig, mod] = await Promise.all([
              window.review.readOriginal(change.path),
              window.review.read(change.path),
            ])
            return [change.path, {
              oldFile: { name: change.path, contents: orig ?? '' },
              newFile: { name: change.path, contents: mod },
            } satisfies FileData] as const
          } catch {
            return [change.path, null] as const
          }
        })
      )

      if (cancelled) return
      setFileDataMap((prev) => {
        const next: Record<string, FileData> = {}
        let changed = false
        for (const [path, data] of entries) {
          if (!data) continue
          const old = prev[path]
          if (old && old.oldFile.contents === data.oldFile.contents && old.newFile.contents === data.newFile.contents) {
            next[path] = old
          } else {
            next[path] = data
            changed = true
          }
        }
        if (Object.keys(prev).length !== Object.keys(next).length) changed = true
        return changed ? next : prev
      })
    }

    loadAll()
    return () => { cancelled = true }
  }, [changes])

  // Sort changes to match the sidebar tree order (alphabetical by path segments)
  const sortedChanges = useMemo(
    () => [...changes].sort((a, b) => a.path.localeCompare(b.path)),
    [changes]
  )

  const toggleCollapse = useCallback((path: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [path]: !prev[path] }))
  }, [])

  const handleLineClick = useCallback(
    (filePath: string, lineNumber: number, side: AnnotationSide) => {
      setCommentInputs((prev) => ({ ...prev, [filePath]: { line: lineNumber, side } }))
    },
    []
  )

  const handleGutterClick = useCallback(
    (filePath: string, range: SelectedLineRange) => {
      const side: AnnotationSide = range.side === 'deletions' ? 'deletions' : 'additions'
      setCommentInputs((prev) => ({ ...prev, [filePath]: { line: range.start, side } }))
    },
    []
  )

  const handleCommentSubmit = useCallback(
    (filePath: string, line: number, text: string) => {
      onComment(filePath, line, text)
      setCommentInputs((prev) => ({ ...prev, [filePath]: null }))
    },
    [onComment]
  )

  const handleCommentCancel = useCallback((filePath: string) => {
    setCommentInputs((prev) => ({ ...prev, [filePath]: null }))
  }, [])

  const pierreTheme: 'pierre-dark' | 'pierre-light' = useMemo(
    () => theme === 'dark' ? 'pierre-dark' : 'pierre-light',
    [theme]
  )


  if (changes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-fg-secondary text-sm">
        No files to review
      </div>
    )
  }

  return (
    <Virtualizer className="h-full overflow-auto" contentClassName="flex flex-col gap-1">
      <ScrollTracker
        sortedChanges={sortedChanges}
        fileRefs={fileRefs}
        onActiveFileChange={onActiveFileChange}
      />
      {sortedChanges.map((change) => {
        const fileData = fileDataMap[change.path]
        if (!fileData) return null

        const isCollapsed = collapsedFiles[change.path] ?? false
        const fileComments = commentsByFile[change.path] ?? []
        const inputLine = commentInputs[change.path] ?? null

        return (
          <FileDiffBlock
            key={change.path}
            change={change}
            fileData={fileData}
            isCollapsed={isCollapsed}
            fileComments={fileComments}
            inputLine={inputLine}
            theme={pierreTheme}
            onToggleCollapse={toggleCollapse}
            onLineClick={handleLineClick}
            onGutterClick={handleGutterClick}
            onCommentSubmit={handleCommentSubmit}
            onCommentCancel={handleCommentCancel}
            onDeleteComment={onDeleteComment}
            ref={(el) => { fileRefs.current[change.path] = el }}
          />
        )
      })}
    </Virtualizer>
  )
})

function ScrollTracker({
  sortedChanges,
  fileRefs,
  onActiveFileChange,
}: {
  sortedChanges: FileChange[]
  fileRefs: React.RefObject<Record<string, HTMLDivElement | null>>
  onActiveFileChange: (path: string) => void
}) {
  const virtualizer = useVirtualizer()

  useEffect(() => {
    const root = (virtualizer as any)?.root
    if (!root || !(root instanceof HTMLElement)) return
    const container = root

    const onScroll = () => {
      const containerTop = container.getBoundingClientRect().top
      let topFile: string | null = null

      for (const change of sortedChanges) {
        const el = fileRefs.current?.[change.path]
        if (!el) continue
        const top = el.getBoundingClientRect().top - containerTop
        if (top <= 10) {
          topFile = change.path
        } else {
          if (!topFile) topFile = change.path
          break
        }
      }

      if (topFile) onActiveFileChange(topFile)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [virtualizer, sortedChanges, fileRefs, onActiveFileChange])

  return null
}

interface CommentInputTarget {
  line: number
  side: AnnotationSide
}

interface FileDiffBlockProps {
  change: FileChange
  fileData: FileData
  isCollapsed: boolean
  fileComments: ExistingComment[]
  inputLine: CommentInputTarget | null
  theme: 'pierre-dark' | 'pierre-light'
  onToggleCollapse: (path: string) => void
  onLineClick: (filePath: string, lineNumber: number, side: AnnotationSide) => void
  onGutterClick: (filePath: string, range: SelectedLineRange) => void
  onCommentSubmit: (filePath: string, line: number, text: string) => void
  onCommentCancel: (filePath: string) => void
  onDeleteComment: (id: string) => void
}

const FileDiffBlock = forwardRef<HTMLDivElement, FileDiffBlockProps>(
  function FileDiffBlock(
    {
      change,
      fileData,
      isCollapsed,
      fileComments,
      inputLine,
      theme,
      onToggleCollapse,
      onLineClick,
      onGutterClick,
      onCommentSubmit,
      onCommentCancel,
      onDeleteComment,
    },
    ref
  ) {
    const lineAnnotations = useMemo(() => {
      const annotations: DiffLineAnnotation<CommentAnnotation>[] = []

      for (const comment of fileComments) {
        annotations.push({
          side: 'additions',
          lineNumber: comment.lineNumber,
          metadata: { comment },
        })
      }

      if (inputLine !== null) {
        annotations.push({
          side: inputLine.side,
          lineNumber: inputLine.line,
          metadata: { isInput: true },
        })
      }

      return annotations
    }, [fileComments, inputLine])

    const renderAnnotation = useCallback(
      (annotation: DiffLineAnnotation<CommentAnnotation>) => {
        if (annotation.metadata?.isInput) {
          return (
            <CommentInput
              defaultValue=""
              isUpdate={false}
              onSubmit={(text) =>
                onCommentSubmit(change.path, annotation.lineNumber, text)
              }
              onCancel={() => onCommentCancel(change.path)}
            />
          )
        }
        if (annotation.metadata?.comment) {
          return (
            <InlineComment
              comment={annotation.metadata.comment}
              onDelete={onDeleteComment}
            />
          )
        }
        return null
      },
      [change.path, onCommentSubmit, onCommentCancel, onDeleteComment]
    )

    const renderHeaderPrefix = useCallback(
      () => {
        const Icon = isCollapsed ? ChevronRight : ChevronDown
        return (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse(change.path)
            }}
            className="p-0.5 rounded hover:bg-hover transition-colors border-none bg-transparent cursor-pointer text-fg-secondary"
          >
            <Icon size={14} strokeWidth={1.5} />
          </button>
        )
      },
      [isCollapsed, change.path, onToggleCollapse]
    )

    const diffOptions = useMemo(
      () => ({
        diffStyle: 'split' as const,
        overflow: 'wrap' as const,
        theme,
        collapsed: isCollapsed,
        hunkSeparators: 'line-info' as const,
        expandUnchanged: true,
        lineHoverHighlight: 'both' as const,
        enableGutterUtility: true,
        unsafeCSS: `
          [data-diffs-header] {
            position: sticky;
            top: 0;
            z-index: 10;
            background-color: var(--diffs-bg);
          }
          [data-column-number][data-hovered] [data-line-number-content] {
            visibility: hidden;
          }
          [data-utility-button] {
            margin-right: 4px;
            margin-top: 2px;
            width: 16px;
            height: 16px;
            border-radius: 5px;
            background: var(--diffs-addition-base);
            color: var(--diffs-bg);
            fill: currentColor;
            transition: transform 0.12s ease, box-shadow 0.12s ease;
          }
          [data-utility-button]:hover {
            transform: scale(1.15);
            box-shadow: 0 0 0 3px color-mix(in oklch, var(--diffs-addition-base) 30%, transparent);
          }
          [data-utility-button]:active {
            transform: scale(0.95);
            transition-duration: 0.05s;
          }
        `,
        onGutterUtilityClick: (range: SelectedLineRange) =>
          onGutterClick(change.path, range),
        onLineClick: (props: OnDiffLineClickProps) =>
          onLineClick(change.path, props.lineNumber, props.annotationSide),
      }),
      [theme, isCollapsed, change.path, onGutterClick, onLineClick]
    )

    // VirtualizedFileDiff caches fileDiff with ??= and never re-parses from
    // updated files. Force remount when contents change.
    const contentKey = `${change.path}:${fileData.oldFile.contents.length}:${fileData.newFile.contents.length}`

    return (
      <div ref={ref} data-file-path={change.path}>
        <MultiFileDiff<CommentAnnotation>
          key={contentKey}
          oldFile={fileData.oldFile}
          newFile={fileData.newFile}
          options={diffOptions}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
          renderHeaderPrefix={renderHeaderPrefix}
        />
      </div>
    )
  }
)
