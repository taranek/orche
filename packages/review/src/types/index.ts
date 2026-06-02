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

export type ReviewRange =
  | { kind: 'all' }
  | { kind: 'working' }
  | { kind: 'commit'; sha: string }

export interface ReviewCommit {
  sha: string
  shortSha: string
  subject: string
  author: string
  date: string
}

export const REVIEW_ID = 'review-session'
