import { useEffect, useState, useCallback, useMemo, useRef, memo, forwardRef, useImperativeHandle } from 'react'
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
  setRef,
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
  setRef: (el: HTMLDivElement | null) => void
}) {
  const stats = computeStats(fileData.original, fileData.modified)

  return (
    <div ref={setRef} data-file-path={change.path}>
      <DiffFileHeader
        path={change.path}
        status={change.status}
        stats={stats}
        isCollapsed={isCollapsed}
        onClick={onToggleCollapse}
      />

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
    const fileRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const containerRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({
      scrollToFile: (path: string) => {
        const el = fileRefs.current[path]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
    }))

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

    const sortedChanges = useMemo(
      () => [...changes].sort((a, b) => a.path.localeCompare(b.path)),
      [changes]
    )

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const onScroll = () => {
        const containerTop = container.getBoundingClientRect().top
        let topFile: string | null = null

        for (const change of sortedChanges) {
          const el = fileRefs.current[change.path]
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
    }, [sortedChanges, onActiveFileChange])

    const toggleCollapse = useCallback((path: string) => {
      setCollapsedFiles((prev) => ({ ...prev, [path]: !prev[path] }))
    }, [])

    if (changes.length === 0) return EMPTY_STATE

    return (
      <div ref={containerRef} id="cm-diff-scroll" style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sortedChanges.map((change) => {
            const fileData = fileDataMap[change.path]
            if (!fileData) return null

            return (
              <FileDiffItem
                key={change.path}
                change={change}
                fileData={fileData}
                isCollapsed={collapsedFiles[change.path] ?? false}
                onToggleCollapse={() => toggleCollapse(change.path)}
                onChange={(value) => onChange(change.path, value)}
                onComment={(line, text) => onComment(change.path, line, text)}
                onDeleteComment={onDeleteComment}
                onRelocateComments={onRelocateComments}
                existingComments={commentsByFile[change.path] ?? EMPTY_COMMENTS}
                setRef={(el) => { fileRefs.current[change.path] = el }}
              />
            )
          })}
        </div>
      </div>
    )
  }
)
