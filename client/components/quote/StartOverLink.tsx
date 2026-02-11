import { useQuote } from "@/context/QuoteContext";

interface StartOverLinkProps {
  className?: string;
}

const STORAGE_KEY = "cethos_quote_draft";
const UPLOAD_STORAGE_KEY = "cethos_upload_draft";

export default function StartOverLink({ className = "" }: StartOverLinkProps) {
  const { resetQuote } = useQuote();

  const handleStartOver = () => {
    const confirmed = window.confirm(
      "Start over? This will clear all your progress.",
    );
    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(UPLOAD_STORAGE_KEY);
    resetQuote();
  };

  return (
    <button
      onClick={handleStartOver}
      className={`inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition ${className}`}
    >
      ↺ Start Over
    </button>
  );
}
