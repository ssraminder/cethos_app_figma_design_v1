import { useNavigate } from "react-router-dom";
import { useQuote } from "@/context/QuoteContext";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import Footer from "@/components/Footer";
import Step1Upload from "@/components/steps/Step1Upload";
import Step2Details from "@/components/steps/Step2Details";
import Step3Review from "@/components/steps/Step3Review";
import Step4Contact from "@/components/steps/Step4Contact";

export default function Index() {
  const navigate = useNavigate();
  const { state, goToNextStep, goToPreviousStep, validateStep } = useQuote();

  const handleContinue = async () => {
    const isLastStep = state.currentStep === 4;
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
          {/* Step Indicator */}
          <StepIndicator currentStep={state.currentStep} />

          {/* Content Container */}
          <div className="max-w-[896px] mx-auto">
            {/* Conditional Step Rendering */}
            {state.currentStep === 1 && <Step1Upload />}
            {state.currentStep === 2 && <Step2Details />}
            {state.currentStep === 3 && <Step3Review />}
            {state.currentStep === 4 && <Step4Contact />}
          </div>
        </div>
      </main>

      {/* Footer - Only show on steps 1-4 */}
      {state.currentStep <= 4 && (
        <Footer
          onBack={handleBack}
          onContinue={handleContinue}
          canContinue={validateStep(state.currentStep)}
          showBack={state.currentStep > 1}
        />
      )}
    </div>
  );
}
