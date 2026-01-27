import { Bot, User, X } from "lucide-react";

interface UploadChoiceModalProps {
  onAIQuote: () => void;
  onHumanReview: () => void;
  loading?: boolean;
}

export default function UploadChoiceModal({
  onAIQuote,
  onHumanReview,
  loading = false,
}: UploadChoiceModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="text-center pt-8 px-8 pb-4">
          <h2 className="text-2xl font-bold text-cethos-navy mb-3">
            How would you like to proceed?
          </h2>
          <p className="text-sm text-cethos-slate">
            Your documents have been processed successfully
          </p>
        </div>

        {/* Options */}
        <div className="px-8 pb-8 space-y-4">
          {/* AI Instant Quote Option */}
          <button
            onClick={onAIQuote}
            disabled={loading}
            className="w-full p-6 border-2 border-cethos-teal rounded-xl hover:bg-cethos-teal/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-cethos-teal/10 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-cethos-teal/20 transition-colors">
                <Bot className="w-6 h-6 text-cethos-teal" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-lg text-cethos-navy mb-1">
                  Get Instant Quote
                </div>
                <div className="text-sm text-cethos-slate">
                  AI-powered pricing, proceed to checkout immediately
                </div>
              </div>
            </div>
          </button>

          {/* Human Review Option */}
          <button
            onClick={onHumanReview}
            disabled={loading}
            className="w-full p-6 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
                <User className="w-6 h-6 text-gray-600" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-lg text-cethos-navy mb-1">
                  Request Human Review
                </div>
                <div className="text-sm text-cethos-slate">
                  Our team will email your quote within 4 hours
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer Note */}
        <div className="bg-gray-50 px-8 py-4 rounded-b-2xl border-t border-gray-100">
          <p className="text-xs text-cethos-slate text-center">
            You can request human review at any time during checkout
          </p>
        </div>
      </div>
    </div>
  );
}
