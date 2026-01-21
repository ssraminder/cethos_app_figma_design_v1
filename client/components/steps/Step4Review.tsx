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
  const {
    documents,
    totals,
    isRush,
    hitlRequired,
    customerEmail,
    quoteNumber,
    isLoading,
    isReady,
    error,
  } = useQuotePricing(state.quoteId);

  // HITL Modal State
  const [showHitlModal, setShowHitlModal] = useState(false);
  const [hitlNote, setHitlNote] = useState("");
  const [isSubmittingHitl, setIsSubmittingHitl] = useState(false);
  const [hitlSubmitted, setHitlSubmitted] = useState(false);
  const [hitlRequestSubmitted, setHitlRequestSubmitted] = useState(false);

  // Check if system triggered HITL (not customer-requested)
  const isSystemTriggeredHitl = hitlRequired === true;

  const handleRequestReview = async () => {
    setIsSubmittingHitl(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quoteId: state.quoteId,
            triggerReasons: ["customer_requested"], // ✅ CORRECT
            isCustomerRequested: true,
            customerNote: hitlNote || null,
          }),
        },
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setHitlSubmitted(true); // Shows modal success
        setHitlRequestSubmitted(true); // Transforms the page
      } else {
        throw new Error(result.error || "Failed to submit request");
      }
    } catch (error) {
      console.error("Error requesting HITL:", error);
      alert("Error submitting request. Please try again.");
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
      {isSystemTriggeredHitl ? (
        // ========== SYSTEM-TRIGGERED HITL STATE ==========
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Pending Banner - Amber/Yellow theme */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="text-amber-500 text-3xl">⏳</div>
              <div>
                <h2 className="text-xl font-semibold text-amber-800 mb-2">
                  Additional Review Required
                </h2>
                <p className="text-amber-700 mb-3">
                  Our team needs to verify some details before we can finalize
                  your quote. This typically happens when:
                </p>
                <ul className="text-sm text-amber-700 space-y-1 mb-3">
                  <li>• Documents have unusual formatting</li>
                  <li>• Text is partially obscured or handwritten</li>
                  <li>• We want to ensure pricing accuracy</li>
                </ul>
                <p className="text-amber-700 font-medium">
                  We'll email you within 4 working hours with your confirmed
                  quote.
                </p>
              </div>
            </div>
          </div>

          {/* Quote Reference */}
          <div className="bg-white rounded-lg border p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Quote Reference</span>
              <span className="font-mono font-medium">
                {quoteNumber || "N/A"}
              </span>
            </div>
          </div>

          {/* Document Summary - Read Only */}
          <div className="bg-white rounded-lg border p-6 mb-6">
            <h3 className="font-medium text-gray-700 mb-4">
              Documents Submitted
            </h3>

            {documents.map((doc, index) => (
              <div
                key={index}
                className="flex justify-between items-start py-3 border-b last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-800">{doc.filename}</p>
                  <p className="text-sm text-gray-500">
                    {DOC_TYPE_LABELS[doc.documentType] || doc.documentType} •{" "}
                    {doc.languageName} → English
                  </p>
                  <div className="flex gap-4 text-sm text-gray-500 mt-1">
                    <span>{doc.wordCount || 0} words</span>
                    <span>{doc.pageCount || 0} pages</span>
                    <span>{doc.billablePages || 0} billable</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-400">Pending</p>
                  <p className="text-xs text-gray-400">Price TBD</p>
                </div>
              </div>
            ))}
          </div>

          {/* What Happens Next */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 className="font-medium text-gray-800 mb-3">
              What happens next?
            </h3>
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center font-medium">
                  1
                </span>
                <span>Our team reviews your documents for accuracy</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-medium">
                  2
                </span>
                <span>
                  We'll email you a confirmed quote with final pricing
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-medium">
                  3
                </span>
                <span>You can then proceed to payment</span>
              </li>
            </ol>
          </div>

          {/* Contact Info Reminder */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <span className="font-medium">We'll contact you at:</span>{" "}
              {customerEmail || "your registered email"}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => (window.location.href = "/")}
              className="px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium"
            >
              Return to Home
            </button>
            <button
              onClick={() => (window.location.href = "/contact")}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Contact Support
            </button>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            Questions? Email us at support@cethos.com
          </p>
        </div>
      ) : hitlRequestSubmitted ? (
        // ========== CUSTOMER-REQUESTED HITL STATE ==========
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Pending Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="text-amber-500 text-3xl">⏳</div>
              <div>
                <h2 className="text-lg font-semibold text-amber-800 mb-1">
                  Review Pending
                </h2>
                <p className="text-amber-700 mb-2">
                  Our team is reviewing your documents. We'll email you within 4
                  working hours.
                </p>
                <p className="text-sm text-amber-600">
                  Quote #{state.quoteId?.substring(0, 8)}
                </p>
              </div>
            </div>
          </div>

          {/* Document Summary - Read Only */}
          <div className="bg-white rounded-lg border p-6 mb-6">
            <h3 className="font-medium text-gray-700 mb-4">
              Documents Submitted
            </h3>

            {documents.map((doc, index) => (
              <div
                key={index}
                className="flex justify-between items-start py-3 border-b last:border-0"
              >
                <div>
                  <p className="font-medium">{doc.filename}</p>
                  <p className="text-sm text-gray-500">
                    {DOC_TYPE_LABELS[doc.documentType] || doc.documentType} •{" "}
                    {doc.languageName} → English
                  </p>
                  <p className="text-sm text-gray-500">
                    {doc.wordCount} words • {doc.pageCount} pages •{" "}
                    {doc.billablePages} billable
                  </p>
                </div>
                <p className="font-medium">${doc.lineTotal?.toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* What Happens Next */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 className="font-medium mb-3">What happens next?</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="font-medium text-gray-800">1.</span>
                Our team reviews your documents for accuracy
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-gray-800">2.</span>
                We'll email you an updated quote (if needed)
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-gray-800">3.</span>
                You can then proceed to payment
              </li>
            </ol>
          </div>

          {/* Action Button */}
          <div className="text-center">
            <button
              onClick={() => (window.location.href = "/")}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Return to Home
            </button>
            <p className="text-sm text-gray-500 mt-2">
              We'll email you when your quote is ready
            </p>
          </div>
        </div>
      ) : (
        // ========== NORMAL REVIEW STATE ==========
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
        </>
      )}

      {/* HITL Request Modal */}
      {showHitlModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            {!hitlSubmitted ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">
                    Request Human Review
                  </h3>
                  <button
                    onClick={() => setShowHitlModal(false)}
                    className="text-gray-400 hover:text-gray-600 text-xl"
                  >
                    ×
                  </button>
                </div>

                <p className="text-gray-600 mb-4">
                  Our team will review your documents and email you an updated
                  quote within 4 working hours.
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
                    {isSubmittingHitl ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="text-green-500 text-5xl mb-4">✓</div>
                <h3 className="text-lg font-semibold mb-2">Review Requested</h3>
                <p className="text-gray-600 mb-4">
                  Your quote is being reviewed by our team.
                  <br />
                  We'll email you within 4 working hours.
                </p>
                <button
                  onClick={() => {
                    setShowHitlModal(false);
                    setHitlSubmitted(false);
                    setHitlNote("");
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
