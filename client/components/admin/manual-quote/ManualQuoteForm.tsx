import { useState } from "react";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { supabase } from "@/lib/supabase";
import { CheckCircle, Circle, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import StaffCustomerForm from "./StaffCustomerForm";
import StaffTranslationDetailsForm from "./StaffTranslationDetailsForm";
import StaffFileUploadForm from "./StaffFileUploadForm";
import StaffPricingForm from "./StaffPricingForm";
import StaffPaymentReviewForm from "./StaffPaymentReviewForm";

interface CustomerData {
  id?: string;
  email?: string;
  phone?: string;
  fullName: string;
  customerType: "individual" | "business";
  companyName?: string;
}

interface QuoteData {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  intendedUseId?: string;
  countryOfIssue?: string;
  specialInstructions?: string;
}

interface FileData {
  id: string;
  name: string;
  size: number;
  file: File;
}

interface PricingData {
  translationTotal: number;
  certificationTotal: number;
  subtotal: number;
  rushFee: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  discount?: number;
  surcharge?: number;
}

interface ManualQuoteFormProps {
  onComplete?: (quoteId: string) => void;
  onCancel?: () => void;
}

export default function ManualQuoteForm({
  onComplete,
  onCancel,
}: ManualQuoteFormProps) {
  const { session } = useAdminAuthContext();
  const staffId = session?.staffId;

  console.log("🔑 [AUTH DEBUG] ManualQuoteForm auth state:");
  console.log("  - session:", session);
  console.log("  - staffId:", staffId);

  const [currentStep, setCurrentStep] = useState(1);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [quote, setQuote] = useState<QuoteData>({});
  const [files, setFiles] = useState<FileData[]>([]);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [entryPoint, setEntryPoint] = useState<
    "staff_manual" | "staff_phone" | "staff_walkin" | "staff_email"
  >("staff_manual");
  const [notes, setNotes] = useState("");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processWithAI, setProcessWithAI] = useState(true);

  const steps = [
    { id: 1, name: "Customer Info", description: "Enter customer details" },
    {
      id: 2,
      name: "Translation Details",
      description: "Select languages and options",
    },
    { id: 3, name: "Upload Files", description: "Add documents (optional)" },
    { id: 4, name: "Pricing", description: "Calculate and review pricing" },
    { id: 5, name: "Review", description: "Finalize and create quote" },
  ];

  const handleNext = async () => {
    console.log(
      "⏭️ [NAVIGATION] handleNext called - current step:",
      currentStep,
    );
    console.log("  - quoteId:", quoteId);
    console.log("  - staffId:", staffId);
    console.log("  - customer:", customer);

    // Create quote when moving to step 3 (file upload) if not already created
    if (currentStep === 2 && !quoteId && staffId && customer) {
      console.log(
        "🎯 [NAVIGATION] Moving from step 2 to 3 - creating quote first",
      );
      await createInitialQuote();
    }

    if (currentStep < steps.length) {
      console.log("⏭️ [NAVIGATION] Moving to step", currentStep + 1);
      setCurrentStep(currentStep + 1);
    }
  };

  const createInitialQuote = async () => {
    console.log("📝 [QUOTE CREATION] createInitialQuote called");
    console.log("  - staffUser?.id:", staffUser?.id);
    console.log("  - customer:", customer);

    if (!staffUser?.id || !customer) {
      console.log(
        "⏸️ [QUOTE CREATION] Missing staffUser or customer - skipping",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      console.log(
        "🌐 [QUOTE CREATION] Calling create-staff-quote edge function",
      );
      const createQuoteResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-quote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            staffId: staffUser.id,
            customerData: {
              email: customer.email,
              phone: customer.phone,
              fullName: customer.fullName,
              customerType: customer.customerType,
              companyName: customer.companyName,
            },
            quoteData: {
              sourceLanguageId: quote.sourceLanguageId,
              targetLanguageId: quote.targetLanguageId,
              intendedUseId: quote.intendedUseId,
              countryOfIssue: quote.countryOfIssue,
              specialInstructions: quote.specialInstructions,
            },
            entryPoint,
            notes,
          }),
        },
      );

      console.log(
        "📡 [QUOTE CREATION] Response status:",
        createQuoteResponse.status,
      );

      if (!createQuoteResponse.ok) {
        const error = await createQuoteResponse.json();
        console.error("❌ [QUOTE CREATION] Error response:", error);
        throw new Error(error.message || "Failed to create quote");
      }

      const quoteResult = await createQuoteResponse.json();
      console.log(
        "✅ [QUOTE CREATION] Quote created successfully:",
        quoteResult,
      );
      console.log("  - New quoteId:", quoteResult.quoteId);

      setQuoteId(quoteResult.quoteId);
      toast.success("Quote created - ready for file uploads");
    } catch (error) {
      console.error("❌ [QUOTE CREATION] Error creating quote:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create quote",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: // Customer Info
        return (
          customer && customer.fullName && (customer.email || customer.phone)
        );
      case 2: // Translation Details
        return true; // Optional fields
      case 3: // Upload Files
        return true; // Optional
      case 4: // Pricing
        return pricing && pricing.total > 0;
      case 5: // Review
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async (
    paymentMethodId: string,
    sendPaymentLink: boolean,
  ) => {
    if (!staffUser?.id || !customer || !quoteId) {
      toast.error("Missing required information");
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: Calculate and save pricing
      if (pricing) {
        const pricingResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calculate-manual-quote-pricing`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              quoteId: quoteId,
              staffId: staffUser.id,
              pricingData: pricing,
              manualOverride: true,
              useAutoCalculation: false,
            }),
          },
        );

        if (!pricingResponse.ok) {
          console.error("Failed to save pricing");
        }
      }

      // Step 2: Update payment method and mark as ready
      if (supabase) {
        const { error: updateError } = await supabase
          .from("quotes")
          .update({
            payment_method_id: paymentMethodId,
            status: "quote_ready",
          })
          .eq("id", quoteId);

        if (updateError) {
          console.error("Error updating payment method:", updateError);
          throw updateError;
        }
      } else {
        throw new Error("Supabase client not available");
      }

      // Step 3: Send payment link if needed
      if (sendPaymentLink && customer.email) {
        // TODO: Implement payment link generation via Stripe
        // This would call another edge function to create a Stripe payment link
        console.log("Payment link generation not implemented yet");
      }

      toast.success("Quote completed successfully!");

      if (onComplete) {
        onComplete(quoteId);
      }
    } catch (error) {
      console.error("Error finalizing quote:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to finalize quote",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Create Manual Quote
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Create a quote on behalf of a customer
        </p>
      </div>

      {/* Stepper */}
      <div className="mb-8">
        <nav aria-label="Progress">
          <ol className="flex items-center">
            {steps.map((step, stepIdx) => (
              <li
                key={step.id}
                className={`relative ${
                  stepIdx !== steps.length - 1 ? "pr-8 sm:pr-20 flex-1" : ""
                }`}
              >
                {/* Completed Step */}
                {step.id < currentStep ? (
                  <>
                    <div
                      className="absolute inset-0 flex items-center"
                      aria-hidden="true"
                    >
                      {stepIdx !== steps.length - 1 && (
                        <div className="h-0.5 w-full bg-indigo-600"></div>
                      )}
                    </div>
                    <div className="relative flex items-center justify-center">
                      <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-700 cursor-pointer">
                        <CheckCircle className="h-5 w-5 text-white" />
                      </div>
                      <span className="ml-2 text-xs font-medium text-indigo-600 hidden sm:block">
                        {step.name}
                      </span>
                    </div>
                  </>
                ) : step.id === currentStep ? (
                  /* Current Step */
                  <>
                    <div
                      className="absolute inset-0 flex items-center"
                      aria-hidden="true"
                    >
                      {stepIdx !== steps.length - 1 && (
                        <div className="h-0.5 w-full bg-gray-200"></div>
                      )}
                    </div>
                    <div className="relative flex items-center justify-center">
                      <div className="h-8 w-8 rounded-full border-2 border-indigo-600 bg-white flex items-center justify-center">
                        <Circle className="h-5 w-5 text-indigo-600 fill-indigo-600" />
                      </div>
                      <span className="ml-2 text-xs font-medium text-indigo-600 hidden sm:block">
                        {step.name}
                      </span>
                    </div>
                  </>
                ) : (
                  /* Upcoming Step */
                  <>
                    <div
                      className="absolute inset-0 flex items-center"
                      aria-hidden="true"
                    >
                      {stepIdx !== steps.length - 1 && (
                        <div className="h-0.5 w-full bg-gray-200"></div>
                      )}
                    </div>
                    <div className="relative flex items-center justify-center">
                      <div className="h-8 w-8 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center hover:border-gray-400">
                        <Circle className="h-5 w-5 text-gray-300" />
                      </div>
                      <span className="ml-2 text-xs font-medium text-gray-500 hidden sm:block">
                        {step.name}
                      </span>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-[400px]">
        {/* Step Header */}
        <div className="mb-6 pb-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {steps[currentStep - 1].name}
          </h2>
          <p className="text-sm text-gray-600">
            {steps[currentStep - 1].description}
          </p>
        </div>

        {/* Step 1: Customer Info */}
        {currentStep === 1 && (
          <StaffCustomerForm
            value={customer}
            onChange={setCustomer}
            entryPoint={entryPoint}
            onEntryPointChange={setEntryPoint}
          />
        )}

        {/* Step 2: Translation Details */}
        {currentStep === 2 && (
          <StaffTranslationDetailsForm value={quote} onChange={setQuote} />
        )}

        {/* Step 3: Upload Files */}
        {currentStep === 3 && (
          <StaffFileUploadForm
            quoteId={quoteId}
            staffId={staffUser?.id || ""}
            onFilesChange={setFiles}
            processWithAI={processWithAI}
            onProcessWithAIChange={setProcessWithAI}
          />
        )}

        {/* Step 4: Pricing */}
        {currentStep === 4 && (
          <StaffPricingForm
            quoteId={quoteId}
            onPricingChange={setPricing}
            initialPricing={pricing}
          />
        )}

        {/* Step 5: Review */}
        {currentStep === 5 && (
          <StaffPaymentReviewForm
            reviewData={{
              customer,
              quote,
              pricing,
              files,
              entryPoint,
              notes,
            }}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < 5 && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            )}

            {currentStep < steps.length && (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed() || isSubmitting}
                className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                  canProceed() && !isSubmitting
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Debug Info */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 p-4 bg-gray-50 rounded text-xs">
          <p>
            <strong>Current Step:</strong> {currentStep}
          </p>
          <p>
            <strong>Staff ID:</strong> {staffUser?.id}
          </p>
          <p>
            <strong>Can Proceed:</strong> {canProceed() ? "Yes" : "No"}
          </p>
          <p>
            <strong>Quote ID:</strong> {quoteId || "Not created yet"}
          </p>
        </div>
      )}
    </div>
  );
}
