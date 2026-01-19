import { Check } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";

interface Step {
  number: number;
  label: string;
}

interface StepIndicatorProps {
  currentStep: number;
}

const steps: Step[] = [
  { number: 1, label: "Upload" },
  { number: 2, label: "Details" },
  { number: 3, label: "Review" },
  { number: 4, label: "Contact" },
];

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
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

  return (
    <div className="w-full max-w-[520px] mx-auto mb-8 px-4">
      <div className="flex items-center justify-between relative">
        {steps.map((step, index) => (
          <div
            key={step.number}
            className="flex flex-col items-center relative flex-1"
          >
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`absolute left-[calc(50%+16px)] top-4 right-[calc(-100%+16px)] h-0.5 z-0 ${
                  isCompleted(step.number) ? "bg-green-500" : "bg-cethos-border"
                }`}
              />
            )}

            {/* Step circle */}
            <button
              onClick={() => handleStepClick(step)}
              disabled={!isCompleted(step.number)}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all relative z-10 ${
                isCompleted(step.number)
                  ? "bg-green-500 text-white border-2 border-transparent cursor-pointer hover:bg-green-600"
                  : isActive(step.number)
                    ? "bg-cethos-blue text-white border-2 border-transparent"
                    : "bg-white text-cethos-slate-light border-2 border-cethos-border"
              }`}
            >
              {isCompleted(step.number) ? (
                <Check className="w-4 h-4" />
              ) : (
                step.number
              )}
            </button>

            {/* Step label */}
            <span
              className={`mt-2 text-xs font-normal text-center whitespace-nowrap ${
                isCompleted(step.number)
                  ? "text-green-600 font-semibold"
                  : isActive(step.number)
                    ? "text-cethos-navy font-semibold"
                    : "text-cethos-slate"
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
