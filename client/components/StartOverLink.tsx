import { RotateCcw } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";

interface StartOverLinkProps {
  className?: string;
}

export default function StartOverLink({ className = "" }: StartOverLinkProps) {
  const { resetQuote } = useQuote();

  const handleStartOver = () => {
    const confirmed = window.confirm(
      "Are you sure you want to start over? All your uploaded documents and entered information will be lost.",
    );

    if (confirmed) {
      localStorage.removeItem("cethos_quote_draft");
      localStorage.removeItem("cethos_quote_id");
      localStorage.removeItem("cethos_quote_state");

      resetQuote();
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
