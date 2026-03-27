// CodeEditor
export { CodeEditor, CodeDiffEditor } from './components/CodeEditor/CodeEditor';
export { SplitDiffEditorInner } from './components/CodeEditor/SplitDiffEditor';
export { InlineComment, CommentInput, ReviewGutterMarker, CommentBlockWidget, InputBlockWidget } from './components/CodeEditor/reviewComponents';
export { orcheTheme, orcheSyntaxHighlighting, reviewCursorTheme, diffTheme } from './components/CodeEditor/themes';
export { baseExtensions } from './components/CodeEditor/baseExtensions';
export { getLanguageExtension } from './components/CodeEditor/languageExtension';
export { buildDiffDecos, computeSpacers, computeSpacersFromDOM, trimChunkEdges, buildLineChunks, drawFlowConnections, createResizingWidget, RevertGutterMarker, SpacerWidget, DiffGutterMarker, updateScrollbarMarkers } from './components/CodeEditor/diffUtils';
export type { CodeDiffEditorProps, CodeEditorProps, DiffMode, ExistingComment } from './components/CodeEditor/types';

// UI
export { ButtonPill } from './components/ui/button-pill';

// Store
export { useReviewStore } from './store/reviewStore';
export type { ReviewComment } from './store/reviewStore';

// Theme
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
export { palettes, obsidian, porcelain, sandstone, arctic, defaultPalette } from './theme/palette';
export type { Palette, PaletteName } from './theme/palette';
