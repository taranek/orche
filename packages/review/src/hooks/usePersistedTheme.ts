import { useState, useCallback } from 'react'
import { palettes, type PaletteName } from '@orche/shared'

const THEME_KEY = 'orche-review-theme'

export function usePersistedTheme(): [PaletteName, (name: PaletteName) => void] {
  const [theme, setTheme] = useState<PaletteName>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return (stored && stored in palettes) ? stored as PaletteName : 'obsidian'
  })
  const set = useCallback((name: PaletteName) => {
    setTheme(name)
    localStorage.setItem(THEME_KEY, name)
  }, [])
  return [theme, set]
}
