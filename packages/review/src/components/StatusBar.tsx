import { useEffect } from 'react'
import { GitBranch } from 'lucide-react'
import { SubmitReviewButton } from './SubmitReviewButton'

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
      {commentCount > 0 ? <SubmitReviewButton onClick={onSubmit} /> : null}
    </div>
  )
}
