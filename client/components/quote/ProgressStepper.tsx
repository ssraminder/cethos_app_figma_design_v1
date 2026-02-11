interface ProgressStepperProps {
  currentStep: number;
  className?: string;
}

const STEPS = [
  { number: 1, label: "Upload", shortLabel: "Upload" },
  { number: 2, label: "Details", shortLabel: "Details" },
  { number: 3, label: "Contact", shortLabel: "Contact" },
  { number: 4, label: "Review", shortLabel: "Review" },
  { number: 5, label: "Delivery", shortLabel: "Delivery" },
  { number: 6, label: "Pay", shortLabel: "Pay" },
];

export default function ProgressStepper({
  currentStep,
  className = "",
}: ProgressStepperProps) {
  const isCompleted = (step: number) => step < currentStep;
  const isActive = (step: number) => step === currentStep;

  const currentStepData = STEPS.find((s) => s.number === currentStep);

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop Stepper — hidden on mobile */}
      <div className="hidden sm:flex items-center justify-center max-w-2xl mx-auto">
        {STEPS.map((step, index) => (
          <div key={step.number} className="flex items-center">
            {/* Step circle + label */}
            <div className="flex flex-col items-center">
              <div
                className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  isCompleted(step.number)
                    ? "bg-green-500 text-white"
                    : isActive(step.number)
                      ? "bg-teal-600 text-white ring-4 ring-teal-100"
                      : "border-2 border-gray-300 text-gray-400"
                }`}
              >
                {isCompleted(step.number) ? (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`mt-1.5 text-xs ${
                  isCompleted(step.number)
                    ? "text-teal-600"
                    : isActive(step.number)
                      ? "text-gray-900 font-semibold"
                      : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {index < STEPS.length - 1 && (
              <div
                className={`flex-1 min-w-[32px] lg:min-w-[48px] h-0.5 mx-2 ${
                  isCompleted(step.number) ? "bg-teal-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Mobile Stepper — dots only, visible on small screens */}
      <div className="flex sm:hidden flex-col items-center">
        <div className="flex items-center gap-1.5 mb-2">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className={`rounded-full transition-all ${
                isCompleted(step.number)
                  ? "w-2 h-2 bg-teal-500"
                  : isActive(step.number)
                    ? "w-3 h-3 bg-teal-600"
                    : "w-2 h-2 bg-gray-300"
              }`}
            />
          ))}
        </div>

        {currentStepData && (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">
              {currentStepData.label}
            </p>
            <p className="text-xs text-gray-500">
              Step {currentStep} of {STEPS.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
