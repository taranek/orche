import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'orche-panel-width'
const DEFAULT_WIDTH = 224 // w-56
const MIN_WIDTH = 160
const MAX_WIDTH = 480

export function ResizablePanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(stored))) : DEFAULT_WIDTH
  })
  const panelRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  // Persist on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width))
  }, [width])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX
    const startWidth = width

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  return (
    <div
      ref={panelRef}
      className={`shrink-0 flex flex-col relative ${className}`}
      style={{ width }}
    >
      {children}

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize z-30 hover:bg-accent/20 active:bg-accent/30 transition-colors"
      />
    </div>
  )
}
