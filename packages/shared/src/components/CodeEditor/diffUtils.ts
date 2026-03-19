import { EditorView, Decoration, type DecorationSet, WidgetType, GutterMarker } from '@codemirror/view';
import { Text, RangeSetBuilder, RangeSet } from '@codemirror/state';
import { Chunk } from '@codemirror/merge';

// --- Spacer widget for alignment ---

export class SpacerWidget extends WidgetType {
  constructor(readonly height: number, readonly className?: string) { super(); }
  toDOM() {
    const el = document.createElement('div');
    el.style.height = `${this.height}px`;
    if (this.className) el.className = this.className;
    return el;
  }
  eq(other: SpacerWidget) { return this.height === other.height && this.className === other.className; }
  get estimatedHeight() { return this.height; }
}

// --- Diff highlight decorations ---

export const deletedTextDeco = Decoration.mark({ class: 'cm-diff-deleted-text' });
export const insertedTextDeco = Decoration.mark({ class: 'cm-diff-inserted-text' });

// Gutter markers that just add a CSS class to the gutter row
export class DiffGutterMarker extends GutterMarker {
  constructor(readonly cls: string) { super(); }
  eq(other: DiffGutterMarker) { return this.cls === other.cls; }
  elementClass = this.cls;
}
export const deletedGutterMarker = new DiffGutterMarker('cm-gutter-diff-deleted');
export const insertedGutterMarker = new DiffGutterMarker('cm-gutter-diff-inserted');
export const insertionPointGutterMarker = new DiffGutterMarker('cm-gutter-diff-insertion-point');
export const deletionPointGutterMarker = new DiffGutterMarker('cm-gutter-diff-deletion-point');

// Build line + inline change decorations + gutter line classes for one side of the diff
export function buildDiffDecos(
  doc: Text,
  chunks: readonly InstanceType<typeof Chunk>[],
  side: 'a' | 'b'
): { decos: DecorationSet; gutterMarkers: RangeSet<GutterMarker> } {
  const textDeco = side === 'a' ? deletedTextDeco : insertedTextDeco;

  const ranges: Array<{ from: number; to: number; deco: Decoration }> = [];
  const gutterRanges: Array<{ from: number; marker: GutterMarker }> = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const chunkCls = `cm-chunk-${ci}`;
    const from = side === 'a' ? chunk.fromA : chunk.fromB;
    const to = side === 'a' ? chunk.toA : chunk.toB;
    if (from === to) {
      if (side === 'a' && chunk.fromB !== chunk.toB) {
        const line = doc.lineAt(Math.min(from, doc.length));
        ranges.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-diff-insertion-point ${chunkCls}` }) });
        gutterRanges.push({ from: line.from, marker: insertionPointGutterMarker });
      }
      if (side === 'b' && chunk.fromA !== chunk.toA) {
        const line = doc.lineAt(Math.min(from, doc.length));
        ranges.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-diff-deletion-point ${chunkCls}` }) });
        gutterRanges.push({ from: line.from, marker: deletionPointGutterMarker });
      }
      continue;
    }

    const startLine = doc.lineAt(from);
    const endPos = Math.min(to - 1, doc.length);
    const endLine = doc.lineAt(Math.max(endPos, 0));
    const baseClass = side === 'a' ? 'cm-diff-deleted' : 'cm-diff-inserted';
    const firstClass = side === 'a' ? 'cm-diff-deleted-first' : 'cm-diff-inserted-first';
    const lastClass = side === 'a' ? 'cm-diff-deleted-last' : 'cm-diff-inserted-last';
    const gutterMk = side === 'a' ? deletedGutterMarker : insertedGutterMarker;
    for (let ln = startLine.number; ln <= endLine.number; ln++) {
      const line = doc.line(ln);
      const isFirst = ln === startLine.number;
      const isLast = ln === endLine.number;
      let cls = baseClass;
      if (isFirst && isLast) cls += ` ${firstClass} ${lastClass}`;
      else if (isFirst) cls += ` ${firstClass}`;
      else if (isLast) cls += ` ${lastClass}`;
      ranges.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `${cls} ${chunkCls}` }) });
      gutterRanges.push({ from: line.from, marker: gutterMk });
    }

    for (const change of chunk.changes) {
      const cFrom = side === 'a' ? change.fromA : change.fromB;
      const cTo = side === 'a' ? change.toA : change.toB;
      if (cFrom === cTo) continue;
      const absFrom = from + cFrom;
      const absTo = from + cTo;
      if (absFrom < absTo && absTo <= doc.length) {
        ranges.push({ from: absFrom, to: absTo, deco: textDeco });
      }
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  gutterRanges.sort((a, b) => a.from - b.from);

  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) {
    builder.add(r.from, r.to, r.deco);
  }

  const gutterBuilder = new RangeSetBuilder<GutterMarker>();
  for (const r of gutterRanges) {
    gutterBuilder.add(r.from, r.from, r.marker);
  }

  return { decos: builder.finish(), gutterMarkers: gutterBuilder.finish() };
}

// Spacer computation with access to both docs
export function computeSpacers(
  docA: Text,
  docB: Text,
  chunks: readonly InstanceType<typeof Chunk>[],
  lineHeight: number
): { a: DecorationSet; b: DecorationSet } {
  const spacersA: Array<{ pos: number; height: number; className?: string }> = [];
  const spacersB: Array<{ pos: number; height: number; className?: string }> = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const aEmpty = chunk.fromA === chunk.toA;
    const bEmpty = chunk.fromB === chunk.toB;

    let linesA = 0, linesB = 0;
    if (!aEmpty) {
      const s = docA.lineAt(chunk.fromA);
      const e = docA.lineAt(Math.min(chunk.toA - 1, docA.length));
      linesA = e.number - s.number + 1;
    }
    if (!bEmpty) {
      const s = docB.lineAt(chunk.fromB);
      const e = docB.lineAt(Math.min(chunk.toB - 1, docB.length));
      linesB = e.number - s.number + 1;
    }

    const diff = linesA - linesB;
    if (diff > 0) {
      // Place spacer after the last line of the B chunk
      const pos = bEmpty
        ? Math.min(chunk.fromB, docB.length)
        : docB.lineAt(Math.min(chunk.toB > 0 ? chunk.toB - 1 : 0, docB.length)).to;
      spacersB.push({ pos, height: diff * lineHeight });
    } else if (diff < 0) {
      const pos = aEmpty
        ? Math.min(chunk.fromA, docA.length)
        : docA.lineAt(Math.min(chunk.toA > 0 ? chunk.toA - 1 : 0, docA.length)).to;
      spacersA.push({ pos, height: -diff * lineHeight });
    }
  }

  const buildSet = (items: Array<{ pos: number; height: number; className?: string }>): DecorationSet => {
    if (!items.length) return Decoration.none;
    items.sort((a, b) => a.pos - b.pos);
    return Decoration.set(
      items.map(s =>
        Decoration.widget({
          widget: new SpacerWidget(s.height, s.className),
          block: true,
          side: 1,
        }).range(s.pos)
      )
    );
  };

  return { a: buildSet(spacersA), b: buildSet(spacersB) };
}

// Trim identical leading/trailing lines from chunks for cleaner line-level diffs
export function trimChunkEdges(
  docA: Text,
  docB: Text,
  chunks: readonly InstanceType<typeof Chunk>[]
): readonly InstanceType<typeof Chunk>[] {
  return chunks.map(chunk => {
    let { fromA, toA, fromB, toB } = chunk;
    // Trim matching leading lines
    while (fromA < toA && fromB < toB) {
      const lineA = docA.lineAt(fromA);
      const lineB = docB.lineAt(fromB);
      if (lineA.text !== lineB.text) break;
      fromA = lineA.to + 1;
      fromB = lineB.to + 1;
    }
    // Trim matching trailing lines
    while (fromA < toA && fromB < toB) {
      const lineA = docA.lineAt(Math.min(toA - 1, docA.length));
      const lineB = docB.lineAt(Math.min(toB - 1, docB.length));
      if (lineA.text !== lineB.text) break;
      toA = lineA.from;
      toB = lineB.from;
    }
    if (fromA === chunk.fromA && toA === chunk.toA) return chunk;
    // Rebuild with trimmed bounds — reuse Chunk.build on the sub-range
    return Object.assign(Object.create(Object.getPrototypeOf(chunk)), {
      ...chunk,
      fromA, toA, fromB, toB,
      // Recalculate changes within trimmed range
      changes: chunk.changes.filter((c: { fromA: number; toA: number; fromB: number; toB: number }) => {
        const absFromA = chunk.fromA + c.fromA;
        const absToA = chunk.fromA + c.toA;
        return absFromA >= fromA && absToA <= toA;
      }),
    });
  }).filter(c => c.fromA !== c.toA || c.fromB !== c.toB);
}

// --- Flow connections between matching chunks (Sankey-style) ---

export function drawFlowConnections(
  svg: SVGSVGElement,
  editorA: EditorView,
  editorB: EditorView,
  chunks: readonly InstanceType<typeof Chunk>[]
) {
  svg.innerHTML = '';
  if (!chunks.length) return;

  // Read theme diff colors
  const cs = getComputedStyle(document.documentElement);
  const insertedBg = cs.getPropertyValue('--diff-inserted-bg').trim();
  const insertedBorder = cs.getPropertyValue('--diff-inserted-border').trim();
  const deletedBg = cs.getPropertyValue('--diff-deleted-bg').trim();
  const deletedBorder = cs.getPropertyValue('--diff-deleted-border').trim();

  const svgRect = svg.getBoundingClientRect();
  // Curve endpoints: right edge of A content -> left edge of B content (through gutters)
  const aRight = editorA.contentDOM.getBoundingClientRect().right - svgRect.left;
  const bLeft = editorB.contentDOM.getBoundingClientRect().left - svgRect.left;

  const getBounds = (els: NodeListOf<Element>) => {
    let top = Infinity, bottom = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    return { top, bottom };
  };

  for (let ci = 0; ci < chunks.length; ci++) {
    const selector = `.cm-chunk-${ci}`;
    const aEls = editorA.dom.querySelectorAll(selector);
    const bEls = editorB.dom.querySelectorAll(selector);

    if (aEls.length === 0 && bEls.length === 0) continue;

    const chunk = chunks[ci];
    const addOnly = chunk.fromA === chunk.toA;
    const delOnly = chunk.fromB === chunk.toB;

    let yA1: number, yA2: number, yB1: number, yB2: number;

    if (aEls.length > 0) {
      const bounds = getBounds(aEls);
      yA1 = bounds.top - svgRect.top;
      yA2 = bounds.bottom - svgRect.top;
    } else {
      const scrollerRect = editorA.scrollDOM.getBoundingClientRect();
      const block = editorA.lineBlockAt(Math.min(chunk.fromA, editorA.state.doc.length));
      const scrollTop = editorA.scrollDOM.scrollTop;
      const mid = block.top - scrollTop + scrollerRect.top + block.height / 2 - svgRect.top;
      yA1 = yA2 = mid;
    }

    if (bEls.length > 0) {
      const bounds = getBounds(bEls);
      yB1 = bounds.top - svgRect.top;
      yB2 = bounds.bottom - svgRect.top;
    } else {
      const scrollerRect = editorB.scrollDOM.getBoundingClientRect();
      const block = editorB.lineBlockAt(Math.min(chunk.fromB, editorB.state.doc.length));
      const scrollTop = editorB.scrollDOM.scrollTop;
      const mid = block.top - scrollTop + scrollerRect.top + block.height / 2 - svgRect.top;
      yB1 = yB2 = mid;
    }

    // Cull off-screen
    if (yA2 < -20 && yB2 < -20) continue;
    if (yA1 > svgRect.height + 20 && yB1 > svgRect.height + 20) continue;

    const isModify = !addOnly && !delOnly;
    const x0 = aRight;
    const x1 = bLeft;
    const span = x1 - x0;
    const cx = span * 0.4;

    // Filled bezier shape (inset by 0.5px so strokes align with box-shadow borders)
    const t = yA1 + 0.5, b2 = yA2 - 0.5, tB = yB1 + 0.5, bB = yB2 - 0.5;
    const d = `M ${x0},${t} C ${x0 + cx},${t} ${x1 - cx},${tB} ${x1},${tB} L ${x1},${bB} C ${x1 - cx},${bB} ${x0 + cx},${b2} ${x0},${b2} Z`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);

    if (isModify) {
      // Horizontal gradient: deleted -> inserted for modify chunks
      const gradId = `grad-${ci}`;
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.setAttribute('id', gradId);
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', String(x0)); grad.setAttribute('y1', '0');
      grad.setAttribute('x2', String(x1)); grad.setAttribute('y2', '0');
      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', deletedBg);
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', insertedBg);
      grad.appendChild(stop1); grad.appendChild(stop2);
      let defs = svg.querySelector('defs');
      if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.prepend(defs); }
      defs.appendChild(grad);
      path.setAttribute('fill', `url(#${gradId})`);
    } else {
      path.setAttribute('fill', addOnly ? insertedBg : deletedBg);
    }
    svg.appendChild(path);

    // Top & bottom border strokes (inset to match inset box-shadow on diff lines)
    for (const [ly, ry] of [[yA1 + 0.5, yB1 + 0.5], [yA2 - 0.5, yB2 - 0.5]] as [number, number][]) {
      if (isModify) {
        const strokeGradId = `sg-${ci}-${ly === yA1 + 0.5 ? 't' : 'b'}`;
        const sg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        sg.setAttribute('id', strokeGradId);
        sg.setAttribute('gradientUnits', 'userSpaceOnUse');
        sg.setAttribute('x1', String(x0)); sg.setAttribute('y1', '0');
        sg.setAttribute('x2', String(x1)); sg.setAttribute('y2', '0');
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', deletedBorder);
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', insertedBorder);
        sg.appendChild(s1); sg.appendChild(s2);
        let defs = svg.querySelector('defs');
        if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.prepend(defs); }
        defs.appendChild(sg);
        const stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        stroke.setAttribute('d', `M ${x0},${ly} C ${x0 + cx},${ly} ${x1 - cx},${ry} ${x1},${ry}`);
        stroke.setAttribute('fill', 'none');
        stroke.setAttribute('stroke', `url(#${strokeGradId})`);
        stroke.setAttribute('stroke-width', '1');
        svg.appendChild(stroke);
      } else {
        const stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        stroke.setAttribute('d', `M ${x0},${ly} C ${x0 + cx},${ly} ${x1 - cx},${ry} ${x1},${ry}`);
        stroke.setAttribute('fill', 'none');
        stroke.setAttribute('stroke', addOnly ? insertedBorder : deletedBorder);
        stroke.setAttribute('stroke-width', '1');
        svg.appendChild(stroke);
      }
    }
  }
}

// Helper: create a widget wrapper with ResizeObserver that cleans up on removal
export function createResizingWidget(view: EditorView, cssText: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = cssText;
  const ro = new ResizeObserver(() => { view.requestMeasure(); });
  ro.observe(wrap);
  // Disconnect when element is removed from DOM
  const mo = new MutationObserver((_, observer) => {
    if (!wrap.isConnected) { ro.disconnect(); observer.disconnect(); }
  });
  mo.observe(wrap.ownerDocument.body, { childList: true, subtree: true });
  return wrap;
}

// --- Revert gutter marker (shown on editor B at first line of each chunk) ---

export type ChunkType = 'add' | 'delete' | 'modify';

// --- Scrollbar change annotations ---

const SCROLLBAR_MARKER_CLASS = 'cm-scrollbar-change-marker';

const SCROLLBAR_OVERLAY_CLASS = 'cm-scrollbar-overlay';

export function updateScrollbarMarkers(
  editor: EditorView,
  chunks: readonly InstanceType<typeof Chunk>[],
  side: 'a' | 'b'
) {
  // Find or create the non-scrolling overlay container on editor.dom
  let overlay = editor.dom.querySelector(`.${SCROLLBAR_OVERLAY_CLASS}`) as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = SCROLLBAR_OVERLAY_CLASS;
    overlay.style.cssText = 'position:absolute;top:0;right:0;bottom:0;width:6px;z-index:10;pointer-events:none;';
    editor.dom.appendChild(overlay);
  }

  // Clear old markers
  overlay.innerHTML = '';

  const doc = editor.state.doc;
  if (doc.length === 0 || chunks.length === 0) return;

  const scrollHeight = editor.scrollDOM.scrollHeight;
  const clientHeight = editor.scrollDOM.clientHeight;
  if (scrollHeight <= clientHeight) return; // everything fits, no scrollbar needed

  // Viewport position indicator
  const scrollTop = editor.scrollDOM.scrollTop;
  const vpTopPx = (scrollTop / scrollHeight) * clientHeight;
  const vpHeightPx = (clientHeight / scrollHeight) * clientHeight;
  const viewport = document.createElement('div');
  viewport.className = 'cm-scrollbar-viewport';
  viewport.style.cssText = `position:absolute;right:0;width:6px;top:${vpTopPx}px;height:${vpHeightPx}px;pointer-events:none;border-radius:3px;background:var(--text-primary);opacity:0.08;`;
  overlay.appendChild(viewport);

  // Update viewport position on scroll
  const onScroll = () => {
    const st = editor.scrollDOM.scrollTop;
    const sh = editor.scrollDOM.scrollHeight;
    const ch = editor.scrollDOM.clientHeight;
    viewport.style.top = `${(st / sh) * ch}px`;
    viewport.style.height = `${(ch / sh) * ch}px`;
  };
  // Store cleanup ref on the overlay element
  const prevCleanup = (overlay as any).__scrollCleanup;
  if (prevCleanup) editor.scrollDOM.removeEventListener('scroll', prevCleanup);
  editor.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
  (overlay as any).__scrollCleanup = onScroll;

  // Map each chunk's pixel position in the full document to a position in the overlay.
  for (const chunk of chunks) {
    const from = side === 'a' ? chunk.fromA : chunk.fromB;
    const to = side === 'a' ? chunk.toA : chunk.toB;
    const thisEmpty = from === to;

    const marker = document.createElement('div');
    marker.className = SCROLLBAR_MARKER_CLASS;

    if (thisEmpty) {
      const block = editor.lineBlockAt(Math.min(from, doc.length));
      const topPx = (block.top / scrollHeight) * clientHeight;
      marker.style.cssText = `position:absolute;right:0;width:6px;height:2px;top:${topPx}px;pointer-events:none;border-radius:1px;background:var(--diff-deleted-border);`;
    } else {
      const startBlock = editor.lineBlockAt(from);
      const endBlock = editor.lineBlockAt(Math.min(to - 1, doc.length));
      const topPx = (startBlock.top / scrollHeight) * clientHeight;
      const bottomPx = ((endBlock.top + endBlock.height) / scrollHeight) * clientHeight;
      const heightPx = Math.max(2, bottomPx - topPx);
      marker.style.cssText = `position:absolute;right:0;width:6px;height:${heightPx}px;top:${topPx}px;pointer-events:none;border-radius:1px;background:var(--diff-inserted-border);`;
    }

    overlay.appendChild(marker);
  }
}

// --- Revert gutter marker (shown on editor B at first line of each chunk) ---

export class RevertGutterMarker extends GutterMarker {
  constructor(readonly chunkIndex: number, readonly heightPx: number, readonly chunkType: ChunkType) { super(); }
  eq(other: RevertGutterMarker) { return this.chunkIndex === other.chunkIndex && this.heightPx === other.heightPx && this.chunkType === other.chunkType; }
  toDOM() {
    const el = document.createElement('div');
    el.className = `cm-revert-strip cm-revert-strip-${this.chunkType}`;
    el.dataset.chunk = String(this.chunkIndex);
    // Height set to 0 initially; updateStripHeights sets the real value after layout
    // Inner button
    el.innerHTML = `<div class="cm-revert-button" data-chunk="${this.chunkIndex}" title="Revert to original"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></div>`;
    return el;
  }
}
