import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle,
  Circle,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

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
  uploadStatus: "pending" | "uploading" | "success" | "failed";
  aiStatus?: "pending" | "processing" | "completed" | "failed" | "skipped";
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
}

interface ManualQuoteFormProps {
  onComplete?: (quoteId: string) => void;
  onCancel?: () => void;
}

export default function ManualQuoteForm({
  onComplete,
  onCancel,
}: ManualQuoteFormProps) {
  const { user, staffUser } = useAuth();
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

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
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
          customer &&
          customer.fullName &&
          (customer.email || customer.phone)
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
        {/* Step Content - Placeholder for now */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {steps[currentStep - 1].name}
          </h2>
          <p className="text-sm text-gray-600">
            {steps[currentStep - 1].description}
          </p>
        </div>

        {/* Placeholder Content */}
        <div className="text-center text-gray-500 py-12">
          Step {currentStep} content will go here
          <div className="mt-4 text-xs text-gray-400">
            {currentStep === 1 && "StaffCustomerForm component"}
            {currentStep === 2 && "Translation details form"}
            {currentStep === 3 && "DocumentManagementPanel component"}
            {currentStep === 4 && "StaffPricingForm component"}
            {currentStep === 5 && "StaffQuoteReview component"}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>

            {currentStep < steps.length ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                  canProceed()
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Final submission logic
                  console.log("Creating quote...");
                }}
                disabled={!canProceed()}
                className={`px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                  canProceed()
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                Create Quote
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
        </div>
      )}
    </div>
  );
}
