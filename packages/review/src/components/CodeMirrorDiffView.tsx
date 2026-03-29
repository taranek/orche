import { useEffect, useState, useCallback, useMemo, useRef, memo, forwardRef, useImperativeHandle } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { ExistingComment } from '@orche/shared'
import type { FileChange } from '../types'
import { DiffFileHeader } from './DiffFileHeader'
import { MergeViewEditor } from './MergeViewEditor'
import './merge-view-styles.css'

interface FileData {
  original: string
  modified: string
}

const EMPTY_COMMENTS: ExistingComment[] = []

export interface CodeMirrorDiffViewHandle {
  scrollToFile: (path: string) => void
}

interface CodeMirrorDiffViewProps {
  changes: FileChange[]
  commentsByFile: Record<string, ExistingComment[]>
  onComment: (filePath: string, line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onRelocateComments: (moves: Array<{ id: string; lineNumber: number }>) => void
  onChange: (filePath: string, content: string) => void
  activeFile: string | null
  onActiveFileChange: (path: string) => void
  theme: 'dark' | 'light'
}

function computeStats(original: string, modified: string) {
  const origLines = original ? original.split('\n') : []
  const modLines = modified ? modified.split('\n') : []
  const maxLen = Math.max(origLines.length, modLines.length)
  let additions = 0, deletions = 0
  for (let i = 0; i < maxLen; i++) {
    if (origLines[i] !== modLines[i]) {
      if (origLines[i] !== undefined) deletions++
      if (modLines[i] !== undefined) additions++
    }
  }
  return { additions, deletions }
}

const EMPTY_STATE = (
  <div className="h-full flex items-center justify-center text-fg-secondary text-sm">
    No files to review
  </div>
)

const FileDiffItem = memo(function FileDiffItem({
  change, fileData, isCollapsed, onToggleCollapse,
  onChange, onComment, onDeleteComment, onRelocateComments, existingComments,
  onInView,
}: {
  change: FileChange
  fileData: FileData
  isCollapsed: boolean
  onToggleCollapse: () => void
  onChange: (value: string) => void
  onComment: (line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onRelocateComments: (moves: Array<{ id: string; lineNumber: number }>) => void
  existingComments: ExistingComment[]
  onInView: (path: string) => void
}) {
  const stats = computeStats(fileData.original, fileData.modified)
  const headerRef = useRef<HTMLDivElement>(null)

  // Report when this file's header crosses the top of the viewport
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onInView(change.path)
      },
      { rootMargin: '0px 0px -90% 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [change.path, onInView])

  return (
    <div data-file-path={change.path}>
      <div ref={headerRef}>
        <DiffFileHeader
          path={change.path}
          status={change.status}
          stats={stats}
          isCollapsed={isCollapsed}
          onClick={onToggleCollapse}
        />
      </div>

      {!isCollapsed ? (
        <MergeViewEditor
          original={fileData.original}
          modified={fileData.modified}
          filePath={change.path}
          onChange={onChange}
          onComment={onComment}
          onDeleteComment={onDeleteComment}
          onRelocateComments={onRelocateComments}
          existingComments={existingComments}
        />
      ) : null}
    </div>
  )
})

export const CodeMirrorDiffView = forwardRef<CodeMirrorDiffViewHandle, CodeMirrorDiffViewProps>(
  function CodeMirrorDiffView({
    changes,
    commentsByFile,
    onComment,
    onDeleteComment,
    onRelocateComments,
    onChange,
    activeFile: _activeFile,
    onActiveFileChange,
    theme: _theme,
  }, ref) {
    const [fileDataMap, setFileDataMap] = useState<Record<string, FileData>>({})
    const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({})
    const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
    const virtuosoRef = useRef<VirtuosoHandle>(null)

    const sortedChanges = useMemo(
      () => [...changes].sort((a, b) => a.path.localeCompare(b.path)),
      [changes]
    )

    const loadedItems = useMemo(
      () => sortedChanges.filter(c => fileDataMap[c.path]),
      [sortedChanges, fileDataMap]
    )

    useImperativeHandle(ref, () => ({
      scrollToFile: (path: string) => {
        const index = loadedItems.findIndex(c => c.path === path)
        if (index >= 0) {
          virtuosoRef.current?.scrollToIndex({ index, align: 'start', behavior: 'smooth' })
        }
      },
    }))

    // Load file contents
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
              return [change.path, { original: orig ?? '', modified: mod }] as const
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
            if (old && old.original === data.original && old.modified === data.modified) {
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

    const toggleCollapse = useCallback((path: string) => {
      setCollapsedFiles((prev) => ({ ...prev, [path]: !prev[path] }))
    }, [])

    const handleFileInView = useCallback((path: string) => {
      setActiveFilePath(path)
      onActiveFileChange(path)
    }, [onActiveFileChange])


    if (changes.length === 0) return EMPTY_STATE

    // Data for sticky header overlay
    const stickyChange = activeFilePath ? loadedItems.find(c => c.path === activeFilePath) : loadedItems[0]
    const stickyFileData = stickyChange ? fileDataMap[stickyChange.path] : undefined
    const stickyStats = stickyFileData ? computeStats(stickyFileData.original, stickyFileData.modified) : undefined

    return (
      <div className="h-full relative" id="cm-diff-scroll">
        {/* Sticky file header overlay */}
        {stickyChange && stickyStats && (
          <div className="absolute top-0 left-0 right-0 z-30">
            <DiffFileHeader
              path={stickyChange.path}
              status={stickyChange.status}
              stats={stickyStats}
              isCollapsed={collapsedFiles[stickyChange.path] ?? false}
              onClick={() => toggleCollapse(stickyChange.path)}
            />
          </div>
        )}

        <Virtuoso
          ref={virtuosoRef}
          totalCount={loadedItems.length}
          overscan={1000}
          className="h-full"
          itemContent={(index) => {
            const change = loadedItems[index]
            const fileData = fileDataMap[change.path]
            if (!fileData) return null

            return (
              <FileDiffItem
                change={change}
                fileData={fileData}
                isCollapsed={collapsedFiles[change.path] ?? false}
                onToggleCollapse={() => toggleCollapse(change.path)}
                onChange={(value) => onChange(change.path, value)}
                onComment={(line, text) => onComment(change.path, line, text)}
                onDeleteComment={onDeleteComment}
                onRelocateComments={onRelocateComments}
                existingComments={commentsByFile[change.path] ?? EMPTY_COMMENTS}
                onInView={handleFileInView}
              />
            )
          }}
        />
      </div>
    )
  }
)
