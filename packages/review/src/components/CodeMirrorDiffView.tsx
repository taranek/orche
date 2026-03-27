import { useEffect, useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { CodeDiffEditor, type ExistingComment } from '@orche/shared'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { FileChange } from '../types'

/** Style overrides for the multi-file flat scroll layout */
const PIERRE_STYLES = `
/* Hide SVG flow connections — they leak between files in flat scroll */
.cm-diff-override svg { display: none !important; }

/* Divider between panes — clean subtle gap like Pierre */
.cm-diff-override > div > div:nth-child(2) {
  width: 2px !important;
  background: color-mix(in oklch, var(--base) 80%, black) !important;
  pointer-events: none;
  overflow: hidden !important;
}

/* Hide revert gutter (uses SVG buttons that don't work in flat scroll) */
.cm-diff-override .cm-revert-gutter { display: none !important; }


/* Hide insertion/deletion point lines completely — spacer has full height to compensate */
.cm-diff-override .cm-diff-insertion-point,
.cm-diff-override .cm-diff-deletion-point {
  height: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  line-height: 0 !important;
  font-size: 0 !important;
  overflow: hidden !important;
  background: none !important;
  box-shadow: none !important;
}
`

interface FileData {
  original: string
  modified: string
}

export interface CodeMirrorDiffViewHandle {
  scrollToFile: (path: string) => void
}

interface CodeMirrorDiffViewProps {
  changes: FileChange[]
  commentsByFile: Record<string, ExistingComment[]>
  onComment: (filePath: string, line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onChange: (filePath: string, content: string) => void
  activeFile: string | null
  onActiveFileChange: (path: string) => void
  theme: 'dark' | 'light'
}

/** Compute diff stats from raw text */
function computeStats(original: string, modified: string) {
  const origLines = original ? original.split('\n') : []
  const modLines = modified ? modified.split('\n') : []
  // Simple line-based diff count
  const maxLen = Math.max(origLines.length, modLines.length)
  let additions = 0, deletions = 0
  for (let i = 0; i < maxLen; i++) {
    const a = origLines[i]
    const b = modLines[i]
    if (a !== b) {
      if (a !== undefined) deletions++
      if (b !== undefined) additions++
    }
  }
  return { additions, deletions }
}

/** Auto-sizing wrapper for CodeDiffEditor — measures scrollHeight and expands to fit */
function AutoSizedDiffEditor({
  original, modified, filePath, onChange, onComment, onDeleteComment, existingComments,
}: {
  original: string
  modified: string
  filePath: string
  onChange: (value: string) => void
  onComment: (line: number, text: string) => void
  onDeleteComment: (id: string) => void
  existingComments: ExistingComment[]
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>(400)

  // After mount, measure the actual scroll height and resize
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    // Wait for CodeMirror to finish layout
    const measure = () => {
      const scrollers = wrapper.querySelectorAll('.cm-scroller')
      let maxH = 400
      scrollers.forEach((s) => {
        if (s.scrollHeight > maxH) maxH = s.scrollHeight
      })
      if (maxH !== height) setHeight(maxH)
    }

    // Multiple rAFs to wait for diff computation + spacers
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(measure)))
  })

  return (
    <div ref={wrapperRef} className="cm-diff-override" style={{ height }}>
      <CodeDiffEditor
        original={original}
        modified={modified}
        mode="split"
        filePath={filePath}
        onChange={onChange}
        reviewMode
        existingComments={existingComments}
        onComment={onComment}
        onDeleteComment={onDeleteComment}
      />
    </div>
  )
}

export const CodeMirrorDiffView = forwardRef<CodeMirrorDiffViewHandle, CodeMirrorDiffViewProps>(
  function CodeMirrorDiffView({
    changes,
    commentsByFile,
    onComment,
    onDeleteComment,
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

    const sortedChanges = useMemo(
      () => [...changes].sort((a, b) => a.path.localeCompare(b.path)),
      [changes]
    )

    // Scroll tracking for active file
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

    if (changes.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-fg-secondary text-sm">
          No files to review
        </div>
      )
    }

    return (
      <div ref={containerRef} id="cm-diff-scroll" style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
        <style dangerouslySetInnerHTML={{ __html: PIERRE_STYLES }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sortedChanges.map((change) => {
            const fileData = fileDataMap[change.path]
            if (!fileData) return null

            const isCollapsed = collapsedFiles[change.path] ?? false
            const fileComments = commentsByFile[change.path] ?? []
            const stats = computeStats(fileData.original, fileData.modified)
            const statusIcon = change.status === 'added' ? '+' : change.status === 'deleted' ? '-' : '~'
            const statusColor = change.status === 'added'
              ? '#4ade80'
              : change.status === 'deleted'
              ? '#f87171'
              : '#facc15'

            return (
              <div
                key={change.path}
                ref={(el) => { fileRefs.current[change.path] = el }}
                data-file-path={change.path}
              >
                {/* Sticky file header */}
                <div
                  onClick={() => toggleCollapse(change.path)}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    background: 'var(--sidebar)',
                    borderBottom: '1px solid var(--edge)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  {isCollapsed
                    ? <ChevronRight size={14} style={{ color: 'var(--fg-secondary)' }} />
                    : <ChevronDown size={14} style={{ color: 'var(--fg-secondary)' }} />
                  }
                  <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: statusColor }}>{statusIcon}</span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--fg-secondary)' }}>{change.path}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'monospace', display: 'flex', gap: 6 }}>
                    {stats.deletions > 0 && <span style={{ color: '#f87171' }}>-{stats.deletions}</span>}
                    {stats.additions > 0 && <span style={{ color: '#4ade80' }}>+{stats.additions}</span>}
                  </span>
                </div>

                {/* Diff editor — auto-sized to content */}
                {!isCollapsed && (
                  <AutoSizedDiffEditor
                    original={fileData.original}
                    modified={fileData.modified}
                    filePath={change.path}
                    onChange={(value) => onChange(change.path, value)}
                    existingComments={fileComments}
                    onComment={(line, text) => onComment(change.path, line, text)}
                    onDeleteComment={onDeleteComment}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
