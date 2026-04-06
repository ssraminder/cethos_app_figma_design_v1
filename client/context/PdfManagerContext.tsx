// client/context/PdfManagerContext.tsx
// Editor state management with undo/redo for PDF Manager

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { PdfFile, PageThumbnail, PdfManagerState, PdfOperation } from '../types/pdf-manager';

// --- Actions ---
type Action =
  | { type: 'ADD_FILES'; files: PdfFile[] }
  | { type: 'REMOVE_FILE'; clientId: string }
  | { type: 'REORDER_FILES'; fromIndex: number; toIndex: number }
  | { type: 'SELECT_FILE'; index: number | null }
  | { type: 'SET_PAGES'; pages: PageThumbnail[] }
  | { type: 'TOGGLE_PAGE_SELECTION'; pageIndex: number }
  | { type: 'SELECT_ALL_PAGES' }
  | { type: 'DESELECT_ALL_PAGES' }
  | { type: 'REORDER_PAGES'; fromIndex: number; toIndex: number }
  | { type: 'REMOVE_SELECTED_PAGES' }
  | { type: 'SET_PROCESSING'; isProcessing: boolean }
  | { type: 'SET_FOLDER'; folderId: string | null }
  | { type: 'PUSH_UNDO'; operation: PdfOperation }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET' };

const initialState: PdfManagerState = {
  files: [],
  selectedFileIndex: null,
  pages: [],
  selectedPageIndices: [],
  undoStack: [],
  redoStack: [],
  isProcessing: false,
  currentFolder: null,
};

function reducer(state: PdfManagerState, action: Action): PdfManagerState {
  switch (action.type) {
    case 'ADD_FILES':
      return { ...state, files: [...state.files, ...action.files] };

    case 'REMOVE_FILE':
      return {
        ...state,
        files: state.files.filter(f => f.clientId !== action.clientId),
        selectedFileIndex: null,
        pages: [],
        selectedPageIndices: [],
      };

    case 'REORDER_FILES': {
      const files = [...state.files];
      const [moved] = files.splice(action.fromIndex, 1);
      files.splice(action.toIndex, 0, moved);
      return { ...state, files };
    }

    case 'SELECT_FILE':
      return { ...state, selectedFileIndex: action.index, pages: [], selectedPageIndices: [] };

    case 'SET_PAGES':
      return { ...state, pages: action.pages, selectedPageIndices: [] };

    case 'TOGGLE_PAGE_SELECTION': {
      const idx = action.pageIndex;
      const selected = state.selectedPageIndices.includes(idx)
        ? state.selectedPageIndices.filter(i => i !== idx)
        : [...state.selectedPageIndices, idx];
      return { ...state, selectedPageIndices: selected };
    }

    case 'SELECT_ALL_PAGES':
      return { ...state, selectedPageIndices: state.pages.map((_, i) => i) };

    case 'DESELECT_ALL_PAGES':
      return { ...state, selectedPageIndices: [] };

    case 'REORDER_PAGES': {
      const pages = [...state.pages];
      const [moved] = pages.splice(action.fromIndex, 1);
      pages.splice(action.toIndex, 0, moved);
      return { ...state, pages: pages.map((p, i) => ({ ...p, pageIndex: i })) };
    }

    case 'REMOVE_SELECTED_PAGES': {
      const removeSet = new Set(state.selectedPageIndices);
      const pages = state.pages
        .filter((_, i) => !removeSet.has(i))
        .map((p, i) => ({ ...p, pageIndex: i }));
      return { ...state, pages, selectedPageIndices: [] };
    }

    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.isProcessing };

    case 'SET_FOLDER':
      return { ...state, currentFolder: action.folderId };

    case 'PUSH_UNDO':
      return {
        ...state,
        undoStack: [...state.undoStack, action.operation],
        redoStack: [],
      };

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const undoStack = [...state.undoStack];
      const operation = undoStack.pop()!;
      return {
        ...state,
        undoStack,
        redoStack: [...state.redoStack, operation],
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const redoStack = [...state.redoStack];
      const operation = redoStack.pop()!;
      return {
        ...state,
        redoStack,
        undoStack: [...state.undoStack, operation],
      };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// --- Context ---
interface PdfManagerContextValue {
  state: PdfManagerState;
  dispatch: React.Dispatch<Action>;
  addFiles: (files: PdfFile[]) => void;
  removeFile: (clientId: string) => void;
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  selectFile: (index: number | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const PdfManagerContext = createContext<PdfManagerContextValue | null>(null);

export function PdfManagerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addFiles = useCallback((files: PdfFile[]) => {
    dispatch({ type: 'ADD_FILES', files });
  }, []);

  const removeFile = useCallback((clientId: string) => {
    dispatch({ type: 'REMOVE_FILE', clientId });
  }, []);

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: 'REORDER_FILES', fromIndex, toIndex });
  }, []);

  const selectFile = useCallback((index: number | null) => {
    dispatch({ type: 'SELECT_FILE', index });
  }, []);

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  return (
    <PdfManagerContext.Provider
      value={{
        state,
        dispatch,
        addFiles,
        removeFile,
        reorderFiles,
        selectFile,
        canUndo: state.undoStack.length > 0,
        canRedo: state.redoStack.length > 0,
        undo,
        redo,
      }}
    >
      {children}
    </PdfManagerContext.Provider>
  );
}

export function usePdfManager() {
  const ctx = useContext(PdfManagerContext);
  if (!ctx) throw new Error('usePdfManager must be used within PdfManagerProvider');
  return ctx;
}
