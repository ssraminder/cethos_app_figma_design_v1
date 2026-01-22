import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
} from "react";
import { useSupabase } from "@/hooks/useSupabase";

// Types
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface QuoteState {
  currentStep: number;
  quoteId: string;
  files: UploadedFile[];
  sourceLanguageId: string;
  targetLanguageId: string;
  intendedUseId: string;
  countryOfIssue: string;
  specialInstructions: string;
  customerType: "individual" | "business";
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  quoteNumber: string;
  isProcessing: boolean;
  emailQuoteMode: boolean;
  emailQuoteSent: boolean;
  // Delivery options
  deliverySpeed: "standard" | "rush" | "same_day";
  digitalDeliveryOptions: string[];
  physicalDeliveryOption: string | null;
  pickupLocationId: string | null;
  shippingAddress: ShippingAddress | null;
}

interface QuoteContextType {
  state: QuoteState;
  updateState: (updates: Partial<QuoteState>) => void;
  goToNextStep: () => Promise<{ success: boolean; quoteId?: string }>;
  goToPreviousStep: () => void;
  goToStep: (step: number) => void;
  validateStep: (step: number) => boolean;
  resetQuote: () => void;
  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;
  completeProcessing: () => void;
  skipToEmail: () => void;
}

const initialState: QuoteState = {
  currentStep: 1,
  quoteId: "",
  files: [],
  sourceLanguageId: "",
  targetLanguageId: "",
  intendedUseId: "",
  countryOfIssue: "",
  specialInstructions: "",
  customerType: "individual",
  companyName: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  quoteNumber: "",
  isProcessing: false,
  emailQuoteMode: false,
  emailQuoteSent: false,
  deliverySpeed: "standard",
  digitalDeliveryOptions: ["online_portal"],
  physicalDeliveryOption: null,
  pickupLocationId: null,
  shippingAddress: null,
};

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

const STORAGE_KEY = "cethos_quote_draft";

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
      console.error("Error loading quote draft:", error);
    }
    return initialState;
  });

  const supabase = useSupabase();
  const filesQueuedForUpload = useRef<UploadedFile[]>([]);

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      // Don't persist files (File objects can't be serialized)
      const { files, ...persistableState } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
    } catch (error) {
      console.error("Error saving quote draft:", error);
    }
  }, [state]);

  const updateState = (updates: Partial<QuoteState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const addFile = (file: UploadedFile) => {
    setState((prev) => ({
      ...prev,
      files: [...prev.files, file],
    }));

    // Queue file for upload (will be uploaded when moving to step 2)
    filesQueuedForUpload.current.push(file);
  };

  const removeFile = (fileId: string) => {
    setState((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== fileId),
    }));

    // Remove from upload queue
    filesQueuedForUpload.current = filesQueuedForUpload.current.filter(
      (f) => f.id !== fileId,
    );
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1: // Upload
        return state.files.length > 0;

      case 2: // Details
        return !!(
          state.sourceLanguageId &&
          state.targetLanguageId &&
          state.sourceLanguageId !== state.targetLanguageId &&
          state.intendedUseId &&
          state.countryOfIssue
        );

      case 3: // Contact
        const baseValid = !!(
          state.firstName &&
          state.lastName &&
          state.email &&
          state.phone
        );
        if (state.customerType === "business") {
          return baseValid && !!state.companyName;
        }
        return baseValid;

      case 4: // Review & Rush
        return true; // Always valid, calculations happen in component

      case 5: // Billing & Delivery
        // Require billing address to be filled
        if (!state.shippingAddress) return false;
        return !!(
          state.shippingAddress.addressLine1 &&
          state.shippingAddress.city &&
          state.shippingAddress.state &&
          state.shippingAddress.postalCode
        );

      case 6: // Payment
        return true; // Always valid (placeholder step)

      default:
        return false;
    }
  };

  const goToNextStep = async (): Promise<{
    success: boolean;
    quoteId?: string;
  }> => {
    if (!validateStep(state.currentStep)) {
      return { success: false };
    }

    if (state.currentStep >= 5) {
      return { success: false };
    }

    // Step 1 -> 2: Create quote and upload files
    if (state.currentStep === 1) {
      if (filesQueuedForUpload.current.length > 0) {
        const result = await supabase.createQuoteWithFiles(
          filesQueuedForUpload.current,
        );
        if (result) {
          filesQueuedForUpload.current = []; // Clear queue
          updateState({
            currentStep: 2,
            quoteId: result.quoteId,
            quoteNumber: result.quoteNumber,
          });
          // Return the quoteId immediately so it can be used for triggering processing
          return { success: true, quoteId: result.quoteId };
        } else {
          // Failed to create quote - don't block navigation, localStorage is backup
          updateState({ currentStep: 2 });
          return { success: true };
        }
      }
      updateState({ currentStep: 2 });
      return { success: true };
    }

    // Step 2 -> 3: Update quote details, navigate to Contact
    if (state.currentStep === 2) {
      if (state.quoteId) {
        await supabase.updateQuoteDetails(state.quoteId, {
          sourceLanguageId: state.sourceLanguageId,
          targetLanguageId: state.targetLanguageId,
          intendedUseId: state.intendedUseId,
          countryOfIssue: state.countryOfIssue,
          specialInstructions: state.specialInstructions,
        });
      }
      updateState({ currentStep: 3 });
      return { success: true };
    }

    // Step 3 (Contact) -> 4 (Review): Save contact info and enable processing screen
    if (state.currentStep === 3) {
      if (state.quoteId) {
        await supabase.createOrUpdateCustomer(state.quoteId, {
          email: state.email,
          firstName: state.firstName,
          lastName: state.lastName,
          phone: state.phone,
          customerType: state.customerType,
          companyName: state.companyName,
        });
      }
      // Enable processing screen - user will wait here for AI analysis
      updateState({ isProcessing: true });
      return { success: true };
    }

    // Step 4 (Review) -> 5 (Success): Finalize quote
    if (state.currentStep === 4) {
      if (state.quoteId) {
        // Customer already saved in step 3
        await supabase.finalizeQuote(state.quoteId, state.files.length);
      }

      updateState({ currentStep: 5 });
      return { success: true };
    }

    return { success: false };
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
      console.error("Error clearing quote draft:", error);
    }
  };

  const completeProcessing = () => {
    updateState({ isProcessing: false, currentStep: 4 });
  };

  const skipToEmail = () => {
    updateState({ isProcessing: false, currentStep: 3, emailQuoteMode: true });
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
        completeProcessing,
        skipToEmail,
      }}
    >
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuote() {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error("useQuote must be used within a QuoteProvider");
  }
  return context;
}
