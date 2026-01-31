import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
  useCallback,
} from "react";
import { useSupabase } from "@/hooks/useSupabase";
import { supabase, isSupabaseEnabled } from "@/lib/supabase";

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
  entryPoint: string; // 'order_form' - tracks where user started
  files: UploadedFile[];
  sourceLanguageId: string;
  targetLanguageId: string;
  intendedUseId: string;
  serviceProvince: string;
  countryOfIssue: string;
  countryId: string;
  certificationTypeId: string;
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
  turnaroundType: "standard" | "rush" | "same_day";
  turnaroundFee: number;
  deliveryFee: number;
  digitalDeliveryOptions: string[];
  physicalDeliveryOption: string | null;
  pickupLocationId: string | null;
  billingAddress: ShippingAddress | null;
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
  entryPoint: "order_form",
  files: [],
  sourceLanguageId: "",
  targetLanguageId: "",
  intendedUseId: "",
  serviceProvince: "",
  countryOfIssue: "",
  countryId: "",
  certificationTypeId: "",
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
  turnaroundType: "standard",
  turnaroundFee: 0,
  deliveryFee: 0,
  digitalDeliveryOptions: ["online_portal"],
  physicalDeliveryOption: null,
  pickupLocationId: null,
  billingAddress: null,
  shippingAddress: null,
};

const defaultContext: QuoteContextType = {
  state: initialState,
  updateState: () => {},
  goToNextStep: async () => ({ success: false }),
  goToPreviousStep: () => {},
  goToStep: () => {},
  validateStep: () => false,
  resetQuote: () => {},
  addFile: () => {},
  removeFile: () => {},
  completeProcessing: () => {},
  skipToEmail: () => {},
};
// New change
const QuoteContext = createContext<QuoteContextType>(defaultContext);
const STORAGE_KEY = "cethos_quote_draft";
const UPLOAD_STORAGE_KEY = "cethos_upload_draft";

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<QuoteState>(() => {
    // Check for quote_id in URL FIRST - takes priority over localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuoteId = urlParams.get('quote_id');
    
    if (urlQuoteId) {
      console.log('🔗 Quote link detected in URL - clearing localStorage');
      // Clear old quote data from localStorage BEFORE loading
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(UPLOAD_STORAGE_KEY);
      // Return initial state with the URL quote ID
      // The useEffect will load full quote data from DB
      return { ...initialState, quoteId: urlQuoteId };
    }

    // No URL quote_id - load from localStorage as usual
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
// new change ends
  const supabaseHook = useSupabase();
  const filesQueuedForUpload = useRef<UploadedFile[]>([]);
  const urlQuoteLoadedRef = useRef<boolean>(false);

  // Helper to determine which step to show based on quote status
  const determineStepFromQuote = useCallback((quote: any): number => {
    // If quote is ready for payment, go to step 5 (billing)
    if (quote.status === 'quote_ready' || quote.status === 'awaiting_payment') {
      return 5;
    }
    // If processing or pending, go to step 4 (review)
    if (quote.processing_status === 'processing' || quote.processing_status === 'pending') {
      return 4;
    }
    // If has customer info, go to step 4
    if (quote.customer_email || quote.customer_id) {
      return 4;
    }
    // If has language selection, go to step 3
    if (quote.source_language_id && quote.target_language_id) {
      return 3;
    }
    // Default to step 2
    return 2;
  }, []);

  // Load quote from database when URL has quote_id parameter
  const loadQuoteFromDatabase = useCallback(async (quoteId: string, token?: string | null) => {
    if (!isSupabaseEnabled() || !supabase) {
      console.log('📝 Supabase not configured - cannot load quote from URL');
      return;
    }

    try {
      // If token is provided, validate it first
      if (token) {
        const { data: magicLink, error: tokenError } = await supabase
          .from('customer_magic_links')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('token', token)
          .eq('is_used', false)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (tokenError || !magicLink) {
          console.error('❌ Invalid or expired token');
          // Still try to load the quote - they might be able to view it
        } else {
          console.log('✅ Valid magic link token');
          // Mark token as used (optional - depends on business logic)
        }
      }

      // Fetch quote data with related files and customer info
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select(`
          *,
          quote_files (
            id,
            original_filename,
            file_size,
            mime_type,
            storage_path,
            ai_processing_status
          ),
          customers (
            id,
            email,
            full_name,
            phone,
            company_name,
            customer_type
          )
        `)
        .eq('id', quoteId)
        .single();

      if (quoteError || !quote) {
        console.error('❌ Failed to load quote:', quoteError);
        return;
      }

      console.log('✅ Quote loaded from database:', quote.quote_number);

      // Parse customer name into first/last name if available
      let firstName = '';
      let lastName = '';
      if (quote.customers?.full_name) {
        const nameParts = quote.customers.full_name.split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
      }

      // Determine the current step based on quote status
      const currentStep = determineStepFromQuote(quote);

      // Update context state with quote data
      setState(prev => ({
        ...prev,
        quoteId: quote.id,
        quoteNumber: quote.quote_number || '',
        sourceLanguageId: quote.source_language_id || '',
        targetLanguageId: quote.target_language_id || '',
        intendedUseId: quote.intended_use_id || '',
        serviceProvince: quote.service_province || '',
        countryOfIssue: quote.country_of_issue || '',
        countryId: quote.country_id || '',
        certificationTypeId: quote.certification_type_id || '',
        specialInstructions: quote.special_instructions || '',
        // Customer info
        email: quote.customers?.email || '',
        firstName: firstName,
        lastName: lastName,
        phone: quote.customers?.phone || '',
        companyName: quote.customers?.company_name || '',
        customerType: quote.customers?.customer_type || 'individual',
        // Files - map to expected format (without actual File objects)
        files: quote.quote_files?.map((f: any) => ({
          id: f.id,
          name: f.original_filename,
          size: f.file_size,
          type: f.mime_type,
          file: null as any, // File objects can't be restored from DB
        })) || [],
        // Turnaround and delivery options from quote
        turnaroundType: quote.turnaround_type || 'standard',
        turnaroundFee: quote.turnaround_fee || 0,
        deliveryFee: quote.delivery_fee || 0,
        // Set the determined step
        currentStep: currentStep,
        // If quote is in processing status, show processing screen
        isProcessing: quote.processing_status === 'processing' || quote.processing_status === 'pending',
      }));

    } catch (error) {
      console.error('❌ Error loading quote from URL:', error);
    }
  }, [determineStepFromQuote]);

  // Check for quote_id in URL - this takes priority over localStorage
  useEffect(() => {
    // Only run once on mount
    if (urlQuoteLoadedRef.current) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlQuoteId = urlParams.get('quote_id');
    const urlToken = urlParams.get('token');

    if (urlQuoteId) {
      urlQuoteLoadedRef.current = true;
      console.log('🔗 Quote link detected - clearing localStorage and loading quote:', urlQuoteId);

      // Clear old quote data from localStorage
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(UPLOAD_STORAGE_KEY);

      // Load the quote from database
      loadQuoteFromDatabase(urlQuoteId, urlToken);
    }
  }, [loadQuoteFromDatabase]);

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
          state.countryId
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
        // Component-level validation handles required fields
        return true;

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

    if (state.currentStep >= 6) {
      return { success: false };
    }

    // Reset scroll position on step transition
    window.scrollTo(0, 0);

    // Step 1 -> 2: Create quote and upload files
    if (state.currentStep === 1) {
      if (filesQueuedForUpload.current.length > 0) {
        const result = await supabaseHook.createQuoteWithFiles(
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
        await supabaseHook.updateQuoteDetails(state.quoteId, {
          sourceLanguageId: state.sourceLanguageId,
          targetLanguageId: state.targetLanguageId,
          intendedUseId: state.intendedUseId,
          serviceProvince: state.serviceProvince,
          countryOfIssue: state.countryOfIssue,
          countryId: state.countryId,
          certificationTypeId: state.certificationTypeId,
          specialInstructions: state.specialInstructions,
        });
      }
      updateState({ currentStep: 3 });
      return { success: true };
    }

    // Step 3 (Contact) -> 4 (Review & Rush): Save contact info and enable processing screen
    if (state.currentStep === 3) {
      if (state.quoteId) {
        await supabaseHook.createOrUpdateCustomer(state.quoteId, {
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

    // Step 4 (Review & Rush) -> 5 (Billing & Delivery)
    // Rush selection and pricing already saved in Step4ReviewRush component
    if (state.currentStep === 4) {
      updateState({ currentStep: 5 });
      return { success: true };
    }

    // Step 5 (Billing & Delivery) -> 6 (Payment)
    // Billing address and delivery options already saved in Step5BillingDelivery component
    if (state.currentStep === 5) {
      updateState({ currentStep: 6 });
      return { success: true };
    }

    // Step 6 (Payment) -> Complete
    // Payment processing would happen here
    if (state.currentStep === 6) {
      // For now, just finalize the quote
      if (state.quoteId) {
        await supabaseHook.finalizeQuote(state.quoteId, state.files.length);
      }
      // Could navigate to success page or show confirmation
      return { success: true };
    }

    return { success: false };
  };

  const goToPreviousStep = () => {
    if (state.currentStep > 1) {
      // Reset scroll position on step transition
      window.scrollTo(0, 0);
      updateState({ currentStep: state.currentStep - 1 });
    }
  };

  const goToStep = (step: number) => {
    // Only allow navigation to completed steps or the next step
    if (step >= 1 && step <= 6) {
      // Check if all previous steps are valid
      let canNavigate = true;
      for (let i = 1; i < step; i++) {
        if (!validateStep(i)) {
          canNavigate = false;
          break;
        }
      }

      if (canNavigate) {
        // Reset scroll position on step transition
        window.scrollTo(0, 0);
        updateState({ currentStep: step });
      }
    }
  };

  const resetQuote = () => {
    setState(initialState);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("cethos_quote_id");
      localStorage.removeItem("cethos_quote_state");
    } catch (error) {
      console.error("Error clearing quote draft:", error);
    }

    window.location.href = "/quote";
  };

  const completeProcessing = () => {
    updateState({ isProcessing: false, currentStep: 4 });
  };

  const skipToEmail = () => {
    updateState({
      isProcessing: false,
      emailQuoteSent: true  // Show EmailQuoteConfirmation instead of going back to Step 3
    });
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
  return useContext(QuoteContext);
}
