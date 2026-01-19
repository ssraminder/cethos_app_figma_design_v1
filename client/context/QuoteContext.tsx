import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Types
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

export interface QuoteState {
  currentStep: number;
  files: UploadedFile[];
  sourceLanguage: string;
  targetLanguage: string;
  intendedUse: string;
  countryOfIssue: string;
  specialInstructions: string;
  customerType: 'individual' | 'business';
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  quoteNumber: string;
}

interface QuoteContextType {
  state: QuoteState;
  updateState: (updates: Partial<QuoteState>) => void;
  goToNextStep: () => boolean;
  goToPreviousStep: () => void;
  goToStep: (step: number) => void;
  validateStep: (step: number) => boolean;
  resetQuote: () => void;
  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;
}

const initialState: QuoteState = {
  currentStep: 1,
  files: [],
  sourceLanguage: '',
  targetLanguage: '',
  intendedUse: '',
  countryOfIssue: '',
  specialInstructions: '',
  customerType: 'individual',
  companyName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  quoteNumber: '',
};

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

const STORAGE_KEY = 'cethos_quote_draft';

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<QuoteState>(() => {
    // Load from localStorage on mount
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Files cannot be persisted in localStorage, so we keep them empty
        return { ...parsed, files: [] };
      }
    } catch (error) {
      console.error('Error loading quote draft:', error);
    }
    return initialState;
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      // Don't persist files (File objects can't be serialized)
      const { files, ...persistableState } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
    } catch (error) {
      console.error('Error saving quote draft:', error);
    }
  }, [state]);

  const updateState = (updates: Partial<QuoteState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const addFile = (file: UploadedFile) => {
    setState(prev => ({
      ...prev,
      files: [...prev.files, file],
    }));
  };

  const removeFile = (fileId: string) => {
    setState(prev => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId),
    }));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1: // Upload
        return state.files.length > 0;
      
      case 2: // Details
        return !!(
          state.sourceLanguage &&
          state.targetLanguage &&
          state.intendedUse &&
          state.countryOfIssue
        );
      
      case 3: // Review
        return true; // Always valid
      
      case 4: // Contact
        const baseValid = !!(state.firstName && state.lastName && state.email && state.phone);
        if (state.customerType === 'business') {
          return baseValid && !!state.companyName;
        }
        return baseValid;
      
      case 5: // Success
        return true; // Always valid
      
      default:
        return false;
    }
  };

  const goToNextStep = (): boolean => {
    if (!validateStep(state.currentStep)) {
      return false;
    }

    if (state.currentStep < 5) {
      // Generate quote number when moving to step 5
      if (state.currentStep === 4) {
        const randomNum = Math.floor(Math.random() * 90000) + 10000;
        updateState({
          currentStep: state.currentStep + 1,
          quoteNumber: `QT-2026-${randomNum}`,
        });
      } else {
        updateState({ currentStep: state.currentStep + 1 });
      }
      return true;
    }
    return false;
  };

  const goToPreviousStep = () => {
    if (state.currentStep > 1) {
      updateState({ currentStep: state.currentStep - 1 });
    }
  };

  const goToStep = (step: number) => {
    // Only allow navigation to completed steps or the next step
    if (step >= 1 && step <= 5) {
      // Check if all previous steps are valid
      let canNavigate = true;
      for (let i = 1; i < step; i++) {
        if (!validateStep(i)) {
          canNavigate = false;
          break;
        }
      }
      
      if (canNavigate) {
        updateState({ currentStep: step });
      }
    }
  };

  const resetQuote = () => {
    setState(initialState);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing quote draft:', error);
    }
  };

  return (
    <QuoteContext.Provider
      value={{
        state,
        updateState,
        goToNextStep,
        goToPreviousStep,
        goToStep,
        validateStep,
        resetQuote,
        addFile,
        removeFile,
      }}
    >
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuote() {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error('useQuote must be used within a QuoteProvider');
  }
  return context;
}
