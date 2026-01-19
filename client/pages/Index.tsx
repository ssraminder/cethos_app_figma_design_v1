import { useNavigate } from "react-router-dom";
import { useQuote } from "@/context/QuoteContext";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import Footer from "@/components/Footer";
import ProcessingStatus from "@/components/ProcessingStatus";
import EmailQuoteConfirmation from "@/components/EmailQuoteConfirmation";
import Step1Upload from "@/components/steps/Step1Upload";
import Step2Details from "@/components/steps/Step2Details";
import Step3Review from "@/components/steps/Step3Review";
import Step4Contact from "@/components/steps/Step4Contact";

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

  const handleContinue = async () => {
    const isLastStep = state.currentStep === 4;

    // Special handling for email quote mode on Step 4
    if (isLastStep && state.emailQuoteMode) {
      const success = await goToNextStep();
      if (success) {
        // Show confirmation instead of navigating to success page
        updateState({ emailQuoteSent: true });
      }
      return;
    }

    // Normal flow
    const success = await goToNextStep();

    // Navigate to success page if we were on step 4 and successfully moved to step 5
    if (success && isLastStep) {
      navigate("/success");
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
              state.currentStep === 3 && <Step3Review />}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 4 && <Step4Contact />}
          </div>
        </div>
      </main>

      {/* Footer - Only show on steps 1-4 and not during processing or email confirmation */}
      {!state.isProcessing && !state.emailQuoteSent && state.currentStep <= 4 && (
        <Footer
          onBack={handleBack}
          onContinue={handleContinue}
          canContinue={validateStep(state.currentStep)}
          showBack={state.currentStep > 1}
          continueText={
            state.currentStep === 4 && state.emailQuoteMode
              ? "Send My Quote"
              : "Continue"
          }
        />
      )}
    </div>
  );
}
