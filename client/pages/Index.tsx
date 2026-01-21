import { useNavigate } from "react-router-dom";
import { useQuote } from "@/context/QuoteContext";
import { useDocumentProcessing } from "@/hooks/useDocumentProcessing";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import Footer from "@/components/Footer";
import ProcessingStatus from "@/components/ProcessingStatus";
import EmailQuoteConfirmation from "@/components/EmailQuoteConfirmation";
import Step1Upload from "@/components/steps/Step1Upload";
import Step2Details from "@/components/steps/Step2Details";
import Step3Contact from "@/components/steps/Step3Contact";
import Step4Delivery from "@/components/quote/Step4Delivery";
import Step4Review from "@/components/steps/Step4Review";

export default function Index() {
  const navigate = useNavigate();
  const {
    state,
    updateState,
    goToNextStep,
    goToPreviousStep,
    validateStep,
    completeProcessing,
    skipToEmail,
  } = useQuote();

  const { triggerProcessing } = useDocumentProcessing();

  const handleContinue = async () => {
    const currentStep = state.currentStep;
    const isLastStep = currentStep === 5;

    // Special handling for email quote mode on Step 5 (Review)
    if (isLastStep && state.emailQuoteMode) {
      const result = await goToNextStep();
      if (result.success) {
        // Show confirmation instead of navigating to success page
        updateState({ emailQuoteSent: true });
      }
      return;
    }

    // Normal flow
    const result = await goToNextStep();
    console.log("🔄 Step transition:", {
      success: result.success,
      fromStep: currentStep,
      toStep: state.currentStep,
      returnedQuoteId: result.quoteId,
      stateQuoteId: state.quoteId,
    });

    // After moving from Step 1 to Step 2, trigger document processing
    // Use the returned quoteId instead of state.quoteId (which hasn't updated yet)
    if (result.success && currentStep === 1 && result.quoteId) {
      console.log(
        "🚀 Triggering document processing for quote:",
        result.quoteId,
      );
      // Trigger processing in background (don't await)
      triggerProcessing(result.quoteId)
        .then(() => {
          console.log("✅ Document processing triggered successfully");
        })
        .catch((error) => {
          console.error("❌ Failed to trigger processing:", error);
          // Processing will happen eventually, don't block user flow
        });
    }

    // Navigate to checkout page if we were on step 5 (Review) and successfully moved forward
    if (result.success && isLastStep) {
      navigate(`/quote/${state.quoteId}/checkout`);
    }
  };

  const handleBack = () => {
    goToPreviousStep();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 w-full">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-8 sm:py-12 lg:py-16">
          {/* Step Indicator - Hide during processing and email confirmation */}
          {!state.isProcessing && !state.emailQuoteSent && (
            <StepIndicator currentStep={state.currentStep} />
          )}

          {/* Content Container */}
          <div className="max-w-[896px] mx-auto">
            {/* Show Email Quote Confirmation */}
            {state.emailQuoteSent && <EmailQuoteConfirmation />}

            {/* Show Processing Status */}
            {!state.emailQuoteSent && state.isProcessing && (
              <ProcessingStatus
                quoteId={state.quoteId}
                onComplete={completeProcessing}
                onEmailInstead={skipToEmail}
              />
            )}

            {/* Conditional Step Rendering */}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 1 && <Step1Upload />}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 2 && <Step2Details />}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 3 && <Step3Contact />}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 4 && <Step4Delivery />}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 5 && <Step4Review />}
          </div>
        </div>
      </main>

      {/* Footer - Only show on steps 1-5 and not during processing or email confirmation */}
      {!state.isProcessing &&
        !state.emailQuoteSent &&
        state.currentStep <= 5 && (
          <Footer
            onBack={handleBack}
            onContinue={handleContinue}
            canContinue={validateStep(state.currentStep)}
            showBack={state.currentStep > 1}
            continueText={
              state.currentStep === 5 && state.emailQuoteMode
                ? "Send My Quote"
                : state.currentStep === 5
                  ? "Proceed to Checkout"
                  : "Continue"
            }
          />
        )}
    </div>
  );
}
