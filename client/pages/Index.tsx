import { useNavigate } from "react-router-dom";
import { useQuote } from "@/context/QuoteContext";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import FileUpload from "@/components/FileUpload";
import SaveForLater from "@/components/SaveForLater";
import Footer from "@/components/Footer";

export default function Index() {
  const navigate = useNavigate();
  const { state, goToNextStep, validateStep } = useQuote();

  const handleContinue = () => {
    if (goToNextStep()) {
      navigate("/details");
    }
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
            {/* Page Title */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
                Upload Your Documents
              </h1>
              <p className="text-base text-cethos-slate">
                Select the documents you need translated and certified
              </p>
            </div>

            {/* File Upload Section */}
            <div className="mb-6">
              <FileUpload />
            </div>

            {/* Save for Later Section */}
            <div>
              <SaveForLater />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer
        onBack={() => {}}
        onContinue={handleContinue}
        canContinue={validateStep(1)}
        showBack={false}
      />
    </div>
  );
}
