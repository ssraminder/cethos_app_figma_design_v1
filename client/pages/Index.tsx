import { useQuote } from "@/context/QuoteContext";
import ProgressStepper from "@/components/quote/ProgressStepper";
import ProcessingStatus from "@/components/ProcessingStatus";
import Step1Upload from "@/components/quote/Step1Upload";
import Step2Details from "@/components/quote/Step2Details";
import Step3Contact from "@/components/steps/Step3Contact";
import Step4ReviewRush from "@/components/quote/Step4ReviewRush";
import Step5BillingDelivery from "@/components/quote/Step5BillingDelivery";
import Step6Payment from "@/components/quote/Step6Payment";

export default function QuoteFlow() {
  const { state, updateState } = useQuote();

  const handleProcessingComplete = () => {
    updateState({ showProcessingModal: false, isProcessing: false, currentStep: 4 });
  };

  const handleEmailInstead = () => {
    updateState({ showProcessingModal: false, isProcessing: false });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-extrabold text-teal-600 tracking-tight">
          CETHOS
        </span>
        <div className="w-px h-5 bg-gray-200" />
        <span className="text-sm text-gray-500 font-medium">Get a Quote</span>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-7 pb-24">
        <ProgressStepper currentStep={state.currentStep} className="mb-7" />

        {/* Processing Modal — overlays current step */}
        {state.showProcessingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <ProcessingStatus
              quoteId={state.quoteId ?? ""}
              onComplete={handleProcessingComplete}
              onEmailInstead={handleEmailInstead}
            />
          </div>
        )}

        {/* Step Components */}
        {state.currentStep === 1 && <Step1Upload />}
        {state.currentStep === 2 && <Step2Details />}
        {state.currentStep === 3 && <Step3Contact />}
        {!state.showProcessingModal && state.currentStep === 4 && (
          <Step4ReviewRush />
        )}
        {!state.showProcessingModal && state.currentStep === 5 && (
          <Step5BillingDelivery />
        )}
        {!state.showProcessingModal && state.currentStep === 6 && (
          <Step6Payment />
        )}
      </div>
    </div>
  );
}
