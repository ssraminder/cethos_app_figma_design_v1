import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Info } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";

export default function Success() {
  const navigate = useNavigate();
  const { state, resetQuote, goToStep } = useQuote();
  const [copied, setCopied] = useState(false);

  const handleCopyQuote = async () => {
    try {
      await navigator.clipboard.writeText(state.quoteNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleNewQuote = () => {
    resetQuote();
    navigate("/");
  };

  const handleViewDetails = () => {
    // Go back to review step (step 3)
    goToStep(3);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 w-full pb-8">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-8 sm:py-12 lg:py-16">
          {/* Step Indicator */}
          <StepIndicator currentStep={state.currentStep} />

          {/* Success Content - Centered */}
          <div className="max-w-[600px] mx-auto text-center">
            {/* Success Icon with Animation */}
            <div className="flex justify-center mb-6 animate-in zoom-in duration-500">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
            </div>

            {/* Success Message */}
            <h1 className="text-2xl sm:text-3xl font-bold text-cethos-navy mb-6">
              Quote Saved Successfully!
            </h1>

            {/* Quote Number with Copy */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="text-2xl font-mono text-cethos-slate-dark font-semibold">
                {state.quoteNumber}
              </span>
              <button
                onClick={handleCopyQuote}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Copy quote number"
              >
                <Copy className="w-5 h-5 text-cethos-slate" />
                {copied && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-cethos-slate-dark text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    Copied!
                  </span>
                )}
              </button>
            </div>

            {/* Confirmation Email */}
            <div className="mb-8">
              <p className="text-sm text-cethos-slate mb-2">
                We've sent a confirmation to:
              </p>
              <p className="text-sm font-semibold text-cethos-slate-dark">
                {state.email}
              </p>
            </div>

            {/* What's Next Card */}
            <div className="bg-background rounded-xl p-6 text-left mb-4">
              <h2 className="text-lg font-semibold text-cethos-navy mb-4">
                What happens next?
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-cethos-blue rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">1</span>
                  </div>
                  <p className="text-cethos-slate-dark text-sm pt-0.5">
                    Our team will review your documents
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-cethos-blue rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">2</span>
                  </div>
                  <p className="text-cethos-slate-dark text-sm pt-0.5">
                    You'll receive a final quote via email
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-cethos-blue rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">3</span>
                  </div>
                  <p className="text-cethos-slate-dark text-sm pt-0.5">
                    Complete payment to begin translation
                  </p>
                </div>
              </div>
            </div>

            {/* Phase 1 Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-900 text-left">
                  Online payment coming soon! Our team will contact you to
                  complete your order.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleNewQuote}
                className="w-full h-12 bg-cethos-blue hover:bg-blue-600 text-white font-semibold text-base rounded-lg transition-colors"
              >
                Start New Quote
              </button>
              <button
                onClick={handleViewDetails}
                className="text-cethos-blue hover:underline font-medium text-sm"
              >
                View Quote Details
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* No Footer Navigation on Success Page */}
    </div>
  );
}
