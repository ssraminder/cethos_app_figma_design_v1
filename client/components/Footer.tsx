import { ChevronLeft, ChevronRight, Save } from "lucide-react";

interface FooterProps {
  onBack?: () => void;
  onContinue?: () => void;
  onSaveForLater?: () => void;
  canContinue?: boolean;
  showBack?: boolean;
  showSaveForLater?: boolean;
  continueText?: string;
}

export default function Footer({
  onBack,
  onContinue,
  onSaveForLater,
  canContinue = false,
  showBack = true,
  showSaveForLater = false,
  continueText = "Continue",
}: FooterProps) {
  return (
    <footer className="w-full border-t border-cethos-border bg-white shadow-lg sticky bottom-0">
      <div className="max-w-[896px] mx-auto px-4 sm:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Back Button */}
          {showBack ? (
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-3 text-cethos-slate hover:text-cethos-slate-dark transition-colors opacity-50 hover:opacity-100"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-base font-medium">Back</span>
            </button>
          ) : (
            <div />
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Save for Later Button */}
            {showSaveForLater && onSaveForLater && (
              <button
                onClick={onSaveForLater}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base border-2 border-cethos-blue text-cethos-blue hover:bg-blue-50 transition-all"
              >
                <Save className="w-5 h-5" />
                <span>Save for Later</span>
              </button>
            )}

            {/* Continue Button */}
            <button
              onClick={onContinue}
              disabled={!canContinue}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
                canContinue
                  ? "bg-cethos-blue hover:bg-blue-600"
                  : "bg-secondary cursor-not-allowed"
              }`}
            >
              <span>{continueText}</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
