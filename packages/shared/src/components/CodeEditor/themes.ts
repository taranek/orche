import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const orcheTheme = EditorView.theme({
  '&': {
    position: 'relative',
    fontSize: '12px',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-primary)',
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: 'var(--text-primary)',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    lineHeight: '1.5',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--text-primary)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--accent-dim) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-surface)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-tertiary)',
    border: 'none',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontWeight: '600',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
    minWidth: '40px',
  },
  '.cm-foldGutter': {
    display: 'none !important',
  },
  '.cm-scroller': {
    overflow: 'auto !important',
    position: 'absolute !important' as string,
    inset: '0',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  // Diff highlighting
  '.cm-changedLine': {
    backgroundColor: 'var(--diff-changed-bg, rgba(var(--status-green-rgb, 34, 197, 94), 0.05))',
  },
  '.cm-changedText': {
    backgroundColor: 'var(--diff-changed-text-bg, rgba(var(--status-green-rgb, 34, 197, 94), 0.1))',
  },
  '.cm-deletedChunk': {
    backgroundColor: 'var(--diff-deleted-bg, rgba(var(--status-red-rgb, 239, 68, 68), 0.05))',
  },
  // Review mode styles
  '.cm-review-line-highlight': {
    backgroundColor: 'var(--accent-dim) !important',
  },
  '.cm-review-commented-line': {
    backgroundColor: 'var(--accent-dim) !important',
  },
});

export const reviewCursorTheme = EditorView.theme({ '.cm-content': { cursor: 'pointer' } });

// Syntax highlighting using CSS variables — adapts to any palette
const orcheHighlightStyle = HighlightStyle.define([
  { tag: t.keyword,                  color: 'var(--syntax-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: 'var(--syntax-name)' },
  { tag: [t.propertyName],           color: 'var(--syntax-property)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--syntax-function)' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--syntax-constant)' },
  { tag: [t.definition(t.name), t.separator], color: 'var(--text-primary)' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: 'var(--syntax-type)' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: 'var(--syntax-operator)' },
  { tag: [t.meta, t.comment],        color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: t.strong,                    fontWeight: 'bold' },
  { tag: t.emphasis,                  fontStyle: 'italic' },
  { tag: t.strikethrough,             textDecoration: 'line-through' },
  { tag: t.link,                      color: 'var(--syntax-operator)', textDecoration: 'underline' },
  { tag: t.heading,                   fontWeight: 'bold', color: 'var(--syntax-name)' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: 'var(--syntax-constant)' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: 'var(--syntax-string)' },
  { tag: t.invalid,                   color: 'var(--status-red)' },
]);

export const orcheSyntaxHighlighting = syntaxHighlighting(orcheHighlightStyle);

export const diffTheme = EditorView.theme({
  '.cm-diff-deleted': {
    backgroundColor: 'var(--diff-deleted-bg)',
  },
  '.cm-diff-inserted': {
    backgroundColor: 'var(--diff-inserted-bg)',
  },
  '.cm-diff-deleted-first': {
    boxShadow: 'inset 0 1px 0 var(--diff-deleted-border)',
  },
  '.cm-diff-deleted-last': {
    boxShadow: 'inset 0 -1px 0 var(--diff-deleted-border)',
  },
  '.cm-diff-deleted-first.cm-diff-deleted-last': {
    boxShadow: 'inset 0 1px 0 var(--diff-deleted-border), inset 0 -1px 0 var(--diff-deleted-border)',
  },
  '.cm-diff-inserted-first': {
    boxShadow: 'inset 0 1px 0 var(--diff-inserted-border)',
  },
  '.cm-diff-inserted-last': {
    boxShadow: 'inset 0 -1px 0 var(--diff-inserted-border)',
  },
  '.cm-diff-inserted-first.cm-diff-inserted-last': {
    boxShadow: 'inset 0 1px 0 var(--diff-inserted-border), inset 0 -1px 0 var(--diff-inserted-border)',
  },
  '.cm-diff-insertion-point': {
    backgroundColor: 'var(--diff-inserted-bg)',
    boxShadow: 'inset 0 1px 0 var(--diff-inserted-border), inset 0 -1px 0 var(--diff-inserted-border)',
  },
  '.cm-diff-deletion-point': {
    backgroundColor: 'var(--diff-deleted-bg)',
    boxShadow: 'inset 0 1px 0 var(--diff-deleted-border), inset 0 -1px 0 var(--diff-deleted-border)',
  },
  '.cm-diff-deleted-text': {
    backgroundColor: 'var(--diff-deleted-text)',
  },
  '.cm-diff-inserted-text': {
    backgroundColor: 'var(--diff-inserted-text)',
  },
  // Gutter row backgrounds for diff lines
  '.cm-gutter-diff-deleted': {
    backgroundColor: 'var(--diff-deleted-bg)',
  },
  '.cm-gutter-diff-inserted': {
    backgroundColor: 'var(--diff-inserted-bg)',
  },
  '.cm-gutter-diff-insertion-point': {
    backgroundColor: 'var(--diff-inserted-bg)',
  },
  '.cm-gutter-diff-deletion-point': {
    backgroundColor: 'var(--diff-deleted-bg)',
  },
  '.cm-revert-gutter': {
    width: '24px',
    cursor: 'pointer',
    position: 'relative',
    zIndex: 20,
  },
  '.cm-revert-gutter .cm-gutterElement': {
    padding: '0',
    overflow: 'visible',
    position: 'relative',
  },
  '.cm-revert-strip': {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    visibility: 'hidden',
    pointerEvents: 'auto',
    zIndex: 30,
  },
  '.cm-revert-strip-add': {},
  '.cm-revert-strip-delete': {},
  '.cm-revert-strip-modify': {},
  '.cm-revert-button': {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 0.15s, color 0.15s, background-color 0.15s, border-color 0.15s',
    '&:hover': {
      opacity: '1',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-hover)',
      borderColor: 'var(--border-active)',
    },
  },
  '.cm-collapsedLines': {
    padding: '4px 0',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    letterSpacing: '0.02em',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    textAlign: 'center',
    background: 'linear-gradient(to bottom, transparent, var(--bg-surface) 35%, var(--bg-surface) 65%, transparent)',
    '&:hover': {
      color: 'var(--text-primary)',
    },
  },
});
