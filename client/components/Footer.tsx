import { ChevronLeft, ChevronRight } from "lucide-react";

interface FooterProps {
  onBack?: () => void;
  onContinue?: () => void;
  canContinue?: boolean;
  showBack?: boolean;
}

export default function Footer({
  onBack,
  onContinue,
  canContinue = false,
  showBack = true,
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
            <span>Continue</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </footer>
  );
}
