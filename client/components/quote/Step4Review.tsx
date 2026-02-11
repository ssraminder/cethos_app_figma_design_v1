import { useState, useEffect, useRef, Fragment } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  Search,
  Loader2,
  ChevronRight,
  Mail,
  Camera,
  Globe,
  FileText,
} from "lucide-react";
import StartOverLink from "@/components/StartOverLink";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

interface DocumentRow {
  id: string;
  detected_document_type: string;
  extracted_holder_name: string | null;
  billable_pages: number;
  base_rate: number;
  line_total: number;
  certification_type_id: string | null;
  certification_price: number;
  certification_name: string | null;
  certification_code: string | null;
}

type ViewType = "ready" | "review" | "processing";

interface ReviewFile {
  original_filename: string;
  processing_status: string | null;
  assessed_complexity: string | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Step4Review() {
  const { state, goToNextStep, goToPreviousStep } = useQuote();

  const [view, setView] = useState<ViewType>("processing");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [quoteTotals, setQuoteTotals] = useState<{
    subtotal: number;
    certification_total: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    calculated_totals: Record<string, number> | null;
  } | null>(null);
  const [reviewFiles, setReviewFiles] = useState<ReviewFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifyConfirmed, setNotifyConfirmed] = useState(false);

  // Polling refs
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // ── Mount: check processing status ────────────────────────────────────

  useEffect(() => {
    checkProcessingStatus();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [state.quoteId]);

  // ── Core logic ────────────────────────────────────────────────────────

  const checkProcessingStatus = async () => {
    if (!state.quoteId) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("quotes")
        .select("processing_status")
        .eq("id", state.quoteId)
        .single();

      if (error) throw error;

      if (data?.processing_status === "quote_ready") {
        setView("ready");
        await loadPricingData();
      } else if (data?.processing_status === "review_required") {
        setView("review");
        await loadReviewReasons();
      } else {
        // Still processing or unknown status
        setView("processing");
        startPolling();
      }
    } catch (err) {
      console.error("Error checking processing status:", err);
      setView("processing");
      startPolling();
    } finally {
      setLoading(false);
    }
  };

  const loadPricingData = async () => {
    if (!state.quoteId) return;

    try {
      // Query 1: AI analysis results with certification info
      const { data: analysisData, error: analysisError } = await supabase
        .from("ai_analysis_results")
        .select(
          `id,
          detected_document_type,
          extracted_holder_name,
          billable_pages,
          base_rate,
          line_total,
          certification_type_id,
          certification_price,
          certification_types (
            name,
            code
          )`,
        )
        .eq("quote_id", state.quoteId)
        .order("created_at");

      if (analysisError) throw analysisError;

      const docs: DocumentRow[] = (analysisData || []).map((r: any) => ({
        id: r.id,
        detected_document_type: r.detected_document_type || "Document",
        extracted_holder_name: r.extracted_holder_name || null,
        billable_pages: r.billable_pages || 0,
        base_rate: r.base_rate || 0,
        line_total: parseFloat(r.line_total) || 0,
        certification_type_id: r.certification_type_id || null,
        certification_price: parseFloat(r.certification_price) || 0,
        certification_name: r.certification_types?.name || null,
        certification_code: r.certification_types?.code || null,
      }));

      setDocuments(docs);

      // Query 2: Quote totals
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          "subtotal, certification_total, tax_rate, tax_amount, total, calculated_totals",
        )
        .eq("id", state.quoteId)
        .single();

      if (quoteError) throw quoteError;

      setQuoteTotals(quoteData);
    } catch (err) {
      console.error("Error loading pricing data:", err);
      toast.error("Failed to load pricing data");
    }
  };

  const loadReviewReasons = async () => {
    if (!state.quoteId) return;

    try {
      // Fetch quote_files with their analysis results
      const { data, error } = await supabase
        .from("quote_files")
        .select(
          `original_filename,
          ai_analysis_results (
            processing_status,
            assessed_complexity
          )`,
        )
        .eq("quote_id", state.quoteId);

      if (error) throw error;

      const files: ReviewFile[] = (data || []).map((f: any) => ({
        original_filename: f.original_filename,
        processing_status:
          f.ai_analysis_results?.[0]?.processing_status || null,
        assessed_complexity:
          f.ai_analysis_results?.[0]?.assessed_complexity || null,
      }));

      setReviewFiles(files);
    } catch (err) {
      console.error("Error loading review reasons:", err);
    }
  };

  const startPolling = () => {
    if (pollIntervalRef.current) return;

    pollStartRef.current = Date.now();

    pollIntervalRef.current = setInterval(async () => {
      if (!state.quoteId) return;

      const elapsed = Date.now() - pollStartRef.current;

      // 45-second timeout fallback
      if (elapsed >= 45000) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;

        // Update quote to review_required so customer is never stuck
        await supabase
          .from("quotes")
          .update({ processing_status: "review_required" })
          .eq("id", state.quoteId);

        setView("review");
        await loadReviewReasons();
        return;
      }

      // Poll processing status
      const { data } = await supabase
        .from("quotes")
        .select("processing_status")
        .eq("id", state.quoteId)
        .single();

      if (data?.processing_status === "quote_ready") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setView("ready");
        setLoading(true);
        await loadPricingData();
        setLoading(false);
      } else if (data?.processing_status === "review_required") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setView("review");
        await loadReviewReasons();
      }
    }, 3000);
  };

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleContinue = async () => {
    setSaving(true);
    try {
      if (state.quoteId) {
        const { error } = await supabase
          .from("quotes")
          .update({ status: "quote_ready" })
          .eq("id", state.quoteId);

        if (error) throw error;
      }
      goToNextStep();
    } catch (err) {
      console.error("Error updating quote status:", err);
      toast.error("Failed to continue. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyMe = () => {
    setNotifyConfirmed(true);
    toast.success(
      `We'll email you at ${state.email} when your quote is ready.`,
    );
  };

  // ── Helpers ───────────────────────────────────────────────────────────

  const getCertBadgeStyles = (code: string | null): string => {
    switch (code) {
      case "commissioner":
        return "bg-teal-50 text-teal-700";
      case "notarization":
        return "bg-purple-50 text-purple-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const formatDocType = (type: string): string => {
    return type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Derived totals
  const translationTotal =
    quoteTotals?.calculated_totals?.translation_total ??
    quoteTotals?.subtotal ??
    documents.reduce((sum, d) => sum + d.line_total, 0);

  const certificationTotal =
    quoteTotals?.calculated_totals?.certification_total ??
    quoteTotals?.certification_total ??
    documents.reduce((sum, d) => sum + d.certification_price, 0);

  const subtotal = translationTotal + certificationTotal;
  const taxRate = 0.05;
  const taxAmount = subtotal * taxRate;
  const estimatedTotal = subtotal + taxAmount;
  const docCount = documents.length;

  // Review reasons for View 4B
  const getReviewReasons = (): { icon: React.ReactNode; text: string }[] => {
    const reasons: { icon: React.ReactNode; text: string }[] = [];

    const hasLowQuality = reviewFiles.some(
      (f) =>
        f.assessed_complexity === "hard" || f.processing_status === "failed",
    );
    const hasMultipleFiles = reviewFiles.length > 1;

    if (hasLowQuality) {
      reasons.push({
        icon: <Camera className="w-5 h-5 text-gray-400 flex-shrink-0" />,
        text: "Low scan quality \u2014 we want to make sure we read everything correctly",
      });
    }

    if (hasMultipleFiles) {
      reasons.push({
        icon: <Globe className="w-5 h-5 text-gray-400 flex-shrink-0" />,
        text: "Multiple languages detected \u2014 confirming which portions need translation",
      });
    }

    if (reasons.length === 0) {
      reasons.push({
        icon: <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />,
        text: "Our team is reviewing your documents for the most accurate pricing.",
      });
    }

    return reasons;
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading && view !== "processing") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
        <span className="ml-3 text-gray-600">Loading pricing data...</span>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // VIEW 4C: Still Processing
  // ════════════════════════════════════════════════════════════════════════

  if (view === "processing") {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div
          className="text-center bg-white rounded-[14px] border border-gray-200"
          style={{ padding: "44px 20px" }}
        >
          <Loader2 className="w-12 h-12 animate-spin text-cethos-teal mx-auto" />

          <h2 className="mt-6 text-xl font-bold text-gray-900">
            Analyzing Your Documents
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Reading and analyzing your documents for an accurate quote.
            <br />
            Usually less than 30 seconds.
          </p>

          <div className="mt-4 flex justify-center gap-1.5">
            <span className="w-2 h-2 bg-cethos-teal rounded-full animate-pulse" />
            <span className="w-2 h-2 bg-cethos-teal rounded-full animate-pulse [animation-delay:0.2s]" />
            <span className="w-2 h-2 bg-cethos-teal rounded-full animate-pulse [animation-delay:0.4s]" />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <StartOverLink />
          <div className="flex items-center gap-4">
            <button
              onClick={goToPreviousStep}
              className="px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors"
            >
              &larr; Back
            </button>
            <button
              disabled
              className="px-6 py-3 bg-gray-300 text-white rounded-lg cursor-not-allowed font-semibold"
            >
              Waiting&hellip;
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // VIEW 4B: Review Required
  // ════════════════════════════════════════════════════════════════════════

  if (view === "review") {
    const reasons = getReviewReasons();

    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div
          className="text-center bg-white rounded-[14px] border border-gray-200"
          style={{ padding: "44px 20px" }}
        >
          <Search className="w-14 h-14 text-cethos-teal mx-auto" />

          <h2 className="mt-6 text-xl font-bold text-gray-900">
            Your Quote Needs a Quick Review
          </h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
            Our team needs to verify a few details before finalizing your
            pricing. Usually takes less than 2 hours during business hours.
          </p>

          {/* Reasons */}
          <div className="mt-6 space-y-3 text-left max-w-md mx-auto">
            {reasons.map((reason, idx) => (
              <div key={idx} className="flex items-start gap-3">
                {reason.icon}
                <span className="text-sm text-gray-600">{reason.text}</span>
              </div>
            ))}
          </div>

          {/* Email notification */}
          <p className="mt-6 text-sm text-gray-500">
            We&rsquo;ll email you at{" "}
            <span className="font-medium text-gray-700">{state.email}</span>
            <br />
            as soon as your quote is ready.
          </p>

          {/* Notify button */}
          {!notifyConfirmed ? (
            <button
              onClick={handleNotifyMe}
              className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light font-semibold transition-colors"
            >
              <Mail className="w-4 h-4" />
              Save &amp; Notify Me When Ready
            </button>
          ) : (
            <div className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-green-50 text-green-700 rounded-lg font-medium">
              <CheckCircle2 className="w-4 h-4" />
              We&rsquo;ll email you at {state.email} when your quote is ready.
            </div>
          )}

          <p className="mt-4 text-xs text-gray-400">
            You can also check back anytime &mdash; your progress is saved.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <StartOverLink />
          <div className="flex items-center gap-4">
            <button
              onClick={goToPreviousStep}
              className="px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors"
            >
              &larr; Back
            </button>
            <button
              disabled
              className="px-6 py-3 bg-gray-300 text-white rounded-lg cursor-not-allowed font-semibold"
            >
              Continue &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // VIEW 4A: Quote Ready — Pricing Table
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="text-sm font-medium text-green-600">
            Analysis Complete
          </span>
        </div>
        <h2 className="text-3xl font-bold text-cethos-navy">
          Review Your Quote
        </h2>
        <p className="text-cethos-gray mt-1">
          Here&rsquo;s your quote breakdown with certifications per document.
        </p>
      </div>

      {/* Documents & Certifications Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">
            Documents &amp; Certifications
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.5px] text-gray-500 px-2.5 py-[7px]">
                  Document
                </th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.5px] text-gray-500 px-2.5 py-[7px]">
                  Pages
                </th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.5px] text-gray-500 px-2.5 py-[7px]">
                  Rate
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-[0.5px] text-gray-500 px-2.5 py-[7px]">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <Fragment key={doc.id}>
                  {/* Document row */}
                  <tr className="border-b border-gray-100">
                    <td className="px-2.5 py-[9px]">
                      <div className="font-semibold text-gray-800 text-[13px]">
                        {formatDocType(doc.detected_document_type)}
                      </div>
                      {doc.extracted_holder_name && (
                        <div className="text-[11px] text-gray-400">
                          {doc.extracted_holder_name}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-[9px] text-[13px] text-gray-700">
                      {doc.billable_pages.toFixed(2)}
                    </td>
                    <td className="px-2.5 py-[9px] text-[13px] text-gray-700">
                      ${doc.base_rate.toFixed(2)}
                    </td>
                    <td className="px-2.5 py-[9px] text-[13px] text-gray-700 text-right">
                      ${(doc.billable_pages * doc.base_rate).toFixed(2)}
                    </td>
                  </tr>

                  {/* Certification row (if applicable) */}
                  {doc.certification_type_id && doc.certification_price > 0 && (
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <td
                        colSpan={3}
                        className="pl-[30px] pr-2.5 py-[9px] text-[12px] text-gray-500"
                      >
                        <span className="mr-1.5">&cularr;</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${getCertBadgeStyles(doc.certification_code)}`}
                        >
                          {doc.certification_name || "Certification"}
                        </span>
                      </td>
                      <td className="px-2.5 py-[9px] text-[12px] text-gray-500 text-right">
                        ${doc.certification_price.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8">
        <div className="px-4 sm:px-6 py-4 space-y-3">
          <div className="flex justify-between text-sm text-gray-700">
            <span>
              Translation ({docCount} doc{docCount !== 1 ? "s" : ""})
            </span>
            <span>${translationTotal.toFixed(2)}</span>
          </div>

          {certificationTotal > 0 && (
            <div className="flex justify-between text-sm text-gray-700">
              <span>Certifications</span>
              <span>${certificationTotal.toFixed(2)}</span>
            </div>
          )}

          <div className="border-t border-gray-200 pt-3 flex justify-between text-sm font-medium text-gray-900">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-sm text-gray-600">
            <span>Est. Tax (GST 5%)</span>
            <span>${taxAmount.toFixed(2)}</span>
          </div>

          <p className="text-xs text-gray-400">
            * Estimated tax &mdash; actual calculated at billing step based on
            province.
          </p>

          <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
            <span className="font-bold text-gray-900">Estimated Total</span>
            <span className="text-xl font-bold text-gray-900">
              ${estimatedTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <StartOverLink />
        <div className="flex items-center gap-4">
          <button
            onClick={goToPreviousStep}
            disabled={saving}
            className="px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &larr; Back
          </button>
          <button
            onClick={handleContinue}
            disabled={saving}
            className="px-6 py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Continue to Delivery
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
