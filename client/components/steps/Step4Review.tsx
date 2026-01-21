import { useState } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";
import { useQuotePricing } from "@/hooks/useQuotePricing";
import DocumentPricingCard from "@/components/DocumentPricingCard";
import QuoteSummary from "@/components/QuoteSummary";
import HumanReviewNotice from "@/components/HumanReviewNotice";
import ProcessingStatus from "@/components/ProcessingStatus";
import { Loader2 } from "lucide-react";

// Document type display names
const DOC_TYPE_LABELS: Record<string, string> = {
  birth_certificate: "Birth Certificate",
  marriage_certificate: "Marriage Certificate",
  divorce_decree: "Divorce Decree",
  drivers_license: "Driver's License",
  passport: "Passport",
  police_clearance: "Police Clearance",
  diploma_degree: "Diploma/Degree",
  transcript: "Academic Transcript",
  medical_records: "Medical Records",
  legal_contract: "Legal Contract",
  immigration_document: "Immigration Document",
  court_document: "Court Document",
  bank_statement: "Bank Statement",
  employment_letter: "Employment Letter",
  power_of_attorney: "Power of Attorney",
  affidavit: "Affidavit",
  other: "Document",
};

// Complexity labels
const COMPLEXITY_LABELS: Record<string, string> = {
  easy: "Standard",
  medium: "Moderate",
  hard: "Complex",
};

export default function Step4Review() {
  const { state, completeProcessing, skipToEmail } = useQuote();
  const { languages, loading: optionsLoading } = useDropdownOptions();
  const { documents, totals, isRush, isLoading, isReady, error } =
    useQuotePricing(state.quoteId);

  // HITL Modal State
  const [showHitlModal, setShowHitlModal] = useState(false);
  const [hitlNote, setHitlNote] = useState('');
  const [isSubmittingHitl, setIsSubmittingHitl] = useState(false);
  const [hitlSubmitted, setHitlSubmitted] = useState(false);

  const handleRequestReview = async () => {
    setIsSubmittingHitl(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hitl-review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            quoteId: state.quoteId,
            reasons: ['customer_requested'],
            isCustomerRequested: true,
            customerNote: hitlNote || null
          })
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setHitlSubmitted(true);
      } else {
        throw new Error(result.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error requesting HITL:', error);
      alert('Error submitting request. Please try again.');
    } finally {
      setIsSubmittingHitl(false);
    }
  };

  // Get language names from IDs
  const sourceLanguage = languages.find((l) => l.id === state.sourceLanguageId);
  const targetLanguage = languages.find((l) => l.id === state.targetLanguageId);

  const languagePair =
    sourceLanguage && targetLanguage
      ? `${sourceLanguage.name} → ${targetLanguage.name}`
      : "Language pair not set";

  // If processing not complete, show processing status
  if (!isReady && state.quoteId) {
    return (
      <div className="space-y-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
            Preparing Your Quote
          </h1>
          <p className="text-base text-cethos-slate">
            We're analyzing your documents to provide accurate pricing
          </p>
        </div>
        <ProcessingStatus
          quoteId={state.quoteId}
          onComplete={completeProcessing}
          onEmailInstead={skipToEmail}
        />
        {isLoading && (
          <div className="animate-pulse space-y-3">
            <div className="h-24 bg-gray-200 rounded-lg"></div>
            <div className="h-24 bg-gray-200 rounded-lg"></div>
          </div>
        )}
      </div>
    );
  }

  // If there was an error loading pricing
  if (error) {
    return (
      <div className="space-y-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
            Quote Error
          </h1>
        </div>
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium mb-2">
            Unable to load quote pricing
          </p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (optionsLoading) {
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
          AI-powered analysis of your documents
        </p>
      </div>

      {/* AI Analysis Results - Document Cards */}
      <div className="space-y-4 mb-6">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="bg-white border-2 border-cethos-border rounded-xl p-6"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-cethos-navy mb-1">
                  {doc.filename}
                </h3>
                <p className="text-sm text-cethos-slate">
                  {DOC_TYPE_LABELS[doc.documentType] || doc.documentType} •{" "}
                  {doc.languageName} → English
                </p>
              </div>
              <span className="text-lg font-bold text-cethos-navy">
                ${doc.lineTotal.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-cethos-slate">Word Count:</span>
                <span className="ml-2 font-medium text-cethos-navy">
                  {doc.wordCount}
                </span>
              </div>
              <div>
                <span className="text-cethos-slate">Pages:</span>
                <span className="ml-2 font-medium text-cethos-navy">
                  {doc.pageCount}
                </span>
              </div>
              <div>
                <span className="text-cethos-slate">Billable Pages:</span>
                <span className="ml-2 font-medium text-cethos-navy">
                  {doc.billablePages}
                </span>
              </div>
              <div>
                <span className="text-cethos-slate">Complexity:</span>
                <span className="ml-2 font-medium text-cethos-navy">
                  {COMPLEXITY_LABELS[doc.complexity] || doc.complexity}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quote Summary - Now uses calculated_totals from database */}
      <div className="mb-6">
        <QuoteSummary
          translationTotal={totals.translation_total}
          certificationTotal={totals.certification_total}
          subtotal={totals.subtotal}
          rushFee={totals.rush_fee}
          taxRate={totals.tax_rate}
          taxAmount={totals.tax_amount}
          grandTotal={totals.total}
          isRush={isRush}
        />
      </div>

      {/* Human Review Notice */}
      <div>
        <HumanReviewNotice onRequestReview={() => setShowHitlModal(true)} />
      </div>

      {/* HITL Request Modal */}
      {showHitlModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            {!hitlSubmitted ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Request Human Review</h3>
                  <button
                    onClick={() => setShowHitlModal(false)}
                    className="text-gray-400 hover:text-gray-600 text-xl"
                  >
                    ×
                  </button>
                </div>

                <p className="text-gray-600 mb-4">
                  Our team will review your documents and email you an updated quote within 4 working hours.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Please tell us what concerns you (optional):
                  </label>
                  <textarea
                    value={hitlNote}
                    onChange={(e) => setHitlNote(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 h-24 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., The word count seems incorrect..."
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowHitlModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestReview}
                    disabled={isSubmittingHitl}
                    className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:bg-gray-400"
                  >
                    {isSubmittingHitl ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="text-green-500 text-5xl mb-4">✓</div>
                <h3 className="text-lg font-semibold mb-2">Review Requested</h3>
                <p className="text-gray-600 mb-4">
                  Your quote is being reviewed by our team.<br/>
                  We'll email you within 4 working hours.
                </p>
                <button
                  onClick={() => {
                    setShowHitlModal(false);
                    setHitlSubmitted(false);
                    setHitlNote('');
                  }}
                  className="px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
