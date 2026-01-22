import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import { format, isWeekend, isSameDay } from "date-fns";
import {
  FileText,
  Calendar,
  Zap,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface DocumentInfo {
  name: string;
  fileName: string;
  pages: number;
}

interface TurnaroundOption {
  id: string;
  code: string;
  name: string;
  description: string;
  multiplier: number;
  days_reduction: number;
  is_rush: boolean;
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

  // Turnaround options
  const [turnaroundType, setTurnaroundType] = useState<
    "standard" | "rush" | "same_day"
  >(state.turnaroundType || "standard");
  const [turnaroundOptions, setTurnaroundOptions] = useState<
    TurnaroundOption[]
  >([]);

  // Availability checks
  const [isSameDayEligible, setIsSameDayEligible] = useState(false);
  const [isRushAvailable, setIsRushAvailable] = useState(true);
  const [isSameDayAvailable, setIsSameDayAvailable] = useState(false);

  // Data
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [intendedUse, setIntendedUse] = useState("");

  // Delivery dates
  const [standardDays, setStandardDays] = useState(2);
  const [standardDeliveryDate, setStandardDeliveryDate] = useState<Date>(
    new Date(),
  );
  const [rushDeliveryDate, setRushDeliveryDate] = useState<Date>(new Date());

  useEffect(() => {
    fetchQuoteData();
  }, []);

  useEffect(() => {
    checkAvailability();
  }, [sourceLanguage, targetLanguage, documentType, intendedUse]);

  const fetchQuoteData = async () => {
    setLoading(true);
    try {
      // Fetch turnaround options from database
      const { data: turnaroundData, error: turnaroundError } = await supabase
        .from("delivery_options")
        .select(
          "id, code, name, description, multiplier, days_reduction, is_rush",
        )
        .eq("category", "turnaround")
        .eq("is_active", true)
        .order("sort_order");

      if (turnaroundError) {
        console.error("Error fetching turnaround options:", turnaroundError);
      } else {
        setTurnaroundOptions(turnaroundData || []);
      }

      // Fetch quote details including pricing
      if (state.quoteId) {
        const { data: quoteData, error: quoteError } = await supabase
          .from("quotes")
          .select(
            `
            *,
            quote_documents(file_name, calculated_pages),
            source_language:languages!quotes_source_language_id_fkey(name, code),
            target_language:languages!quotes_target_language_id_fkey(name, code),
            intended_use:intended_uses(name, code, requires_certification),
            document_type:document_types(name, code)
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
        const pages = docs.reduce(
          (sum: number, doc: DocumentInfo) => sum + doc.pages,
          0,
        );
        setTotalPages(pages);

        // Extract language/document info for same-day check
        setSourceLanguage((quoteData.source_language as any)?.code || "");
        setTargetLanguage((quoteData.target_language as any)?.code || "");
        setDocumentType((quoteData.document_type as any)?.code || "");
        setIntendedUse((quoteData.intended_use as any)?.code || "");

        // Get or calculate pricing
        if (quoteData.calculated_totals) {
          setPricing(quoteData.calculated_totals as PricingSummary);
        } else {
          await calculatePricing(
            pages,
            quoteData.intended_use?.requires_certification,
          );
        }

        // Calculate delivery dates
        const days = calculateStandardDays(pages);
        setStandardDays(days);
        const standardDate = await getDeliveryDate(days);
        const rushDate = await getDeliveryDate(Math.max(1, days - 1));
        setStandardDeliveryDate(standardDate);
        setRushDeliveryDate(rushDate);
      }
    } catch (err) {
      console.error("Error fetching quote data:", err);
      toast.error("Failed to load quote details");
    } finally {
      setLoading(false);
    }
  };

  const calculatePricing = async (
    pages: number,
    requiresCertification: boolean,
  ) => {
    try {
      const translationCost = pages * 25; // $25 per page
      const certificationCost = requiresCertification ? 35 : 0;
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

  // Calculate turnaround days: 2 + floor((pages-1)/2)
  const calculateStandardDays = (pages: number): number => {
    return 2 + Math.floor((pages - 1) / 2);
  };

  // Calculate delivery date (skip weekends and holidays)
  const getDeliveryDate = async (daysToAdd: number): Promise<Date> => {
    // Fetch holidays from database
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date")
      .gte("holiday_date", new Date().toISOString())
      .eq("is_active", true);

    const holidayDates = holidays?.map((h) => new Date(h.holiday_date)) || [];

    let date = new Date();
    let addedDays = 0;

    while (addedDays < daysToAdd) {
      date.setDate(date.getDate() + 1);

      // Skip weekends
      if (isWeekend(date)) continue;

      // Skip holidays
      if (holidayDates.some((h) => isSameDay(h, date))) continue;

      addedDays++;
    }

    return date;
  };

  // Check cutoff time (MST timezone)
  const checkCutoffTime = (
    cutoffHour: number,
    cutoffMinute: number,
  ): boolean => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Not available on weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    // Get current time in MST (America/Edmonton)
    const mstTime = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Edmonton" }),
    );
    const currentHour = mstTime.getHours();
    const currentMinute = mstTime.getMinutes();

    // Check if before cutoff
    if (currentHour < cutoffHour) return true;
    if (currentHour === cutoffHour && currentMinute < cutoffMinute) return true;

    return false;
  };

  // Check same-day eligibility from database
  const checkAvailability = async () => {
    if (!sourceLanguage || !targetLanguage || !documentType || !intendedUse) {
      return;
    }

    // Check if same-day eligible
    const { data, error } = await supabase
      .from("same_day_eligibility")
      .select("*")
      .eq("source_language", sourceLanguage)
      .eq("target_language", targetLanguage)
      .eq("document_type", documentType)
      .eq("intended_use", intendedUse)
      .eq("is_active", true)
      .maybeSingle();

    const isEligible = !!data && !error;
    setIsSameDayEligible(isEligible);

    // Check cutoff times
    const rushAvail = checkCutoffTime(16, 30); // 4:30 PM
    const sameDayAvail = isEligible && checkCutoffTime(14, 0); // 2:00 PM

    setIsRushAvailable(rushAvail);
    setIsSameDayAvailable(sameDayAvail);
  };

  // Calculate fees based on selection
  const calculateFees = () => {
    const subtotal = pricing?.subtotal || 0;
    let turnaroundFee = 0;

    const selectedOption = turnaroundOptions.find(
      (opt) => opt.code === turnaroundType,
    );

    if (selectedOption && selectedOption.is_rush) {
      turnaroundFee = subtotal * (selectedOption.multiplier - 1);
    }

    const subtotalWithTurnaround = subtotal + turnaroundFee;
    const taxAmount = subtotalWithTurnaround * (pricing?.tax_rate || 0.05);
    const total = subtotalWithTurnaround + taxAmount;

    return { turnaroundFee, taxAmount, total };
  };

  const { turnaroundFee, taxAmount, total } = calculateFees();

  const handleContinue = async () => {
    setSaving(true);
    try {
      // Save turnaround selection and updated totals to database
      if (state.quoteId) {
        const updatedTotals = {
          ...pricing,
          rush_fee: turnaroundFee,
          subtotal: (pricing?.subtotal || 0) + turnaroundFee,
          tax_amount: taxAmount,
          total: total,
        };

        const { error } = await supabase
          .from("quotes")
          .update({
            turnaround_type: turnaroundType,
            calculated_totals: updatedTotals,
            estimated_delivery_date:
              turnaroundType === "same_day"
                ? new Date().toISOString()
                : turnaroundType === "rush"
                  ? rushDeliveryDate.toISOString()
                  : standardDeliveryDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", state.quoteId);

        if (error) throw error;
      }

      // Update context state
      updateState({
        turnaroundType,
        turnaroundFee,
      });

      await goToNextStep();
    } catch (err) {
      console.error("Error saving turnaround selection:", err);
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

  const standardOption = turnaroundOptions.find(
    (opt) => opt.code === "standard",
  );
  const rushOption = turnaroundOptions.find((opt) => opt.code === "rush");
  const sameDayOption = turnaroundOptions.find(
    (opt) => opt.code === "same_day",
  );

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Review Your Quote
        </h2>
        <p className="text-gray-600">
          Confirm your details and choose turnaround time
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
              Base Price
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

      {/* Turnaround Time Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Turnaround Time</h2>
          <p className="text-sm text-gray-500">Choose your delivery speed</p>
        </div>
        <div className="px-6 py-4 space-y-3">
          {/* Standard Option */}
          {standardOption && (
            <label
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                turnaroundType === "standard"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="turnaround"
                value="standard"
                checked={turnaroundType === "standard"}
                onChange={() => setTurnaroundType("standard")}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-600" />
                    <p className="font-medium text-gray-900">
                      {standardOption.name}
                    </p>
                  </div>
                  <span className="text-gray-600">Included</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Ready by {format(standardDeliveryDate, "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-xs text-gray-400">
                  {standardDays} business {standardDays === 1 ? "day" : "days"}{" "}
                  based on document length
                </p>
              </div>
              {turnaroundType === "standard" && (
                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}
            </label>
          )}

          {/* Rush Option */}
          {rushOption && (
            <label
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                turnaroundType === "rush"
                  ? "border-blue-500 bg-blue-50"
                  : !isRushAvailable
                    ? "border-gray-200 bg-gray-100 cursor-not-allowed opacity-60"
                    : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="turnaround"
                value="rush"
                checked={turnaroundType === "rush"}
                onChange={() => isRushAvailable && setTurnaroundType("rush")}
                disabled={!isRushAvailable}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-600" />
                    <p className="font-medium text-gray-900">
                      {rushOption.name}
                    </p>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                      +{((rushOption.multiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="font-semibold text-amber-600">
                    +$
                    {(
                      (pricing?.subtotal || 0) *
                      (rushOption.multiplier - 1)
                    ).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Ready by {format(rushDeliveryDate, "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-xs text-gray-400">
                  1 day faster • Order by 4:30 PM MST Mon-Fri
                  {!isRushAvailable && (
                    <span className="text-red-500 ml-1">(Cutoff passed)</span>
                  )}
                </p>
              </div>
              {turnaroundType === "rush" && (
                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}
            </label>
          )}

          {/* Same-Day Option - Only show if eligible */}
          {sameDayOption && isSameDayEligible && (
            <label
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                turnaroundType === "same_day"
                  ? "border-green-500 bg-green-50"
                  : !isSameDayAvailable
                    ? "border-gray-200 bg-gray-100 cursor-not-allowed opacity-60"
                    : "border-green-200 hover:border-green-300"
              }`}
            >
              <input
                type="radio"
                name="turnaround"
                value="same_day"
                checked={turnaroundType === "same_day"}
                onChange={() =>
                  isSameDayAvailable && setTurnaroundType("same_day")
                }
                disabled={!isSameDayAvailable}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-green-600" />
                    <p className="font-medium text-gray-900">
                      {sameDayOption.name}
                    </p>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      +{((sameDayOption.multiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="font-semibold text-green-600">
                    +$
                    {(
                      (pricing?.subtotal || 0) *
                      (sameDayOption.multiplier - 1)
                    ).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Ready TODAY by 6:00 PM MST
                </p>
                <p className="text-xs text-gray-400">
                  Order by 2:00 PM MST • Limited availability
                  {!isSameDayAvailable && (
                    <span className="text-red-500 ml-1">(Cutoff passed)</span>
                  )}
                </p>
              </div>
              {turnaroundType === "same_day" && (
                <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}
            </label>
          )}
        </div>
      </div>

      {/* Total Card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 mb-8 text-white">
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-blue-100">Subtotal</span>
            <span className="font-medium">
              ${(pricing?.subtotal || 0).toFixed(2)}
            </span>
          </div>

          {turnaroundFee > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-blue-100 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Turnaround Fee
              </span>
              <span className="font-medium">${turnaroundFee.toFixed(2)}</span>
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
            <span className="text-3xl font-bold">${total.toFixed(2)}</span>
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
    </div>
  );
}
