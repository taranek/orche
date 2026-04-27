import { Send } from 'lucide-react'
import { Button } from './Button'

const isMac = navigator.platform.includes('Mac')

interface SubmitReviewButtonProps {
  onClick: () => void
}

export function SubmitReviewButton({ onClick }: SubmitReviewButtonProps) {
  return (
    <Button variant="primary" size="md" onClick={onClick}>
      <Send size={12} strokeWidth={2.5} className="text-accent" />
      <span className="text-[12px] font-semibold tracking-tight text-accent">Submit Review</span>
      <span className="flex items-center gap-1 ml-0.5">
        <kbd className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-[4px] bg-accent/10 shadow-[0_0_0_1px_var(--accent-dim)] text-[10px] font-medium text-accent font-mono leading-none">
          {isMac ? '⌘' : 'Ctrl'}
        </kbd>
        <kbd className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-[4px] bg-accent/10 shadow-[0_0_0_1px_var(--accent-dim)] text-[10px] font-medium text-accent font-mono leading-none">
          ↵
        </kbd>
      </span>
    </Button>
  )
}
