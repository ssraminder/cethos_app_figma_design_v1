import { CheckCircle, Mail } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";

export default function EmailQuoteConfirmation() {
  const { state, resetQuote } = useQuote();

  const handleStartNewQuote = () => {
    resetQuote();
  };

  const handleClose = () => {
    // Could navigate to home or just stay
    window.location.href = "/";
  };

  return (
    <div className="max-w-[500px] mx-auto">
      <div className="bg-white border-2 border-cethos-border rounded-xl shadow-sm p-8">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold font-jakarta text-cethos-navy text-center mb-3">
          We'll email your quote when it's ready!
        </h2>

        {/* Quote Number */}
        <div className="text-center mb-6">
          <p className="text-cethos-slate mb-2">
            Your quote{" "}
            <span className="font-semibold text-cethos-navy">
              #{state.quoteNumber || "Processing"}
            </span>{" "}
            is being prepared.
          </p>
          <p className="text-cethos-slate mb-4">We'll send it to:</p>

          {/* Email Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <Mail className="w-4 h-4 text-cethos-blue" />
            <span className="font-semibold text-cethos-navy">
              {state.email}
            </span>
          </div>
        </div>

        {/* Estimated Time */}
        <div className="text-center mb-8">
          <p className="text-sm text-cethos-slate">
            Usually ready in <span className="font-semibold">5-10 minutes</span>
            .
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-cethos-border mb-6" />

        {/* What Happens Next */}
        <div className="mb-8">
          <h3 className="font-semibold text-cethos-navy mb-4">
            What happens next?
          </h3>
          <ol className="space-y-3">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-cethos-blue text-white rounded-full flex items-center justify-center text-sm font-semibold">
                1
              </span>
              <span className="text-cethos-slate">
                We'll analyze your documents
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-cethos-blue text-white rounded-full flex items-center justify-center text-sm font-semibold">
                2
              </span>
              <span className="text-cethos-slate">
                Calculate your personalized quote
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-cethos-blue text-white rounded-full flex items-center justify-center text-sm font-semibold">
                3
              </span>
              <span className="text-cethos-slate">
                Email you a link to review and pay
              </span>
            </li>
          </ol>
        </div>

        {/* Divider */}
        <div className="border-t border-cethos-border mb-6" />

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleStartNewQuote}
            className="flex-1 px-6 py-3 border-2 border-cethos-border rounded-lg font-semibold text-cethos-navy hover:border-cethos-blue hover:text-cethos-blue transition-all"
          >
            Start Another Quote
          </button>
          <button
            onClick={handleClose}
            className="flex-1 px-6 py-3 bg-cethos-blue text-white rounded-lg font-semibold hover:bg-blue-600 transition-all"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
