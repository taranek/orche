import { FileText, MessageCircle, Palette } from 'lucide-react'
import type { SidePanel } from '../types'

export function IconRail({ active, onChange, commentCount }: {
  active: SidePanel
  onChange: (panel: SidePanel) => void
  commentCount: number
}) {
  const topItems: { id: SidePanel; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: 'files', icon: <FileText size={20} strokeWidth={1.4} />, label: 'Changed Files' },
    { id: 'comments', icon: <MessageCircle size={20} strokeWidth={1.4} />, label: 'Comments', badge: commentCount || undefined },
  ]

  const bottomItem = { id: 'theme' as SidePanel, icon: <Palette size={20} strokeWidth={1.4} />, label: 'Theme' }

  return (
    <div className="w-12 shrink-0 flex flex-col items-center pt-2 pb-3 gap-2 bg-sidebar/60 border-r border-edge/50">
      {topItems.map(({ id, icon, label, badge }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`relative w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer border-none transition-all duration-200 ${
            active === id
              ? 'bg-hover text-fg'
              : 'bg-transparent text-fg-secondary hover:text-fg hover:bg-hover/40'
          }`}
          title={label}
        >
          {icon}
          {badge != null && badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-accent text-base rounded-full px-1 leading-none shadow-sm">
              {badge}
            </span>
          )}
          {active === id && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-5 bg-accent rounded-r-full" />
          )}
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => onChange(bottomItem.id)}
        className={`relative w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer border-none transition-all duration-200 ${
          active === bottomItem.id
            ? 'bg-hover text-fg'
            : 'bg-transparent text-fg-secondary hover:text-fg hover:bg-hover/40'
        }`}
        title={bottomItem.label}
      >
        {bottomItem.icon}
        {active === bottomItem.id && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-5 bg-accent rounded-r-full" />
        )}
      </button>
    </div>
  )
}
