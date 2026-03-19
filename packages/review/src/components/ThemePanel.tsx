import { palettes, type PaletteName } from '@orche/shared'
import { IconCheck, SwatchPair } from './Icons'

const paletteLabels: Record<PaletteName, string> = {
  obsidian: 'Obsidian',
  porcelain: 'Porcelain',
  sandstone: 'Sandstone',
  arctic: 'Arctic',
}

export function ThemePanel({ theme, onThemeChange }: {
  theme: PaletteName
  onThemeChange: (name: PaletteName) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-1">
        {(Object.keys(palettes) as PaletteName[]).map((name) => {
          const p = palettes[name]
          const isActive = name === theme
          return (
            <button
              key={name}
              className={`flex items-center gap-3 w-full px-3 py-3 text-left text-[13px] transition-all duration-100 cursor-pointer border-none font-[inherit] rounded-lg mb-0.5 ${
                isActive
                  ? 'bg-accent-dim text-accent'
                  : 'bg-transparent text-fg hover:bg-hover/60'
              }`}
              onClick={() => onThemeChange(name)}
            >
              <SwatchPair bg={p.bg.base} accent={p.accent.base} size={14} />
              <span className="flex-1">{paletteLabels[name]}</span>
              {isActive && <IconCheck />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
