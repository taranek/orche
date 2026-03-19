export interface FileChange {
  path: string
  name: string
  status: 'modified' | 'added' | 'deleted'
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: 'modified' | 'added' | 'deleted'
  children?: FileTreeNode[]
}

export type SidePanel = 'files' | 'comments' | 'theme'

export const REVIEW_ID = 'review-session'
