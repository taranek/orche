import { useRef, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, Decoration, WidgetType, gutter, gutterLineClass, type BlockInfo, type ViewUpdate } from '@codemirror/view';
import { EditorState, Compartment, Text, RangeSet } from '@codemirror/state';
import { Chunk } from '@codemirror/merge';

import {
  reviewCursorTheme, diffTheme,
  getLanguageExtension,
  baseExtensions,
  buildDiffDecos, computeSpacers, trimChunkEdges, drawFlowConnections,
  RevertGutterMarker, type ExistingComment,
  InlineComment, CommentInput, ReviewGutterMarker, CommentBlockWidget, InputBlockWidget,
} from '@orche/shared';

type ChunkType = 'add' | 'delete' | 'modify';

// --- Context collapsing: hide unchanged lines between hunks ---

const CONTEXT_MARGIN = 3; // lines of context above/below each hunk
const MIN_COLLAPSE = 4;   // minimum lines to bother collapsing

class CollapsedLinesWidget extends WidgetType {
  constructor(readonly lineCount: number) { super(); }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-collapsed-context';
    el.textContent = `⋯ ${this.lineCount} lines hidden ⋯`;
    el.style.cssText = 'padding:3px 0;text-align:center;font-size:11px;font-family:"JetBrains Mono","SF Mono",Menlo,monospace;color:var(--fg-tertiary);cursor:default;background:linear-gradient(to bottom,transparent,var(--sidebar) 35%,var(--sidebar) 65%,transparent);user-select:none;';
    return el;
  }
  eq(other: CollapsedLinesWidget) { return this.lineCount === other.lineCount; }
  get estimatedHeight() { return 24; }
}

interface CollapseRange {
  fromLine: number; // 1-based line number
  toLine: number;   // 1-based line number (inclusive)
}

/** Compute line ranges to collapse in a document given the chunks on that side. */
function computeCollapseRanges(
  doc: Text,
  chunks: readonly InstanceType<typeof Chunk>[],
  side: 'a' | 'b',
): CollapseRange[] {
  const totalLines = doc.lines;
  if (totalLines === 0) return [];

  // Collect "visible" line ranges (changed lines + context margin)
  const visible: Array<[number, number]> = [];
  for (const chunk of chunks) {
    const from = side === 'a' ? chunk.fromA : chunk.fromB;
    const to = side === 'a' ? chunk.toA : chunk.toB;
    // Convert char offsets to line numbers
    const startLine = doc.lineAt(Math.min(from, doc.length)).number;
    const endLine = to > from ? doc.lineAt(Math.min(to - 1, doc.length)).number : startLine;
    visible.push([
      Math.max(1, startLine - CONTEXT_MARGIN),
      Math.min(totalLines, endLine + CONTEXT_MARGIN),
    ]);
  }

  // Merge overlapping visible ranges
  visible.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of visible) {
    if (merged.length && s <= merged[merged.length - 1][1] + 1) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }

  // Gaps between visible ranges are the collapse ranges
  const ranges: CollapseRange[] = [];
  let cursor = 1;
  for (const [s, e] of merged) {
    if (s > cursor && (s - cursor) >= MIN_COLLAPSE) {
      ranges.push({ fromLine: cursor, toLine: s - 1 });
    }
    cursor = e + 1;
  }
  // Trailing gap
  if (cursor <= totalLines && (totalLines - cursor + 1) >= MIN_COLLAPSE) {
    ranges.push({ fromLine: cursor, toLine: totalLines });
  }

  return ranges;
}

/** Build Decoration.replace ranges that hide collapsed lines and insert a widget. */
function buildCollapseDecos(doc: Text, ranges: CollapseRange[]): RangeSet<Decoration> {
  if (!ranges.length) return RangeSet.empty;
  const decos: Array<{ from: number; to: number; deco: Decoration }> = [];
  for (const r of ranges) {
    const from = doc.line(r.fromLine).from;
    const to = doc.line(r.toLine).to;
    const lineCount = r.toLine - r.fromLine + 1;
    decos.push({
      from,
      to,
      deco: Decoration.replace({ widget: new CollapsedLinesWidget(lineCount), block: false }),
    });
  }
  return RangeSet.of(decos.map(d => d.deco.range(d.from, d.to)));
}

// Theme override: disable internal scroll, render at natural height
const flatScrollTheme = EditorView.theme({
  '&': { height: 'auto !important', overflow: 'visible !important' },
  '.cm-scroller': {
    overflow: 'visible !important',
    position: 'relative !important',
    inset: 'auto',
    height: 'auto',
  },
});

export interface DiffStats {
  additions: number;
  deletions: number;
  chunks: readonly InstanceType<typeof Chunk>[];
}

interface FlatSplitDiffEditorProps {
  original: string;
  modified: string;
  filePath?: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onComment?: (line: number, comment: string) => void;
  onDeleteComment?: (commentId: string) => void;
  reviewMode?: boolean;
  existingComments?: ExistingComment[];
  onStatsComputed?: (stats: DiffStats) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export function FlatSplitDiffEditor({
  original,
  modified,
  filePath,
  onChange,
  onSave,
  onComment,
  onDeleteComment,
  reviewMode = false,
  existingComments,
  onStatsComputed,
  scrollContainerRef,
}: FlatSplitDiffEditorProps) {
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
  const onStatsComputedRef = useRef(onStatsComputed);
  onStatsComputedRef.current = onStatsComputed;
  const handleRejectChunkRef = useRef<(index: number) => void>(() => {});
  const reviewModeRef = useRef(reviewMode);
  reviewModeRef.current = reviewMode;
  const existingCommentsRef = useRef(existingComments);
  existingCommentsRef.current = existingComments;

  const [commentWidgetDoms, setCommentWidgetDoms] = useState<Map<string, HTMLDivElement>>(new Map());
  const [inputWidgetDom, setInputWidgetDom] = useState<HTMLDivElement | null>(null);
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);

  const revertGutterCompartment = useRef(new Compartment());
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
  const collapseCompartmentA = useRef(new Compartment());
  const collapseCompartmentB = useRef(new Compartment());

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

  const redrawFlows = useCallback(() => {
    const svg = flowSvgRef.current;
    const a = editorARef.current;
    const b = editorBRef.current;
    if (!svg || !a || !b) return;
    updateStripHeights();
    drawFlowConnections(svg, a, b, chunksRef.current);
  }, [updateStripHeights]);

  const applyDiff = useCallback((docA: Text, docB: Text) => {
    const a = editorARef.current;
    const b = editorBRef.current;
    if (!a || !b) return;

    const rawChunks = Chunk.build(docA, docB);
    const chunks = trimChunkEdges(docA, docB, rawChunks);
    chunksRef.current = chunks;

    const resultA = buildDiffDecos(docA, chunks, 'a');
    const resultB = buildDiffDecos(docB, chunks, 'b');

    const lineHeight = a.defaultLineHeight;
    const spacers = computeSpacers(docA, docB, chunks, lineHeight);

    // Context collapsing — hide unchanged lines between hunks
    const collapseRangesA = computeCollapseRanges(docA, chunks, 'a');
    const collapseRangesB = computeCollapseRanges(docB, chunks, 'b');
    const collapseDcA = buildCollapseDecos(docA, collapseRangesA);
    const collapseDcB = buildCollapseDecos(docB, collapseRangesB);

    a.dispatch({
      effects: [
        diffDecoCompartmentA.current.reconfigure(EditorView.decorations.of(resultA.decos)),
        spacerCompartmentA.current.reconfigure(EditorView.decorations.of(spacers.a)),
        gutterClassCompartmentA.current.reconfigure(gutterLineClass.of(resultA.gutterMarkers)),
        collapseCompartmentA.current.reconfigure(EditorView.decorations.of(collapseDcA)),
      ],
    });
    b.dispatch({
      effects: [
        diffDecoCompartmentB.current.reconfigure(EditorView.decorations.of(resultB.decos)),
        spacerCompartmentB.current.reconfigure(EditorView.decorations.of(spacers.b)),
        gutterClassCompartmentB.current.reconfigure(gutterLineClass.of(resultB.gutterMarkers)),
        collapseCompartmentB.current.reconfigure(EditorView.decorations.of(collapseDcB)),
      ],
    });

    // Revert gutter
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
            ? gutter({ class: 'cm-revert-gutter', markers: () => RangeSet.of(revertMarkers.map(r => r.marker.range(r.from))) })
            : []
        ),
      ],
    });

    // Report stats — convert char offsets to line counts
    const addLines = chunks.reduce((sum, c) => {
      if (c.fromB === c.toB) return sum;
      return sum + (docB.lineAt(Math.min(c.toB - 1, docB.length)).number - docB.lineAt(c.fromB).number + 1);
    }, 0);
    const delLines = chunks.reduce((sum, c) => {
      if (c.fromA === c.toA) return sum;
      return sum + (docA.lineAt(Math.min(c.toA - 1, docA.length)).number - docA.lineAt(c.fromA).number + 1);
    }, 0);
    onStatsComputedRef.current?.({ additions: addLines, deletions: delLines, chunks });

    requestAnimationFrame(() => requestAnimationFrame(() => {
      redrawFlows();
    }));
  }, [redrawFlows]);

  // Create editors on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const leftPane = container.querySelector('[data-pane="left"]') as HTMLElement;
    const rightPane = container.querySelector('[data-pane="right"]') as HTMLElement;
    if (!leftPane || !rightPane) return;

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => { onSaveRef.current?.(); return true; },
    }]);

    const langExt = getLanguageExtension(filePath);

    const reviewGutter = gutter({
      class: 'cm-review-gutter',
      lineMarker: (view: EditorView, line: BlockInfo) => {
        if (!reviewModeRef.current) return null;
        const lineNum = view.state.doc.lineAt(line.from).number;
        const hasComment = existingCommentsRef.current?.some(c => c.lineNumber === lineNum);
        if (hasComment) return new ReviewGutterMarker();
        return null;
      },
      domEventHandlers: {
        click: (view: EditorView, line: BlockInfo) => {
          if (!reviewModeRef.current) return false;
          setActiveCommentLine(view.state.doc.lineAt(line.from).number);
          return true;
        },
      },
    });

    const hoverTracker = EditorView.domEventHandlers({
      click: (e: MouseEvent, view: EditorView) => {
        if (!reviewModeRef.current) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) return false;
        setActiveCommentLine(view.state.doc.lineAt(pos).number);
        return true;
      },
      mousemove: (e: MouseEvent, view: EditorView) => {
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
      mouseleave: (_e: MouseEvent, view: EditorView) => {
        if (hoveredLineRef.current !== null) {
          hoveredLineRef.current = null;
          view.dispatch({ effects: hoverDecoCompartment.current.reconfigure([]) });
        }
        return false;
      },
    });

    // Editor A (original, read-only) — with flat scroll theme
    const editorA = new EditorView({
      state: EditorState.create({
        doc: original,
        extensions: [
          ...baseExtensions({ readOnly: true }),
          diffTheme,
          flatScrollTheme,
          langExt,
          EditorState.readOnly.of(true),
          spacerCompartmentA.current.of([]),
          diffDecoCompartmentA.current.of([]),
          gutterClassCompartmentA.current.of([]),
          collapseCompartmentA.current.of([]),
        ],
      }),
      parent: leftPane,
    });
    editorARef.current = editorA;

    // Editor B (modified) — with flat scroll theme
    const editorB = new EditorView({
      state: EditorState.create({
        doc: modified,
        extensions: [
          ...baseExtensions({ readOnly: false }),
          diffTheme,
          flatScrollTheme,
          langExt,
          readOnlyCompartment.current.of(reviewMode ? EditorState.readOnly.of(true) : []),
          reviewCompartment.current.of([]),
          hoverDecoCompartment.current.of([]),
          spacerCompartmentB.current.of([]),
          diffDecoCompartmentB.current.of([]),
          gutterClassCompartmentB.current.of([]),
          collapseCompartmentB.current.of([]),
          revertGutterCompartment.current.of([]),
          reviewGutter,
          hoverTracker,
          saveKeymap,
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
              const a = editorARef.current;
              if (a) applyDiff(a.state.doc, update.state.doc);
            }
          }),
        ],
      }),
      parent: rightPane,
    });
    editorBRef.current = editorB;

    // Override scroller styles directly on DOM — theme !important can't be overridden via another theme
    const applyFlatScrollStyles = (editor: EditorView) => {
      const scroller = editor.scrollDOM;
      scroller.style.setProperty('overflow', 'visible', 'important');
      scroller.style.setProperty('position', 'relative', 'important');
      scroller.style.setProperty('inset', 'auto', 'important');
      scroller.style.setProperty('height', 'auto', 'important');
      editor.dom.style.setProperty('height', 'auto', 'important');
      editor.dom.style.setProperty('overflow', 'visible', 'important');
    };
    applyFlatScrollStyles(editorA);
    applyFlatScrollStyles(editorB);

    // NO scroll sync needed — both editors render at full height with spacers for alignment

    // Revert button hover
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

    // Initial diff
    applyDiff(editorA.state.doc, editorB.state.doc);

    // Redraw flows on outer scroll
    let flowRaf = 0;
    const scheduleFlowRedraw = () => {
      if (!flowRaf) flowRaf = requestAnimationFrame(() => { flowRaf = 0; redrawFlows(); });
    };
    const scrollEl = scrollContainerRef?.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', scheduleFlowRedraw, { passive: true });
    }

    // On resize, recalculate
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
      cancelAnimationFrame(flowRaf);
      ro.disconnect();
      if (scrollEl) scrollEl.removeEventListener('scroll', scheduleFlowRedraw);
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
    if (changed) applyDiff(a.state.doc, b.state.doc);
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
      b.dom.querySelectorAll<HTMLDivElement>('[data-comment-widget-id]').forEach((el: HTMLDivElement) => {
        newCommentDoms.set(el.dataset.commentWidgetId!, el);
      });
      setCommentWidgetDoms(newCommentDoms);
      const inputEl = b.dom.querySelector<HTMLDivElement>('[data-input-widget-key]');
      setInputWidgetDom(inputEl);
      redrawFlows();
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
    b.dispatch({ changes: { from: chunk.fromB, to: Math.min(chunk.toB, b.state.doc.length), insert: originalText } });
    applyDiff(a.state.doc, b.state.doc);
    onChangeRef.current?.(b.state.doc.toString());
  }, [applyDiff]);
  handleRejectChunkRef.current = handleRejectChunk;

  return (
    <div ref={containerRef} style={{ display: 'flex', width: '100%' }}>
      <div data-pane="left" style={{ flex: 1, minWidth: 0, overflowX: 'hidden', overflowY: 'visible' }} />

      {/* Thin divider — no SVG flow connections in flat scroll mode */}
      <div
        ref={dividerRef}
        style={{ width: 1, flexShrink: 0, background: 'var(--edge)' }}
      />
      {/* Hidden SVG for compatibility — drawFlowConnections still called but invisible */}
      <svg ref={flowSvgRef} style={{ display: 'none' }} />

      <div data-pane="right" style={{ flex: 1, minWidth: 0, overflowX: 'hidden', overflowY: 'visible' }} />

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
