import { useEffect, useRef, useMemo } from 'react'
import { useFileTree, FileTree } from '@pierre/trees/react'
import { preparePresortedFileTreeInput, themeToTreeStyles } from '@pierre/trees'
import { useTheme } from '@orche/shared'
import { useFileStore } from '../store/fileStore'
import type { FileChange } from '../types'

interface FileTreePanelProps {
  changes: FileChange[]
  onFileClick?: (path: string) => void
  commentCounts?: Record<string, number>
}

function FileTreeInner({
  changes,
  onFileClick,
  commentCounts,
}: {
  changes: FileChange[]
  onFileClick?: (path: string) => void
  commentCounts?: Record<string, number>
}) {
  const selectedFile = useFileStore((s) => s.selectedFile)
  const selectFile = useFileStore((s) => s.selectFile)
  const { palette } = useTheme()

  const preparedInput = useMemo(
    () => preparePresortedFileTreeInput(changes.map(c => c.path)),
    [changes]
  )

  const gitStatus = changes.map(c => ({
    path: c.path,
    status: c.status === 'added' ? 'added' as const
      : c.status === 'deleted' ? 'deleted' as const
      : 'modified' as const,
  }))

  // Map our palette to tree theme styles
  const treeStyles = useMemo(() => themeToTreeStyles({
    type: palette.mode,
    bg: palette.bg.surface,
    fg: palette.text.primary,
    colors: {
      'gitDecoration.addedResourceForeground': palette.status.green,
      'gitDecoration.modifiedResourceForeground': palette.status.amber,
      'gitDecoration.deletedResourceForeground': palette.status.red,
      'gitDecoration.untrackedResourceForeground': palette.status.cyan,
      'list.activeSelectionBackground': palette.accent.dim,
      'list.activeSelectionForeground': palette.text.primary,
      'list.hoverBackground': palette.bg.hover,
      'list.focusOutline': palette.accent.base,
      'focusBorder': palette.accent.base,
    },
  }), [palette])

  // Comment count decorations
  const commentCountsRef = useRef(commentCounts)
  commentCountsRef.current = commentCounts

  const scrollLockUntilRef = useRef(0)
  const onFileClickRef = useRef(onFileClick)
  onFileClickRef.current = onFileClick
  const selectFileRef = useRef(selectFile)
  selectFileRef.current = selectFile

  const { model } = useFileTree({
    preparedInput,
    initialExpansion: 'open',
    density: 'compact',
    itemHeight: 24,
    icons: {
      set: 'complete',
      colored: true,
    },
    gitStatus,
    unsafeCSS: `
      [data-file-tree-virtualized-root] {
        font-size: 12px;
        font-family: "JetBrains Mono", "SF Mono", Menlo, monospace;
      }
      [data-file-tree-row] {
        padding-left: 4px !important;
        padding-right: 4px !important;
        border-radius: 5px;
      }
      [data-file-tree-row-label] {
        font-size: 11px;
        letter-spacing: -0.01em;
      }
      [data-file-tree-row-icon] svg {
        width: 14px;
        height: 14px;
      }
      [data-file-tree-row-decoration] {
        font-size: 10px;
        opacity: 0.7;
      }
      [data-file-tree-git-status] {
        font-size: 10px;
        font-weight: 600;
      }
    `,
    renderRowDecoration: ({ item }) => {
      const count = commentCountsRef.current?.[item.path]
      if (count && count > 0) {
        return { text: String(count), title: `${count} comment${count > 1 ? 's' : ''}` }
      }
      return null
    },
    onSelectionChange: (selectedPaths) => {
      const selected = selectedPaths[0]
      if (selected) {
        scrollLockUntilRef.current = Date.now() + 1000
        selectFileRef.current(selected)
        onFileClickRef.current?.(selected)
      }
    },
  })

  // Update git status when changes update after mount
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    model.setGitStatus(gitStatus)
  }, [changes])

  // Sync active file from store → tree
  useEffect(() => {
    if (Date.now() < scrollLockUntilRef.current) return
    if (selectedFile) {
      model.focusPath(selectedFile)
    }
  }, [selectedFile, model])

  return (
    <FileTree
      model={model}
      style={{ height: '100%', ...treeStyles }}
    />
  )
}

export function FileTreePanel({ changes, onFileClick, commentCounts }: FileTreePanelProps) {
  if (changes.length === 0) return null

  return (
    <div className="h-full">
      <FileTreeInner
        changes={changes}
        onFileClick={onFileClick}
        commentCounts={commentCounts}
      />
    </div>
  )
}
