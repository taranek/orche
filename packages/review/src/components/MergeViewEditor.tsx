/**
 * MergeView wrapper — uses @codemirror/merge for native side-by-side alignment.
 * Manages the CM lifecycle, comment gutter, inline comment widgets, and React portals.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MergeView } from '@codemirror/merge'
import { EditorView, gutter, type BlockInfo } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import {
  baseExtensions, getLanguageExtension, diffTheme,
  type ExistingComment,
  InlineComment, CommentInput, CommentBlockWidget,
} from '@orche/shared'
import {
  reviewDecoField, reviewLineDecoField,
  addCommentMarkerInstance, commentDotMarkerInstance,
} from './review-extensions'
import { useSyncDocuments, useReviewDecorations } from './useMergeViewSync'

export interface MergeViewEditorProps {
  original: string
  modified: string
  filePath: string
  onChange: (value: string) => void
  onComment: (line: number, text: string) => void
  onDeleteComment: (id: string) => void
  onRelocateComments: (moves: Array<{ id: string; lineNumber: number }>) => void
  existingComments: ExistingComment[]
}

export function MergeViewEditor({
  original, modified, filePath, onChange,
  onComment, onDeleteComment, onRelocateComments, existingComments,
}: MergeViewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)

  const callbacksRef = useRef({ onChange, onComment, onDeleteComment, onRelocateComments })
  callbacksRef.current = { onChange, onComment, onDeleteComment, onRelocateComments }

  const existingCommentsRef = useRef(existingComments)
  existingCommentsRef.current = existingComments

  const commentLineSet = useMemo(
    () => new Set(existingComments.map(c => c.lineNumber)),
    [existingComments]
  )
  const commentLineSetRef = useRef(commentLineSet)
  commentLineSetRef.current = commentLineSet

  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)

  // Create MergeView on mount
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

  /** Flush relocated comment positions to store on unmount */
  const flushRelocations = useCallback(() => {
    const view = mergeViewRef.current
    if (!view) return
    const b = view.b
    const comments = existingCommentsRef.current
    if (!comments?.length) return
    const moves: Array<{ id: string; lineNumber: number }> = []
    const decoState = b.state.field(reviewDecoField)
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

  useSyncDocuments(mergeViewRef, original, modified)
  const { commentWidgetDoms, inputWidgetDom } = useReviewDecorations(mergeViewRef, existingComments, activeCommentLine)

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
