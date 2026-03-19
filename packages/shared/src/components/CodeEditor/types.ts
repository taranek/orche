export interface ExistingComment {
  lineNumber: number;
  text: string;
  id: string;
}

export type DiffMode = 'split' | 'unified';

export interface CodeDiffEditorProps {
  original: string;
  modified: string;
  mode?: DiffMode;
  onChange?: (value: string) => void;
  onSave?: () => void;
  filePath?: string;
  onComment?: (line: number, comment: string) => void;
  onDeleteComment?: (commentId: string) => void;
  reviewMode?: boolean;
  existingComments?: ExistingComment[];
  onEditorReady?: (api: { revealLine: (line: number) => void }) => void;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  filePath?: string;
  readOnly?: boolean;
}
