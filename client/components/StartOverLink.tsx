import { RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuote } from "@/context/QuoteContext";
import { useUpload } from "@/context/UploadContext";
import { handleStartNewQuote } from "@/utils/navigationHelpers";

interface StartOverLinkProps {
  className?: string;
}

export default function StartOverLink({ className = "" }: StartOverLinkProps) {
  const navigate = useNavigate();

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
      // Use the navigation helper which clears storage and navigates to correct entry point
      handleStartNewQuote(navigate);

      // Call the appropriate reset function if available
      if (resetFunction) {
        resetFunction();
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
