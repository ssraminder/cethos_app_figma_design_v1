import { useQuote } from "@/context/QuoteContext";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";
import DocumentPricingCard from "@/components/DocumentPricingCard";
import QuoteSummary from "@/components/QuoteSummary";
import HumanReviewNotice from "@/components/HumanReviewNotice";
import { Loader2 } from "lucide-react";

export default function Step3Review() {
  const { state } = useQuote();
  const { languages, loading } = useDropdownOptions();

  const handleRequestReview = () => {
    console.log("Human review requested");
    // Handle human review request
  };

  // Get language names from IDs
  const sourceLanguage = languages.find((l) => l.id === state.sourceLanguageId);
  const targetLanguage = languages.find((l) => l.id === state.targetLanguageId);

  // Map uploaded files to document pricing data
  const languagePair =
    sourceLanguage && targetLanguage
      ? `${sourceLanguage.name} → ${targetLanguage.name}`
      : "Language pair not set";

  const documents = state.files.map((file) => ({
    filename: file.name,
    languagePair,
    translationPrice: 65, // Base price per document
    certificationPrice: 50, // Base certification price
    pages: 1, // Default to 1 page (would need actual page detection)
  }));

  // Calculate totals
  const translationTotal = documents.reduce(
    (sum, doc) => sum + doc.translationPrice,
    0,
  );
  const certificationTotal = documents.reduce(
    (sum, doc) => sum + doc.certificationPrice,
    0,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-blue" />
        <span className="ml-3 text-cethos-slate">Loading quote details...</span>
      </div>
    );
  }

  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <div className="mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy">
            Review Your Quote
          </h1>
        </div>
        <p className="text-base text-cethos-slate">
          Here's an estimate based on your documents
        </p>
      </div>

      {/* Document Pricing Cards */}
      <div className="space-y-4 mb-6">
        {documents.map((doc, index) => (
          <DocumentPricingCard
            key={index}
            filename={doc.filename}
            languagePair={doc.languagePair}
            translationPrice={doc.translationPrice}
            certificationPrice={doc.certificationPrice}
            pages={doc.pages}
          />
        ))}
      </div>

      {/* Quote Summary */}
      <div className="mb-6">
        <QuoteSummary
          translationTotal={translationTotal}
          certificationTotal={certificationTotal}
        />
      </div>

      {/* Human Review Notice */}
      <div>
        <HumanReviewNotice onRequestReview={handleRequestReview} />
      </div>
    </>
  );
}
