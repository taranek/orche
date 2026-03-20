import { useEffect, type MutableRefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';

interface UseDiffSyncOptions {
  editorARef: MutableRefObject<EditorView | null>;
  editorBRef: MutableRefObject<EditorView | null>;
  original: string;
  modified: string;
  applyDiff: (docA: Text, docB: Text) => void;
}

/**
 * Syncs editor documents in-place when original/modified content changes.
 * This preserves scroll position since the editors are never remounted.
 */
export function useDiffSync({
  editorARef,
  editorBRef,
  original,
  modified,
  applyDiff,
}: UseDiffSyncOptions): void {
  useEffect(() => {
    const a = editorARef.current;
    const b = editorBRef.current;
    if (!a || !b) return;

    const currentOriginal = a.state.doc.toString();
    const currentModified = b.state.doc.toString();

    if (currentOriginal !== original) {
      a.dispatch({ changes: { from: 0, to: a.state.doc.length, insert: original } });
    }
    if (currentModified !== modified) {
      b.dispatch({ changes: { from: 0, to: b.state.doc.length, insert: modified } });
    }
    if (currentOriginal !== original || currentModified !== modified) {
      applyDiff(a.state.doc, b.state.doc);
    }
  }, [original, modified, applyDiff, editorARef, editorBRef]);
}
