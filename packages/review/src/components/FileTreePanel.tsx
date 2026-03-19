import { useState } from 'react'
import type { FileTreeNode } from '../types'

function FileTreeItem({
  node,
  selectedFile,
  onFileSelect,
  depth = 0,
}: {
  node: FileTreeNode
  selectedFile: string | null
  onFileSelect: (path: string) => void
  depth?: number
}) {
  const [isExpanded, setIsExpanded] = useState(true)
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
          <svg
            width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-fg-secondary/60">
            <path d="M1.5 2h4.586a1 1 0 01.707.293l.914.914a1 1 0 00.707.293H14.5a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1V3a1 1 0 011-1z" />
          </svg>
          <span className="font-medium">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onFileSelect(node.path)}
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
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-fg-secondary/60 shrink-0">
        <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function FileTreePanel({ tree, selectedFile, onSelect }: {
  tree: FileTreeNode[]
  selectedFile: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1 pb-3 pt-1">
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            selectedFile={selectedFile}
            onFileSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
