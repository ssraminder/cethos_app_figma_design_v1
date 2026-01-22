import { Check } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";

interface Step {
  number: number;
  label: string;
  shortLabel: string;
}

interface StepIndicatorProps {
  currentStep: number;
  className?: string;
}

const STEPS: Step[] = [
  { number: 1, label: "Upload", shortLabel: "Upload" },
  { number: 2, label: "Details", shortLabel: "Details" },
  { number: 3, label: "Contact", shortLabel: "Contact" },
  { number: 4, label: "Review", shortLabel: "Review" },
  { number: 5, label: "Billing", shortLabel: "Billing" },
  { number: 6, label: "Payment", shortLabel: "Pay" },
];

export default function StepIndicator({
  currentStep,
  className = ""
}: StepIndicatorProps) {
  const { goToStep, validateStep } = useQuote();

  const isCompleted = (stepNumber: number) => stepNumber < currentStep;
  const isActive = (stepNumber: number) => stepNumber === currentStep;

  const handleStepClick = (step: Step) => {
    // Only allow navigation to completed steps
    if (isCompleted(step.number)) {
      // Check if all previous steps are valid
      let canNavigate = true;
      for (let i = 1; i < step.number; i++) {
        if (!validateStep(i)) {
          canNavigate = false;
          break;
        }
      }

      if (canNavigate) {
        goToStep(step.number);
      }
    }
  };

  const currentStepData = STEPS.find(s => s.number === currentStep);

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop Stepper - hidden on mobile */}
      <div className="hidden sm:flex items-center justify-center max-w-3xl mx-auto mb-8 px-4">
        {STEPS.map((step, index) => (
          <div key={step.number} className="flex items-center">
            {/* Step Circle + Label */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => handleStepClick(step)}
                disabled={!isCompleted(step.number)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all relative ${
                  isCompleted(step.number)
                    ? "bg-green-500 text-white cursor-pointer hover:bg-green-600"
                    : isActive(step.number)
                      ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {isCompleted(step.number) ? (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  step.number
                )}
              </button>
              <span
                className={`mt-2 text-xs font-medium ${
                  isCompleted(step.number)
                    ? "text-green-600"
                    : isActive(step.number)
                      ? "text-blue-600"
                      : "text-gray-500"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector Line (not after last step) */}
            {index < STEPS.length - 1 && (
              <div
                className={`w-12 lg:w-16 h-1 mx-1 rounded ${
                  isCompleted(step.number) ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Mobile Stepper - visible only on mobile */}
      <div className="flex sm:hidden flex-col items-center mb-8 px-4">
        {/* Circles row */}
        <div className="flex items-center gap-1 mb-3">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className={`rounded-full transition-all ${
                isCompleted(step.number)
                  ? "w-2.5 h-2.5 bg-green-500"
                  : isActive(step.number)
                    ? "w-3 h-3 bg-blue-600 ring-2 ring-blue-100"
                    : "w-2.5 h-2.5 bg-gray-300"
              }`}
            />
          ))}
        </div>

        {/* Current step label */}
        {currentStepData && (
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">
              {currentStepData.label}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Step {currentStep} of {STEPS.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
