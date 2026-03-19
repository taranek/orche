import { useRef, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, Decoration, gutter, gutterLineClass } from '@codemirror/view';
import { EditorState, Compartment, Text, RangeSet } from '@codemirror/state';
import { Chunk } from '@codemirror/merge';

import type { CodeDiffEditorProps } from './types';
import { reviewCursorTheme, diffTheme } from './themes';
import { getLanguageExtension } from './languageExtension';
import { baseExtensions } from './baseExtensions';
import { buildDiffDecos, computeSpacers, trimChunkEdges, drawFlowConnections, RevertGutterMarker, updateScrollbarMarkers, type ChunkType } from './diffUtils';
import { InlineComment, CommentInput, ReviewGutterMarker, CommentBlockWidget, InputBlockWidget } from './reviewComponents';

export function SplitDiffEditorInner({
  original,
  modified,
  onChange,
  onSave,
  filePath,
  onComment,
  onDeleteComment,
  reviewMode = false,
  existingComments,
  onEditorReady,
}: CodeDiffEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorARef = useRef<EditorView | null>(null);
  const editorBRef = useRef<EditorView | null>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const flowSvgRef = useRef<SVGSVGElement>(null);
  const chunksRef = useRef<readonly InstanceType<typeof Chunk>[]>([]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onCommentRef = useRef(onComment);
  onCommentRef.current = onComment;
  const onDeleteCommentRef = useRef(onDeleteComment);
  onDeleteCommentRef.current = onDeleteComment;
  const handleRejectChunkRef = useRef<(index: number) => void>(() => {});
  const reviewModeRef = useRef(reviewMode);
  reviewModeRef.current = reviewMode;
  const existingCommentsRef = useRef(existingComments);
  existingCommentsRef.current = existingComments;

  // State for React portals
  const [commentWidgetDoms, setCommentWidgetDoms] = useState<Map<string, HTMLDivElement>>(new Map());
  const [inputWidgetDom, setInputWidgetDom] = useState<HTMLDivElement | null>(null);
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);

  // Revert gutter on editor B (faces the divider for all chunk types)
  const revertGutterCompartment = useRef(new Compartment());

  // Compartments for dynamic reconfiguration
  const spacerCompartmentA = useRef(new Compartment());
  const spacerCompartmentB = useRef(new Compartment());
  const diffDecoCompartmentA = useRef(new Compartment());
  const diffDecoCompartmentB = useRef(new Compartment());
  const gutterClassCompartmentA = useRef(new Compartment());
  const gutterClassCompartmentB = useRef(new Compartment());
  const reviewCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const hoveredLineRef = useRef<number | null>(null);
  const hoverDecoCompartment = useRef(new Compartment());
  const diffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update revert strip heights from DOM
  const updateStripHeights = useCallback(() => {
    const b = editorBRef.current;
    if (!b) return;
    const chunks = chunksRef.current;
    for (let i = 0; i < chunks.length; i++) {
      const els = b.dom.querySelectorAll(`.cm-chunk-${i}`);
      if (!els.length) continue;
      let top = Infinity, bottom = -Infinity;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.top < top) top = r.top;
        if (r.bottom > bottom) bottom = r.bottom;
      }
      const strip = b.dom.querySelector(`.cm-revert-strip[data-chunk="${i}"]`) as HTMLElement | null;
      if (strip) {
        strip.style.height = `${bottom - top}px`;
        strip.style.visibility = 'visible';
      }
    }
  }, []);

  // Redraw flow connections between matching chunks
  const redrawFlows = useCallback(() => {
    const svg = flowSvgRef.current;
    const a = editorARef.current;
    const b = editorBRef.current;
    if (!svg || !a || !b) return;
    updateStripHeights();
    drawFlowConnections(svg, a, b, chunksRef.current);
  }, [updateStripHeights]);


  // Compute diff and apply decorations + spacers to both editors
  const applyDiff = useCallback((docA: Text, docB: Text) => {
    const a = editorARef.current;
    const b = editorBRef.current;
    if (!a || !b) return;

    const rawChunks = Chunk.build(docA, docB);
    // Trim matching lines from chunk edges (Chunk.build is char-level, we want line-level)
    const chunks = trimChunkEdges(docA, docB, rawChunks);
    chunksRef.current = chunks;

    // Diff highlighting + gutter markers
    const resultA = buildDiffDecos(docA, chunks, 'a');
    const resultB = buildDiffDecos(docB, chunks, 'b');

    // Alignment spacers
    const lineHeight = a.defaultLineHeight;
    const spacers = computeSpacers(docA, docB, chunks, lineHeight);

    a.dispatch({
      effects: [
        diffDecoCompartmentA.current.reconfigure(EditorView.decorations.of(resultA.decos)),
        spacerCompartmentA.current.reconfigure(EditorView.decorations.of(spacers.a)),
        gutterClassCompartmentA.current.reconfigure(gutterLineClass.of(resultA.gutterMarkers)),
      ],
    });
    // Dispatch spacers + diff decos first so lineBlockAt includes spacer heights
    b.dispatch({
      effects: [
        diffDecoCompartmentB.current.reconfigure(EditorView.decorations.of(resultB.decos)),
        spacerCompartmentB.current.reconfigure(EditorView.decorations.of(spacers.b)),
        gutterClassCompartmentB.current.reconfigure(gutterLineClass.of(resultB.gutterMarkers)),
      ],
    });

    // Build revert gutter markers AFTER spacers are applied
    const revertMarkers: Array<{ from: number; marker: RevertGutterMarker }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const bEmpty = chunk.fromB === chunk.toB;
      const aEmpty = chunk.fromA === chunk.toA;
      const pos = Math.min(chunk.fromB, docB.length);
      const lineStart = b.state.doc.lineAt(pos).from;

      const chunkType: ChunkType = aEmpty ? 'add' : bEmpty ? 'delete' : 'modify';
      revertMarkers.push({ from: lineStart, marker: new RevertGutterMarker(i, 0, chunkType) });
    }
    revertMarkers.sort((x, y) => x.from - y.from);

    b.dispatch({
      effects: [
        revertGutterCompartment.current.reconfigure(
          revertMarkers.length
            ? gutter({
                class: 'cm-revert-gutter',
                markers: () => RangeSet.of(revertMarkers.map(r => r.marker.range(r.from))),
              })
            : []
        ),
      ],
    });

    // After layout settles, update revert strip heights + redraw flows + scrollbar markers
    requestAnimationFrame(() => requestAnimationFrame(() => {
      redrawFlows();
      const a = editorARef.current;
      const b = editorBRef.current;
      if (a) updateScrollbarMarkers(a, chunks, 'a');
      if (b) updateScrollbarMarkers(b, chunks, 'b');
    }));
  }, [redrawFlows]);

  // Create both editors on mount
  useEffect(() => {
    const container = containerRef.current;
    const divider = dividerRef.current;
    if (!container || !divider) return;

    const leftPane = container.querySelector('[data-pane="left"]') as HTMLElement;
    const rightPane = container.querySelector('[data-pane="right"]') as HTMLElement;
    if (!leftPane || !rightPane) return;

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => { onSaveRef.current?.(); return true; },
    }]);

    const langExt = getLanguageExtension(filePath);

    // Review mode gutter
    const reviewGutter = gutter({
      class: 'cm-review-gutter',
      lineMarker: (view, line) => {
        if (!reviewModeRef.current) return null;
        const lineNum = view.state.doc.lineAt(line.from).number;
        const hasComment = existingCommentsRef.current?.some(c => c.lineNumber === lineNum);
        if (hasComment) return new ReviewGutterMarker();
        return null;
      },
      domEventHandlers: {
        click: (view, line) => {
          if (!reviewModeRef.current) return false;
          setActiveCommentLine(view.state.doc.lineAt(line.from).number);
          return true;
        },
      },
    });

    const hoverTracker = EditorView.domEventHandlers({
      click: (e, view) => {
        if (!reviewModeRef.current) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) return false;
        const lineNum = view.state.doc.lineAt(pos).number;
        setActiveCommentLine(lineNum);
        return true;
      },
      mousemove: (e, view) => {
        if (!reviewModeRef.current) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) {
          if (hoveredLineRef.current !== null) {
            hoveredLineRef.current = null;
            view.dispatch({ effects: hoverDecoCompartment.current.reconfigure([]) });
          }
          return false;
        }
        const lineNum = view.state.doc.lineAt(pos).number;
        if (lineNum !== hoveredLineRef.current) {
          hoveredLineRef.current = lineNum;
          const line = view.state.doc.line(lineNum);
          view.dispatch({
            effects: hoverDecoCompartment.current.reconfigure(
              EditorView.decorations.of(
                Decoration.set([Decoration.line({ class: 'cm-review-line-highlight' }).range(line.from)])
              )
            ),
          });
        }
        return false;
      },
      mouseleave: (_e, view) => {
        if (hoveredLineRef.current !== null) {
          hoveredLineRef.current = null;
          view.dispatch({ effects: hoverDecoCompartment.current.reconfigure([]) });
        }
        return false;
      },
    });

    // Editor A (original, read-only)
    const editorA = new EditorView({
      state: EditorState.create({
        doc: original,
        extensions: [
          ...baseExtensions({ readOnly: true }),
          diffTheme,
          langExt,
          EditorState.readOnly.of(true),
          spacerCompartmentA.current.of([]),
          diffDecoCompartmentA.current.of([]),
          gutterClassCompartmentA.current.of([]),
        ],
      }),
      parent: leftPane,
    });
    editorARef.current = editorA;

    // Editor B (modified)
    const editorB = new EditorView({
      state: EditorState.create({
        doc: modified,
        extensions: [
          ...baseExtensions({ readOnly: false }),
          diffTheme,
          langExt,
          readOnlyCompartment.current.of(reviewMode ? EditorState.readOnly.of(true) : []),
          reviewCompartment.current.of([]),
          hoverDecoCompartment.current.of([]),
          spacerCompartmentB.current.of([]),
          diffDecoCompartmentB.current.of([]),
          gutterClassCompartmentB.current.of([]),
          revertGutterCompartment.current.of([]),
          reviewGutter,
          hoverTracker,
          saveKeymap,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
              // Re-diff synchronously
              const a = editorARef.current;
              if (a) applyDiff(a.state.doc, update.state.doc);
            }
          }),
        ],
      }),
      parent: rightPane,
    });
    editorBRef.current = editorB;

    // Sync scrolling
    const syncScroll = (source: EditorView, target: EditorView) => {
      const sTop = source.scrollDOM.scrollTop;
      if (Math.abs(target.scrollDOM.scrollTop - sTop) > 1) {
        target.scrollDOM.scrollTop = sTop;
      }
    };

    let scrolling = false;
    let flowRaf = 0;
    const scheduleFlowRedraw = () => {
      if (!flowRaf) flowRaf = requestAnimationFrame(() => { flowRaf = 0; redrawFlows(); });
    };
    const onScrollA = () => {
      if (scrolling) return;
      scrolling = true;
      syncScroll(editorA, editorB);
      scrolling = false;
      scheduleFlowRedraw();
    };
    const onScrollB = () => {
      if (scrolling) return;
      scrolling = true;
      syncScroll(editorB, editorA);
      scrolling = false;
      scheduleFlowRedraw();
    };
    editorA.scrollDOM.addEventListener('scroll', onScrollA, { passive: true });
    editorB.scrollDOM.addEventListener('scroll', onScrollB, { passive: true });

    // Expose revealLine API
    onEditorReady?.({
      revealLine: (line: number) => {
        if (line <= editorB.state.doc.lines) {
          const lineObj = editorB.state.doc.line(line);
          editorB.dispatch({ selection: { anchor: lineObj.from }, scrollIntoView: true });
        }
      },
    });

    // Show revert button when hovering affected lines in editor B
    let activeRevertBtn: HTMLElement | null = null;
    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const line = target.closest('.cm-diff-inserted, .cm-diff-insertion-point, .cm-diff-spacer-added, .cm-diff-deletion-point, .cm-diff-spacer-deleted, div[contenteditable="false"]');
      if (!line) {
        if (activeRevertBtn) { activeRevertBtn.style.opacity = ''; activeRevertBtn = null; }
        return;
      }
      const pos = editorB.posAtDOM(line as Node);
      const chunks = chunksRef.current;
      let chunkIdx = -1;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        if (pos >= c.fromB && pos <= Math.max(c.toB, c.fromB)) { chunkIdx = i; break; }
      }
      if (chunkIdx < 0) {
        if (activeRevertBtn) { activeRevertBtn.style.opacity = ''; activeRevertBtn = null; }
        return;
      }
      const btn = editorB.dom.querySelector(`.cm-revert-button[data-chunk="${chunkIdx}"]`) as HTMLElement | null;
      if (btn !== activeRevertBtn) {
        if (activeRevertBtn) activeRevertBtn.style.opacity = '';
        if (btn) btn.style.opacity = '1';
        activeRevertBtn = btn;
      }
    };
    const onMouseLeave = () => {
      if (activeRevertBtn) { activeRevertBtn.style.opacity = ''; activeRevertBtn = null; }
    };
    const onRevertClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const strip = target.closest('.cm-revert-strip, .cm-revert-button');
      if (strip) {
        const chunkAttr = strip.getAttribute('data-chunk');
        if (chunkAttr != null) { handleRejectChunkRef.current(Number(chunkAttr)); return; }
      }
      const gutterEl = target.closest('.cm-revert-gutter');
      if (!gutterEl) return;
      const y = e.clientY;
      const strips = editorB.dom.querySelectorAll('.cm-revert-strip');
      for (const s of strips) {
        const r = s.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
          const chunkAttr = s.getAttribute('data-chunk');
          if (chunkAttr != null) { handleRejectChunkRef.current(Number(chunkAttr)); return; }
        }
      }
    };
    editorB.dom.addEventListener('click', onRevertClick);
    editorB.dom.addEventListener('mousemove', onMouseMove);
    editorB.dom.addEventListener('mouseleave', onMouseLeave);

    // Initial diff computation
    applyDiff(editorA.state.doc, editorB.state.doc);

    // On resize, recalculate everything
    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        applyDiff(editorA.state.doc, editorB.state.doc);
      }, 150);
    });
    ro.observe(container);

    return () => {
      clearTimeout(resizeTimer);
      if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
      cancelAnimationFrame(flowRaf);
      ro.disconnect();
      editorA.scrollDOM.removeEventListener('scroll', onScrollA);
      editorB.scrollDOM.removeEventListener('scroll', onScrollB);
      editorB.dom.removeEventListener('click', onRevertClick);
      editorB.dom.removeEventListener('mousemove', onMouseMove);
      editorB.dom.removeEventListener('mouseleave', onMouseLeave);
      editorA.destroy();
      editorB.destroy();
      editorARef.current = null;
      editorBRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update documents when props change
  useEffect(() => {
    const a = editorARef.current;
    const b = editorBRef.current;
    if (!a || !b) return;

    let changed = false;
    if (a.state.doc.toString() !== original) {
      a.dispatch({ changes: { from: 0, to: a.state.doc.length, insert: original } });
      changed = true;
    }
    if (b.state.doc.toString() !== modified) {
      b.dispatch({ changes: { from: 0, to: b.state.doc.length, insert: modified } });
      changed = true;
    }
    if (changed) {
      applyDiff(a.state.doc, b.state.doc);
    }
  }, [original, modified, applyDiff]);

  // Update readOnly based on reviewMode
  useEffect(() => {
    const b = editorBRef.current;
    if (!b) return;
    b.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        reviewMode ? [EditorState.readOnly.of(true), reviewCursorTheme] : []
      ),
    });
    if (!reviewMode) {
      hoveredLineRef.current = null;
      b.dispatch({ effects: hoverDecoCompartment.current.reconfigure([]) });
      setActiveCommentLine(null);
    }
  }, [reviewMode]);

  // Comment widget decorations
  useEffect(() => {
    const b = editorBRef.current;
    if (!b) return;

    const comments = existingComments;
    const inputLine = activeCommentLine;
    const widgets: Array<{ pos: number; widget: CommentBlockWidget | InputBlockWidget }> = [];

    if (comments?.length) {
      for (const c of [...comments].sort((a, b) => a.lineNumber - b.lineNumber)) {
        if (c.lineNumber <= b.state.doc.lines) {
          widgets.push({ pos: b.state.doc.line(c.lineNumber).to, widget: new CommentBlockWidget(c.id) });
        }
      }
    }
    if (inputLine !== null && inputLine <= b.state.doc.lines) {
      widgets.push({ pos: b.state.doc.line(inputLine).to, widget: new InputBlockWidget(`input-${inputLine}`) });
    }

    widgets.sort((a, bb) => a.pos - bb.pos);
    const decoSet = widgets.length > 0
      ? Decoration.set(widgets.map(w => Decoration.widget({ widget: w.widget, block: true, side: 1 }).range(w.pos)))
      : Decoration.none;

    const lineDecos = comments?.length
      ? Decoration.set(
          comments
            .filter(c => c.lineNumber <= b.state.doc.lines)
            .map(c => Decoration.line({ class: 'cm-review-commented-line' }).range(b.state.doc.line(c.lineNumber).from))
            .sort((a, bb) => a.from - bb.from)
        )
      : Decoration.none;

    b.dispatch({
      effects: reviewCompartment.current.reconfigure([
        EditorView.decorations.of(decoSet),
        EditorView.decorations.of(lineDecos),
      ]),
    });

    requestAnimationFrame(() => {
      const newCommentDoms = new Map<string, HTMLDivElement>();
      b.dom.querySelectorAll<HTMLDivElement>('[data-comment-widget-id]').forEach(el => {
        newCommentDoms.set(el.dataset.commentWidgetId!, el);
      });
      setCommentWidgetDoms(newCommentDoms);
      const inputEl = b.dom.querySelector<HTMLDivElement>('[data-input-widget-key]');
      setInputWidgetDom(inputEl);
      redrawFlows();
      // Second rAF: portal content renders after state update, resizing the widget
      requestAnimationFrame(() => requestAnimationFrame(redrawFlows));
    });
  }, [existingComments, activeCommentLine, redrawFlows]);

  const handleSubmitComment = useCallback((text: string) => {
    if (activeCommentLine !== null && onCommentRef.current) {
      onCommentRef.current(activeCommentLine, text);
    }
    setActiveCommentLine(null);
  }, [activeCommentLine]);

  const handleCancelComment = useCallback(() => setActiveCommentLine(null), []);

  const existingForLine = activeCommentLine !== null
    ? existingCommentsRef.current?.find((c) => c.lineNumber === activeCommentLine)
    : null;

  const handleRejectChunk = useCallback((chunkIndex: number) => {
    const a = editorARef.current;
    const b = editorBRef.current;
    if (!a || !b) return;

    const chunk = chunksRef.current[chunkIndex];
    if (!chunk) return;

    const originalText = chunk.fromA < chunk.toA
      ? a.state.doc.sliceString(chunk.fromA, Math.min(chunk.toA, a.state.doc.length))
      : '';
    const fromB = chunk.fromB;
    const toB = Math.min(chunk.toB, b.state.doc.length);

    b.dispatch({ changes: { from: fromB, to: toB, insert: originalText } });

    applyDiff(a.state.doc, b.state.doc);
    onChangeRef.current?.(b.state.doc.toString());
  }, [applyDiff]);
  handleRejectChunkRef.current = handleRejectChunk;

  return (
    <div ref={containerRef} className="h-full w-full flex">
      <div data-pane="left" className="flex-1 min-w-0 overflow-hidden [&_.cm-editor]:h-full" />

      <div
        ref={dividerRef}
        className="w-8 shrink-0 relative overflow-visible z-10 pointer-events-none"
      >
        <svg
          ref={flowSvgRef}
          className="pointer-events-none absolute inset-y-0 -left-20 -right-20 w-[calc(100%+160px)] h-full"
        />
      </div>

      <div data-pane="right" className="flex-1 min-w-0 overflow-hidden [&_.cm-editor]:h-full" />


      {existingComments?.map(c => {
        const dom = commentWidgetDoms.get(c.id);
        if (!dom) return null;
        return createPortal(
          <InlineComment key={c.id} comment={c} onDelete={(id) => onDeleteCommentRef.current?.(id)} />,
          dom
        );
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
    </div>
  );
}
