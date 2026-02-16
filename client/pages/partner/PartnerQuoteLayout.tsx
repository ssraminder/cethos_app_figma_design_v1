// PartnerQuoteLayout.tsx
// Branded wrapper for partner quote flow
// Renders existing Step1-Step4 components with partner branding

import { useQuote } from "@/context/QuoteContext";
import ProgressStepper from "@/components/quote/ProgressStepper";
import ProcessingStatus from "@/components/ProcessingStatus";
import Step1Upload from "@/components/quote/Step1Upload";
import Step2Details from "@/components/quote/Step2Details";
import Step3Contact from "@/components/quote/Step3Contact";
import Step4ReviewCheckout from "@/components/quote/Step4ReviewCheckout";

interface PartnerData {
  partner_id: string;
  code: string;
  name: string;
  customer_rate: number;
  logo_url: string | null;
  welcome_message: string | null;
  has_pickup_location: boolean;
}

interface Props {
  partnerData: PartnerData;
}

export default function PartnerQuoteLayout({ partnerData }: Props) {
  const { state, updateState } = useQuote();

  const handleProcessingComplete = () => {
    updateState({
      showProcessingModal: false,
      isProcessing: false,
      currentStep: 4,
    });
  };

  const handleEmailInstead = () => {
    updateState({ showProcessingModal: false, isProcessing: false });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Partner Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center">
          {partnerData.logo_url ? (
            <img
              src={partnerData.logo_url}
              alt={partnerData.name}
              className="h-14 max-w-[200px] mx-auto object-contain"
            />
          ) : (
            <h1 className="text-xl font-semibold text-gray-800">
              {partnerData.name}
            </h1>
          )}
          {partnerData.welcome_message && (
            <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
              {partnerData.welcome_message}
            </p>
          )}
        </div>
      </div>

      {/* Quote Flow Content */}
      <div className={`mx-auto py-7 pb-24 ${state.currentStep === 4 ? "max-w-7xl px-4 sm:px-6 lg:px-8" : "max-w-2xl px-5"}`}>
        <ProgressStepper
          currentStep={state.currentStep}
          className={`mb-7 ${state.currentStep === 4 ? "max-w-2xl mx-auto" : ""}`}
        />

        {/* Processing Modal */}
        {state.showProcessingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <ProcessingStatus
              quoteId={state.quoteId ?? ""}
              onComplete={handleProcessingComplete}
              onEmailInstead={handleEmailInstead}
            />
          </div>
        )}

        {/* Step Components — same as /quote flow */}
        {state.currentStep === 1 && <Step1Upload />}
        {state.currentStep === 2 && <Step2Details />}
        {state.currentStep === 3 && <Step3Contact />}
        {!state.showProcessingModal && state.currentStep === 4 && (
          <Step4ReviewCheckout />
        )}
      </div>

      {/* Powered by CETHOS Footer */}
      <div className="border-t border-gray-100 py-6 text-center">
        <p className="text-xs text-gray-400">
          Powered by{" "}
          <a
            href="https://www.cethos.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-700 font-medium"
          >
            CETHOS Translations
          </a>
        </p>
      </div>
    </div>
  );
}
