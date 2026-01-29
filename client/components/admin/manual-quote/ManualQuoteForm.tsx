import { useState } from "react";
import {
  CheckCircle,
  Circle,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface ManualQuoteFormProps {
  onComplete?: (quoteId: string) => void;
  onCancel?: () => void;
}

export default function ManualQuoteForm({
  onComplete,
  onCancel,
}: ManualQuoteFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // Submit form
      setIsSubmitting(true);
      try {
        // Placeholder submission logic
        toast.success("Quote created successfully!");
        if (onComplete) {
          onComplete("placeholder-quote-id");
        }
      } catch (error) {
        toast.error("Failed to create quote");
      } finally {
        setIsSubmitting(false);
      }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create Manual Quote</h1>
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
                      currentStep >= step.id
                        ? "text-gray-900"
                        : "text-gray-500"
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
          {currentStep === 1 && <Step1Placeholder />}
          {currentStep === 2 && <Step2Placeholder />}
          {currentStep === 3 && <Step3Placeholder />}
          {currentStep === 4 && <Step4Placeholder />}
          {currentStep === 5 && <Step5Placeholder />}
        </div>

        {/* Action Buttons */}
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
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {currentStep === steps.length ? "Create Quote" : "Next"}
              {currentStep < steps.length && (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Placeholder Step Components
function Step1Placeholder() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Step 1: Customer Information</h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Placeholder Form</p>
          <p className="mt-1">Customer information form fields will be implemented here</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            type="text"
            placeholder="John Doe"
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-500 bg-gray-50 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            placeholder="john@example.com"
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-500 bg-gray-50 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer Type
          </label>
          <select
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-500 bg-gray-50 cursor-not-allowed"
          >
            <option>Select customer type...</option>
            <option>Individual</option>
            <option>Business</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Step2Placeholder() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Step 2: Translation Details</h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Placeholder Form</p>
          <p className="mt-1">Translation details form fields will be implemented here</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source Language
          </label>
          <select
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-500 bg-gray-50 cursor-not-allowed"
          >
            <option>Select source language...</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Language
          </label>
          <select
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-500 bg-gray-50 cursor-not-allowed"
          >
            <option>Select target language...</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Intended Use
          </label>
          <select
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-500 bg-gray-50 cursor-not-allowed"
          >
            <option>Select intended use...</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Step3Placeholder() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Step 3: Upload Files</h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Placeholder Form</p>
          <p className="mt-1">File upload interface will be implemented here</p>
        </div>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
        <p className="text-gray-500">File upload area placeholder</p>
        <p className="text-sm text-gray-400 mt-2">Drag and drop or click to upload files</p>
      </div>
    </div>
  );
}

function Step4Placeholder() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Step 4: Pricing</h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Placeholder Form</p>
          <p className="mt-1">Pricing calculation interface will be implemented here</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-md p-6 space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal:</span>
          <span className="text-gray-900 font-medium">$0.00</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Tax:</span>
          <span className="text-gray-900 font-medium">$0.00</span>
        </div>
        <div className="border-t border-gray-200 pt-4 flex justify-between">
          <span className="text-gray-900 font-semibold">Total:</span>
          <span className="text-gray-900 font-bold text-lg">$0.00</span>
        </div>
      </div>
    </div>
  );
}

function Step5Placeholder() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Step 5: Review & Confirm</h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Placeholder Form</p>
          <p className="mt-1">Quote review and confirmation will be shown here</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-md p-4">
          <p className="text-sm font-medium text-gray-700">Customer Details</p>
          <p className="text-sm text-gray-500 mt-2">Customer information will be displayed here</p>
        </div>

        <div className="bg-gray-50 rounded-md p-4">
          <p className="text-sm font-medium text-gray-700">Translation Details</p>
          <p className="text-sm text-gray-500 mt-2">Translation details will be displayed here</p>
        </div>

        <div className="bg-gray-50 rounded-md p-4">
          <p className="text-sm font-medium text-gray-700">Quote Summary</p>
          <p className="text-sm text-gray-500 mt-2">Quote summary will be displayed here</p>
        </div>
      </div>
    </div>
  );
}
