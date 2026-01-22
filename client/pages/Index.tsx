import { useState } from "react";
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
import Step4ReviewRush from "@/components/quote/Step4ReviewRush";
import Step5BillingDelivery from "@/components/quote/Step5BillingDelivery";
import Step6Payment from "@/components/quote/Step6Payment";
import { X } from "lucide-react";

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

  // Save for Later modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveEmail, setSaveEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [saveSent, setSaveSent] = useState(false);

  const handleContinue = async () => {
    const currentStep = state.currentStep;
    const isLastStep = currentStep === 6; // Updated to 6 steps

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

    // Payment processing would happen on step 6
    // For now, step 6 is just a placeholder
  };

  const handleBack = () => {
    goToPreviousStep();
  };

  const handleSaveForLater = () => {
    setShowSaveModal(true);
  };

  const handleSendSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    try {
      // TODO: Implement actual email sending logic
      // For now, just simulate the success
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log(
        "Save for later email:",
        saveEmail,
        "Quote ID:",
        state.quoteId,
      );
      setSaveSent(true);

      // Reset after 3 seconds
      setTimeout(() => {
        setShowSaveModal(false);
        setSaveEmail("");
        setSaveSent(false);
      }, 3000);
    } catch (error) {
      console.error("Error sending save link:", error);
      alert("Failed to send link. Please try again.");
    } finally {
      setIsSending(false);
    }
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
              state.currentStep === 4 && <Step4ReviewRush />}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 5 && <Step5BillingDelivery />}
            {!state.emailQuoteSent &&
              !state.isProcessing &&
              state.currentStep === 6 && <Step6Payment />}
          </div>
        </div>
      </main>

      {/* Footer - Only show on steps 1-5 and not during processing or email confirmation */}
      {/* Step 6 has its own internal navigation buttons */}
      {!state.isProcessing &&
        !state.emailQuoteSent &&
        state.currentStep <= 5 && (
          <Footer
            onBack={handleBack}
            onContinue={handleContinue}
            onSaveForLater={handleSaveForLater}
            canContinue={validateStep(state.currentStep)}
            showBack={state.currentStep > 1}
            showSaveForLater={false}
            continueText={
              state.currentStep === 5 ? "Proceed to Payment" : "Continue"
            }
          />
        )}

      {/* Save for Later Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            {!saveSent ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-cethos-navy">
                    Save for Later
                  </h3>
                  <button
                    onClick={() => setShowSaveModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <p className="text-cethos-slate mb-4">
                  We'll email you a link to return to your quote anytime.
                </p>

                <form onSubmit={handleSendSaveLink} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-cethos-navy mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={saveEmail}
                      onChange={(e) => setSaveEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="w-full px-4 py-3 border border-cethos-border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent"
                    />
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowSaveModal(false)}
                      className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSending}
                      className="px-5 py-2.5 bg-cethos-blue text-white rounded-lg hover:bg-blue-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? "Sending..." : "Send Link"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="text-green-500 text-6xl mb-4">✓</div>
                <h3 className="text-xl font-bold text-cethos-navy mb-2">
                  Link Sent!
                </h3>
                <p className="text-cethos-slate">
                  Check your email for a link to return to your quote.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
