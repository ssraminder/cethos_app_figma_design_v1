import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useSupabase } from "@/hooks/useSupabase";
import { supabase } from "@/lib/supabase";
import type { UploadedFile } from "./QuoteContext";

// Upload Form State Interface
export interface UploadFormState {
  // Quote
  quoteId: string | null;
  quoteNumber: string | null;

  // Step 1: Files
  files: UploadedFile[];

  // Step 2: Translation Details
  sourceLanguageId: string;
  targetLanguageId: string;
  intendedUseId: string;
  serviceProvince: string;
  countryOfIssue: string;
  countryId: string;
  certificationTypeId: string;
  specialInstructions: string;

  // Step 3: Contact
  fullName: string;
  email: string;
  phone: string;
  customerType: "individual" | "business";
  companyName: string;

  // Step 4: UI State
  currentStep: 1 | 2 | 3 | 4;
  isSubmitting: boolean;
  submissionType: "manual" | "ai" | null;
  error: string | null;
  showConfirmation: boolean;
  showProcessingModal: boolean;
  processingStatus: "pending" | "processing" | "complete" | "failed" | null;
}

interface UploadContextType {
  state: UploadFormState;
  updateState: (updates: Partial<UploadFormState>) => void;
  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;
  goToNextStep: () => Promise<{ success: boolean; quoteId?: string }>;
  goToPreviousStep: () => void;
  resetUpload: () => void;
  submitManualQuote: () => Promise<void>;
  submitAIQuote: () => Promise<void>;
}

const initialState: UploadFormState = {
  quoteId: null,
  quoteNumber: null,
  files: [],
  sourceLanguageId: "",
  targetLanguageId: "",
  intendedUseId: "",
  serviceProvince: "",
  countryOfIssue: "",
  countryId: "",
  certificationTypeId: "",
  specialInstructions: "",
  fullName: "",
  email: "",
  phone: "",
  customerType: "individual",
  companyName: "",
  currentStep: 1,
  isSubmitting: false,
  submissionType: null,
  error: null,
  showConfirmation: false,
  showProcessingModal: false,
  processingStatus: null,
};

const UploadContext = createContext<UploadContextType>({
  state: initialState,
  updateState: () => {},
  addFile: () => {},
  removeFile: () => {},
  goToNextStep: async () => ({ success: false }),
  goToPreviousStep: () => {},
  resetUpload: () => {},
  submitManualQuote: async () => {},
  submitAIQuote: async () => {},
});

const STORAGE_KEY = "cethos_upload_draft";

export function UploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadFormState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, files: [] };
      }
    } catch (error) {
      console.error("Error loading upload draft:", error);
    }
    return initialState;
  });

  const supabaseHook = useSupabase();

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      const { files, ...persistableState } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
    } catch (error) {
      console.error("Error saving upload draft:", error);
    }
  }, [state]);

  const updateState = (updates: Partial<UploadFormState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const addFile = (file: UploadedFile) => {
    setState((prev) => ({
      ...prev,
      files: [...prev.files, file],
    }));
  };

  const removeFile = (fileId: string) => {
    setState((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== fileId),
    }));
  };

  const goToNextStep = async (): Promise<{
    success: boolean;
    quoteId?: string;
  }> => {
    const { currentStep } = state;

    // Step 1 -> 2: Create quote and upload files
    if (currentStep === 1) {
      if (state.files.length === 0) return { success: false };

      try {
        // Create quote
        const result = await supabaseHook.createQuoteWithFiles(state.files);

        if (!result) {
          console.error("Failed to create quote");
          return { success: false };
        }

        // Update quote with entry_point tracking
        if (supabase) {
          await supabase
            .from("quotes")
            .update({ entry_point: "upload_form" })
            .eq("id", result.quoteId);
        }

        // Update state and navigate immediately
        updateState({
          quoteId: result.quoteId,
          quoteNumber: result.quoteNumber,
          currentStep: 2,
          processingStatus: "processing",
        });

        // Return the quoteId so it can be used to trigger processing
        return { success: true, quoteId: result.quoteId };
      } catch (error) {
        console.error("Error in Step 1:", error);
        updateState({ error: "Failed to upload files. Please try again." });
        return { success: false };
      }
    }

    // Step 2 -> 3: Update quote details
    if (currentStep === 2) {
      if (
        !state.sourceLanguageId ||
        !state.targetLanguageId ||
        !state.intendedUseId ||
        !state.countryId
      ) {
        return { success: false };
      }

      if (state.quoteId) {
        try {
          const updateData = {
            sourceLanguageId: state.sourceLanguageId,
            targetLanguageId: state.targetLanguageId,
            intendedUseId: state.intendedUseId,
            serviceProvince: state.serviceProvince,
            countryOfIssue: state.countryOfIssue,
            countryId: state.countryId,
            certificationTypeId: state.certificationTypeId,
            specialInstructions: state.specialInstructions,
          };

          console.log("📝 Updating quote details:", {
            quoteId: state.quoteId,
            data: updateData,
          });

          const success = await supabaseHook.updateQuoteDetails(
            state.quoteId,
            updateData,
          );

          if (!success) {
            console.error(
              "❌ Failed to update quote details - updateQuoteDetails returned false",
            );
            updateState({
              error:
                "Failed to save translation details. Please check your selections and try again.",
            });
            return { success: false };
          }

          console.log(
            "✅ Quote details updated successfully, proceeding to step 3",
          );
        } catch (error: any) {
          console.error("❌ Error updating quote details:", {
            message: error?.message || "Unknown error",
            details: error?.details || "No details",
            hint: error?.hint || "No hint",
            code: error?.code || "No code",
            full: error,
          });
          updateState({
            error:
              "Failed to save translation details. Please check your selections and try again.",
          });
          return { success: false };
        }
      }

      updateState({ currentStep: 3, error: null });
      return { success: true };
    }

    // Step 3 -> 4: Create/update customer
    if (currentStep === 3) {
      if (!state.fullName || !state.email || !state.phone) {
        return { success: false };
      }

      if (state.customerType === "business" && !state.companyName) {
        return { success: false };
      }

      if (state.quoteId) {
        try {
          // Split fullName into firstName and lastName
          const nameParts = state.fullName.trim().split(" ");
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";

          await supabaseHook.createOrUpdateCustomer(state.quoteId, {
            email: state.email,
            firstName,
            lastName,
            phone: state.phone,
            customerType: state.customerType,
            companyName: state.companyName,
          });
        } catch (error) {
          console.error("Error creating customer:", error);
        }
      }

      updateState({ currentStep: 4 });
      return { success: true };
    }

    return { success: false };
  };

  const goToPreviousStep = () => {
    if (state.currentStep > 1) {
      updateState({ currentStep: (state.currentStep - 1) as 1 | 2 | 3 | 4 });
    }
  };

  const resetUpload = () => {
    setState(initialState);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing upload draft:", error);
    }

    // Redirect to upload page
    window.location.href = "/upload";
  };

  // Wait for AI processing to complete
  const waitForProcessingComplete = async (
    quoteId: string,
    timeoutMs: number,
  ): Promise<boolean> => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (!supabase) return false;

      const { data } = await supabase
        .from("quotes")
        .select("processing_status")
        .eq("id", quoteId)
        .single();

      if (data?.processing_status === "quote_ready") {
        return true;
      }

      if (data?.processing_status === "failed") {
        throw new Error("Processing failed");
      }

      if (data?.processing_status === "hitl_pending") {
        throw new Error("Manual review required");
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return false; // Timeout
  };

  const submitManualQuote = async () => {
    if (!state.quoteId) {
      updateState({
        error: "No quote ID found. Please start over from Step 1.",
      });
      console.error("submitManualQuote: Missing quoteId");
      return;
    }

    if (!supabase) {
      updateState({
        error: "Database connection not available. Please try again.",
      });
      console.error("submitManualQuote: Supabase not initialized");
      return;
    }

    updateState({ isSubmitting: true, submissionType: "manual", error: null });

    console.log(
      "📝 Starting manual quote submission for quote:",
      state.quoteId,
    );

    try {
      // 1. Update quote status to hitl_pending
      console.log("1️⃣ Updating quote status to hitl_pending");
      await supabase
        .from("quotes")
        .update({ status: "hitl_pending" })
        .eq("id", state.quoteId);

      // 2. Create HITL review record
      console.log("2️⃣ Creating HITL review record");
      await supabase.functions.invoke("create-hitl-review", {
        body: {
          quote_id: state.quoteId,
          is_customer_requested: true,
          trigger_reasons: ["upload_form_manual"],
          customer_note:
            state.specialInstructions ||
            "Submitted via upload form - manual quote requested",
        },
      });

      // 3. Send confirmation email
      console.log("3️⃣ Sending confirmation email to:", state.email);
      await supabase.functions.invoke("send-email", {
        body: {
          template: "manual_quote_requested",
          to: state.email,
          data: {
            customer_name: state.fullName,
            quote_number: state.quoteNumber,
          },
        },
      });

      // 4. Show confirmation view
      console.log("✅ Manual quote submission complete!");
      updateState({ showConfirmation: true });
    } catch (error) {
      console.error("❌ Error submitting manual quote:", error);
      updateState({
        error:
          "Something went wrong submitting your request. Please try again or contact support.",
      });
    } finally {
      updateState({ isSubmitting: false });
    }
  };

  const submitAIQuote = async () => {
    if (!state.quoteId) {
      updateState({
        error: "No quote ID found. Please start over from Step 1.",
      });
      console.error("submitAIQuote: Missing quoteId");
      return;
    }

    if (!supabase) {
      updateState({
        error: "Database connection not available. Please try again.",
      });
      console.error("submitAIQuote: Supabase not initialized");
      return;
    }

    updateState({ isSubmitting: true, submissionType: "ai", error: null });

    console.log("🤖 Starting AI quote submission for quote:", state.quoteId);

    try {
      // 1. Check if AI processing is complete
      console.log("1️⃣ Checking AI processing status");
      const { data: quote } = await supabase
        .from("quotes")
        .select("processing_status")
        .eq("id", state.quoteId)
        .single();

      if (quote?.processing_status !== "quote_ready") {
        // Show loading modal
        console.log(
          "⏳ Processing not complete, showing modal. Status:",
          quote?.processing_status,
        );
        updateState({ showProcessingModal: true });

        // Wait for processing (60 second timeout)
        console.log("⏱️ Waiting for processing to complete (60s timeout)");
        const completed = await waitForProcessingComplete(state.quoteId, 60000);

        if (!completed) {
          console.log("⏰ Processing timeout!");
          throw new Error("Processing timeout");
        }

        console.log("✅ Processing complete!");
        updateState({ showProcessingModal: false });
      } else {
        console.log("✅ Processing already complete (status: quote_ready)");
      }

      // 2. Update quote status to quote_ready
      console.log("2️⃣ Updating quote status to quote_ready");
      await supabase
        .from("quotes")
        .update({ status: "quote_ready" })
        .eq("id", state.quoteId);

      // 3. Redirect to main quote flow Step 4
      console.log(
        "3️⃣ Redirecting to review page:",
        `/quote/${state.quoteId}/review`,
      );
      window.location.href = `/quote/${state.quoteId}/review`;
    } catch (error) {
      console.error("❌ Error submitting AI quote:", error);

      updateState({
        showProcessingModal: false,
        error:
          "AI processing is taking longer than expected. Would you like to request a manual quote instead?",
      });
    } finally {
      updateState({ isSubmitting: false });
    }
  };

  return (
    <UploadContext.Provider
      value={{
        state,
        updateState,
        addFile,
        removeFile,
        goToNextStep,
        goToPreviousStep,
        resetUpload,
        submitManualQuote,
        submitAIQuote,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  return useContext(UploadContext);
}
