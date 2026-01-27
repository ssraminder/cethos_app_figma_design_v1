import { RotateCcw } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";
import { useUpload } from "@/context/UploadContext";

interface StartOverLinkProps {
  className?: string;
}

export default function StartOverLink({ className = "" }: StartOverLinkProps) {
  // Try to use UploadContext first, fall back to QuoteContext
  let resetFunction: (() => void) | undefined;

  try {
    const uploadContext = useUpload();
    resetFunction = uploadContext.resetUpload;
  } catch {
    // Fall back to QuoteContext
    try {
      const quoteContext = useQuote();
      resetFunction = quoteContext.resetQuote;
    } catch {
      // Neither context available
    }
  }

  const handleStartOver = () => {
    const confirmed = window.confirm(
      "Are you sure you want to start over? All your uploaded documents and entered information will be lost.",
    );

    if (confirmed) {
      // Clear all possible localStorage keys
      localStorage.removeItem("cethos_quote_draft");
      localStorage.removeItem("cethos_quote_id");
      localStorage.removeItem("cethos_quote_state");
      localStorage.removeItem("cethos_upload_draft");

      // Call the appropriate reset function
      if (resetFunction) {
        resetFunction();
      } else {
        // Fallback: redirect to quote page
        window.location.href = "/quote";
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleStartOver}
      className={`text-sm text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1.5 ${className}`}
    >
      <RotateCcw className="w-4 h-4" />
      <span>Start Over</span>
    </button>
  );
}
