import { useState } from 'react'
import { ChevronRight, Folder, File } from 'lucide-react'
import { useFileStore } from '../store/fileStore'
import type { FileTreeNode } from '../types'

function FileTreeItem({
  node,
  depth = 0,
  onFileClick,
}: {
  node: FileTreeNode
  depth?: number
  onFileClick?: (path: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const selectedFile = useFileStore((s) => s.selectedFile)
  const selectFile = useFileStore((s) => s.selectFile)
  const isSelected = node.path === selectedFile

  const statusColor = node.status
    ? { modified: 'text-status-amber', added: 'text-status-green', deleted: 'text-status-red' }[node.status]
    : undefined

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 text-left text-[12px] text-fg hover:bg-hover rounded border-none bg-transparent cursor-pointer font-[inherit]"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronRight
            size={10}
            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
          <Folder size={14} className="text-fg-secondary/60" />
          <span className="font-medium">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => { selectFile(node.path); onFileClick?.(node.path) }}
      className={`flex items-center gap-1.5 w-full px-2 py-1.5 text-left text-[12px] font-mono rounded border-none cursor-pointer font-[inherit] transition-colors ${
        isSelected
          ? 'bg-accent-dim text-fg'
          : 'text-fg-secondary hover:text-fg hover:bg-hover'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {node.status ? (
        <span className={`${statusColor} text-[10px]`}>
          {node.status === 'modified' && '~'}
          {node.status === 'added' && '+'}
          {node.status === 'deleted' && '-'}
        </span>
      ) : (
        <span className="w-[8px]" />
      )}
      <File size={12} className="text-fg-secondary/60 shrink-0" strokeWidth={1.2} />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function FileTreePanel({ tree, onFileClick }: { tree: FileTreeNode[]; onFileClick?: (path: string) => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1 pb-3 pt-1">
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            onFileClick={onFileClick}
          />
        ))}
      </div>
    </div>
  )
}
