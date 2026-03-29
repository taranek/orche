import { Send } from 'lucide-react'

const isMac = navigator.platform.includes('Mac')

interface SubmitReviewButtonProps {
  onClick: () => void
}

export function SubmitReviewButton({ onClick }: SubmitReviewButtonProps) {
  return (
    <button
      onClick={onClick}
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
  )
}
