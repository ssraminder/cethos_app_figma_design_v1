import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getStartNewQuoteRoute } from "@/utils/navigationHelpers";
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
  RefreshCw,
  Info,
  CheckCircle,
} from "lucide-react";
import StartOverLink from "@/components/StartOverLink";
import { toast } from "sonner";

interface DocumentAnalysis {
  id: string;
  quote_file_id: string;
  detected_language: string;
  language_name: string;
  detected_document_type: string;
  assessed_complexity: string;
  word_count: number;
  page_count: number;
  billable_pages: number;
  base_rate: number;
  line_total: string;
  certification_price: string;
  processing_status: string;
  ocr_confidence: number | null;
  language_confidence: number | null;
  document_type_confidence: number | null;
  complexity_confidence: number | null;
  quote_files: {
    id: string;
    original_filename: string;
  };
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

interface Totals {
  translationSubtotal: number;
  certificationTotal: number;
  subtotal: number;
}

export default function Step4ReviewRush() {
  const { state, updateState, goToNextStep, goToPreviousStep } = useQuote();
  const navigate = useNavigate();

  // HITL Request State
  const [showHitlModal, setShowHitlModal] = useState(false);
  const [showHitlSuccessModal, setShowHitlSuccessModal] = useState(false);
  const [hitlNote, setHitlNote] = useState("");
  const [hitlSubmitting, setHitlSubmitting] = useState(false);
  const [hitlRequested, setHitlRequested] = useState(false);
  const [hitlRequired, setHitlRequired] = useState(false);
  const [hitlReason, setHitlReason] = useState("");

  // Turnaround options
  const [turnaroundType, setTurnaroundType] = useState<
    "standard" | "rush" | "same_day"
  >(state.turnaroundType || "standard");
  const [turnaroundOptions, setTurnaroundOptions] = useState<
    TurnaroundOption[]
  >([]);
  const [rushMultiplier, setRushMultiplier] = useState(1.3);
  const [sameDayMultiplier, setSameDayMultiplier] = useState(2.0);
  const [rushCutoffHour, setRushCutoffHour] = useState(16);
  const [rushCutoffMinute, setRushCutoffMinute] = useState(30);
  const [sameDayCutoffHour, setSameDayCutoffHour] = useState(14);
  const [sameDayCutoffMinute, setSameDayCutoffMinute] = useState(0);
  const [rushTurnaroundDays, setRushTurnaroundDays] = useState(1);

  // Availability checks
  const [isSameDayEligible, setIsSameDayEligible] = useState(false);
  const [isRushAvailable, setIsRushAvailable] = useState(true);
  const [isSameDayAvailable, setIsSameDayAvailable] = useState(false);

  // Data from AI analysis
  const [documents, setDocuments] = useState<DocumentAnalysis[]>([]);
  const [totals, setTotals] = useState<Totals>({
    translationSubtotal: 0,
    certificationTotal: 0,
    subtotal: 0,
  });

  // State management
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingState, setProcessingState] = useState<
    "loading" | "processing" | "complete" | "no_data"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);

  // Language/document info for same-day eligibility
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [targetLanguageName, setTargetLanguageName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [baseRate, setBaseRate] = useState(65);
  const [languageMultiplier, setLanguageMultiplier] = useState(1.0);

  // Delivery dates
  const [standardDays, setStandardDays] = useState(2);
  const [standardDeliveryDate, setStandardDeliveryDate] = useState<Date>(
    new Date(),
  );
  const [rushDeliveryDate, setRushDeliveryDate] = useState<Date>(new Date());

  useEffect(() => {
    fetchTurnaroundOptions();
    fetchAnalysisData();
  }, [state.quoteId]);

  useEffect(() => {
    if (sourceLanguage && targetLanguage && documentType && intendedUse) {
      checkAvailability();
    }
  }, [sourceLanguage, targetLanguage, documentType, intendedUse]);

  // Auto-polling effect
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    if (processingState === "processing" && !isPolling) {
      console.log("🔄 Starting auto-poll (every 3 seconds, 45 second timeout)");
      setIsPolling(true);
      setPollAttempts(0);

      // Poll every 3 seconds
      pollInterval = setInterval(() => {
        setPollAttempts((prev) => {
          const newCount = prev + 1;
          console.log(`🔄 Poll attempt ${newCount}`);
          return newCount;
        });
        fetchAnalysisData();
      }, 3000);

      // 45 second timeout
      timeoutId = setTimeout(() => {
        console.log("⏰ Polling timeout reached (45 seconds)");
        if (pollInterval) clearInterval(pollInterval);
        setIsPolling(false);
        handleAutoHITLFallback("timeout");
      }, 45000);
    }

    return () => {
      if (pollInterval) {
        console.log("🛑 Clearing poll interval");
        clearInterval(pollInterval);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (processingState !== "processing") {
        setIsPolling(false);
      }
    };
  }, [processingState]);

  const fetchTurnaroundOptions = async () => {
    try {
      const { data: turnaroundData, error: turnaroundError } = await supabase
        .from("delivery_options")
        .select(
          "id, code, name, description, multiplier, days_reduction, is_rush",
        )
        .eq("category", "turnaround")
        .eq("is_active", true)
        .order("sort_order");

      const { data: settingsData } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "rush_multiplier",
          "same_day_multiplier",
          "rush_cutoff_hour",
          "rush_cutoff_minute",
          "same_day_cutoff_hour",
          "same_day_cutoff_minute",
          "rush_turnaround_days",
        ]);

      const settings = (settingsData || []).reduce(
        (acc: Record<string, number>, setting) => {
          const parsed = Number(setting.setting_value);
          if (!Number.isNaN(parsed)) {
            acc[setting.setting_key] = parsed;
          }
          return acc;
        },
        {},
      );

      const nextRushMultiplier = settings.rush_multiplier || rushMultiplier;
      const nextSameDayMultiplier =
        settings.same_day_multiplier || sameDayMultiplier;
      const nextRushDays = settings.rush_turnaround_days || rushTurnaroundDays;

      setRushMultiplier(nextRushMultiplier);
      setSameDayMultiplier(nextSameDayMultiplier);
      if (settings.rush_cutoff_hour !== undefined) {
        setRushCutoffHour(settings.rush_cutoff_hour);
      }
      if (settings.rush_cutoff_minute !== undefined) {
        setRushCutoffMinute(settings.rush_cutoff_minute);
      }
      if (settings.same_day_cutoff_hour !== undefined) {
        setSameDayCutoffHour(settings.same_day_cutoff_hour);
      }
      if (settings.same_day_cutoff_minute !== undefined) {
        setSameDayCutoffMinute(settings.same_day_cutoff_minute);
      }
      if (settings.rush_turnaround_days !== undefined) {
        setRushTurnaroundDays(settings.rush_turnaround_days);
      }

      const fallbackOptions: TurnaroundOption[] = [
        {
          id: "fallback-standard",
          code: "standard",
          name: "Standard Delivery",
          description: "Standard turnaround based on document length",
          multiplier: 1.0,
          days_reduction: 0,
          is_rush: false,
        },
        {
          id: "fallback-rush",
          code: "rush",
          name: "Rush Delivery",
          description: "1 business day faster",
          multiplier: nextRushMultiplier,
          days_reduction: nextRushDays,
          is_rush: true,
        },
        {
          id: "fallback-same-day",
          code: "same_day",
          name: "Same-Day Delivery",
          description: "Ready today",
          multiplier: nextSameDayMultiplier,
          days_reduction: 0,
          is_rush: true,
        },
      ];

      if (turnaroundError) {
        console.error("Error fetching turnaround options:", turnaroundError);
        setTurnaroundOptions(fallbackOptions);
        return;
      }

      const options =
        turnaroundData && turnaroundData.length > 0
          ? turnaroundData.map((option) => {
              if (option.code === "rush") {
                return { ...option, multiplier: nextRushMultiplier };
              }
              if (option.code === "same_day") {
                return { ...option, multiplier: nextSameDayMultiplier };
              }
              return option;
            })
          : fallbackOptions;

      const hasStandard = options.some((opt) => opt.code === "standard");
      const hasRush = options.some((opt) => opt.code === "rush");
      const hasSameDay = options.some((opt) => opt.code === "same_day");
      const mergedOptions = [...options];

      if (!hasStandard) {
        mergedOptions.unshift(fallbackOptions[0]);
      }
      if (!hasRush) {
        mergedOptions.push(fallbackOptions[1]);
      }
      if (!hasSameDay) {
        mergedOptions.push(fallbackOptions[2]);
      }

      setTurnaroundOptions(mergedOptions);
    } catch (err) {
      console.error("Error fetching turnaround options:", err);
      useFallbackOptions();
    }
  };

  // Helper: Get customer-friendly reason messages
  const getCustomerFriendlyReason = (reason: string): string => {
    const messages: Record<string, string> = {
      timeout:
        "Our system took longer than expected to analyze your documents.",
      processing_error: "We encountered a technical issue while processing.",
      low_ocr_confidence: "Some text was difficult to read clearly.",
      low_language_confidence:
        "We need to verify the language in your documents.",
      low_classification_confidence: "We need to confirm the document type.",
      high_value_order:
        "Due to the size of your order, we provide personalized review.",
      high_page_count:
        "Due to the number of pages, we provide personalized review.",
      quality_check: "We want to ensure the most accurate quote possible.",
    };
    return messages[reason] || messages["quality_check"];
  };

  // Handler: Return to Quote Form (clears storage, navigates to clean URL)
  const handleReturnToQuoteForm = () => {
    // Get entry point BEFORE clearing storage
    let entryPoint = 'upload_form';

    try {
      const uploadDraft = localStorage.getItem('cethos_upload_draft');
      const quoteDraft = localStorage.getItem('cethos_quote_draft');

      if (uploadDraft) {
        entryPoint = JSON.parse(uploadDraft)?.entryPoint || 'upload_form';
      } else if (quoteDraft) {
        entryPoint = JSON.parse(quoteDraft)?.entryPoint || 'upload_form';
      }
    } catch (e) {
      console.error('Error reading entryPoint:', e);
    }

    // Clear storage - IMPORTANT: must happen AFTER reading entryPoint
    localStorage.removeItem('cethos_upload_draft');
    localStorage.removeItem('cethos_quote_draft');

    // Navigate to CLEAN URL (NO quote_id parameter!)
    // Using replace: true to prevent back-button loop
    if (entryPoint === 'order_form') {
      navigate('/quote?step=1', { replace: true });
    } else {
      navigate('/upload?step=1', { replace: true });
    }
  };

  // Handler: Auto-HITL fallback (timeout, error, low confidence, etc.)
  const handleAutoHITLFallback = async (reason: string) => {
    console.log("🚨 Auto-HITL fallback triggered. Reason:", reason);

    try {
      const quoteId = state.quoteId;
      if (!quoteId) {
        console.error("No quote ID for HITL fallback");
        return;
      }

      // Fetch quote with customer info FIRST
      const { data: quote } = await supabase
        .from("quotes")
        .select(
          `
          quote_number,
          customers (
            email,
            full_name
          )
        `,
        )
        .eq("id", quoteId)
        .single();

      const customerEmail = quote?.customers?.email;
      const customerName = quote?.customers?.full_name || "Customer";
      const quoteNumber = quote?.quote_number;

      // 1. Check if HITL review already exists
      const { data: existing } = await supabase
        .from("hitl_reviews")
        .select("id")
        .eq("quote_id", quoteId)
        .maybeSingle();

      if (!existing) {
        console.log("1️⃣ Creating HITL review record");
        await supabase.from("hitl_reviews").insert({
          quote_id: quoteId,
          status: "pending",
          is_customer_requested: false,
          trigger_reasons: [reason],
          priority:
            reason === "timeout" || reason === "processing_error" ? 1 : 2,
        });
      } else {
        console.log("✅ HITL review already exists");
      }

      // 2. Update quote status
      console.log("2️⃣ Updating quote to HITL pending");
      await supabase
        .from("quotes")
        .update({
          status: "hitl_pending",
          hitl_required: true,
          hitl_reasons: [reason],
        })
        .eq("id", quoteId);

      // 3. Send Brevo Template #16 to customer (AI fallback)
      console.log("3️⃣ Sending Brevo template #16 to customer");

      // Validate before sending
      if (!customerEmail) {
        console.error("No customer email found for quote");
        // Still navigate to confirmation, just skip email
      } else {
        await supabase.functions.invoke("send-email", {
          body: {
            templateId: 16,
            to: customerEmail,
            subject: `Your Quote is Being Reviewed - ${quoteNumber}`,
            params: {
              QUOTE_NUMBER: quoteNumber,
              CUSTOMER_NAME: customerName,
              FAILURE_REASON: getCustomerFriendlyReason(reason),
            },
          },
        });
      }

      // 4. Navigate to confirmation page with reason
      console.log("4️⃣ Navigating to confirmation page with reason:", reason);
      navigate(`/quote/confirmation?quote_id=${quoteId}&reason=${reason}`, {
        replace: true,
      });
    } catch (error) {
      console.error("❌ Error in auto-HITL fallback:", error);
      setError(
        "Failed to process your request. Please contact support with your quote number: " +
          state.quoteNumber,
      );
    }
  };

  const fetchAnalysisData = async () => {
    setLoading(true);
    setError(null);

    try {
      const quoteId = state.quoteId;

      if (!quoteId) {
        console.error("No quote ID available");
        setError("No quote ID found");
        setProcessingState("no_data");
        setLoading(false);
        return;
      }

      // First, check quote status for HITL or errors
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("hitl_required, hitl_reasons, processing_status, status")
        .eq("id", quoteId)
        .single();

      if (quoteError) {
        console.error("Error fetching quote:", quoteError);
      }

      // If HITL triggered by AI (low confidence, high value, etc.)
      if (quote?.hitl_required && quote?.status === "hitl_pending") {
        console.log("🚨 HITL required by AI. Reasons:", quote.hitl_reasons);
        const reason = quote.hitl_reasons?.[0] || "quality_check";
        handleAutoHITLFallback(reason);
        return;
      }

      // If processing failed
      if (
        quote?.processing_status === "error" ||
        quote?.processing_status === "failed"
      ) {
        console.log("❌ Processing failed, triggering HITL fallback");
        handleAutoHITLFallback("processing_error");
        return;
      }

      // Query 1: Get analysis results (without join to avoid 400 error)
      const { data: analysisResults, error: analysisError } = await supabase
        .from("ai_analysis_results")
        .select(
          "id, quote_file_id, detected_language, language_name, detected_document_type, assessed_complexity, word_count, page_count, billable_pages, base_rate, line_total, certification_price, processing_status, ocr_confidence, language_confidence, document_type_confidence, complexity_confidence",
        )
        .eq("quote_id", quoteId)
        .eq("processing_status", "complete");

      if (analysisError) throw analysisError;

      // Check if no results yet
      if (!analysisResults || analysisResults.length === 0) {
        // Check if still processing
        const { data: pendingFiles } = await supabase
          .from("quote_files")
          .select("processing_status, id")
          .eq("quote_id", quoteId)
          .neq("processing_status", "complete");

        if (pendingFiles && pendingFiles.length > 0) {
          setProcessingState("processing");
        } else {
          setProcessingState("no_data");
        }
        setLoading(false);
        return;
      }

      // Query 2: Get file names separately
      const fileIds = analysisResults.map((r) => r.quote_file_id);
      const { data: files, error: filesError } = await supabase
        .from("quote_files")
        .select("id, original_filename")
        .in("id", fileIds);

      if (filesError) throw filesError;

      // Merge the data
      const filesMap = new Map(files?.map((f) => [f.id, f]) || []);
      const mergedData = analysisResults.map((analysis) => ({
        ...analysis,
        quote_files: filesMap.get(analysis.quote_file_id) || {
          id: analysis.quote_file_id,
          original_filename: "Unknown",
        },
      }));

      // Calculate totals from merged data
      const translationSubtotal = mergedData.reduce(
        (sum, doc) => sum + (parseFloat(doc.line_total) || 0),
        0,
      );
      const certificationTotal = mergedData.reduce(
        (sum, doc) => sum + (parseFloat(doc.certification_price) || 0),
        0,
      );
      const subtotal = translationSubtotal + certificationTotal;

      // Calculate total pages
      const totalBillablePages = mergedData.reduce(
        (sum, doc) => sum + (doc.billable_pages || 0),
        0,
      );

      // Set documents and totals
      setDocuments(mergedData);
      setTotals({
        translationSubtotal,
        certificationTotal,
        subtotal,
      });
      setProcessingState("complete");

      // Extract language/document info from first document for same-day check
      if (mergedData.length > 0) {
        const firstDoc = mergedData[0];
        setSourceLanguage(firstDoc.detected_language || "");
        setDocumentType(firstDoc.detected_document_type || "");

        // Get intended use from quote AND check HITL status
        const { data: quoteData } = await supabase
          .from("quotes")
          .select(
            "intended_use:intended_uses(code), hitl_required, hitl_reason, target_language_id, source_language_id, target_language:languages!quotes_target_language_id_fkey(id, name, code), source_language:languages!quotes_source_language_id_fkey(id, name, code, multiplier)",
          )
          .eq("id", quoteId)
          .single();

        // Fetch base rate from settings
        const { data: baseRateSetting } = await supabase
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", "base_rate")
          .single();

        const fetchedBaseRate = parseFloat(
          baseRateSetting?.setting_value || "65",
        );
        setBaseRate(fetchedBaseRate);

        // Set target language from quote data
        if (quoteData?.target_language) {
          setTargetLanguage((quoteData.target_language as any)?.code || "");
          setTargetLanguageName((quoteData.target_language as any)?.name || "");
        }

        // Set source language multiplier
        if (quoteData?.source_language) {
          const multiplier = parseFloat(
            (quoteData.source_language as any)?.multiplier || "1.0",
          );
          setLanguageMultiplier(multiplier);
        }

        if (quoteData?.intended_use) {
          setIntendedUse((quoteData.intended_use as any)?.code || "");
        }

        // Set HITL status
        if (quoteData?.hitl_required) {
          setHitlRequired(true);
          setHitlReason(quoteData.hitl_reason || "");
        }
      }

      // Calculate delivery dates
      const days = calculateStandardDays(totalBillablePages);
      setStandardDays(days);
      const standardDate = await getDeliveryDate(days);
      const rushDate = await getDeliveryDate(Math.max(1, days - 1));
      setStandardDeliveryDate(standardDate);
      setRushDeliveryDate(rushDate);

      // Update quotes table with totals
      await supabase
        .from("quotes")
        .update({
          subtotal: translationSubtotal,
          certification_total: certificationTotal,
          tax_rate: 0.05,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);
    } catch (err) {
      console.error("Error fetching analysis data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load pricing data",
      );
      setProcessingState("no_data");
    } finally {
      setLoading(false);
    }
  };

  // Calculate turnaround days: 2 + floor((pages-1)/2)
  const calculateStandardDays = (pages: number): number => {
    return 2 + Math.floor((pages - 1) / 2);
  };

  // Calculate delivery date (skip weekends and holidays)
  const getDeliveryDate = async (daysToAdd: number): Promise<Date> => {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    const { data: holidays, error: holidaysError } = await supabase
      .from("holidays")
      .select("holiday_date")
      .gte("holiday_date", today);

    if (holidaysError) {
      console.error("Error fetching holidays:", holidaysError);
    }

    const holidayDates = holidays?.map((h) => new Date(h.holiday_date)) || [];

    let date = new Date();
    let addedDays = 0;

    while (addedDays < daysToAdd) {
      date.setDate(date.getDate() + 1);
      if (isWeekend(date)) continue;
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
    const dayOfWeek = now.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    const mstTime = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Edmonton" }),
    );
    const currentHour = mstTime.getHours();
    const currentMinute = mstTime.getMinutes();

    if (currentHour < cutoffHour) return true;
    if (currentHour === cutoffHour && currentMinute < cutoffMinute) return true;

    return false;
  };

  // Check same-day eligibility from database
  const checkAvailability = async () => {
    if (!sourceLanguage || !targetLanguage || !documentType || !intendedUse) {
      return;
    }

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

    const rushAvail = checkCutoffTime(rushCutoffHour, rushCutoffMinute);
    const sameDayAvail =
      isEligible && checkCutoffTime(sameDayCutoffHour, sameDayCutoffMinute);

    setIsRushAvailable(rushAvail);
    setIsSameDayAvailable(sameDayAvail);
  };

  // Calculate fees based on selection
  const calculateFees = () => {
    const subtotal = totals.subtotal;
    let turnaroundFee = 0;

    const selectedOption = turnaroundOptions.find(
      (opt) => opt.code === turnaroundType,
    );

    if (selectedOption && selectedOption.is_rush) {
      const multiplier =
        selectedOption.code === "rush"
          ? rushMultiplier
          : selectedOption.code === "same_day"
            ? sameDayMultiplier
            : selectedOption.multiplier;
      turnaroundFee = subtotal * (multiplier - 1);
    }

    const subtotalWithTurnaround = subtotal + turnaroundFee;
    const taxRate = 0.05;
    const taxAmount = subtotalWithTurnaround * taxRate;
    const total = subtotalWithTurnaround + taxAmount;

    return { turnaroundFee, taxAmount, total };
  };

  const { turnaroundFee, taxAmount, total } = calculateFees();

  // Handle HITL Review Request
  const handleRequestReview = async () => {
    setHitlSubmitting(true);
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
            triggerReasons: ["customer_requested"],
            isCustomerRequested: true,
            customerNote: hitlNote || null,
          }),
        },
      );

      if (response.ok) {
        setShowHitlModal(false);
        setShowHitlSuccessModal(true);
        setHitlRequested(true);
      } else {
        const error = await response.json();
        console.error("HITL request failed:", error);
        alert("Failed to submit review request. Please try again.");
      }
    } catch (error) {
      console.error("Failed to request review:", error);
      alert("Failed to submit review request. Please try again.");
    } finally {
      setHitlSubmitting(false);
    }
  };

  const handleContinue = async () => {
    setSaving(true);
    try {
      if (state.quoteId) {
        const { error } = await supabase
          .from("quotes")
          .update({
            turnaround_type: turnaroundType,
            rush_fee: turnaroundFee,
            tax_amount: taxAmount,
            total: total,
            calculated_totals: {
              translation_total: totals.translationSubtotal,
              certification_total: totals.certificationTotal,
              subtotal: totals.subtotal,
              rush_fee: turnaroundFee,
              delivery_fee: 0,
              tax_amount: taxAmount,
              tax_rate: 0.05,
              total: total,
            },
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

  // Loading state
  if (loading || processingState === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
        <span className="ml-3 text-gray-600">Loading pricing data...</span>
      </div>
    );
  }

  // Processing state
  if (processingState === "processing") {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-cethos-teal mx-auto" />
          <p className="mt-4 text-lg text-gray-900 font-medium">
            Analyzing your documents...
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {isPolling
              ? `Auto-checking every 3 seconds... (${pollAttempts > 0 ? `attempt ${pollAttempts}` : "starting"})`
              : "This usually takes 10-30 seconds"}
          </p>
          <div className="mt-4 text-xs text-gray-400">
            {isPolling && "Maximum wait: 45 seconds"}
          </div>
          <button
            onClick={fetchAnalysisData}
            disabled={isPolling}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" />
            {isPolling ? "Auto-Polling..." : "Refresh Status"}
          </button>
        </div>
      </div>
    );
  }

  // No data / error state
  if (processingState === "no_data" || documents.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-8 h-8 text-yellow-600" />
          </div>
          <p className="mt-4 text-lg text-gray-900 font-medium">
            No pricing data available
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {error || "Your documents may still be processing"}
          </p>
          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={fetchAnalysisData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <button
              onClick={goToPreviousStep}
              className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
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

  const totalBillablePages = documents.reduce(
    (sum, doc) => sum + (doc.billable_pages || 0),
    0,
  );

  // If system triggered HITL (not customer requested), show blocking view
  if (hitlRequired && !hitlRequested) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-semibold text-amber-800 mb-2">
            Additional Review Required
          </h2>
          <p className="text-amber-700 mb-4">
            Our team needs to review your documents to provide an accurate
            quote. We'll email you at{" "}
            <span className="font-medium">{state.email}</span> within 4 working
            hours.
          </p>

          {hitlReason && (
            <div className="bg-white/50 rounded-lg p-3 mb-4 text-sm text-amber-700">
              <span className="font-medium">Reason:</span> {hitlReason}
            </div>
          )}

          <div className="bg-white rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium">Quote Number:</span>{" "}
              {state.quoteNumber}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Documents:</span> {documents.length}{" "}
              file(s)
            </p>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleReturnToQuoteForm}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Return to Quote Form
            </button>
            <button
              onClick={() =>
                (window.location.href = `mailto:support@cethos.com?subject=Quote ${state.quoteNumber}`)
              }
              className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              Contact Support
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-cethos-navy mb-2">
          Review Your Quote
        </h2>
        <p className="text-cethos-gray">
          Confirm your details and choose turnaround time
        </p>
      </div>

      {/* Document Breakdown */}
      <div className="bg-white rounded-xl border border-cethos-border shadow-cethos-card overflow-hidden mb-6">
        <div className="px-6 py-4 bg-cethos-bg-light border-b border-cethos-border">
          <h2 className="font-semibold text-gray-900">Documents</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {documents.map((doc) => (
            <div key={doc.id} className="px-6 py-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 truncate">
                    {doc.quote_files?.original_filename || "Document"}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-xs bg-cethos-teal-50 text-cethos-teal px-2 py-0.5 rounded">
                      Detected Language:{" "}
                      {doc.language_name || doc.detected_language}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      Target Language: {targetLanguageName}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      Billable Pages: {doc.billable_pages.toFixed(1)}
                    </span>
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                      AI Confidence:{" "}
                      {Math.round(
                        (((doc.ocr_confidence || 0) +
                          (doc.language_confidence || 0) +
                          (doc.document_type_confidence || 0) +
                          (doc.complexity_confidence || 0)) /
                          4) *
                          100,
                      )}
                      %
                    </span>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <p className="font-semibold text-gray-900">
                    ${parseFloat(doc.line_total).toFixed(2)}
                  </p>
                  {parseFloat(doc.certification_price) > 0 && (
                    <p className="text-xs text-gray-500">
                      +${parseFloat(doc.certification_price).toFixed(2)} cert
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Price Breakdown</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <div className="flex justify-between text-gray-700">
              <span>Certified Translation</span>
              <span>${totals.translationSubtotal.toFixed(2)}</span>
            </div>
            <div className="text-xs text-gray-500 ml-4 mt-0.5">
              {totalBillablePages.toFixed(1)} pages × $
              {(baseRate * languageMultiplier).toFixed(2)} per page
            </div>
          </div>
          {totals.certificationTotal > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>
                Certification ({documents.length} document
                {documents.length !== 1 ? "s" : ""})
              </span>
              <span>${totals.certificationTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-gray-200 pt-3 flex justify-between font-medium text-gray-900">
            <span>Subtotal</span>
            <span>${totals.subtotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Turnaround Time Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Turnaround Time</h2>
          <p className="text-sm text-gray-500">Choose your delivery speed</p>
        </div>
        <div className="px-6 py-4 space-y-3">
          {/* Debug info */}
          {turnaroundOptions.length === 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ Turnaround options not loaded. Please run the database setup
                SQL file.
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                File: <code>code/database-setup-step4-step5.sql</code>
              </p>
            </div>
          )}

          {/* Standard Option */}
          {standardOption && (
            <label
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                turnaroundType === "standard"
                  ? "border-cethos-teal bg-cethos-teal-50"
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
                <div className="w-5 h-5 bg-cethos-teal rounded-full flex items-center justify-center">
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
                  ? "border-cethos-teal bg-cethos-teal-50"
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
                      +{((rushMultiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="font-semibold text-amber-600">
                    +${(totals.subtotal * (rushMultiplier - 1)).toFixed(2)}
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
                <div className="w-5 h-5 bg-cethos-teal rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}
            </label>
          )}

          {/* Same-Day Option */}
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
                      +{((sameDayMultiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="font-semibold text-green-600">
                    +${(totals.subtotal * (sameDayMultiplier - 1)).toFixed(2)}
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
      <div className="bg-gradient-to-r from-cethos-teal to-cethos-teal-light rounded-xl p-6 mb-8 text-white">
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-cethos-teal-50">Subtotal</span>
            <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
          </div>

          {turnaroundFee > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-cethos-teal-50 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Turnaround Fee
              </span>
              <span className="font-medium">${turnaroundFee.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm">
            <span className="text-cethos-teal-50">Estimated Tax (5% GST)</span>
            <span className="font-medium">${taxAmount.toFixed(2)}</span>
          </div>

          <div className="pt-3 border-t border-cethos-teal-light flex justify-between items-center">
            <span className="text-xl font-bold">TOTAL CAD</span>
            <span className="text-3xl font-bold">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* HITL Request Banner - MOVED HERE - Below pricing, above navigation */}
      {!hitlRequested && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6">
          {/* Header row: icon, title, and button */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                Not sure about the analysis?
              </span>
            </div>
            <button
              onClick={() => setShowHitlModal(true)}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Request Human Review
            </button>
          </div>

          {/* Description - FULL WIDTH */}
          <p className="text-sm text-amber-700 ml-7">
            Our team can review your documents and provide an accurate quote
            within 4 working hours.
          </p>
        </div>
      )}

      {/* Show confirmation if HITL was requested */}
      {hitlRequested && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-green-800 font-medium">
                Review Requested
              </p>
              <p className="text-sm text-green-700 mt-1">
                Our team will review your quote and email you within 4 working
                hours.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-6">
        <StartOverLink />
        <div className="flex items-center gap-4">
          <button
            onClick={goToPreviousStep}
            disabled={saving}
            className="px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back
          </button>

          <button
            onClick={handleContinue}
            disabled={saving || hitlRequested || hitlRequired}
            className="flex-1 px-6 py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : hitlRequested || hitlRequired ? (
              "Awaiting Review"
            ) : (
              <>
                Continue to Delivery
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* HITL Request Modal */}
      {showHitlModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-cethos-navy mb-2">
              Request Human Review
            </h3>
            <p className="text-sm text-cethos-gray mb-4">
              Our translation experts will review your documents and provide an
              accurate quote within 4 working hours.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-cethos-navy mb-1">
                Additional Notes (optional)
              </label>
              <textarea
                value={hitlNote}
                onChange={(e) => setHitlNote(e.target.value)}
                rows={3}
                placeholder="Tell us about any concerns or special requirements..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-cethos-navy placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowHitlModal(false)}
                disabled={hitlSubmitting}
                className="flex-1 px-4 py-2 border border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestReview}
                disabled={hitlSubmitting}
                className="flex-1 px-4 py-2 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light transition-colors disabled:opacity-50 font-semibold"
              >
                {hitlSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HITL Success Modal */}
      {showHitlSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Review Requested
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              Your quote is being reviewed by our team.
            </p>
            <p className="text-sm text-gray-600 mb-1">
              <span className="font-medium">Quote:</span> {state.quoteNumber}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              We'll email you at{" "}
              <span className="font-medium">{state.email}</span> within 4
              working hours.
            </p>
            <button
              onClick={() => {
                setShowHitlSuccessModal(false);
                handleReturnToQuoteForm();
              }}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Return to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
