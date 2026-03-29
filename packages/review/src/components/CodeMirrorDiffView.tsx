import { useEffect, useState, useCallback, useMemo, useRef, memo, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { MergeView } from '@codemirror/merge'
import { EditorView, Decoration, GutterMarker, gutter, type BlockInfo } from '@codemirror/view'
import { EditorState, StateEffect, StateField, type ChangeDesc } from '@codemirror/state'
import {
  baseExtensions, getLanguageExtension, diffTheme,
  type ExistingComment,
  InlineComment, CommentInput, CommentBlockWidget, InputBlockWidget,
} from '@orche/shared'
import type { FileChange } from '../types'
import { DiffFileHeader } from './DiffFileHeader'
import './merge-view-styles.css'

interface FileData {
  original: string
  modified: string
}

/** Hoisted default to avoid new array reference on every render (rerender-memo-with-default-value) */
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
interface MergeViewEditorProps {
  original: string
  modified: string
  filePath: string
  onChange: (value: string) => void
  onComment: (line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onRelocateComments: (moves: Array<{ id: string; lineNumber: number }>) => void
  existingComments: ExistingComment[]
}

function MergeViewEditor({
  original, modified, filePath, onChange,
  onComment, onDeleteComment, onRelocateComments, existingComments,
}: MergeViewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)
  const installedCommentIdsRef = useRef<string>('')

  // Consolidate callback refs into a single object (advanced-event-handler-refs)
  const callbacksRef = useRef({ onChange, onComment, onDeleteComment, onRelocateComments })
  callbacksRef.current = { onChange, onComment, onDeleteComment, onRelocateComments }

  const existingCommentsRef = useRef(existingComments)
  existingCommentsRef.current = existingComments

  // O(1) lookup for comment lines in gutter (js-set-map-lookups)
  const commentLineSet = useMemo(
    () => new Set(existingComments.map(c => c.lineNumber)),
    [existingComments]
  )
  const commentLineSetRef = useRef(commentLineSet)
  commentLineSetRef.current = commentLineSet

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
        return commentLineSetRef.current.has(lineNum) ? commentDotMarkerInstance : addCommentMarkerInstance
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
              callbacksRef.current.onChange(update.state.doc.toString())
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
    if (moves.length) callbacksRef.current.onRelocateComments(moves)
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

  // Use functional setState to avoid activeCommentLine dependency (rerender-functional-setstate)
  const handleSubmitComment = useCallback((text: string) => {
    setActiveCommentLine((line) => {
      if (line !== null) callbacksRef.current.onComment(line, text)
      return null
    })
  }, [])

  const handleCancelComment = useCallback(() => setActiveCommentLine(null), [])

  const existingForLine = activeCommentLine !== null
    ? existingComments.find((c) => c.lineNumber === activeCommentLine)
    : null

  return (
    <>
      <div ref={containerRef} />
      {existingComments.map(c => {
        const dom = commentWidgetDoms.get(c.id)
        if (!dom) return null
        return createPortal(
          <InlineComment key={c.id} comment={c} onDelete={(id) => callbacksRef.current.onDeleteComment(id)} />,
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

// Hoisted empty state (rendering-hoist-jsx)
const EMPTY_STATE = (
  <div className="h-full flex items-center justify-center text-fg-secondary text-sm">
    No files to review
  </div>
)

/** Individual file diff — memoized to prevent re-renders when sibling files change (rerender-memo) */
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

    // Load file contents (async-parallel — already uses Promise.all)
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

    // Scroll tracking for active file (client-passive-event-listeners — already passive)
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
