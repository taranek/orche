export function CommentsPanel({ comments, onClickComment }: {
  comments: { id: string; filePath: string; lineNumber: number; text: string }[]
  onClickComment: (filePath: string) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {comments.length === 0 ? (
          <div className="px-3 py-12 text-center text-[12px] text-fg-secondary leading-relaxed">
            Click on lines in the diff<br />to add review comments.
          </div>
        ) : (
          comments.map(c => (
            <button
              key={c.id}
              onClick={() => onClickComment(c.filePath)}
              className="w-full text-left px-3 py-2.5 mb-1 rounded-lg bg-surface-low/60 hover:bg-surface border-none cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono font-medium text-accent">{c.filePath.split('/').pop()}</span>
                <span className="text-[10px] text-fg-secondary">:{c.lineNumber}</span>
              </div>
              <div className="text-[12px] text-fg-secondary leading-snug">{c.text}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
