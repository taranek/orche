import type { FileTreeNode } from '../types'

interface BuildNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: 'modified' | 'added' | 'deleted'
  children?: { [key: string]: BuildNode }
}

export function buildFileTree(files: { path: string; name: string; status?: 'modified' | 'added' | 'deleted' }[]): FileTreeNode[] {
  const root: { [key: string]: BuildNode } = {}

  files.forEach((file) => {
    const parts = file.path.split('/')
    let current = root

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      const currentPath = parts.slice(0, index + 1).join('/')

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          status: isFile ? file.status : undefined,
          children: isFile ? undefined : {},
        }
      }

      if (!isFile && current[part].children) {
        current = current[part].children!
      }
    })
  })

  const convertToArray = (obj: { [key: string]: BuildNode }): FileTreeNode[] => {
    return Object.values(obj).map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      status: node.status,
      children: node.children ? convertToArray(node.children) : undefined,
    })).sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'folder') return 1
      return a.name.localeCompare(b.name)
    })
  }

  return convertToArray(root)
}
