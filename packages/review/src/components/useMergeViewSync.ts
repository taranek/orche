/**
 * Keeps a MergeView's documents and review decorations in sync with React props.
 */
import { useEffect, useRef, useState } from 'react'
import type { MergeView } from '@codemirror/merge'
import { Decoration } from '@codemirror/view'
import { type ExistingComment, CommentBlockWidget, InputBlockWidget } from '@orche/shared'
import { setReviewDecos } from './review-extensions'

/**
 * Sync MergeView document contents with original/modified props.
 */
export function useSyncDocuments(
  mergeViewRef: React.RefObject<MergeView | null>,
  original: string,
  modified: string,
) {
  useEffect(() => {
    const view = mergeViewRef.current
    if (!view) return
    if (view.a.state.doc.toString() !== original) {
      view.a.dispatch({ changes: { from: 0, to: view.a.state.doc.length, insert: original } })
    }
    if (view.b.state.doc.toString() !== modified) {
      view.b.dispatch({ changes: { from: 0, to: view.b.state.doc.length, insert: modified } })
    }
  }, [mergeViewRef, original, modified])
}

/**
 * Build and dispatch review comment/input decorations on editor B,
 * then query DOM for portal mount points.
 *
 * Only rebuilds when the comment set or active input line actually changes.
 */
export function useReviewDecorations(
  mergeViewRef: React.RefObject<MergeView | null>,
  existingComments: ExistingComment[],
  activeCommentLine: number | null,
) {
  const installedKeyRef = useRef('')
  const [commentWidgetDoms, setCommentWidgetDoms] = useState<Map<string, HTMLDivElement>>(new Map())
  const [inputWidgetDom, setInputWidgetDom] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const view = mergeViewRef.current
    if (!view) return
    const b = view.b

    // Only rebuild if the comment set or input line actually changed
    const commentIds = existingComments.map(c => c.id).sort().join(',')
    const key = activeCommentLine != null ? `${commentIds}|input-${activeCommentLine}` : commentIds
    if (key === installedKeyRef.current) return
    installedKeyRef.current = key

    // Build widget decorations (comment cards + input form)
    const widgetSpecs: Array<{ pos: number; widget: CommentBlockWidget | InputBlockWidget }> = []
    for (const c of [...existingComments].sort((a, cb) => a.lineNumber - cb.lineNumber)) {
      if (c.lineNumber <= b.state.doc.lines) {
        widgetSpecs.push({ pos: b.state.doc.line(c.lineNumber).to, widget: new CommentBlockWidget(c.id) })
      }
    }
    if (activeCommentLine !== null && activeCommentLine <= b.state.doc.lines) {
      widgetSpecs.push({ pos: b.state.doc.line(activeCommentLine).to, widget: new InputBlockWidget(`input-${activeCommentLine}`) })
    }
    widgetSpecs.sort((a, bb) => a.pos - bb.pos)

    const widgetDecos = widgetSpecs.length > 0
      ? Decoration.set(widgetSpecs.map(w => Decoration.widget({ widget: w.widget, block: true, side: 1 }).range(w.pos)))
      : Decoration.none

    // Build line highlight decorations for commented lines
    const lineDecos = existingComments.length > 0
      ? Decoration.set(
          existingComments
            .filter(c => c.lineNumber <= b.state.doc.lines)
            .map(c => Decoration.line({ class: 'cm-review-commented-line' }).range(b.state.doc.line(c.lineNumber).from))
            .sort((a, bb) => a.from - bb.from)
        )
      : Decoration.none

    b.dispatch({ effects: setReviewDecos.of({ widgets: widgetDecos, lineDecos }) })

    // Query portal containers after CM processes the widgets
    requestAnimationFrame(() => {
      const newDoms = new Map<string, HTMLDivElement>()
      b.dom.querySelectorAll<HTMLDivElement>('[data-comment-widget-id]').forEach((el) => {
        newDoms.set(el.dataset.commentWidgetId!, el)
      })
      setCommentWidgetDoms(newDoms)
      setInputWidgetDom(b.dom.querySelector<HTMLDivElement>('[data-input-widget-key]'))
    })
  }, [mergeViewRef, existingComments, activeCommentLine])

  return { commentWidgetDoms, inputWidgetDom }
}
