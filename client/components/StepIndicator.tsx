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
  { number: 5, label: "Checkout" },
];

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="w-full max-w-[520px] mx-auto mb-8 px-4">
      <div className="flex items-center justify-between relative">
        {steps.map((step, index) => (
          <div key={step.number} className="flex flex-col items-center relative flex-1">
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className="absolute left-[calc(50%+16px)] top-4 right-[calc(-100%+16px)] h-0.5 bg-cethos-border z-0"
              />
            )}

            {/* Step circle */}
            <div
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all relative z-10 ${
                step.number === currentStep
                  ? "bg-cethos-blue text-white border-2 border-transparent"
                  : "bg-white text-cethos-slate-light border-2 border-cethos-border"
              }`}
            >
              {step.number}
            </div>

            {/* Step label */}
            <span
              className={`mt-2 text-xs font-normal text-center whitespace-nowrap ${
                step.number === currentStep
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
