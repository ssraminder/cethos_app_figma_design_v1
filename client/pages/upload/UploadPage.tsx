import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useUpload } from "@/context/UploadContext";
import StepIndicator from "@/components/StepIndicator";
import UploadStep1 from "@/components/upload/UploadStep1";
import UploadStep2 from "@/components/upload/UploadStep2";
import UploadStep3 from "@/components/upload/UploadStep3";
import ConfirmationView from "@/components/upload/ConfirmationView";
import ProcessingModal from "@/components/upload/ProcessingModal";
import UploadChoiceModal from "@/components/upload/UploadChoiceModal";

export default function UploadPage() {
  const { state, updateState, handleAIQuoteChoice, handleHumanReviewChoice } = useUpload();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get step from URL query param, default to current state
  const stepParam = searchParams.get("step");
  const urlStep = stepParam ? parseInt(stepParam) : state.currentStep;

  // Sync URL with state
  useEffect(() => {
    if (urlStep !== state.currentStep && urlStep >= 1 && urlStep <= 3) {
      updateState({ currentStep: urlStep as 1 | 2 | 3 });
    }
  }, [urlStep]);

  // Update URL when step changes
  useEffect(() => {
    const newStep = state.currentStep;
    const currentStepParam = searchParams.get("step");

    if (currentStepParam !== newStep.toString()) {
      const params = new URLSearchParams(searchParams);
      params.set("step", newStep.toString());

      // Add quote_id to URL after step 1
      if (state.quoteId && newStep > 1) {
        params.set("quote_id", state.quoteId);
      }

      navigate(`/upload?${params.toString()}`, { replace: true });
    }
  }, [state.currentStep, state.quoteId]);

  // Step labels for indicator (3 steps only)
  const stepLabels = ["Upload", "Details", "Contact"];

  // If showing confirmation, render that instead
  if (state.showConfirmation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cethos-bg-light to-white">
        <div className="container mx-auto px-4 py-8">
          <ConfirmationView />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cethos-bg-light to-white">
      {/* Processing Modal - shown during AI processing */}
      {state.showProcessingModal && <ProcessingModal />}

      {/* Choice Modal - shown after processing completes */}
      {state.showChoiceModal && (
        <UploadChoiceModal
          onAIQuote={handleAIQuoteChoice}
          onHumanReview={handleHumanReviewChoice}
          loading={state.isSubmitting}
        />
      )}

      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold font-jakarta text-cethos-navy mb-2">
            CETHOS Upload Form
          </h1>
          <p className="text-base text-cethos-slate">
            Share your documents and get a quote
          </p>
        </div>

        {/* Step Indicator (3 steps) */}
        <div className="mb-8">
          <StepIndicator
            currentStep={state.currentStep}
            totalSteps={3}
            labels={stepLabels}
          />
        </div>

        {/* Main Content Area */}
        <div className="max-w-3xl mx-auto">
          {/* Render current step */}
          {state.currentStep === 1 && <UploadStep1 />}
          {state.currentStep === 2 && <UploadStep2 />}
          {state.currentStep === 3 && <UploadStep3 />}
        </div>
      </div>
    </div>
  );
}
