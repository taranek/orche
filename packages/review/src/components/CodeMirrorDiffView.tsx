import { useEffect, useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { MergeView } from '@codemirror/merge'
import { EditorView, Decoration, GutterMarker, gutter, type BlockInfo } from '@codemirror/view'
import { EditorState, StateEffect, StateField, type ChangeDesc } from '@codemirror/state'
import {
  baseExtensions, getLanguageExtension, diffTheme,
  type ExistingComment,
  InlineComment, CommentInput, CommentBlockWidget, InputBlockWidget,
} from '@orche/shared'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { FileChange } from '../types'
import './merge-view-styles.css'

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

// --- Comment gutter markers ---

/** "+" button that appears on hover — click to add a comment */
class AddCommentMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-comment-gutter-add'
    el.textContent = '+'
    return el
  }
}

/** Accent dot for lines that already have a comment */
class CommentDotMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-comment-gutter-dot'
    return el
  }
}

const addCommentMarkerInstance = new AddCommentMarker()
const commentDotMarkerInstance = new CommentDotMarker()

/** MergeView wrapper — uses @codemirror/merge for native side-by-side alignment */
function MergeViewEditor({
  original, modified, filePath, onChange,
  onComment, onDeleteComment, onRelocateComments, existingComments,
}: {
  original: string
  modified: string
  filePath: string
  onChange: (value: string) => void
  onComment: (line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onRelocateComments: (moves: Array<{ id: string; lineNumber: number }>) => void
  existingComments: ExistingComment[]
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
  const existingCommentsRef = useRef(existingComments)
  existingCommentsRef.current = existingComments
  const installedCommentIdsRef = useRef<string>('')

  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)
  const [commentWidgetDoms, setCommentWidgetDoms] = useState<Map<string, HTMLDivElement>>(new Map())
  const [inputWidgetDom, setInputWidgetDom] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const langExt = getLanguageExtension(filePath)
    const commonExts = [
      ...baseExtensions({ readOnly: false }),
      diffTheme,
      langExt,
    ]

    const commentGutter = gutter({
      class: 'cm-comment-gutter',
      lineMarker: (view: EditorView, line: BlockInfo) => {
        const lineNum = view.state.doc.lineAt(line.from).number
        const hasComment = existingCommentsRef.current?.some(c => c.lineNumber === lineNum)
        return hasComment ? commentDotMarkerInstance : addCommentMarkerInstance
      },
      domEventHandlers: {
        click: (view: EditorView, line: BlockInfo) => {
          setActiveCommentLine(view.state.doc.lineAt(line.from).number)
          return true
        },
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
          reviewDecoField,
          reviewLineDecoField,
          commentGutter,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      },
      parent: el,
      collapseUnchanged: { margin: 3, minSize: 6 },
      diffConfig: { scanLimit: 1e9 },
      highlightChanges: true,
      gutter: true,
    })

    mergeViewRef.current = view

    // Line-hover tracker: show "+" gutter marker for the hovered line
    let hoveredGutterEl: HTMLElement | null = null
    const clearHover = () => {
      if (hoveredGutterEl) { hoveredGutterEl.classList.remove('cm-gutter-line-hover'); hoveredGutterEl = null }
    }
    const onMouseMove = (e: MouseEvent) => {
      const els = view.b.dom.querySelectorAll<HTMLElement>('.cm-comment-gutter .cm-gutterElement')
      let found: HTMLElement | null = null
      for (const gel of els) {
        const r = gel.getBoundingClientRect()
        if (e.clientY >= r.top && e.clientY < r.bottom) { found = gel; break }
      }
      if (found === hoveredGutterEl) return
      clearHover()
      if (found) { found.classList.add('cm-gutter-line-hover'); hoveredGutterEl = found }
    }
    view.b.dom.addEventListener('mousemove', onMouseMove)
    view.b.dom.addEventListener('mouseleave', clearHover)

    return () => {
      view.b.dom.removeEventListener('mousemove', onMouseMove)
      view.b.dom.removeEventListener('mouseleave', clearHover)
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
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                {/* Sticky file header — elevated pill style */}
                <div
                  onClick={() => toggleCollapse(change.path)}
                  className="sticky top-0 z-20 flex items-center gap-2 h-[38px] px-3 bg-elevated border-b border-edge-active cursor-pointer select-none shadow-[0_1px_3px_rgba(0,0,0,0.15),0_0_0_1px_rgba(255,255,255,0.03)_inset] hover:bg-hover/50 transition-colors"
                >
                  {isCollapsed
                    ? <ChevronRight size={13} className="text-fg-tertiary" />
                    : <ChevronDown size={13} className="text-fg-tertiary" />
                  }
                  <span className="text-[12px] font-mono font-bold" style={{ color: statusColor }}>{statusIcon}</span>
                  <span className="text-[12px] font-mono font-medium text-fg tracking-tight">{change.path}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] font-mono font-semibold tabular-nums">
                    {stats.deletions > 0 && <span className="text-status-red">-{stats.deletions}</span>}
                    {stats.additions > 0 && <span className="text-status-green">+{stats.additions}</span>}
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
