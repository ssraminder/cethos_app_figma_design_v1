import FileUpload from "@/components/FileUpload";
import { useQuote } from "@/context/QuoteContext";
import { useDocumentProcessing } from "@/hooks/useDocumentProcessing";
import { ChevronRight } from "lucide-react";

export default function Step1Upload() {
  const { state, goToNextStep } = useQuote();
  const { triggerProcessing } = useDocumentProcessing();
  const canContinue = state.files.length > 0;

  const handleContinue = async () => {
    if (!state.quoteId) {
      console.error("❌ No quoteId available - cannot trigger processing");
      // Still allow navigation even without quoteId (shouldn't happen in normal flow)
      await goToNextStep();
      return;
    }

    // Navigate to next step first (better UX - don't block user)
    await goToNextStep();

    // Trigger document processing in background (fire and forget)
    console.log("🚀 Triggering document processing for quote:", state.quoteId);

    triggerProcessing(state.quoteId)
      .then((result) => {
        if (result) {
          console.log("✅ Document processing triggered successfully:", result);
        } else {
          console.error("❌ Document processing failed to trigger");
        }
      })
      .catch((error) => {
        console.error("❌ Error triggering document processing:", error);
        // Don't block user - processing can be retried later or manually
      });
  };

  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Upload Your Documents
        </h1>
        <p className="text-base text-cethos-gray">
          Select the documents you need translated and certified
        </p>
      </div>

      {/* File Upload Section */}
      <FileUpload />

      {/* Navigation Button */}
      <div className="flex justify-end mt-8">
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
            canContinue
              ? "bg-cethos-teal hover:bg-cethos-teal-light"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          <span>Continue</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </>
  );
}
