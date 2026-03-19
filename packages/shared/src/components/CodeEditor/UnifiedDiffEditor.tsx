import { useRef, useEffect } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Text, ChangeSet } from '@codemirror/state';
import { unifiedMergeView, updateOriginalDoc, getOriginalDoc } from '@codemirror/merge';

import type { CodeDiffEditorProps } from './types';
import { diffTheme } from './themes';
import { getLanguageExtension } from './languageExtension';
import { baseExtensions } from './baseExtensions';

export function UnifiedDiffEditorInner({
  original,
  modified,
  onChange,
  onSave,
  filePath,
  reviewMode = false,
  onEditorReady,
}: CodeDiffEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => { onSaveRef.current?.(); return true; },
    }]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString());
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: modified,
        extensions: [
          ...baseExtensions({ readOnly: reviewMode }),
          diffTheme,
          getLanguageExtension(filePath),
          unifiedMergeView({
            original,
            highlightChanges: true,
            gutter: true,
            syntaxHighlightDeletions: true,
            mergeControls: true,
            collapseUnchanged: { margin: 3, minSize: 6 },
          }),
          saveKeymap,
          updateListener,
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    onEditorReady?.({
      revealLine: (line: number) => {
        if (line <= view.state.doc.lines) {
          const lineObj = view.state.doc.line(line);
          view.dispatch({ selection: { anchor: lineObj.from }, scrollIntoView: true });
        }
      },
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update modified doc
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur !== modified) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: modified } });
    }
  }, [modified]);

  // Update original doc
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const newOrigText = Text.of(original.split('\n'));
    const oldOrig = getOriginalDoc(view.state);
    const changes = ChangeSet.of(
      { from: 0, to: oldOrig.length, insert: newOrigText },
      oldOrig.length
    );
    view.dispatch({ effects: updateOriginalDoc.of({ doc: newOrigText, changes }) });
  }, [original]);

  return <div ref={containerRef} className="h-full w-full [&_.cm-scroller]:!overflow-auto" />;
}
