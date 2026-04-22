import { useRef, useEffect } from 'react';
import { EditorView, WidgetType, GutterMarker } from '@codemirror/view';
import type { ExistingComment } from './types';

function createResizingWidget(view: EditorView, cssText: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = cssText;
  const ro = new ResizeObserver(() => { view.requestMeasure(); });
  ro.observe(wrap);
  const mo = new MutationObserver((_, observer) => {
    if (!wrap.isConnected) { ro.disconnect(); observer.disconnect(); }
  });
  mo.observe(wrap.ownerDocument.body, { childList: true, subtree: true });
  return wrap;
}

// Shared card class for comment panels
const cardClass = 'bg-surface-low border-[0.5px] border-edge-active rounded-[10px] shadow-[0_2px_8px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.1)] font-sans';

// Kbd badge class matching the app's keyboard shortcut style
const kbdClass = 'px-1.5 py-[5px] rounded-[4px] text-[10px] font-medium font-[inherit] bg-elevated border border-edge-active text-fg-secondary shadow-[0_1px_0_var(--border)] leading-none';

// Inline comment displayed via React portal
export function InlineComment({ comment, onDelete }: { comment: ExistingComment; onDelete: (id: string) => void }) {
  return (
    <div className={`group flex flex-col h-full m-1 ${cardClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b-[0.5px] border-edge">
        <div className="flex items-center gap-1.5">
          <div className="w-[18px] h-[18px] rounded-full shrink-0 bg-[linear-gradient(135deg,var(--status-cyan),var(--status-green),var(--accent),var(--status-amber))]" />
          <span className="text-[11px] font-semibold text-fg">You</span>
          <span className="text-[10px] text-fg-tertiary">on line {comment.lineNumber}</span>
        </div>
        <button
          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-fg-tertiary transition-[opacity,color] duration-150 hover:text-status-red hover:bg-status-red/10 active:scale-[0.96]"
          onClick={() => onDelete(comment.id)}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      {/* Body */}
      <div className="px-2.5 py-2 text-xs font-medium leading-normal text-fg-secondary">
        {comment.text}
      </div>
    </div>
  );
}

// Comment input form rendered via React portal
export function CommentInput({
  defaultValue,
  isUpdate,
  onSubmit,
  onCancel,
}: {
  defaultValue: string;
  isUpdate: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const textRef = useRef(defaultValue);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => taRef.current?.focus());
  }, []);

  const handleSubmit = () => {
    const val = textRef.current.trim();
    if (val) onSubmit(val);
  };

  return (
    <div className={`flex flex-col ${cardClass}`}>
      <textarea
        ref={taRef}
        defaultValue={defaultValue}
        placeholder="Add a review comment..."
        onChange={(e) => { textRef.current = e.target.value; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="w-full min-h-14 max-h-[200px] px-3 py-2.5 bg-transparent text-fg text-xs leading-relaxed border-none outline-none! resize-none font-[inherit] field-sizing-content focus:outline-none! focus:ring-0 focus:border-none"
      />
      <div className="flex items-center justify-between px-2 py-1.5 border-t-[0.5px] border-edge rounded-b-[8px] bg-surface gap-3">
        <span className="text-[11px] text-fg-secondary flex items-center gap-1.5">
          <kbd className={kbdClass}>↵</kbd>
          <span>submit</span>
          <span className="opacity-20">·</span>
          <kbd className={kbdClass}>Esc</kbd>
          <span>cancel</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-2.5 py-1 text-[11px] font-medium text-fg-tertiary rounded-[5px] cursor-pointer border-none bg-transparent font-[inherit] transition-[color,background-color] hover:text-fg hover:bg-hover active:scale-[0.96]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1 text-[11px] font-semibold text-base bg-accent rounded-[5px] cursor-pointer border-none font-[inherit] transition-[transform,filter] hover:brightness-110 active:scale-[0.96]"
          >
            {isUpdate ? 'Update' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Review mode gutter marker ---

export class ReviewGutterMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.style.cssText = 'width: 3px; height: 100%; border-radius: 2px; background: var(--accent);';
    return el;
  }
}

// --- Comment block widget ---

export class CommentBlockWidget extends WidgetType {
  dom: HTMLDivElement | null = null;
  constructor(readonly id: string) { super(); }
  toDOM(view: EditorView) {
    const wrap = createResizingWidget(view, 'width: 100%; padding: 6px 12px 8px 0;');
    wrap.dataset.commentWidgetId = this.id;
    this.dom = wrap;
    return wrap;
  }
  eq(other: CommentBlockWidget) { return this.id === other.id; }
  get estimatedHeight() { return 72; }
}

export class InputBlockWidget extends WidgetType {
  dom: HTMLDivElement | null = null;
  constructor(readonly lineKey: string) { super(); }
  toDOM(view: EditorView) {
    const wrap = createResizingWidget(view, 'width: 100%; padding: 6px 12px 8px 0;');
    wrap.dataset.inputWidgetKey = this.lineKey;
    this.dom = wrap;
    return wrap;
  }
  eq(other: InputBlockWidget) { return this.lineKey === other.lineKey; }
  get estimatedHeight() { return 100; }
}
