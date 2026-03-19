export function PanelHeader({ title }: { title: string }) {
  return (
    <div className="px-3 pt-2 pb-1.5">
      <span className="text-[11px] font-semibold text-fg tracking-[0.06em] uppercase">{title}</span>
    </div>
  )
}
