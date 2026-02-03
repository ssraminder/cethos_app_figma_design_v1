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
  entryPoint: string; // 'upload_form' - tracks where user started

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

  // UI State
  currentStep: 1 | 2 | 3;
  isSubmitting: boolean;
  submissionType: "manual" | "ai" | null;
  error: string | null;
  showConfirmation: boolean;
  showProcessingModal: boolean;
  showChoiceModal: boolean;
  processingStatus: "pending" | "processing" | "complete" | "failed" | null;
  hitlTriggered: boolean;
  hitlReasons: string[];
}

interface UploadContextType {
  state: UploadFormState;
  updateState: (updates: Partial<UploadFormState>) => void;
  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;
  goToNextStep: () => Promise<{ success: boolean; quoteId?: string }>;
  goToPreviousStep: () => void;
  resetUpload: () => void;
  handleAIQuoteChoice: () => Promise<void>;
  handleHumanReviewChoice: () => Promise<void>;
}

const initialState: UploadFormState = {
  quoteId: null,
  quoteNumber: null,
  entryPoint: "upload_form",
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
  showChoiceModal: false,
  processingStatus: null,
  hitlTriggered: false,
  hitlReasons: [],
};

const UploadContext = createContext<UploadContextType>({
  state: initialState,
  updateState: () => {},
  addFile: () => {},
  removeFile: () => {},
  goToNextStep: async () => ({ success: false }),
  goToPreviousStep: () => {},
  resetUpload: () => {},
  handleAIQuoteChoice: async () => {},
  handleHumanReviewChoice: async () => {},
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

    // Step 2 -> 3: Update quote details (countryId is OPTIONAL)
    if (currentStep === 2) {
      if (
        !state.sourceLanguageId ||
        !state.targetLanguageId ||
        !state.intendedUseId
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

    // Step 3: Create/update customer and auto-trigger AI processing
    if (currentStep === 3) {
      if (!state.fullName || !state.email || !state.phone) {
        return { success: false };
      }

      if (state.customerType === "business" && !state.companyName) {
        return { success: false };
      }

      if (!state.quoteId) {
        console.error("No quote ID found after Step 3");
        return { success: false };
      }

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

        console.log("✅ Customer info saved, showing choice modal");

        // Show choice modal immediately (AI processing already running in background)
        updateState({
          showChoiceModal: true,
        });

        return { success: true };
      } catch (error: any) {
        console.error("Error saving customer info:", error);
        updateState({
          error:
            error?.message ||
            "Failed to save contact information. Please try again.",
        });
        return { success: false };
      }
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
      // 1. Update quote to mark HITL required (don't change status)
      console.log("1️⃣ Updating quote to mark HITL required");
      const { error: updateError } = await supabase
        .from("quotes")
        .update({ hitl_required: true })
        .eq("id", state.quoteId);

      if (updateError) {
        console.error("❌ Failed to update hitl_required:", updateError);
        throw updateError;
      }

      // 2. Create HITL review record using fetch (like Step4Review.tsx)
      console.log("2️⃣ Creating HITL review record");
      const hitlResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quoteId: state.quoteId, // camelCase
            isCustomerRequested: true, // camelCase
            triggerReasons: ["upload_form_manual"], // camelCase, array
            customerNote:
              state.specialInstructions ||
              "Submitted via upload form - manual quote requested", // camelCase
          }),
        },
      );

      const hitlResult = await hitlResponse.json();
      if (!hitlResponse.ok || !hitlResult.success) {
        console.error("❌ HITL review creation failed:", hitlResult);
        throw new Error(hitlResult.error || "Failed to create HITL review");
      }

      // 3. Send confirmation email using Brevo template
      console.log("3️⃣ Sending confirmation email to:", state.email);

      const emailResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: state.email,
            toName: state.fullName,
            subject: "Manual Quote Request Received",
            templateId: 15, // Brevo template ID for customer notification
            params: {
              customer_name: state.fullName,
              quote_number: state.quoteNumber,
            },
          }),
        },
      );

      const emailResult = await emailResponse.json();
      if (!emailResponse.ok || !emailResult.success) {
        console.error("❌ Email sending failed:", emailResult);
        // Don't throw - email failure shouldn't prevent manual quote submission
      } else {
        console.log(
          "✅ Confirmation email sent successfully using Brevo template",
        );
      }

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
      // 1. Check if AI processing is complete and if HITL is required
      console.log("1️⃣ Checking AI processing status and HITL requirement");
      const { data: quote } = await supabase
        .from("quotes")
        .select("processing_status, hitl_required, hitl_reasons")
        .eq("id", state.quoteId)
        .single();

      // 2. If HITL is required, automatically create HITL review
      if (quote?.hitl_required || quote?.processing_status === "hitl_pending") {
        console.log("🚨 HITL required! Reasons:", quote?.hitl_reasons);
        updateState({ showProcessingModal: false });

        // Create HITL review
        console.log("2️⃣ Creating HITL review record automatically");
        const hitlResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hitl-review`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              quoteId: state.quoteId,
              isCustomerRequested: false,
              triggerReasons: quote?.hitl_reasons || ["ai_auto_triggered"],
              customerNote: state.specialInstructions || "",
            }),
          },
        );

        const hitlResult = await hitlResponse.json();
        if (!hitlResponse.ok || !hitlResult.success) {
          console.error("❌ HITL review creation failed:", hitlResult);
          throw new Error(hitlResult.error || "Failed to create HITL review");
        }

        // Send email notification using Brevo template 15
        console.log("3️⃣ Sending HITL notification email to:", state.email);
        const emailResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              to: state.email,
              toName: state.fullName,
              subject: "Manual Review Required for Your Quote",
              templateId: 15,
              params: {
                customer_name: state.fullName,
                quote_number: state.quoteNumber,
                review_reason: formatHITLReasons(quote?.hitl_reasons),
              },
            }),
          },
        );

        const emailResult = await emailResponse.json();
        if (!emailResponse.ok || !emailResult.success) {
          console.error("❌ Email sending failed:", emailResult);
        } else {
          console.log("✅ HITL notification email sent successfully");
        }

        // Show confirmation with HITL explanation
        console.log("✅ HITL review created and customer notified");
        updateState({
          showConfirmation: true,
          error: null,
          hitlTriggered: true,
          hitlReasons: quote?.hitl_reasons || [],
        });
        return;
      }

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

      // Update quote status to quote_ready
      console.log("4️⃣ Updating quote status to quote_ready");
      await supabase
        .from("quotes")
        .update({ status: "quote_ready" })
        .eq("id", state.quoteId);

      // Redirect to main quote flow review page
      console.log(
        "5️⃣ Redirecting to review page:",
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

  // Helper function to format HITL reasons for customer display
  const formatHITLReasons = (reasons: string[] | null): string => {
    if (!reasons || reasons.length === 0) {
      return "Additional review needed for quality assurance";
    }

    const reasonMap: Record<string, string> = {
      high_value_order:
        "Your quote exceeds our automatic processing threshold and requires specialist review",
      complex_document:
        "Your document is complex and requires expert verification",
      low_confidence: "Additional verification needed to ensure accuracy",
      unusual_language_pair:
        "This language combination requires specialist attention",
      special_certification: "Special certification requirements detected",
    };

    const formatted = reasons
      .map((r) => reasonMap[r] || r.replace(/_/g, " "))
      .join(", ");

    return formatted;
  };

  // Handler for "AI Instant Quote" choice - redirect to main quote flow Step 4
  const handleAIQuoteChoice = async () => {
    if (!state.quoteId) {
      console.error("No quote ID found for AI quote choice");
      return;
    }

    console.log(
      "🤖 AI Instant Quote selected, redirecting to main quote flow Step 4",
    );

    updateState({ showChoiceModal: false, isSubmitting: true });

    try {
      // Update quote status to quote_ready
      await supabase
        .from("quotes")
        .update({ status: "quote_ready" })
        .eq("id", state.quoteId);

      // Redirect to main quote flow Step 4 (NOT /quote/{id}/review)
      window.location.href = `/quote?step=4&quote_id=${state.quoteId}`;
    } catch (error) {
      console.error("Error in AI quote choice:", error);
      updateState({
        error: "Failed to proceed. Please try again.",
        isSubmitting: false,
        showChoiceModal: true,
      });
    }
  };

  // Handler for "Request Human Review" choice - create HITL and show confirmation
  const handleHumanReviewChoice = async () => {
    if (!state.quoteId) {
      console.error("No quote ID found for human review choice");
      return;
    }

    console.log("👤 Human Review requested by customer");

    updateState({ showChoiceModal: false, isSubmitting: true });

    try {
      // 1. Update quote to require HITL
      console.log("1️⃣ Updating quote to require HITL");
      await supabase
        .from("quotes")
        .update({
          status: "hitl_pending",
          hitl_required: true,
          hitl_reasons: ["customer_requested"],
          hitl_requested_at: new Date().toISOString(),
        })
        .eq("id", state.quoteId);

      // 2. Create HITL review record
      console.log("2️⃣ Creating HITL review record");
      const hitlResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quoteId: state.quoteId,
            isCustomerRequested: true,
            triggerReasons: ["customer_requested"],
            customerNote: state.specialInstructions || "",
          }),
        },
      );

      const hitlResult = await hitlResponse.json();
      if (!hitlResponse.ok || !hitlResult.success) {
        throw new Error(hitlResult.error || "Failed to create HITL review");
      }

      // 3. Send confirmation email to customer (Brevo Template #15)
      console.log("3️⃣ Sending confirmation email to customer");
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: state.email,
            toName: state.fullName,
            subject: "Manual Review Request Received",
            templateId: 15,
            params: {
              customer_name: state.fullName,
              quote_number: state.quoteNumber,
              review_reason: "You requested a human review for accuracy",
            },
          }),
        },
      );

      // 4. Send staff notification email
      console.log("4️⃣ Sending staff notification email");
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: "support@cethos.com", // Update with actual staff email
            subject: `New HITL Review Request - ${state.quoteNumber}`,
            templateId: "staff-new-hitl", // Staff notification template
            params: {
              quote_number: state.quoteNumber,
              customer_name: state.fullName,
              customer_email: state.email,
              document_count: state.files.length,
            },
          }),
        },
      );

      // 5. Navigate to confirmation page
      console.log(
        "✅ Human review request complete, redirecting to confirmation",
      );
      window.location.href = `/upload/confirmation?quote_id=${state.quoteId}`;
    } catch (error: any) {
      console.error("Error in human review choice:", error);
      updateState({
        error:
          error?.message || "Failed to request human review. Please try again.",
        isSubmitting: false,
        showChoiceModal: true,
      });
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
        handleAIQuoteChoice,
        handleHumanReviewChoice,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  return useContext(UploadContext);
}
