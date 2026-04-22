import { createContext, useContext, useEffect, useMemo } from 'react';
import { type Palette, type PaletteName, palettes } from './palette';

interface ThemeContextValue {
  palette: Palette;
  paletteName: PaletteName;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyPalette(p: Palette) {
  const s = document.documentElement.style;

  // Background tokens
  s.setProperty('--bg-sidebar', p.bg.sidebar);
  s.setProperty('--bg-base', p.bg.base);
  s.setProperty('--bg-surface-low', p.bg.surfaceLow);
  s.setProperty('--bg-surface', p.bg.surface);
  s.setProperty('--bg-elevated', p.bg.elevated);
  s.setProperty('--bg-hover', p.bg.hover);

  // Text tokens
  s.setProperty('--text-primary', p.text.primary);
  s.setProperty('--text-secondary', p.text.secondary);
  s.setProperty('--text-tertiary', p.text.tertiary);

  // Border tokens
  s.setProperty('--border', p.border.default);
  s.setProperty('--border-active', p.border.active);
  s.setProperty('--app-border', p.border.app);

  // Accent tokens (consumed by @theme via var())
  s.setProperty('--accent', p.accent.base);
  s.setProperty('--accent-dim', p.accent.dim);

  // Status tokens (consumed by @theme via var())
  s.setProperty('--status-green', p.status.green);
  s.setProperty('--status-red', p.status.red);
  s.setProperty('--status-cyan', p.status.cyan);
  s.setProperty('--status-amber', p.status.amber);

  // Syntax tokens
  s.setProperty('--syntax-keyword', p.syntax.keyword);
  s.setProperty('--syntax-name', p.syntax.name);
  s.setProperty('--syntax-property', p.syntax.property);
  s.setProperty('--syntax-function', p.syntax.function);
  s.setProperty('--syntax-constant', p.syntax.constant);
  s.setProperty('--syntax-type', p.syntax.type);
  s.setProperty('--syntax-operator', p.syntax.operator);
  s.setProperty('--syntax-string', p.syntax.string);
  s.setProperty('--syntax-comment', p.syntax.comment);

  // Diff tokens
  s.setProperty('--diff-inserted-bg', p.diff.insertedBg);
  s.setProperty('--diff-inserted-border', p.diff.insertedBorder);
  s.setProperty('--diff-inserted-text', p.diff.insertedText);
  s.setProperty('--diff-deleted-bg', p.diff.deletedBg);
  s.setProperty('--diff-deleted-border', p.diff.deletedBorder);
  s.setProperty('--diff-deleted-text', p.diff.deletedText);

  // Mode-aware tokens
  const isLight = p.mode === 'light';
  s.setProperty('--scrollbar-thumb', isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.08)');
  s.setProperty('--scrollbar-thumb-hover', isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.14)');
  s.setProperty('--topbar-border', isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)');

  // Vibrancy tokens — per-theme tint and text color over native vibrancy
  s.setProperty('--vibrancy-overlay', p.vibrancy.overlay);
  s.setProperty('--vibrancy-foreground', p.vibrancy.foreground);
}

export function ThemeProvider({
  paletteName,
  children,
}: {
  paletteName: PaletteName;
  children: React.ReactNode;
}) {
  const palette = palettes[paletteName] ?? palettes.obsidian;

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  const value = useMemo(() => ({ palette, paletteName }), [palette, paletteName]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
