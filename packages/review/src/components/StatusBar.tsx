import { ButtonPill } from '@orche/shared'
import { IconSend } from './Icons'

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
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
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
          <IconSend /> Submit Review ({commentCount})
        </ButtonPill>
      )}
    </div>
  )
}
