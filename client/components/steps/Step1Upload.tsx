import FileUpload from "@/components/FileUpload";
import { useQuote } from "@/context/QuoteContext";
import { ChevronRight } from "lucide-react";

export default function Step1Upload() {
  const { state, goToNextStep } = useQuote();
  const canContinue = state.files.length > 0;

  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Upload Your Documents
        </h1>
        <p className="text-base text-cethos-slate">
          Select the documents you need translated and certified
        </p>
      </div>

      {/* File Upload Section */}
      <FileUpload />

      {/* Navigation Button */}
      <div className="flex justify-end mt-8">
        <button
          onClick={goToNextStep}
          disabled={!canContinue}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
            canContinue
              ? "bg-cethos-blue hover:bg-blue-600"
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
