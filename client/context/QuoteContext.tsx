import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

export interface QuoteState {
  // Identity
  quoteId: string | null;
  quoteNumber: string | null;

  // Step 1 — Upload
  files: UploadedFile[];
  sourceLanguageId: string;
  targetLanguageId: string;

  // Step 2 — Details
  intendedUseId: string;
  countryOfIssue: string;
  countryId: string;
  specialInstructions: string; // single consolidated field

  // Step 3 — Contact
  fullName: string;
  email: string;
  phone: string;
  customerType: "individual" | "business";
  companyName: string;

  // Navigation
  currentStep: number;

  // Processing
  isProcessing: boolean;
  processingStatus: string | null; // 'pending' | 'processing' | 'quote_ready' | 'review_required'

  // UI State
  isSubmitting: boolean;
  submissionType: string | null;
  error: string | null;
  showProcessingModal: boolean;
}

interface QuoteContextType {
  state: QuoteState;
  updateState: (updates: Partial<QuoteState>) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goToStep: (step: number) => void;
  resetQuote: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;
const STORAGE_KEY = "cethos_quote_draft";
const UPLOAD_STORAGE_KEY = "cethos_upload_draft";

// ── Initial State ──────────────────────────────────────────────────────────

const initialState: QuoteState = {
  quoteId: null,
  quoteNumber: null,
  files: [],
  sourceLanguageId: "",
  targetLanguageId: "",
  intendedUseId: "",
  countryOfIssue: "",
  countryId: "",
  specialInstructions: "",
  fullName: "",
  email: "",
  phone: "",
  customerType: "individual",
  companyName: "",
  currentStep: 1,
  isProcessing: false,
  processingStatus: null,
  isSubmitting: false,
  submissionType: null,
  error: null,
  showProcessingModal: false,
};

// ── Default Context ────────────────────────────────────────────────────────

const defaultContext: QuoteContextType = {
  state: initialState,
  updateState: () => {},
  goToNextStep: () => {},
  goToPreviousStep: () => {},
  goToStep: () => {},
  resetQuote: () => {},
};

const QuoteContext = createContext<QuoteContextType>(defaultContext);

// ── Provider ───────────────────────────────────────────────────────────────

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<QuoteState>(() => {
    // Check for quote_id in URL FIRST — takes priority over localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuoteId = urlParams.get("quote_id");

    if (urlQuoteId) {
      // Clear old quote data from localStorage BEFORE loading
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(UPLOAD_STORAGE_KEY);
      // Return initial state with the URL quote ID
      // The step component will fetch full quote data from DB
      return { ...initialState, quoteId: urlQuoteId };
    }

    // No URL quote_id — load from localStorage as usual
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Files cannot be persisted in localStorage, so keep them empty
        return { ...initialState, ...parsed, files: [] };
      }
    } catch (error) {
      console.error("Error loading quote draft:", error);
    }
    return initialState;
  });

  // ── localStorage persistence ──────────────────────────────────────────

  useEffect(() => {
    try {
      // Don't persist files (File objects can't be serialized)
      const { files, ...persistableState } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
    } catch (error) {
      console.error("Error saving quote draft:", error);
    }
  }, [state]);

  // ── State update ──────────────────────────────────────────────────────

  const updateState = useCallback((updates: Partial<QuoteState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────

  const goToNextStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= TOTAL_STEPS) return prev;
      window.scrollTo(0, 0);
      return { ...prev, currentStep: prev.currentStep + 1 };
    });
  }, []);

  const goToPreviousStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 1) return prev;
      window.scrollTo(0, 0);
      return { ...prev, currentStep: prev.currentStep - 1 };
    });
  }, []);

  const goToStep = useCallback((step: number) => {
    setState((prev) => {
      // Only allow navigation to steps ≤ current + 1
      if (step < 1 || step > TOTAL_STEPS || step > prev.currentStep + 1) {
        return prev;
      }
      window.scrollTo(0, 0);
      return { ...prev, currentStep: step };
    });
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────

  const resetQuote = useCallback(() => {
    setState(initialState);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(UPLOAD_STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing quote draft:", error);
    }
  }, []);

  return (
    <QuoteContext.Provider
      value={{
        state,
        updateState,
        goToNextStep,
        goToPreviousStep,
        goToStep,
        resetQuote,
      }}
    >
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuote() {
  return useContext(QuoteContext);
}
