import { ButtonPill } from '@orche/shared'
import { Send, GitBranch } from 'lucide-react'

export function StatusBar({ branch, fileCount, commentCount, onSubmit }: {
  branch: string | null
  fileCount: number
  commentCount: number
  onSubmit: () => void
}) {
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
        <ButtonPill variant="accent" onClick={onSubmit}>
          <Send size={12} /> Submit Review ({commentCount})
        </ButtonPill>
      )}
    </div>
  )
}
