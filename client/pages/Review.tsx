import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import Footer from "@/components/Footer";
import DocumentPricingCard from "@/components/DocumentPricingCard";
import QuoteSummary from "@/components/QuoteSummary";
import HumanReviewNotice from "@/components/HumanReviewNotice";

export default function Review() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/details");
  };

  const handleContinue = () => {
    navigate("/contact");
  };

  const handleRequestReview = () => {
    console.log("Human review requested");
    // Handle human review request
  };

  // Generate a random quote number
  const quoteNumber = `QT-2026-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Mock document data
  const documents = [
    {
      filename: "passport-document.pdf",
      languagePair: "German → English",
      translationPrice: 65,
      certificationPrice: 50,
      pages: 1,
    },
    {
      filename: "birth-certificate.pdf",
      languagePair: "German → English",
      translationPrice: 65,
      certificationPrice: 50,
      pages: 1,
    },
  ];

  // Calculate totals
  const translationTotal = documents.reduce((sum, doc) => sum + doc.translationPrice, 0);
  const certificationTotal = documents.reduce((sum, doc) => sum + doc.certificationPrice, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 w-full">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-8 sm:py-12 lg:py-16">
          {/* Step Indicator */}
          <StepIndicator currentStep={3} />

          {/* Content Container */}
          <div className="max-w-[896px] mx-auto">
            {/* Page Title & Quote Badge */}
            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy">
                  Review Your Quote
                </h1>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border border-cethos-border text-cethos-slate-dark font-mono text-sm">
                    {quoteNumber}
                  </span>
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                    Valid for 30 days
                  </span>
                </div>
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
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer
        onBack={handleBack}
        onContinue={handleContinue}
        canContinue={true}
        showBack={true}
      />
    </div>
  );
}
