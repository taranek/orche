import { create } from 'zustand';

export interface ReviewComment {
  id: string;
  agentId: string;
  filePath: string;
  lineNumber: number;
  text: string;
  status: 'pending' | 'submitted';
  createdAt: number;
}

interface ReviewState {
  commentsByAgent: Record<string, ReviewComment[]>;
  reviewModeByAgent: Record<string, boolean>;
  /** Files manually edited by the user in the review UI, keyed by agentId */
  userEditedFiles: Record<string, Set<string>>;

  addComment: (agentId: string, filePath: string, lineNumber: number, text: string) => void;
  removeComment: (agentId: string, commentId: string) => void;
  updateComment: (agentId: string, commentId: string, text: string) => void;
  relocateComments: (agentId: string, moves: Array<{ id: string; lineNumber: number }>) => void;
  markUserEdited: (agentId: string, filePath: string) => void;
  getUserEditedFiles: (agentId: string) => string[];
  clearUserEdits: (agentId: string) => void;
  setReviewMode: (agentId: string, enabled: boolean) => void;
  toggleReviewMode: (agentId: string) => void;
  submitReview: (agentId: string) => ReviewComment[];
  clearSubmitted: (agentId: string) => void;
  getCommentsForFile: (agentId: string, filePath: string) => ReviewComment[];
}

export const useReviewStore = create<ReviewState>()((set, get) => ({
  commentsByAgent: {},
  reviewModeByAgent: {},
  userEditedFiles: {},

  addComment: (agentId, filePath, lineNumber, text) =>
    set((state) => {
      const existing = state.commentsByAgent[agentId] ?? [];
      const comment: ReviewComment = {
        id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        agentId,
        filePath,
        lineNumber,
        text,
        status: 'pending',
        createdAt: Date.now(),
      };
      return {
        commentsByAgent: {
          ...state.commentsByAgent,
          [agentId]: [...existing, comment],
        },
      };
    }),

  removeComment: (agentId, commentId) =>
    set((state) => {
      const existing = state.commentsByAgent[agentId] ?? [];
      return {
        commentsByAgent: {
          ...state.commentsByAgent,
          [agentId]: existing.filter((c) => c.id !== commentId),
        },
      };
    }),

  updateComment: (agentId, commentId, text) =>
    set((state) => {
      const existing = state.commentsByAgent[agentId] ?? [];
      return {
        commentsByAgent: {
          ...state.commentsByAgent,
          [agentId]: existing.map((c) =>
            c.id === commentId ? { ...c, text } : c
          ),
        },
      };
    }),

  relocateComments: (agentId, moves) =>
    set((state) => {
      const existing = state.commentsByAgent[agentId] ?? [];
      const moveMap = new Map(moves.map(m => [m.id, m.lineNumber]));
      return {
        commentsByAgent: {
          ...state.commentsByAgent,
          [agentId]: existing.map((c) => {
            const newLine = moveMap.get(c.id);
            return newLine != null && newLine !== c.lineNumber ? { ...c, lineNumber: newLine } : c;
          }),
        },
      };
    }),

  markUserEdited: (agentId, filePath) =>
    set((state) => {
      const existing = state.userEditedFiles[agentId] ?? new Set<string>()
      if (existing.has(filePath)) return state
      const next = new Set(existing)
      next.add(filePath)
      return { userEditedFiles: { ...state.userEditedFiles, [agentId]: next } }
    }),

  getUserEditedFiles: (agentId) => {
    const state = get()
    return Array.from(state.userEditedFiles[agentId] ?? [])
  },

  clearUserEdits: (agentId) =>
    set((state) => ({
      userEditedFiles: { ...state.userEditedFiles, [agentId]: new Set<string>() },
    })),

  setReviewMode: (agentId, enabled) =>
    set((state) => ({
      reviewModeByAgent: {
        ...state.reviewModeByAgent,
        [agentId]: enabled,
      },
    })),

  toggleReviewMode: (agentId) =>
    set((state) => ({
      reviewModeByAgent: {
        ...state.reviewModeByAgent,
        [agentId]: !(state.reviewModeByAgent[agentId] ?? false),
      },
    })),

  submitReview: (agentId) => {
    const state = get();
    const comments = (state.commentsByAgent[agentId] ?? []).filter(
      (c) => c.status === 'pending'
    );
    set((s) => ({
      commentsByAgent: {
        ...s.commentsByAgent,
        [agentId]: (s.commentsByAgent[agentId] ?? []).map((c) =>
          c.status === 'pending' ? { ...c, status: 'submitted' as const } : c
        ),
      },
    }));
    return comments;
  },

  clearSubmitted: (agentId) =>
    set((state) => ({
      commentsByAgent: {
        ...state.commentsByAgent,
        [agentId]: (state.commentsByAgent[agentId] ?? []).filter(
          (c) => c.status !== 'submitted'
        ),
      },
    })),

  getCommentsForFile: (agentId, filePath) => {
    const state = get();
    return (state.commentsByAgent[agentId] ?? []).filter(
      (c) => c.filePath === filePath && c.status === 'pending'
    );
  },
}));
