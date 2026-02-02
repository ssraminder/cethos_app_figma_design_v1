import { useState } from "react";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { supabase } from "@/lib/supabase";
import { CheckCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import StaffCustomerForm from "./StaffCustomerForm";
import StaffTranslationDetailsForm from "./StaffTranslationDetailsForm";
import StaffFileUploadForm, { FileWithAnalysis } from "./StaffFileUploadForm";
import StaffPricingForm, { QuotePricing } from "./StaffPricingForm";
import StaffReviewForm from "./StaffReviewForm";

interface CustomerData {
  id?: string;
  email: string;
  phone: string;
  fullName: string;
  customerType: "individual" | "business";
  companyName?: string;
  quoteSourceId?: string;
}

interface QuoteData {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  intendedUseId?: string;
  countryOfIssue?: string;
  specialInstructions?: string;
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

  const [currentStep, setCurrentStep] = useState(1);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [quote, setQuote] = useState<QuoteData>({});
  const [files, setFiles] = useState<FileWithAnalysis[]>([]);
  const [processWithAI, setProcessWithAI] = useState(true);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pricing, setPricing] = useState<QuotePricing>({
    filePrices: [],
    documentSubtotal: 0,
    isRush: false,
    rushFee: 0,
    deliveryOptionId: undefined,
    deliveryFee: 0,
    hasDiscount: false,
    discountAmount: 0,
    hasSurcharge: false,
    surchargeAmount: 0,
    preTaxTotal: 0,
    taxRate: 0.05,
    taxAmount: 0,
    total: 0,
  });
  const [staffNotes, setStaffNotes] = useState("");
  
  // Pricing refresh key - increments to trigger re-fetch in StaffPricingForm
  const [pricingRefreshKey, setPricingRefreshKey] = useState(0);

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

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!customer) return false;
        // Full name is required, phone is optional
        if (!customer.fullName?.trim()) {
          toast.error("Please enter the customer's full name");
          return false;
        }
        // At least email is required (phone is optional)
        if (!customer.email?.trim()) {
          toast.error("Please enter the customer's email address");
          return false;
        }
        if (customer.customerType === "business" && !customer.companyName) {
          toast.error("Company name is required for business customers");
          return false;
        }
        // Quote source is required
        if (!customer.quoteSourceId) {
          toast.error("Please select how the customer contacted us");
          return false;
        }
        return true;

      case 2:
        if (
          !quote.sourceLanguageId ||
          !quote.targetLanguageId ||
          !quote.intendedUseId
        ) {
          toast.error("Please fill in all required translation details");
          return false;
        }
        if (quote.sourceLanguageId === quote.targetLanguageId) {
          toast.error("Source and target languages must be different");
          return false;
        }
        return true;

      case 3:
        // Files are optional, always valid
        return true;

      case 4:
        // Pricing validation will be added when we implement Step 4
        return true;

      case 5:
        return true;

      default:
        return true;
    }
  };

  const createInitialQuote = async () => {
    if (!staffId || !customer) {
      toast.error("Missing required information");
      return null;
    }

    console.log("📝 [CREATE QUOTE] Creating initial quote");
    console.log("  - Staff ID:", staffId);
    console.log("  - Customer:", customer);
    console.log("  - Quote data:", quote);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-quote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            staffId,
            customerData: customer,
            quoteData: quote,
            quoteSourceId: customer.quoteSourceId,
            entryPoint: "staff_manual",
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ [CREATE QUOTE] Error:", errorText);
        throw new Error("Failed to create quote");
      }

      const result = await response.json();
      console.log("✅ [CREATE QUOTE] Success:", result);

      setQuoteId(result.quoteId);
      toast.success("Quote created - you can now upload files");
      return result.quoteId;
    } catch (error) {
      console.error("❌ [CREATE QUOTE] Error:", error);
      toast.error("Failed to create quote");
      return null;
    }
  };

  const handleNext = async () => {
    // Validate current step before proceeding
    if (!validateStep(currentStep)) {
      return;
    }

    // Create quote when moving from Step 2 → Step 3
    if (currentStep === 2 && !quoteId && staffId && customer) {
      const newQuoteId = await createInitialQuote();
      if (!newQuoteId) {
        return; // Don't proceed if quote creation failed
      }
    }

    // Refresh pricing data when moving from Step 3 to Step 4
    if (currentStep === 3) {
      setPricingRefreshKey((prev) => prev + 1);
    }

    // Move to next step
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleFinalSubmit = async (sendNotification: boolean) => {
    if (!staffId || !customer || !quoteId) {
      toast.error("Missing required information");
      return;
    }

    setIsSubmitting(true);
    try {
      console.log("📝 [FINAL SUBMIT] Finalizing quote");
      console.log("  - Quote ID:", quoteId);
      console.log("  - Pricing:", pricing);
      console.log("  - Staff Notes:", staffNotes);

      // Call the edge function to finalize the quote with pricing data
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finalize-staff-quote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            staffId,
            quoteId,
            customerId: customer.id,
            pricing,
            staffNotes,
            sendNotification,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [FINAL SUBMIT] Error:", errorData);
        throw new Error(errorData.error || "Failed to finalize quote");
      }

      const result = await response.json();
      console.log("✅ [FINAL SUBMIT] Success:", result);

      toast.success("Quote created successfully!");
      if (onComplete) {
        onComplete(quoteId);
      }
    } catch (error) {
      console.error("❌ [FINAL SUBMIT] Error:", error);
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

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  // Callback to refresh pricing when analysis/certifications change in Step 3
  const handlePricingRefresh = () => {
    console.log("🔄 [PRICING REFRESH] Triggered from file upload form");
    setPricingRefreshKey((prev) => prev + 1);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        // Phone is optional - only need fullName, email, and quoteSourceId
        return (
          customer && customer.email?.trim() && customer.fullName?.trim() && customer.quoteSourceId
        );
      case 2:
        return (
          quote.sourceLanguageId &&
          quote.targetLanguageId &&
          quote.intendedUseId
        );
      case 3:
        return true; // Files are optional
      case 4:
        return true; // Pricing validation
      case 5:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Create Manual Quote
          </h1>
          <p className="text-gray-600 mt-2">
            Follow the steps below to create a new quote for a customer
          </p>
        </div>

        {/* Steps Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                      currentStep >= step.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      <span className="font-semibold">{step.id}</span>
                    )}
                  </div>
                  <p
                    className={`text-sm font-medium text-center ${
                      currentStep >= step.id ? "text-gray-900" : "text-gray-500"
                    }`}
                  >
                    {step.name}
                  </p>
                  <p className="text-xs text-gray-500 text-center mt-1">
                    {step.description}
                  </p>
                </div>

                {index < steps.length - 1 && (
                  <div
                    className={`h-1 flex-1 mx-2 transition-colors ${
                      currentStep > step.id ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          {currentStep === 1 && (
            <StaffCustomerForm value={customer} onChange={setCustomer} />
          )}

          {currentStep === 2 && (
            <StaffTranslationDetailsForm value={quote} onChange={setQuote} />
          )}

          {currentStep === 3 && staffId && (
            <StaffFileUploadForm
              quoteId={quoteId}
              staffId={staffId}
              value={files}
              onChange={setFiles}
              processWithAI={processWithAI}
              onProcessWithAIChange={setProcessWithAI}
              onPricingRefresh={handlePricingRefresh}
            />
          )}

          {currentStep === 4 && quoteId && (
            <StaffPricingForm
              key={`pricing-${pricingRefreshKey}`}
              quoteId={quoteId}
              files={files}
              value={pricing}
              onChange={setPricing}
              refreshKey={pricingRefreshKey}
            />
          )}

          {currentStep === 5 && (
            <StaffReviewForm
              customer={customer}
              quote={quote}
              files={files}
              pricing={pricing}
              staffNotes={staffNotes}
              onStaffNotesChange={setStaffNotes}
              onEditSection={(section) => {
                switch (section) {
                  case "customer":
                    setCurrentStep(1);
                    break;
                  case "translation":
                    setCurrentStep(2);
                    break;
                  case "files":
                    setCurrentStep(3);
                    break;
                  case "pricing":
                    setCurrentStep(4);
                    break;
                }
              }}
              onPrevious={() => setCurrentStep(4)}
              onSubmit={handleFinalSubmit}
              submitting={isSubmitting}
            />
          )}
        </div>

        {/* Action Buttons - Hidden on Step 5 (Review) as StaffReviewForm has its own buttons */}
        {currentStep !== 5 && (
          <div className="flex items-center justify-between">
            <button
              onClick={handleCancel}
              className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                disabled={currentStep === 1 || isSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              <button
                onClick={handleNext}
                disabled={!canProceed() || isSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {currentStep === steps.length ? "Create Quote" : "Next"}
                {currentStep < steps.length && (
                  <ChevronRight className="w-4 h-4" />
                )}
                {isSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2"></div>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
