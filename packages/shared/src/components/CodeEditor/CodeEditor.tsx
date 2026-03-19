import { useRef, useEffect } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';

import type { CodeEditorProps, CodeDiffEditorProps } from './types';
import { getLanguageExtension } from './languageExtension';
import { baseExtensions } from './baseExtensions';
import { UnifiedDiffEditorInner } from './UnifiedDiffEditor';
import { SplitDiffEditorInner } from './SplitDiffEditor';

// --- Standard editor ---

export function CodeEditor({ value, onChange, onSave, filePath, readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const valueRef = useRef(value);
  valueRef.current = value;

  // Compartments for dynamic reconfiguration
  const langCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => { onSaveRef.current?.(); return true; },
    }]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const val = update.state.doc.toString();
        onChangeRef.current?.(val);
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          ...baseExtensions({ readOnly: false }),
          langCompartment.current.of(getLanguageExtension(filePath)),
          readOnlyCompartment.current.of(readOnly ? EditorState.readOnly.of(true) : []),
          saveKeymap,
          updateListener,
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update document when value changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  // Update language when filePath changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(getLanguageExtension(filePath)),
    });
  }, [filePath]);

  // Update readOnly
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        readOnly ? EditorState.readOnly.of(true) : []
      ),
    });
  }, [readOnly]);

  return <div ref={containerRef} className="h-full w-full [&_.cm-scroller]:!overflow-auto" />;
}

// --- Diff editor ---

export function CodeDiffEditor(props: CodeDiffEditorProps) {
  if (props.mode === 'unified') {
    return <UnifiedDiffEditorInner {...props} />;
  }
  return <SplitDiffEditorInner {...props} />;
}

// Re-export for MainContent compatibility
export type { ExistingComment, CodeDiffEditorProps } from './types';
