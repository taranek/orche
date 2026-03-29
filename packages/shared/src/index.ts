// CodeEditor
export { InlineComment, CommentInput, ReviewGutterMarker, CommentBlockWidget, InputBlockWidget } from './components/CodeEditor/reviewComponents';
export { orcheTheme, orcheSyntaxHighlighting, reviewCursorTheme, diffTheme } from './components/CodeEditor/themes';
export { baseExtensions } from './components/CodeEditor/baseExtensions';
export { getLanguageExtension } from './components/CodeEditor/languageExtension';
export { createResizingWidget } from './components/CodeEditor/diffUtils';
export type { ExistingComment } from './components/CodeEditor/types';

// UI
export { ButtonPill } from './components/ui/button-pill';

// Store
export { useReviewStore } from './store/reviewStore';
export type { ReviewComment } from './store/reviewStore';

// Theme
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
export { palettes, obsidian, porcelain, sandstone, arctic, defaultPalette } from './theme/palette';
export type { Palette, PaletteName } from './theme/palette';
