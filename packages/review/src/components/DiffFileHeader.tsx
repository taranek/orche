import { memo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface DiffStats {
  additions: number
  deletions: number
}

function getStatusDisplay(status: string) {
  if (status === 'added') return { icon: '+', color: '#4ade80' }
  if (status === 'deleted') return { icon: '-', color: '#f87171' }
  return { icon: '~', color: '#facc15' }
}

interface DiffFileHeaderProps {
  path: string
  status: string
  stats: DiffStats
  isCollapsed: boolean
  onClick: () => void
}

export const DiffFileHeader = memo(function DiffFileHeader({
  path, status, stats, isCollapsed, onClick,
}: DiffFileHeaderProps) {
  const { icon: statusIcon, color: statusColor } = getStatusDisplay(status)

  return (
    <div
      onClick={onClick}
      className="sticky top-0 z-20 flex items-center gap-2 h-[38px] px-3 bg-elevated border-b border-edge-active cursor-pointer select-none shadow-[0_1px_3px_rgba(0,0,0,0.15),0_0_0_1px_rgba(255,255,255,0.03)_inset] hover:bg-hover transition-colors"
    >
      {isCollapsed
        ? <ChevronRight size={13} className="text-fg-tertiary" />
        : <ChevronDown size={13} className="text-fg-tertiary" />
      }
      <span className="text-[12px] font-mono font-bold" style={{ color: statusColor }}>{statusIcon}</span>
      <span className="text-[12px] font-mono font-medium text-fg tracking-tight">{path}</span>
      <span className="ml-auto flex items-center gap-1.5 text-[11px] font-mono font-semibold tabular-nums">
        {stats.deletions > 0 ? <span className="text-status-red">-{stats.deletions}</span> : null}
        {stats.additions > 0 ? <span className="text-status-green">+{stats.additions}</span> : null}
      </span>
    </div>
  )
})
