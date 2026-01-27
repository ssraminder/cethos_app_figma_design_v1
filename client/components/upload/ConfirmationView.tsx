import { CheckCircle } from "lucide-react";
import { useUpload } from "@/context/UploadContext";

export default function ConfirmationView() {
  const { state, resetUpload } = useUpload();

  const handleUploadMore = () => {
    resetUpload();
    window.location.href = "/upload";
  };

  const handleClose = () => {
    // Try to close the window (works if opened by window.open)
    if (window.opener) {
      window.close();
    } else {
      // Fallback: redirect to home page
      window.location.href = "/";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {/* Success Icon */}
      <div className="mb-6">
        <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-4">
        Quote Request Submitted
      </h1>

      {/* Quote Number */}
      <div className="mb-6">
        <p className="text-base text-cethos-slate mb-3">
          Your quote number is:
        </p>
        <div className="inline-block bg-cethos-bg-light border-2 border-cethos-border rounded-lg px-8 py-4">
          <p className="text-2xl font-bold font-mono text-cethos-navy">
            {state.quoteNumber || "QT26-XXXXX"}
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-base text-cethos-slate max-w-md mb-8">
        Our team will review your documents and email you at{" "}
        <span className="font-semibold text-cethos-navy">{state.email}</span>{" "}
        within 4 working hours.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={handleUploadMore}
          className="px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors"
        >
          Upload More Documents
        </button>
        <button
          onClick={handleClose}
          className="px-6 py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light font-semibold transition-colors"
        >
          Close Window
        </button>
      </div>
    </div>
  );
}
