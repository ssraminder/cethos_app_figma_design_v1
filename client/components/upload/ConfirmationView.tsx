import { CheckCircle, AlertCircle } from "lucide-react";
import { useUpload } from "@/context/UploadContext";
import { getStartNewQuoteRoute } from "@/utils/navigationHelpers";

export default function ConfirmationView() {
  const { state, resetUpload } = useUpload();

  const handleUploadMore = () => {
    resetUpload();
    // Use entry point logic - will go to /upload or /quote based on original entry
    window.location.href = getStartNewQuoteRoute();
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

  // DEPRECATED: HITL removed — replaced by review_required tag
  // const formatHITLReason = (reason: string): string => {
  //   const reasonMap: Record<string, string> = {
  //     high_value_order: "Your quote exceeds our automatic processing threshold",
  //     complex_document: "Your document requires expert verification",
  //     low_confidence: "Additional verification needed for accuracy",
  //     unusual_language_pair: "This language combination requires specialist attention",
  //     special_certification: "Special certification requirements detected",
  //   };
  //   return reasonMap[reason] || reason.replace(/_/g, " ");
  // };

  const isHITL = state.submissionType === "manual"; // DEPRECATED: removed state.hitlTriggered

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {/* Success Icon */}
      <div className="mb-6">
        {isHITL ? (
          <AlertCircle className="w-20 h-20 text-amber-500 mx-auto" />
        ) : (
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-4">
        {isHITL ? "Manual Review Requested" : "Quote Request Submitted"}
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

      {/* DEPRECATED: HITL reasons display removed — replaced by review_required tag */}
      {/* {isHITL && state.hitlReasons && state.hitlReasons.length > 0 && (
        <div className="mb-6 max-w-lg bg-amber-50 border-2 border-amber-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-amber-900 mb-3">
            Why manual review is needed:
          </h3>
          <ul className="text-left text-sm text-amber-800 space-y-2">
            {state.hitlReasons.map((reason, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">•</span>
                <span>{formatHITLReason(reason)}</span>
              </li>
            ))}
          </ul>
        </div>
      )} */}

      {/* Description */}
      <p className="text-base text-cethos-slate max-w-md mb-8">
        {isHITL ? (
          <>
            Our translation specialists will personally review your request and
            email you a detailed quote at{" "}
            <span className="font-semibold text-cethos-navy">
              {state.email}
            </span>{" "}
            within <span className="font-semibold">4 working hours</span>.
          </>
        ) : (
          <>
            Our team will review your documents and email you at{" "}
            <span className="font-semibold text-cethos-navy">
              {state.email}
            </span>{" "}
            within 4 working hours.
          </>
        )}
      </p>

      {/* Confirmation email notice */}
      <div className="mb-8 max-w-md">
        <p className="text-sm text-cethos-slate italic">
          A confirmation email has been sent to your inbox.
        </p>
      </div>

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
