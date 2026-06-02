import { useEffect, useState } from 'react'
import type { ReviewRange } from '../types'

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif',
])

export function isImageFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(filePath.slice(dot).toLowerCase())
}

function mimeFromPath(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.avif': 'image/avif',
  }
  return map[ext] ?? 'image/png'
}

function ImagePanel({ label, src }: { label: string; src: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-tertiary">{label}</span>
      {src ? (
        <img
          src={src}
          className="max-w-[400px] max-h-[300px] rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)] object-contain bg-elevated"
        />
      ) : (
        <div className="w-[200px] h-[150px] rounded-lg bg-elevated shadow-[0_0_0_1px_rgba(0,0,0,0.06)] flex items-center justify-center text-fg-tertiary text-xs">
          No image
        </div>
      )}
    </div>
  )
}

interface ImageDiffProps {
  filePath: string
  status: 'added' | 'modified' | 'deleted'
  range: ReviewRange
}

export function ImageDiff({ filePath, status, range }: ImageDiffProps) {
  const [original, setOriginal] = useState<string | null>(null)
  const [modified, setModified] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const mime = mimeFromPath(filePath)

    async function load() {
      if (status !== 'added') {
        const b64 = await window.review.readOriginalBase64(filePath, range)
        if (!cancelled && b64) setOriginal(`data:${mime};base64,${b64}`)
      }
      if (status !== 'deleted') {
        const b64 = await window.review.readBase64(filePath, range)
        if (!cancelled && b64) setModified(`data:${mime};base64,${b64}`)
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath, status, range])

  return (
    <div className="flex items-start justify-center gap-6 p-6">
      {status !== 'added' && <ImagePanel label="Original" src={original} />}
      {status === 'modified' && <span className="mt-8 text-fg-tertiary text-lg">→</span>}
      {status !== 'deleted' && <ImagePanel label="Modified" src={modified} />}
    </div>
  )
}
