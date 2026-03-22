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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-fg-tertiary">
            <kbd className="inline-flex items-center justify-center h-[22px] min-w-[22px] px-1.5 rounded-[5px] bg-hover border border-edge-active text-[12px] font-medium text-fg font-mono shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="inline-flex items-center justify-center h-[22px] min-w-[22px] px-1.5 rounded-[5px] bg-hover border border-edge-active text-[12px] font-medium text-fg font-mono shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
              ↵
            </kbd>
          </div>
          <button
            onClick={onSubmit}
            className="flex items-center gap-1.5 h-[26px] px-2.5 rounded-full bg-accent text-base text-[11px] font-semibold tracking-tight cursor-pointer border-none transition-all hover:brightness-110 active:scale-[0.97]"
          >
            <Send size={11} strokeWidth={2} />
            <span>Submit Review</span>
          </button>
        </div>
      )}
    </div>
  )
}
