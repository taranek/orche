import { IconFileDoc } from './Icons'
import type { FileChange } from '../types'

export function TabBar({ files, selected, onSelect }: {
  files: FileChange[]
  selected: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div className="h-[38px] shrink-0 flex items-end bg-surface-low/50 overflow-x-auto scrollbar-none">
      {files.map(f => {
        const isActive = f.path === selected
        const fileName = f.path.split('/').pop() ?? f.path
        return (
          <button
            key={f.path}
            onClick={() => onSelect(f.path)}
            className={`group relative flex items-center gap-2 px-4 h-[36px] text-[12px] whitespace-nowrap cursor-pointer border-none font-[inherit] shrink-0 transition-all duration-100 ${
              isActive
                ? 'bg-base text-fg rounded-t-lg tab-notch'
                : 'bg-transparent text-fg-secondary hover:text-fg'
            }`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <IconFileDoc size={13} />
            <span>{fileName}</span>
            {isActive && (
              <span
                className="ml-1 w-4 h-4 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-hover transition-all text-fg-tertiary"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 1l6 6M7 1l-6 6" />
                </svg>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
