import { Loader2 } from "lucide-react";

export default function ProcessingModal() {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 text-center">
        {/* Spinner */}
        <div className="mb-6">
          <Loader2 className="w-16 h-16 text-cethos-teal animate-spin mx-auto" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-cethos-navy mb-3">
          Analyzing Your Documents
        </h2>

        {/* Description */}
        <p className="text-sm text-cethos-slate mb-6">
          Our AI is reviewing your files. This usually takes less than a
          minute...
        </p>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-cethos-teal h-2 rounded-full animate-pulse"
            style={{ width: "70%" }}
          ></div>
        </div>

        <p className="text-xs text-cethos-slate">Processing...</p>
      </div>
    </div>
  );
}
