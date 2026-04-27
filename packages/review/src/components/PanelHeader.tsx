export function PanelHeader({ title }: { title: string }) {
  return (
    <div className="h-[38px] flex items-center px-3 shrink-0">
      <span className="text-[11px] font-semibold text-fg-secondary tracking-[0.04em] uppercase">{title}</span>
    </div>
  )
}
