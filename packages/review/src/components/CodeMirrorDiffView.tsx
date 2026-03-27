import { useEffect, useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { MergeView } from '@codemirror/merge'
import { EditorView, Decoration, gutter, type BlockInfo } from '@codemirror/view'
import { EditorState, Compartment, StateEffect, StateField, type ChangeDesc } from '@codemirror/state'
import {
  baseExtensions, getLanguageExtension, diffTheme, reviewCursorTheme,
  type ExistingComment,
  InlineComment, CommentInput, ReviewGutterMarker, CommentBlockWidget, InputBlockWidget,
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
  onRelocateComments: (moves: Array<{ id: string; lineNumber: number }>) => void
  onChange: (filePath: string, content: string) => void
  activeFile: string | null
  onActiveFileChange: (path: string) => void
  reviewMode?: boolean
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

// --- Review decoration state field ---
// Decorations live in a StateField so they survive doc changes via `map`,
// avoiding portal container destruction on every keystroke.

interface ReviewDecoState {
  widgets: ReturnType<typeof Decoration.set>
  lineDecos: ReturnType<typeof Decoration.set>
}

const setReviewDecos = StateEffect.define<ReviewDecoState>()

const reviewDecoField = StateField.define<ReviewDecoState>({
  create: () => ({ widgets: Decoration.none, lineDecos: Decoration.none }),
  update(value, tr) {
    // If we got an explicit replacement, use it
    for (const e of tr.effects) {
      if (e.is(setReviewDecos)) return e.value
    }
    // Otherwise map through doc changes to keep positions stable
    if (tr.docChanged) {
      return {
        widgets: value.widgets.map(tr.changes as ChangeDesc),
        lineDecos: value.lineDecos.map(tr.changes as ChangeDesc),
      }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.widgets),
})

const reviewLineDecoField = EditorView.decorations.from(reviewDecoField, (v) => v.lineDecos)

/** MergeView wrapper — uses @codemirror/merge for native side-by-side alignment */
function MergeViewEditor({
  original, modified, filePath, onChange,
  onComment, onDeleteComment, onRelocateComments, existingComments, reviewMode,
}: {
  original: string
  modified: string
  filePath: string
  onChange: (value: string) => void
  onComment: (line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onRelocateComments: (moves: Array<{ id: string; lineNumber: number }>) => void
  existingComments: ExistingComment[]
  reviewMode: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onCommentRef = useRef(onComment)
  onCommentRef.current = onComment
  const onDeleteCommentRef = useRef(onDeleteComment)
  onDeleteCommentRef.current = onDeleteComment
  const onRelocateCommentsRef = useRef(onRelocateComments)
  onRelocateCommentsRef.current = onRelocateComments
  const reviewModeRef = useRef(reviewMode)
  reviewModeRef.current = reviewMode
  const existingCommentsRef = useRef(existingComments)
  existingCommentsRef.current = existingComments
  // Track which comment ids are installed so we know when to rebuild vs rely on map
  const installedCommentIdsRef = useRef<string>('')

  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)
  const [commentWidgetDoms, setCommentWidgetDoms] = useState<Map<string, HTMLDivElement>>(new Map())
  const [inputWidgetDom, setInputWidgetDom] = useState<HTMLDivElement | null>(null)

  const hoverDecoCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())
  const hoveredLineRef = useRef<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const langExt = getLanguageExtension(filePath)
    const commonExts = [
      ...baseExtensions({ readOnly: false }),
      diffTheme,
      langExt,
    ]

    const reviewGutter = gutter({
      class: 'cm-review-gutter',
      lineMarker: (view: EditorView, line: BlockInfo) => {
        if (!reviewModeRef.current) return null
        const lineNum = view.state.doc.lineAt(line.from).number
        const hasComment = existingCommentsRef.current?.some(c => c.lineNumber === lineNum)
        if (hasComment) return new ReviewGutterMarker()
        return null
      },
      domEventHandlers: {
        click: (view: EditorView, line: BlockInfo) => {
          if (!reviewModeRef.current) return false
          setActiveCommentLine(view.state.doc.lineAt(line.from).number)
          return true
        },
      },
    })

    const hoverTracker = EditorView.domEventHandlers({
      click: (e: MouseEvent, view: EditorView) => {
        if (!reviewModeRef.current) return false
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos === null) return false
        setActiveCommentLine(view.state.doc.lineAt(pos).number)
        return true
      },
      mousemove: (e: MouseEvent, view: EditorView) => {
        if (!reviewModeRef.current) return false
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos === null) {
          if (hoveredLineRef.current !== null) {
            hoveredLineRef.current = null
            view.dispatch({ effects: hoverDecoCompartment.current.reconfigure([]) })
          }
          return false
        }
        const lineNum = view.state.doc.lineAt(pos).number
        if (lineNum !== hoveredLineRef.current) {
          hoveredLineRef.current = lineNum
          const line = view.state.doc.line(lineNum)
          view.dispatch({
            effects: hoverDecoCompartment.current.reconfigure(
              EditorView.decorations.of(
                Decoration.set([Decoration.line({ class: 'cm-review-line-highlight' }).range(line.from)])
              )
            ),
          })
        }
        return false
      },
      mouseleave: (_e: MouseEvent, view: EditorView) => {
        if (hoveredLineRef.current !== null) {
          hoveredLineRef.current = null
          view.dispatch({ effects: hoverDecoCompartment.current.reconfigure([]) })
        }
        return false
      },
    })

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
          readOnlyCompartment.current.of(reviewMode ? [EditorState.readOnly.of(true), reviewCursorTheme] : []),
          reviewDecoField,
          reviewLineDecoField,
          hoverDecoCompartment.current.of([]),
          reviewGutter,
          hoverTracker,
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
      // Flush relocated positions to store on unmount
      flushRelocations()
      view.destroy()
      mergeViewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Read current widget positions from the StateField and report relocated line numbers */
  const flushRelocations = useCallback(() => {
    const view = mergeViewRef.current
    if (!view) return
    const b = view.b
    const comments = existingCommentsRef.current
    if (!comments?.length) return
    const moves: Array<{ id: string; lineNumber: number }> = []
    const decoState = b.state.field(reviewDecoField)
    // Walk the widget decorations to find current positions
    const idToPos = new Map<string, number>()
    const iter = decoState.widgets.iter()
    while (iter.value) {
      const w = iter.value.spec.widget
      if (w instanceof CommentBlockWidget) {
        idToPos.set(w.id, iter.from)
      }
      iter.next()
    }
    for (const c of comments) {
      const pos = idToPos.get(c.id)
      if (pos != null) {
        const newLine = b.state.doc.lineAt(pos).number
        if (newLine !== c.lineNumber) {
          moves.push({ id: c.id, lineNumber: newLine })
        }
      }
    }
    if (moves.length) onRelocateCommentsRef.current(moves)
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

  // Update readOnly based on reviewMode
  useEffect(() => {
    const view = mergeViewRef.current
    if (!view) return
    view.b.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        reviewMode ? [EditorState.readOnly.of(true), reviewCursorTheme] : []
      ),
    })
    if (!reviewMode) {
      // Flush relocated positions when leaving review mode
      flushRelocations()
      hoveredLineRef.current = null
      view.b.dispatch({ effects: hoverDecoCompartment.current.reconfigure([]) })
      setActiveCommentLine(null)
    }
  }, [reviewMode, flushRelocations])

  // Build & dispatch review decorations only when comment set or activeCommentLine changes
  useEffect(() => {
    const view = mergeViewRef.current
    if (!view) return
    const b = view.b
    const comments = existingComments
    const inputLine = activeCommentLine

    // Check if the comment set actually changed (not just line numbers shifting)
    const commentIds = comments?.map(c => c.id).sort().join(',') ?? ''
    const inputKey = inputLine != null ? `|input-${inputLine}` : ''
    const decoKey = commentIds + inputKey
    if (decoKey === installedCommentIdsRef.current) return
    installedCommentIdsRef.current = decoKey

    const widgetSpecs: Array<{ pos: number; widget: CommentBlockWidget | InputBlockWidget }> = []
    if (comments?.length) {
      for (const c of [...comments].sort((a, cb) => a.lineNumber - cb.lineNumber)) {
        if (c.lineNumber <= b.state.doc.lines) {
          widgetSpecs.push({ pos: b.state.doc.line(c.lineNumber).to, widget: new CommentBlockWidget(c.id) })
        }
      }
    }
    if (inputLine !== null && inputLine <= b.state.doc.lines) {
      widgetSpecs.push({ pos: b.state.doc.line(inputLine).to, widget: new InputBlockWidget(`input-${inputLine}`) })
    }
    widgetSpecs.sort((a, bb) => a.pos - bb.pos)

    const widgetDecos = widgetSpecs.length > 0
      ? Decoration.set(widgetSpecs.map(w => Decoration.widget({ widget: w.widget, block: true, side: 1 }).range(w.pos)))
      : Decoration.none
    const lineDecos = comments?.length
      ? Decoration.set(
          comments
            .filter(c => c.lineNumber <= b.state.doc.lines)
            .map(c => Decoration.line({ class: 'cm-review-commented-line' }).range(b.state.doc.line(c.lineNumber).from))
            .sort((a, bb) => a.from - bb.from)
        )
      : Decoration.none

    b.dispatch({ effects: setReviewDecos.of({ widgets: widgetDecos, lineDecos }) })

    // Query portal containers after CM processes the new widgets
    requestAnimationFrame(() => {
      const newCommentDoms = new Map<string, HTMLDivElement>()
      b.dom.querySelectorAll<HTMLDivElement>('[data-comment-widget-id]').forEach((el: HTMLDivElement) => {
        newCommentDoms.set(el.dataset.commentWidgetId!, el)
      })
      setCommentWidgetDoms(newCommentDoms)
      const inputEl = b.dom.querySelector<HTMLDivElement>('[data-input-widget-key]')
      setInputWidgetDom(inputEl)
    })
  }, [existingComments, activeCommentLine])

  const handleSubmitComment = useCallback((text: string) => {
    if (activeCommentLine !== null && onCommentRef.current) {
      onCommentRef.current(activeCommentLine, text)
    }
    setActiveCommentLine(null)
  }, [activeCommentLine])

  const handleCancelComment = useCallback(() => setActiveCommentLine(null), [])

  const existingForLine = activeCommentLine !== null
    ? existingCommentsRef.current?.find((c) => c.lineNumber === activeCommentLine)
    : null

  return (
    <>
      <div ref={containerRef} />
      {existingComments?.map(c => {
        const dom = commentWidgetDoms.get(c.id)
        if (!dom) return null
        return createPortal(
          <InlineComment key={c.id} comment={c} onDelete={(id) => onDeleteCommentRef.current?.(id)} />,
          dom
        )
      })}
      {inputWidgetDom && activeCommentLine !== null &&
        createPortal(
          <CommentInput
            key={activeCommentLine}
            defaultValue={existingForLine?.text ?? ''}
            isUpdate={!!existingForLine}
            onSubmit={handleSubmitComment}
            onCancel={handleCancelComment}
          />,
          inputWidgetDom
        )
      }
    </>
  )
}

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
    reviewMode = false,
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
                    onComment={(line, text) => onComment(change.path, line, text)}
                    onDeleteComment={onDeleteComment}
                    onRelocateComments={onRelocateComments}
                    existingComments={commentsByFile[change.path] ?? []}
                    reviewMode={reviewMode}
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
