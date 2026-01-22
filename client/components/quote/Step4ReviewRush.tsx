import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import { format, addBusinessDays } from "date-fns";
import {
  FileText,
  Calendar,
  Zap,
  ChevronRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface DocumentInfo {
  name: string;
  fileName: string;
  pages: number;
}

interface RushOption {
  id: string;
  name: string;
  multiplier: number;
  days_reduction: number;
}

interface PricingSummary {
  translation_total: number;
  certification_total: number;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  total: number;
}

export default function Step4ReviewRush() {
  const { state, updateState, goToNextStep, goToPreviousStep } = useQuote();

  const [rushEnabled, setRushEnabled] = useState(false);
  const [rushOption, setRushOption] = useState<RushOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [certificationRequired, setCertificationRequired] = useState(false);

  useEffect(() => {
    fetchQuoteData();
  }, []);

  const fetchQuoteData = async () => {
    setLoading(true);
    try {
      // Fetch rush option from database
      const { data: rushData, error: rushError } = await supabase
        .from("delivery_options")
        .select("id, name, multiplier, days_reduction")
        .eq("category", "turnaround")
        .eq("is_rush", true)
        .eq("is_active", true)
        .single();

      if (rushError) {
        console.error("Error fetching rush option:", rushError);
      } else {
        setRushOption(rushData);
      }

      // Fetch quote details including pricing
      if (state.quoteId) {
        const { data: quoteData, error: quoteError } = await supabase
          .from("quotes")
          .select(
            `
            *,
            quote_documents(file_name, calculated_pages),
            source_language:languages!quotes_source_language_id_fkey(name),
            target_language:languages!quotes_target_language_id_fkey(name),
            intended_use:intended_uses(name, requires_certification)
          `,
          )
          .eq("id", state.quoteId)
          .single();

        if (quoteError) throw quoteError;

        // Process documents
        const docs =
          quoteData.quote_documents?.map((doc: any, index: number) => ({
            name: `Document ${index + 1}`,
            fileName: doc.file_name,
            pages: doc.calculated_pages || 1,
          })) || [];

        setDocuments(docs);
        setTotalPages(
          docs.reduce((sum: number, doc: DocumentInfo) => sum + doc.pages, 0),
        );
        setSourceLanguage((quoteData.source_language as any)?.name || "");
        setTargetLanguage((quoteData.target_language as any)?.name || "");
        setCertificationRequired(
          (quoteData.intended_use as any)?.requires_certification || false,
        );

        // Get or calculate pricing
        if (quoteData.calculated_totals) {
          setPricing(quoteData.calculated_totals as PricingSummary);
        } else {
          // Calculate pricing if not yet available
          await calculatePricing(
            docs.reduce((sum: number, doc: DocumentInfo) => sum + doc.pages, 0),
          );
        }
      }
    } catch (err) {
      console.error("Error fetching quote data:", err);
      toast.error("Failed to load quote details");
    } finally {
      setLoading(false);
    }
  };

  const calculatePricing = async (pages: number) => {
    try {
      // This would normally call a pricing calculation function
      // For now, use placeholder values
      const translationCost = pages * 25; // $25 per page
      const certificationCost = certificationRequired ? 35 : 0;
      const subtotal = translationCost + certificationCost;
      const taxRate = 0.05; // 5% GST
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;

      setPricing({
        translation_total: translationCost,
        certification_total: certificationCost,
        subtotal,
        tax_amount: taxAmount,
        tax_rate: taxRate,
        total,
      });
    } catch (err) {
      console.error("Error calculating pricing:", err);
    }
  };

  // Calculate delivery dates
  const calculateStandardDays = (pages: number): number => {
    if (pages <= 5) return 2;
    if (pages <= 15) return 4;
    return 7;
  };

  const standardDays = calculateStandardDays(totalPages);
  const rushDays = rushOption
    ? Math.max(1, standardDays - rushOption.days_reduction)
    : standardDays;

  const standardDeliveryDate = addBusinessDays(new Date(), standardDays);
  const rushDeliveryDate = addBusinessDays(new Date(), rushDays);

  const formattedStandardDate = format(standardDeliveryDate, "EEEE, MMM d");
  const formattedRushDate = format(rushDeliveryDate, "EEEE, MMM d");

  // Calculate rush fee
  const subtotal = pricing?.subtotal || 0;
  const rushFee =
    rushEnabled && rushOption ? subtotal * (rushOption.multiplier - 1) : 0;
  const subtotalWithRush = subtotal + rushFee;
  const taxAmount = subtotalWithRush * (pricing?.tax_rate || 0.05);
  const grandTotal = subtotalWithRush + taxAmount;

  const handleContinue = async () => {
    setSaving(true);
    try {
      // Save rush selection and updated totals to database
      if (state.quoteId) {
        const updatedTotals = {
          ...pricing,
          rush_fee: rushFee,
          subtotal: subtotalWithRush,
          tax_amount: taxAmount,
          total: grandTotal,
        };

        const { error } = await supabase
          .from("quotes")
          .update({
            delivery_speed: rushEnabled ? "rush" : "standard",
            calculated_totals: updatedTotals,
            estimated_delivery_date: (rushEnabled
              ? rushDeliveryDate
              : standardDeliveryDate
            ).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", state.quoteId);

        if (error) throw error;
      }

      // Update context state
      updateState({
        deliverySpeed: rushEnabled ? "rush" : "standard",
      });

      await goToNextStep();
    } catch (err) {
      console.error("Error saving rush selection:", err);
      toast.error("Failed to save delivery preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Review Your Quote
        </h2>
        <p className="text-gray-600">
          Confirm your details and choose delivery speed
        </p>
      </div>

      {/* Quote Summary Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Quote Summary</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Documents</span>
            <span className="font-medium text-gray-900">
              {documents.length}{" "}
              {documents.length === 1 ? "document" : "documents"}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Translation</span>
            <span className="font-medium text-gray-900">
              {sourceLanguage} → {targetLanguage}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Pages</span>
            <span className="font-medium text-gray-900">
              {totalPages} pages
            </span>
          </div>

          {/* Document List */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase mb-2">
              Documents
            </p>
            <div className="space-y-2">
              {documents.map((doc, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center text-sm"
                >
                  <span
                    className="text-gray-700 truncate max-w-[200px]"
                    title={doc.fileName}
                  >
                    {doc.fileName}
                  </span>
                  <span className="text-gray-500">{doc.pages} pages</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Price Breakdown Card */}
      {pricing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="bg-gray-50 -mx-6 -mt-6 px-6 py-3 rounded-t-xl mb-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase">
              Price Breakdown
            </h3>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Translation ({totalPages} pages)
              </span>
              <span className="font-medium text-gray-900">
                ${pricing.translation_total.toFixed(2)}
              </span>
            </div>

            {pricing.certification_total > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Certification</span>
                <span className="font-medium text-gray-900">
                  ${pricing.certification_total.toFixed(2)}
                </span>
              </div>
            )}

            <div className="pt-3 border-t border-gray-200 flex justify-between">
              <span className="font-medium text-gray-900">Subtotal</span>
              <span className="font-semibold text-gray-900">
                ${pricing.subtotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Estimated Delivery Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Estimated Delivery
          </h3>
        </div>

        {/* Standard Delivery */}
        <div className="mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Standard Delivery</span>
            <span className="text-sm font-medium text-gray-900">
              {formattedStandardDate}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {standardDays} business {standardDays === 1 ? "day" : "days"} from
            order placement
          </p>
        </div>

        {/* Rush Option Toggle */}
        {rushOption && (
          <div className="mt-4">
            <button
              onClick={() => setRushEnabled(!rushEnabled)}
              className={`w-full p-4 rounded-lg border-2 transition-all cursor-pointer ${
                rushEnabled
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      rushEnabled ? "bg-blue-500" : "bg-gray-200"
                    }`}
                  >
                    <Zap
                      className={`w-4 h-4 ${rushEnabled ? "text-white" : "text-gray-500"}`}
                    />
                  </div>
                  <span className="font-medium text-gray-900">
                    Rush Delivery
                  </span>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    rushEnabled
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {rushEnabled ? "ON" : "OFF"}
                </div>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">{formattedRushDate}</span>
                <span
                  className={`font-semibold ${rushEnabled ? "text-blue-600" : "text-gray-900"}`}
                >
                  +${rushFee.toFixed(2)}
                </span>
              </div>

              <p className="text-xs text-gray-500 text-left mt-1">
                {rushDays} business {rushDays === 1 ? "day" : "days"} • +
                {((rushOption.multiplier - 1) * 100).toFixed(0)}% fee
              </p>
            </button>
          </div>
        )}
      </div>

      {/* Total Card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 mb-8 text-white">
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-blue-100">Subtotal</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>

          {rushEnabled && rushFee > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-blue-100 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Rush Fee
              </span>
              <span className="font-medium">${rushFee.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm">
            <span className="text-blue-100">
              Tax ({((pricing?.tax_rate || 0.05) * 100).toFixed(0)}% GST)
            </span>
            <span className="font-medium">${taxAmount.toFixed(2)}</span>
          </div>

          <div className="pt-3 border-t border-blue-500 flex justify-between items-center">
            <span className="text-xl font-bold">TOTAL CAD</span>
            <span className="text-3xl font-bold">${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between gap-4">
        <button
          onClick={goToPreviousStep}
          disabled={saving}
          className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        <button
          onClick={handleContinue}
          disabled={saving}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* Confirmation Message */}
      {!saving && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span>Your quote is saved automatically</span>
        </div>
      )}
    </div>
  );
}
