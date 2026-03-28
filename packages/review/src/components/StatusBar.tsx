import { useEffect } from 'react'
import { Send, GitBranch } from 'lucide-react'

const isMac = navigator.platform.includes('Mac')

export function StatusBar({ branch, fileCount, commentCount, onSubmit }: {
  branch: string | null
  fileCount: number
  commentCount: number
  onSubmit: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'Enter' && commentCount > 0) {
        e.preventDefault()
        onSubmit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSubmit, commentCount])

  return (
    <div className="h-11 shrink-0 flex items-center justify-between px-3 border-t border-edge/60 bg-sidebar/60">
      <div className="flex items-center gap-3 text-[11px] text-fg">
        {branch && (
          <>
            <div className="flex items-center gap-1.5">
              <GitBranch size={11} className="opacity-60" />
              <span className="opacity-80">{branch}</span>
            </div>
            <span className="opacity-25">·</span>
          </>
        )}
        <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
        <span className="opacity-25">·</span>
        <span>{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
      </div>
      {commentCount > 0 && (
        <button
          onClick={onSubmit}
          className="inline-flex items-center gap-2.5 h-[34px] px-3.5 rounded-2xl border border-edge-active bg-elevated overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.03)_inset] hover:shadow-[0_2px_6px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.06)_inset] hover:bg-hover/50 active:scale-[0.97] transition-all cursor-pointer"
        >
          <Send size={12} strokeWidth={2.5} className="text-accent" />
          <span className="text-[12px] font-semibold tracking-tight text-accent">Submit Review</span>
          <span className="flex items-center gap-1 ml-0.5">
            <kbd className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-[4px] bg-hover/60 border border-edge text-[10px] font-medium text-fg-secondary font-mono leading-none">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-[4px] bg-hover/60 border border-edge text-[10px] font-medium text-fg-secondary font-mono leading-none">
              ↵
            </kbd>
          </span>
        </button>
      )}
    </div>
  )
}
