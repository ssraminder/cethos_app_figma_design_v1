import { AlertCircle } from "lucide-react";

interface HumanReviewNoticeProps {
  onRequestReview?: () => void;
}

export default function HumanReviewNotice({
  onRequestReview,
}: HumanReviewNoticeProps) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-cethos-slate-dark font-semibold text-sm mb-1">
            Something doesn't look right?
          </h4>
          <p className="text-cethos-slate text-sm mb-4">
            Request a human review and our team will check your documents within
            4 hours
          </p>
          <button
            onClick={onRequestReview}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            Request Human Review
          </button>
        </div>
      </div>
    </div>
  );
}
