import { ChevronDown } from 'lucide-react'
import type { ReviewCommit, ReviewRange } from '../types'

interface CommitSelectorProps {
  commits: ReviewCommit[]
  range: ReviewRange
  onRangeChange: (range: ReviewRange) => void
}

const ALL = '__all'
const WORKING = '__working'

/**
 * Liquid-glass styled commit range picker.
 *
 * Layout: a wrapping pill that hosts the native <select> (transparent, no native chrome)
 * plus a custom chevron. Native select keeps the OS dropdown panel for free while we get
 * full visual control over the trigger.
 */
export function CommitSelector({ commits, range, onRangeChange }: CommitSelectorProps) {
  const value =
    range.kind === 'all' ? ALL :
    range.kind === 'working' ? WORKING :
    range.sha

  return (
    <div
      className={[
        'group relative inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full',
        // Glass fill: very thin semi-transparent layer that lets the bar tone through
        'bg-[color-mix(in_oklch,var(--surface)_45%,transparent)]',
        'backdrop-blur-xl backdrop-saturate-150',
        // Hairline outline + tiny lift + inner top highlight (the "liquid" cue)
        'shadow-[inset_0_1px_0_color-mix(in_oklch,white_10%,transparent),0_0_0_1px_color-mix(in_oklch,var(--fg)_10%,transparent),0_1px_2px_-1px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)]',
        // Hover: subtly brighter highlight, slightly stronger outline
        'hover:bg-[color-mix(in_oklch,var(--surface)_60%,transparent)]',
        'hover:shadow-[inset_0_1px_0_color-mix(in_oklch,white_16%,transparent),0_0_0_1px_color-mix(in_oklch,var(--fg)_18%,transparent),0_1px_2px_-1px_rgba(0,0,0,0.22),0_4px_10px_rgba(0,0,0,0.1)]',
        'transition-[box-shadow,background-color] duration-150',
      ].join(' ')}
    >
      <select
        value={value}
        aria-label="Filter changes by commit"
        onChange={(e) => {
          const v = e.target.value
          if (v === ALL) onRangeChange({ kind: 'all' })
          else if (v === WORKING) onRangeChange({ kind: 'working' })
          else onRangeChange({ kind: 'commit', sha: v })
        }}
        className={[
          'appearance-none bg-transparent outline-none border-0 cursor-pointer',
          'text-[11px] font-mono text-fg',
          'pr-3 max-w-[260px] truncate',
          // The native select on mac still has a chevron when not appearance:none, but appearance:none strips it.
          // Padding-right above leaves room for our custom one.
        ].join(' ')}
      >
        <option value={ALL}>All changes</option>
        <option value={WORKING}>Working tree only</option>
        {commits.length > 0 && (
          <optgroup label="Commits">
            {commits.map((c) => (
              <option key={c.sha} value={c.sha} title={`${c.author} · ${c.date}`}>
                {c.shortSha} {c.subject}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <ChevronDown size={11} className="opacity-60 group-hover:opacity-90 pointer-events-none -ml-0.5 shrink-0" />
    </div>
  )
}
