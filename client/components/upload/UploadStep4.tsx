import { ChevronLeft, User, Sparkles, Loader2 } from "lucide-react";
import { useUpload } from "@/context/UploadContext";

export default function UploadStep4() {
  const { state, goToPreviousStep, submitManualQuote, submitAIQuote } =
    useUpload();

  const handleManualQuote = async () => {
    await submitManualQuote();
  };

  const handleAIQuote = async () => {
    await submitAIQuote();
  };

  const isManualLoading =
    state.isSubmitting && state.submissionType === "manual";
  const isAILoading = state.isSubmitting && state.submissionType === "ai";

  return (
    <>
      {/* Page Title */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-3">
          How would you like to proceed?
        </h1>
        <p className="text-base text-cethos-slate">
          Choose the best option for your needs
        </p>
      </div>

      {/* Error Message */}
      {state.error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
          <p className="text-sm text-red-800">{state.error}</p>
          {state.error.includes("manual quote instead") && (
            <button
              onClick={handleManualQuote}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Request Manual Quote
            </button>
          )}
        </div>
      )}

      {/* Quote Option Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* AI Quote Card - First on mobile for immediate payment priority */}
        <div className="bg-white border-2 border-cethos-teal rounded-xl p-8 text-center hover:shadow-lg transition-all md:order-2">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-cethos-teal-50 rounded-full flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-cethos-teal" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-cethos-navy mb-4">
            Get Instant AI Quote
          </h2>

          {/* Divider */}
          <div className="border-t border-gray-200 mb-4"></div>

          {/* Description */}
          <p className="text-sm text-cethos-slate mb-6 leading-relaxed">
            Get your quote instantly with AI-powered document analysis. Review
            pricing and pay online in minutes.
          </p>

          {/* Best For */}
          <div className="text-left mb-6">
            <p className="text-sm font-semibold text-cethos-navy mb-2">
              Best for:
            </p>
            <ul className="text-sm text-cethos-slate space-y-1">
              <li>• Standard documents</li>
              <li>• Quick turnaround</li>
              <li>• Immediate payment</li>
            </ul>
          </div>

          {/* Button */}
          <button
            onClick={handleAIQuote}
            disabled={state.isSubmitting}
            className={`w-full h-12 rounded-lg font-semibold text-base transition-all flex items-center justify-center gap-2 ${
              state.isSubmitting
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-cethos-navy text-white hover:bg-opacity-90"
            }`}
          >
            {isAILoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Get AI Quote</span>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </>
            )}
          </button>
        </div>

        {/* Manual Quote Card - Second on mobile */}
        <div className="bg-white border-2 border-cethos-border rounded-xl p-8 text-center hover:border-cethos-teal hover:shadow-lg transition-all md:order-1">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-gray-700" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-cethos-navy mb-4">
            Request Manual Quote
          </h2>

          {/* Divider */}
          <div className="border-t border-gray-200 mb-4"></div>

          {/* Description */}
          <p className="text-sm text-cethos-slate mb-6 leading-relaxed">
            Our translation team will personally review your documents and email
            you a detailed quote within 4 working hours.
          </p>

          {/* Best For */}
          <div className="text-left mb-6">
            <p className="text-sm font-semibold text-cethos-navy mb-2">
              Best for:
            </p>
            <ul className="text-sm text-cethos-slate space-y-1">
              <li>• Complex documents</li>
              <li>• Special requirements</li>
              <li>• Questions about pricing</li>
            </ul>
          </div>

          {/* Button */}
          <button
            onClick={handleManualQuote}
            disabled={state.isSubmitting}
            className={`w-full h-12 rounded-lg font-semibold text-base transition-all flex items-center justify-center gap-2 ${
              state.isSubmitting
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-white border-2 border-cethos-navy text-cethos-navy hover:bg-gray-50"
            }`}
          >
            {isManualLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              "Request Quote"
            )}
          </button>
        </div>
      </div>

      {/* Back Button */}
      <div className="flex justify-start">
        <button
          onClick={goToPreviousStep}
          disabled={state.isSubmitting}
          className={`flex items-center gap-2 px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg font-medium transition-colors ${
            state.isSubmitting
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-cethos-bg-light"
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
      </div>
    </>
  );
}
