import FileUpload from "@/components/FileUpload";
import { useUpload } from "@/context/UploadContext";
import { useDocumentProcessing } from "@/hooks/useDocumentProcessing";
import StartOverLink from "@/components/StartOverLink";
import { ChevronRight } from "lucide-react";

export default function UploadStep1() {
  const { state, goToNextStep } = useUpload();
  const { triggerProcessing } = useDocumentProcessing();
  const canContinue = state.files.length > 0;

  const handleContinue = async () => {
    // Navigate to next step - this creates the quote and returns the quoteId
    const result = await goToNextStep();

    if (!result.success) {
      console.error("❌ Failed to navigate to next step");
      return;
    }

    // Use the quoteId returned by goToNextStep (not state.quoteId which is stale)
    const quoteId = result.quoteId;

    if (!quoteId) {
      console.error("❌ No quoteId returned from navigation");
      return;
    }

    // Trigger document processing in background (fire and forget)
    console.log("🚀 Triggering document processing for quote:", quoteId);

    triggerProcessing(quoteId)
      .then((processingResult) => {
        if (processingResult) {
          console.log(
            "✅ Document processing triggered successfully:",
            processingResult,
          );
        } else {
          console.error("❌ Document processing returned empty result");
        }
      })
      .catch((error) => {
        console.error("❌ Error triggering document processing:", error);
        // Don't block user - processing can be retried later
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
      <div className="flex items-center justify-between mt-8">
        <StartOverLink />
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
