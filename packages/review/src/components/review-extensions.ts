/**
 * CodeMirror extensions for inline review comments.
 * Pure CM state — no React dependencies.
 */
import { EditorView, Decoration, GutterMarker } from '@codemirror/view'
import { StateEffect, StateField, type ChangeDesc } from '@codemirror/state'

// --- Review decoration state field ---
// Decorations live in a StateField so they survive doc changes via `map`,
// avoiding portal container destruction on every keystroke.

export interface ReviewDecoState {
  widgets: ReturnType<typeof Decoration.set>
  lineDecos: ReturnType<typeof Decoration.set>
}

export const setReviewDecos = StateEffect.define<ReviewDecoState>()

export const reviewDecoField = StateField.define<ReviewDecoState>({
  create: () => ({ widgets: Decoration.none, lineDecos: Decoration.none }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setReviewDecos)) return e.value
    }
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

export const reviewLineDecoField = EditorView.decorations.from(reviewDecoField, (v) => v.lineDecos)

// --- Comment gutter markers ---

class AddCommentMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-comment-gutter-add'
    el.textContent = '+'
    return el
  }
}

class CommentDotMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-comment-gutter-dot'
    return el
  }
}

export const addCommentMarkerInstance = new AddCommentMarker()
export const commentDotMarkerInstance = new CommentDotMarker()
