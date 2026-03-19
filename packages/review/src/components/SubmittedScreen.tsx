import { IconCheck } from './Icons'

export function SubmittedScreen() {
  return (
    <div className="h-full flex items-center justify-center bg-vibrancy-overlay rounded-[10px]">
      <div className="text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-status-green/10 flex items-center justify-center text-status-green">
          <IconCheck size={24} />
        </div>
        <div className="text-base font-medium text-fg">Review submitted</div>
        <p className="text-fg-secondary text-xs">Comments sent to the agent.</p>
      </div>
    </div>
  )
}
