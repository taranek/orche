import { useEffect, useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import {
  baseExtensions, getLanguageExtension, diffTheme,
  type ExistingComment,
} from '@orche/shared'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { FileChange } from '../types'

/** Style overrides for the MergeView in flat scroll layout */
const MERGE_VIEW_STYLES = `
/* Make MergeView render at natural height (no internal scroll) */
.cm-mergeView {
  height: auto !important;
  overflow: visible !important;
}
.cm-mergeView .cm-editor {
  height: auto !important;
  overflow: visible !important;
}
.cm-mergeView .cm-scroller {
  overflow: visible !important;
  position: relative !important;
  inset: auto !important;
  height: auto !important;
}

/* Spacer stripe pattern for empty areas (void indicator) */
.cm-mergeView .cm-mergeSpacer {
  background: repeating-linear-gradient(
    -45deg, transparent, transparent 4px,
    rgba(255,255,255,0.07) 4px, rgba(255,255,255,0.07) 7px
  ) !important;
}

/* Changed line backgrounds — right side (additions) green */
.cm-mergeView .cm-merge-b .cm-changedLine {
  background: rgba(34, 197, 94, 0.12) !important;
}
/* Changed line backgrounds — left side (deletions) red */
.cm-mergeView .cm-merge-a .cm-changedLine {
  background: rgba(239, 68, 68, 0.12) !important;
}

/* Inline text change highlighting */
.cm-mergeView .cm-changedText {
  background: rgba(34, 197, 94, 0.25) !important;
}
.cm-mergeView .cm-deletedText {
  background: rgba(239, 68, 68, 0.25) !important;
}

/* Gutter tinting — right side (additions) green */
.cm-mergeView .cm-merge-b .cm-changedLineGutter .cm-gutterElement {
  border-left: 2px solid rgba(34, 197, 94, 0.4) !important;
  color: rgba(34, 197, 94, 0.6) !important;
  background: rgba(34, 197, 94, 0.08) !important;
}
/* Gutter tinting — left side (deletions) red */
.cm-mergeView .cm-merge-a .cm-changedLineGutter .cm-gutterElement {
  border-left: 2px solid rgba(239, 68, 68, 0.4) !important;
  color: rgba(239, 68, 68, 0.6) !important;
  background: rgba(239, 68, 68, 0.08) !important;
}

/* Clean gap between panes — subtle dark divider */
.cm-mergeView .cm-mergeViewGap {
  background: color-mix(in oklch, var(--base) 80%, black) !important;
  width: 2px !important;
  min-width: 2px !important;
  padding: 0 !important;
}
.cm-mergeView .cm-mergeViewGap button {
  display: none !important;
}

/* Collapsed lines styling */
.cm-mergeView .cm-collapsedLines {
  padding: 3px 0 !important;
  font-size: 11px !important;
  color: var(--fg-tertiary) !important;
  background: linear-gradient(to bottom, transparent, var(--sidebar) 35%, var(--sidebar) 65%, transparent) !important;
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

/** MergeView wrapper — uses @codemirror/merge for native side-by-side alignment */
function MergeViewEditor({
  original, modified, filePath, onChange,
}: {
  original: string
  modified: string
  filePath: string
  onChange: (value: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const langExt = getLanguageExtension(filePath)
    const commonExts = [
      ...baseExtensions({ readOnly: false }),
      diffTheme,
      langExt,
    ]

    const view = new MergeView({
      a: {
        doc: original,
        extensions: [
          ...commonExts,
          EditorState.readOnly.of(true),
        ],
      },
      b: {
        doc: modified,
        extensions: [
          ...commonExts,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      },
      parent: el,
      collapseUnchanged: { margin: 3, minSize: 6 },
      highlightChanges: true,
      gutter: true,
    })

    mergeViewRef.current = view

    return () => {
      view.destroy()
      mergeViewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update documents when props change
  useEffect(() => {
    const view = mergeViewRef.current
    if (!view) return

    const currentA = view.a.state.doc.toString()
    const currentB = view.b.state.doc.toString()

    if (currentA !== original) {
      view.a.dispatch({ changes: { from: 0, to: view.a.state.doc.length, insert: original } })
    }
    if (currentB !== modified) {
      view.b.dispatch({ changes: { from: 0, to: view.b.state.doc.length, insert: modified } })
    }
  }, [original, modified])

  return <div ref={containerRef} />
}

export const CodeMirrorDiffView = forwardRef<CodeMirrorDiffViewHandle, CodeMirrorDiffViewProps>(
  function CodeMirrorDiffView({
    changes,
    commentsByFile: _commentsByFile,
    onComment: _onComment,
    onDeleteComment: _onDeleteComment,
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
        <style dangerouslySetInnerHTML={{ __html: MERGE_VIEW_STYLES }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sortedChanges.map((change) => {
            const fileData = fileDataMap[change.path]
            if (!fileData) return null

            const isCollapsed = collapsedFiles[change.path] ?? false
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

                {/* MergeView — native side-by-side diff with proper alignment */}
                {!isCollapsed && (
                  <MergeViewEditor
                    original={fileData.original}
                    modified={fileData.modified}
                    filePath={change.path}
                    onChange={(value) => onChange(change.path, value)}
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
