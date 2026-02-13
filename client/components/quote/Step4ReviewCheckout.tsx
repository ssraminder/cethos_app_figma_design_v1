import { useState, useEffect, useMemo } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { format, isWeekend, isSameDay } from "date-fns";
import {
  FileText,
  Calendar,
  Zap,
  Loader2,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Info,
  CheckCircle,
  Globe,
  Mail,
  MapPin,
  CreditCard,
  Lock,
  AlertCircle,
} from "lucide-react";
import StartOverLink from "@/components/StartOverLink";
import { toast } from "sonner";

// Canadian Provinces Data Check
const CANADIAN_PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

// US States Data
const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "DC", name: "District of Columbia" },
];

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

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  delivery_group: string;
  delivery_type: string;
  is_always_selected: boolean;
  requires_address: boolean;
}

interface PickupLocation {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  phone?: string;
  hours?: string;
}

interface Address {
  fullName: string;
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface GeoLocationData {
  country_code: string;
  region_code: string;
  city: string;
  postal: string;
}

export default function Step4ReviewCheckout() {
  const { state, updateState, goToPreviousStep } = useQuote();
  const navigate = useNavigate();

  // === STATE FROM STEP 4 (Review & Rush) ===

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
  const [dailyCutoffHour, setDailyCutoffHour] = useState(21); // 9 PM MST

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
  const [sourceLanguageName, setSourceLanguageName] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [targetLanguageName, setTargetLanguageName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [baseRate, setBaseRate] = useState(65);
  const [languageMultiplier, setLanguageMultiplier] = useState(1.0);
  const [languageTier, setLanguageTier] = useState(1);

  // NEW: Calculated effective rate (base_rate * multiplier, rounded to nearest 2.5)
  const [effectiveRate, setEffectiveRate] = useState(65);

  // Delivery dates
  const [standardDays, setStandardDays] = useState(2);
  const [standardDeliveryDate, setStandardDeliveryDate] = useState<Date>(
    new Date(),
  );
  const [rushDeliveryDate, setRushDeliveryDate] = useState<Date>(new Date());

  // === STATE FROM STEP 5 (Billing & Delivery) ===

  // Delivery options
  const [digitalOptions, setDigitalOptions] = useState<DeliveryOption[]>([]);
  const [physicalOptions, setPhysicalOptions] = useState<DeliveryOption[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [countries, setCountries] = useState<{ code: string; name: string; is_common: boolean }[]>([]);
  const [selectedDigitalOptions, setSelectedDigitalOptions] = useState<string[]>(["online_portal"]);
  const [selectedPhysicalOption, setSelectedPhysicalOption] = useState<string>("");
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<string>("");

  // Billing address
  const [billingAddress, setBillingAddress] = useState<Address>({
    fullName: state.firstName && state.lastName
      ? `${state.firstName} ${state.lastName}`.trim()
      : "",
    streetAddress: "",
    city: "",
    province: "",
    postalCode: "",
    country: "CA",
  });

  // Shipping address
  const [shippingAddress, setShippingAddress] = useState<Address>({
    fullName: "",
    streetAddress: "",
    city: "",
    province: "",
    postalCode: "",
    country: "CA",
  });
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const [geoLoading, setGeoLoading] = useState(true);

  // Tax
  const [taxRate, setTaxRate] = useState(0.05);
  const [taxName, setTaxName] = useState("GST");

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // === STATE FROM STEP 6 (Payment) ===
  const [payLoading, setPayLoading] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [entryPoint, setEntryPoint] = useState<string | null>(null);

  // === DERIVED STATE ===

  const commonCountries = useMemo(
    () => countries.filter((c) => c.is_common),
    [countries],
  );

  const otherCountries = useMemo(
    () =>
      countries
        .filter((c) => !c.is_common)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  const needsShippingAddress = physicalOptions
    .filter((opt) => opt.requires_address)
    .some((opt) => opt.code === selectedPhysicalOption);

  const isPickupSelected = selectedPhysicalOption === "pickup";

  // ── useEffect hooks ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchTurnaroundOptions();
    fetchAnalysisData();
    fetchDeliveryData();
    fetchExpiryData();
  }, [state.quoteId]);

  useEffect(() => {
    if (sourceLanguage && targetLanguage && documentType && intendedUse) {
      checkAvailability();
    }
  }, [sourceLanguage, targetLanguage, documentType, intendedUse, standardDays]);

  // NEW: Calculate effective rate when baseRate or languageMultiplier changes
  useEffect(() => {
    const rawRate = baseRate * languageMultiplier;
    const calculated = Math.ceil(rawRate / 2.5) * 2.5;
    setEffectiveRate(calculated);
    console.log(`💰 Effective rate calculation: $${baseRate} × ${languageMultiplier} = $${rawRate} → rounded to $${calculated}`);
  }, [baseRate, languageMultiplier]);

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

  // Initialize with geolocation
  useEffect(() => {
    const initializeWithGeoLocation = async () => {
      setGeoLoading(true);

      // Check if user already has billing address saved (went back from later step)
      if (state.billingAddress?.addressLine1) {
        setGeoLoading(false);
        return;
      }

      const geo = await fetchGeoLocation();

      if (geo) {
        // Determine default province based on country
        let defaultProvince = geo.region_code || "";

        // Validate province/state code exists in our lists
        if (geo.country_code === "CA") {
          const validProvince = CANADIAN_PROVINCES.find(
            (p) => p.code === geo.region_code
          );
          defaultProvince = validProvince ? geo.region_code : "AB";
        } else if (geo.country_code === "US") {
          const validState = US_STATES.find((s) => s.code === geo.region_code);
          defaultProvince = validState ? geo.region_code : "";
        }

        // Pre-populate country, province/state, and city only (NOT postal code)
        setBillingAddress((prev) => ({
          ...prev,
          country: geo.country_code,
          province: defaultProvince,
          city: geo.city || prev.city,
          // postalCode intentionally NOT pre-populated
        }));

        // Also set shipping defaults
        setShippingAddress((prev) => ({
          ...prev,
          country: geo.country_code,
          province: defaultProvince,
        }));
      }

      setGeoLoading(false);
    };

    initializeWithGeoLocation();
  }, []);

  // Fetch tax rate when province or country changes
  useEffect(() => {
    const updateTaxRate = async () => {
      const { rate, name } = await fetchTaxRate(
        billingAddress.province,
        billingAddress.country
      );
      setTaxRate(rate);
      setTaxName(name);
    };
    updateTaxRate();
  }, [billingAddress.province, billingAddress.country]);

  // ── Functions ───────────────────────────────────────────────────────────

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
          "daily_cutoff_hour",
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
      if (settings.daily_cutoff_hour !== undefined) {
        setDailyCutoffHour(settings.daily_cutoff_hour);
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

  const useFallbackOptions = () => {
    setTurnaroundOptions([
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
        multiplier: rushMultiplier,
        days_reduction: rushTurnaroundDays,
        is_rush: true,
      },
      {
        id: "fallback-same-day",
        code: "same_day",
        name: "Same-Day Delivery",
        description: "Ready today",
        multiplier: sameDayMultiplier,
        days_reduction: 0,
        is_rush: true,
      },
    ]);
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
    let entryPoint = "upload_form";

    try {
      const uploadDraft = localStorage.getItem("cethos_upload_draft");
      const quoteDraft = localStorage.getItem("cethos_quote_draft");

      if (uploadDraft) {
        entryPoint = JSON.parse(uploadDraft)?.entryPoint || "upload_form";
      } else if (quoteDraft) {
        entryPoint = JSON.parse(quoteDraft)?.entryPoint || "upload_form";
      }
    } catch (e) {
      console.error("Error reading entryPoint:", e);
    }

    // Clear storage - IMPORTANT: must happen AFTER reading entryPoint
    localStorage.removeItem("cethos_upload_draft");
    localStorage.removeItem("cethos_quote_draft");

    // Use window.location.href to force full page reload
    // This prevents React context from persisting old state
    if (entryPoint === "order_form") {
      window.location.href = "/quote?step=1";
    } else {
      window.location.href = "/upload?step=1";
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
        .eq("processing_status", "completed");

      if (analysisError) throw analysisError;

      // Check if no results yet
      if (!analysisResults || analysisResults.length === 0) {
        // First check if the quote itself has pricing data (manual/staff-created quotes)
        const { data: quoteWithPricing } = await supabase
          .from("quotes")
          .select(
            `subtotal, certification_total, rush_fee, delivery_fee, tax_amount, tax_rate, total, calculated_totals,
             intended_use:intended_uses(code),
             target_language:languages!quotes_target_language_id_fkey(id, name, code),
             source_language:languages!quotes_source_language_id_fkey(id, name, code, multiplier, tier)`,
          )
          .eq("id", quoteId)
          .single();

        const ct = quoteWithPricing?.calculated_totals as Record<string, number> | null;
        const quoteTotal = ct?.total || quoteWithPricing?.total || 0;

        if (quoteTotal > 0) {
          // Use quote-level pricing for manual/staff-created quotes
          const subtotalValue = ct?.subtotal || quoteWithPricing?.subtotal || 0;
          const certificationTotalValue = ct?.certification_total || quoteWithPricing?.certification_total || 0;
          const translationSubtotalValue = ct?.translation_total || (subtotalValue - certificationTotalValue);

          setTotals({
            translationSubtotal: translationSubtotalValue,
            certificationTotal: certificationTotalValue,
            subtotal: subtotalValue,
          });

          // Set language info from quote
          if (quoteWithPricing?.source_language) {
            const srcLang = quoteWithPricing.source_language as any;
            setSourceLanguage(srcLang?.code || "");
            setSourceLanguageName(srcLang?.name || "");
            setLanguageMultiplier(parseFloat(srcLang?.multiplier || "1.0"));
            setLanguageTier(srcLang?.tier || 1);
          }
          if (quoteWithPricing?.target_language) {
            setTargetLanguage((quoteWithPricing.target_language as any)?.code || "");
            setTargetLanguageName((quoteWithPricing.target_language as any)?.name || "");
          }
          if (quoteWithPricing?.intended_use) {
            setIntendedUse((quoteWithPricing.intended_use as any)?.code || "");
          }

          setDocuments([]);
          setProcessingState("complete");

          // Calculate delivery dates with a default page estimate
          const days = calculateStandardDays(1);
          setStandardDays(days);
          const standardDate = await getDeliveryDate(days);
          const rushDate = await getDeliveryDate(Math.max(1, days - 1));
          setStandardDeliveryDate(standardDate);
          setRushDeliveryDate(rushDate);

          setLoading(false);
          return;
        }

        // No quote-level pricing either - check if still processing
        const { data: pendingFiles } = await supabase
          .from("quote_files")
          .select("processing_status, id")
          .eq("quote_id", quoteId)
          .neq("processing_status", "completed");

        if (pendingFiles && pendingFiles.length > 0) {
          setProcessingState("processing");
        } else {
          setProcessingState("no_data");
        }
        setLoading(false);
        return;
      }

      // Query 2: Get file names separately (guard against null file IDs from manual entries)
      const fileIds = analysisResults
        .map((r) => r.quote_file_id)
        .filter((id): id is string => !!id);
      let files: { id: string; original_filename: string }[] = [];
      if (fileIds.length > 0) {
        const { data: filesData, error: filesError } = await supabase
          .from("quote_files")
          .select("id, original_filename")
          .in("id", fileIds);
        if (filesError) throw filesError;
        files = filesData || [];
      }

      // Merge the data
      const filesMap = new Map(files.map((f) => [f.id, f]));
      const mergedData = analysisResults.map((analysis) => ({
        ...analysis,
        quote_files: filesMap.get(analysis.quote_file_id) || {
          id: analysis.quote_file_id,
          original_filename: "Unknown",
        },
      }));

      // Get intended use from quote AND check HITL status AND get language info
      const { data: quoteData } = await supabase
        .from("quotes")
        .select(
          `intended_use:intended_uses(code),
           hitl_required,
           hitl_reason,
           target_language_id,
           source_language_id,
           target_language:languages!quotes_target_language_id_fkey(id, name, code),
           source_language:languages!quotes_source_language_id_fkey(id, name, code, multiplier, tier)`,
        )
        .eq("id", quoteId)
        .single();

      // Fetch base rate from settings
      const { data: baseRateSetting } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "base_rate")
        .single();

      const fetchedBaseRate = parseFloat(baseRateSetting?.setting_value || "65");
      setBaseRate(fetchedBaseRate);
      console.log(`📊 Base rate from settings: $${fetchedBaseRate}`);

      // Set source language info from quote data (user-selected language)
      let fetchedMultiplier = 1.0;
      let fetchedTier = 1;
      if (quoteData?.source_language) {
        const srcLang = quoteData.source_language as any;
        fetchedMultiplier = parseFloat(srcLang?.multiplier || "1.0");
        fetchedTier = srcLang?.tier || 1;
        setSourceLanguage(srcLang?.code || "");
        setSourceLanguageName(srcLang?.name || "");
        setLanguageMultiplier(fetchedMultiplier);
        setLanguageTier(fetchedTier);
        console.log(`📊 Source language: ${srcLang?.name} (Tier ${fetchedTier}, multiplier: ${fetchedMultiplier})`);
      }

      // Set target language from quote data
      if (quoteData?.target_language) {
        setTargetLanguage((quoteData.target_language as any)?.code || "");
        setTargetLanguageName((quoteData.target_language as any)?.name || "");
      }

      if (quoteData?.intended_use) {
        setIntendedUse((quoteData.intended_use as any)?.code || "");
      }

      // Set HITL status
      if (quoteData?.hitl_required) {
        setHitlRequired(true);
        setHitlReason(quoteData.hitl_reason || "");
      }

      // Extract document type from first document for same-day check
      if (mergedData.length > 0) {
        const firstDoc = mergedData[0];
        setDocumentType(firstDoc.detected_document_type || "");
      }

      // Calculate the correct effective rate
      const rawRate = fetchedBaseRate * fetchedMultiplier;
      const calculatedEffectiveRate = Math.ceil(rawRate / 2.5) * 2.5;
      setEffectiveRate(calculatedEffectiveRate);
      console.log(`💰 Calculated effective rate: $${fetchedBaseRate} × ${fetchedMultiplier} = $${rawRate} → rounded to $${calculatedEffectiveRate}`);

      // RECALCULATE totals using the correct effective rate
      // This ensures the displayed totals match the user-selected language, not AI-detected
      const totalBillablePages = mergedData.reduce(
        (sum, doc) => sum + (doc.billable_pages || 0),
        0,
      );

      const translationSubtotal = totalBillablePages * calculatedEffectiveRate;
      const certificationTotal = mergedData.reduce(
        (sum, doc) => sum + (parseFloat(doc.certification_price) || 0),
        0,
      );
      const subtotal = translationSubtotal + certificationTotal;

      console.log(`📊 Recalculated totals: ${totalBillablePages.toFixed(1)} pages × $${calculatedEffectiveRate} = $${translationSubtotal.toFixed(2)}`);

      // Update documents with recalculated line_total for display
      const recalculatedDocuments = mergedData.map(doc => ({
        ...doc,
        base_rate: calculatedEffectiveRate,
        line_total: (doc.billable_pages * calculatedEffectiveRate).toFixed(2),
      }));

      // Set documents and totals
      setDocuments(recalculatedDocuments);
      setTotals({
        translationSubtotal,
        certificationTotal,
        subtotal,
      });
      setProcessingState("complete");

      // Calculate delivery dates
      const days = calculateStandardDays(totalBillablePages);
      setStandardDays(days);
      const standardDate = await getDeliveryDate(days);
      const rushDate = await getDeliveryDate(Math.max(1, days - 1));
      setStandardDeliveryDate(standardDate);
      setRushDeliveryDate(rushDate);

      // Update quotes table with recalculated totals
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
  // After daily cutoff (9 PM MST), start counting from next business day
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

    // Check if past daily cutoff (e.g., 9 PM MST) or if it's a weekend
    const mstTime = new Date(
      date.toLocaleString("en-US", { timeZone: "America/Edmonton" }),
    );
    const isPastDailyCutoff = mstTime.getHours() >= dailyCutoffHour;
    const isWeekendOrder = isWeekend(mstTime);

    // If past cutoff OR weekend, advance to the next business day first, then count from there
    if (isPastDailyCutoff || isWeekendOrder) {
      date.setDate(date.getDate() + 1);
      // Skip weekends and holidays to find next business day
      while (
        isWeekend(date) ||
        holidayDates.some((h) => isSameDay(h, date))
      ) {
        date.setDate(date.getDate() + 1);
      }
    }

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

    // Rush is ALWAYS available - ignore cutoff time
    setIsRushAvailable(true);

    // Same-day still respects cutoff
    const sameDayAvail =
      isEligible && checkCutoffTime(sameDayCutoffHour, sameDayCutoffMinute);

    setIsSameDayAvailable(sameDayAvail);
  };

  // ── Billing & Delivery Functions (from Step 5) ──────────────────────────

  // Helper functions for labels
  const getPostalCodeLabel = (country: string): string => {
    if (country === "US") return "ZIP Code";
    if (country === "CA") return "Postal Code";
    return "Postal/ZIP Code";
  };

  const getProvinceLabel = (country: string): string => {
    if (country === "US") return "State";
    if (country === "CA") return "Province";
    return "Province/State/Region";
  };

  // Fetch visitor's location from IP
  const fetchGeoLocation = async (): Promise<GeoLocationData | null> => {
    try {
      // Using ipapi.co - free tier: 1000 requests/day, no API key needed
      const response = await fetch("https://ipapi.co/json/", {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        console.warn("Geolocation fetch failed:", response.status);
        return null;
      }

      const data = await response.json();

      return {
        country_code: data.country_code || "CA",
        region_code: data.region_code || "",
        city: data.city || "",
        postal: data.postal || "",
      };
    } catch (error) {
      console.warn("Geolocation error:", error);
      return null;
    }
  };

  // Fetch tax rate function
  const fetchTaxRate = async (
    provinceCode: string,
    countryCode: string,
  ): Promise<{ rate: number; name: string }> => {
    // Only apply Canadian taxes
    if (countryCode !== "CA") {
      return { rate: 0, name: "No Tax" };
    }

    try {
      const normalizedCode = provinceCode.includes("-")
        ? provinceCode.toUpperCase()
        : `CA-${provinceCode.toUpperCase()}`;
      const { data, error } = await supabase
        .from("tax_rates")
        .select("rate, tax_name")
        .eq("region_code", normalizedCode)
        .eq("is_active", true);

      if (error || !data || data.length === 0) {
        return { rate: 0.05, name: "GST" };
      }

      const totalRate = data.reduce(
        (sum, row) => sum + Number(row.rate || 0),
        0,
      );
      const combinedTaxName = Array.from(new Set(data.map((row) => row.tax_name)))
        .filter(Boolean)
        .join(" + ");

      return { rate: totalRate, name: combinedTaxName || "GST" };
    } catch {
      return { rate: 0.05, name: "GST" };
    }
  };

  const fetchDeliveryData = async () => {
    try {
      // Fetch digital delivery options
      const { data: digital, error: digitalError } = await supabase
        .from("delivery_options")
        .select("*")
        .eq("delivery_group", "digital")
        .eq("is_active", true)
        .order("sort_order");

      if (digitalError) throw digitalError;
      setDigitalOptions(digital || []);

      // Fetch physical delivery options
      const { data: physical, error: physicalError } = await supabase
        .from("delivery_options")
        .select("*")
        .eq("delivery_group", "physical")
        .eq("is_active", true)
        .order("sort_order");

      if (physicalError) throw physicalError;
      setPhysicalOptions(physical || []);

      // Fetch pickup locations
      const { data: locations, error: locationsError } = await supabase
        .from("pickup_locations")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (locationsError) throw locationsError;
      setPickupLocations(locations || []);

      if (locations && locations.length === 1) {
        setSelectedPickupLocation(locations[0].id);
      }

      // Fetch countries
      const { data: countriesData, error: countriesError } = await supabase
        .from("countries")
        .select("code, name, is_common")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");

      if (countriesError) throw countriesError;
      setCountries(countriesData || []);

      // Pre-fill delivery selection if user went back
      if (state.physicalDeliveryOption) {
        setSelectedPhysicalOption(state.physicalDeliveryOption);
      }

      // Pre-fill billing address if user went back
      if (state.billingAddress) {
        setBillingAddress({
          fullName:
            state.billingAddress.firstName && state.billingAddress.lastName
              ? `${state.billingAddress.firstName} ${state.billingAddress.lastName}`.trim()
              : billingAddress.fullName,
          streetAddress: state.billingAddress.addressLine1 || "",
          city: state.billingAddress.city || "",
          province: state.billingAddress.state || "AB",
          postalCode: state.billingAddress.postalCode || "",
          country: state.billingAddress.country || "CA",
        });
      }

      // Pre-fill shipping address if user went back
      if (state.shippingAddress) {
        setShippingAddress({
          fullName:
            state.shippingAddress.firstName && state.shippingAddress.lastName
              ? `${state.shippingAddress.firstName} ${state.shippingAddress.lastName}`.trim()
              : "",
          streetAddress: state.shippingAddress.addressLine1 || "",
          city: state.shippingAddress.city || "",
          province: state.shippingAddress.state || "AB",
          postalCode: state.shippingAddress.postalCode || "",
          country: state.shippingAddress.country || "CA",
        });
      }

      if (state.pickupLocationId) {
        setSelectedPickupLocation(state.pickupLocationId);
      }
    } catch (err) {
      console.error("Error fetching delivery data:", err);
      toast.error("Failed to load delivery options");
    }
  };

  const validateField = (
    name: string,
    value: string,
    country?: string
  ): string => {
    switch (name) {
      case "fullName":
        return value.trim().length < 2 ? "Name is required" : "";
      case "streetAddress":
        return value.trim().length < 5 ? "Street address is required" : "";
      case "city":
        return value.trim().length < 2 ? "City is required" : "";
      case "postalCode":
        if (country === "CA") {
          const caPostalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
          return !caPostalRegex.test(value.trim())
            ? "Valid postal code required (e.g., T2P 1J9)"
            : "";
        }
        if (country === "US") {
          const usZipRegex = /^\d{5}(-\d{4})?$/;
          return !usZipRegex.test(value.trim())
            ? "Valid ZIP code required (e.g., 12345)"
            : "";
        }
        return value.trim().length < 2 ? "Postal/ZIP code required" : "";
      case "province":
        if (country === "CA" || country === "US") {
          return value.trim().length < 2 ? "Province/State is required" : "";
        }
        return "";
      default:
        return "";
    }
  };

  const handleBillingFieldChange = (field: keyof Address, value: string) => {
    if (field === "country") {
      let newProvince = "";
      if (value === "CA") newProvince = "AB";
      else if (value === "US") newProvince = "AL";

      setBillingAddress((prev) => ({
        ...prev,
        [field]: value,
        province: newProvince,
      }));

      if (sameAsBilling) {
        setShippingAddress((prev) => ({
          ...prev,
          [field]: value,
          province: newProvince,
        }));
      }
    } else {
      setBillingAddress((prev) => ({ ...prev, [field]: value }));

      if (sameAsBilling) {
        setShippingAddress((prev) => ({ ...prev, [field]: value }));
      }
    }

    if (errors[`billing_${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`billing_${field}`];
        return newErrors;
      });
    }
  };

  const handleShippingFieldChange = (field: keyof Address, value: string) => {
    if (field === "country") {
      let newProvince = "";
      if (value === "CA") newProvince = "AB";
      else if (value === "US") newProvince = "AL";

      setShippingAddress((prev) => ({
        ...prev,
        [field]: value,
        province: newProvince,
      }));
    } else {
      setShippingAddress((prev) => ({ ...prev, [field]: value }));
    }

    if (errors[`shipping_${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`shipping_${field}`];
        return newErrors;
      });
    }
  };

  const handleBillingFieldBlur = (field: keyof Address) => {
    setTouched((prev) => ({ ...prev, [`billing_${field}`]: true }));
    const error = validateField(
      field,
      billingAddress[field],
      billingAddress.country
    );
    if (error) {
      setErrors((prev) => ({ ...prev, [`billing_${field}`]: error }));
    }
  };

  const handleShippingFieldBlur = (field: keyof Address) => {
    setTouched((prev) => ({ ...prev, [`shipping_${field}`]: true }));
    const error = validateField(
      field,
      shippingAddress[field],
      shippingAddress.country
    );
    if (error) {
      setErrors((prev) => ({ ...prev, [`shipping_${field}`]: error }));
    }
  };

  const handleSameAsBillingChange = (checked: boolean) => {
    setSameAsBilling(checked);
    if (checked) {
      setShippingAddress({ ...billingAddress });
      setErrors((prev) => {
        const newErrors = { ...prev };
        Object.keys(newErrors).forEach((key) => {
          if (key.startsWith("shipping_")) {
            delete newErrors[key];
          }
        });
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    const billingFullNameError = validateField(
      "fullName",
      billingAddress.fullName,
      billingAddress.country
    );
    if (billingFullNameError) newErrors.billing_fullName = billingFullNameError;

    const billingStreetError = validateField(
      "streetAddress",
      billingAddress.streetAddress,
      billingAddress.country
    );
    if (billingStreetError)
      newErrors.billing_streetAddress = billingStreetError;

    const billingCityError = validateField(
      "city",
      billingAddress.city,
      billingAddress.country
    );
    if (billingCityError) newErrors.billing_city = billingCityError;

    const billingPostalError = validateField(
      "postalCode",
      billingAddress.postalCode,
      billingAddress.country
    );
    if (billingPostalError) newErrors.billing_postalCode = billingPostalError;

    if (billingAddress.country === "CA" || billingAddress.country === "US") {
      const billingProvinceError = validateField(
        "province",
        billingAddress.province,
        billingAddress.country
      );
      if (billingProvinceError)
        newErrors.billing_province = billingProvinceError;
    }

    if (needsShippingAddress) {
      const shippingFullNameError = validateField(
        "fullName",
        shippingAddress.fullName,
        shippingAddress.country
      );
      if (shippingFullNameError)
        newErrors.shipping_fullName = shippingFullNameError;

      const shippingStreetError = validateField(
        "streetAddress",
        shippingAddress.streetAddress,
        shippingAddress.country
      );
      if (shippingStreetError)
        newErrors.shipping_streetAddress = shippingStreetError;

      const shippingCityError = validateField(
        "city",
        shippingAddress.city,
        shippingAddress.country
      );
      if (shippingCityError) newErrors.shipping_city = shippingCityError;

      const shippingPostalError = validateField(
        "postalCode",
        shippingAddress.postalCode,
        shippingAddress.country
      );
      if (shippingPostalError)
        newErrors.shipping_postalCode = shippingPostalError;

      if (shippingAddress.country === "CA" || shippingAddress.country === "US") {
        const shippingProvinceError = validateField(
          "province",
          shippingAddress.province,
          shippingAddress.country
        );
        if (shippingProvinceError)
          newErrors.shipping_province = shippingProvinceError;
      }
    }

    if (
      isPickupSelected &&
      pickupLocations.length > 1 &&
      !selectedPickupLocation
    ) {
      newErrors.pickupLocation = "Please select a pickup location";
    }

    // Validate physical delivery selection is made
    if (!selectedPhysicalOption) {
      newErrors.physicalDelivery = "Please select a physical delivery option";
    }

    setErrors(newErrors);

    const touchedFields: Record<string, boolean> = {
      billing_fullName: true,
      billing_streetAddress: true,
      billing_city: true,
      billing_province: true,
      billing_postalCode: true,
    };

    if (needsShippingAddress) {
      touchedFields.shipping_fullName = true;
      touchedFields.shipping_streetAddress = true;
      touchedFields.shipping_city = true;
      touchedFields.shipping_province = true;
      touchedFields.shipping_postalCode = true;
    }

    setTouched(touchedFields);

    return Object.keys(newErrors).length === 0;
  };

  // Fetch expiry data and entry point
  const fetchExpiryData = async () => {
    if (!state.quoteId) return;
    const { data } = await supabase
      .from("quotes")
      .select("expires_at, entry_point")
      .eq("id", state.quoteId)
      .single();

    if (data?.expires_at) {
      const expiryDate = new Date(data.expires_at);
      if (expiryDate < new Date()) {
        navigate("/quote/expired", {
          replace: true,
          state: { quoteNumber: state.quoteNumber },
        });
        return;
      }
      setExpiresAt(data.expires_at);
    }
    if (data?.entry_point) setEntryPoint(data.entry_point);
  };

  // Single source of truth for all pricing
  const calculateFinalPricing = () => {
    const baseSubtotal = totals.subtotal; // translation + certification from AI analysis

    // Turnaround fee
    let turnaroundFee = 0;
    if (turnaroundType === "rush") {
      turnaroundFee = baseSubtotal * (rushMultiplier - 1);
    } else if (turnaroundType === "same_day") {
      turnaroundFee = baseSubtotal * (sameDayMultiplier - 1);
    }

    // Delivery fee
    const selectedDelivery = physicalOptions.find(opt => opt.code === selectedPhysicalOption);
    const deliveryFee = selectedDelivery?.price || 0;

    // Tax
    const taxableAmount = baseSubtotal + turnaroundFee + deliveryFee;
    const taxAmount = taxableAmount * taxRate;

    // Final total
    const finalTotal = taxableAmount + taxAmount;

    return {
      translationTotal: totals.translationSubtotal,
      certificationTotal: totals.certificationTotal,
      baseSubtotal,
      turnaroundFee,
      deliveryFee,
      taxRate,
      taxName,
      taxAmount,
      finalTotal,
    };
  };

  const pricing = calculateFinalPricing();

  // Handle Pay — validates, writes all data, then redirects to Stripe
  const handlePay = async () => {
    // 1. Validate billing form
    if (!validateForm()) {
      toast.error("Please complete all required fields");
      const firstErrorEl = document.querySelector('.border-red-500');
      firstErrorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // 2. Validate physical delivery selection
    if (!selectedPhysicalOption) {
      setErrors(prev => ({ ...prev, physicalDelivery: "Please select a delivery option" }));
      toast.error("Please select a physical delivery option");
      return;
    }

    // 3. Validate pricing
    if (pricing.finalTotal <= 0) {
      toast.error("Invalid order total. Please review your quote.");
      return;
    }

    setPayLoading(true);
    setError(null);

    try {
      const quoteId = state.quoteId;
      if (!quoteId) throw new Error("Quote ID not found");

      const selectedPhysicalObj = physicalOptions.find(opt => opt.code === selectedPhysicalOption);
      const needsShipping = physicalOptions
        .filter(opt => opt.requires_address)
        .some(opt => opt.code === selectedPhysicalOption);

      const shipAddr = sameAsBilling ? billingAddress : shippingAddress;

      // 4. SINGLE DB WRITE — all data in one update
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          // Turnaround data
          turnaround_type: turnaroundType,
          rush_fee: pricing.turnaroundFee,
          estimated_delivery_date:
            turnaroundType === "same_day" ? new Date().toISOString()
            : turnaroundType === "rush" ? rushDeliveryDate.toISOString()
            : standardDeliveryDate.toISOString(),

          // Delivery data
          physical_delivery_option_id: selectedPhysicalObj?.id || null,
          selected_pickup_location_id: selectedPhysicalOption === "pickup" ? selectedPickupLocation : null,
          delivery_fee: pricing.deliveryFee,

          // Billing address
          billing_address: {
            firstName: billingAddress.fullName.split(" ")[0] || billingAddress.fullName,
            lastName: billingAddress.fullName.split(" ").slice(1).join(" ") || "",
            company: state.companyName || "",
            addressLine1: billingAddress.streetAddress,
            addressLine2: "",
            city: billingAddress.city,
            state: billingAddress.province,
            postalCode: billingAddress.postalCode,
            country: billingAddress.country,
            phone: state.phone || "",
          },

          // Shipping address
          shipping_address: needsShipping ? {
            firstName: shipAddr.fullName.split(" ")[0] || shipAddr.fullName,
            lastName: shipAddr.fullName.split(" ").slice(1).join(" ") || "",
            company: state.companyName || "",
            addressLine1: shipAddr.streetAddress,
            addressLine2: "",
            city: shipAddr.city,
            state: shipAddr.province,
            postalCode: shipAddr.postalCode,
            country: shipAddr.country,
            phone: state.phone || "",
          } : null,

          // Calculated totals — single source of truth
          calculated_totals: {
            translation_total: pricing.translationTotal,
            certification_total: pricing.certificationTotal,
            subtotal: pricing.baseSubtotal,
            rush_fee: pricing.turnaroundFee,
            delivery_fee: pricing.deliveryFee,
            tax_rate: pricing.taxRate,
            tax_name: pricing.taxName,
            tax_amount: pricing.taxAmount,
            total: pricing.finalTotal,
          },

          subtotal: pricing.translationTotal,
          certification_total: pricing.certificationTotal,
          tax_rate: pricing.taxRate,
          tax_amount: pricing.taxAmount,
          total: pricing.finalTotal,

          status: "pending_payment",
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (updateError) throw updateError;

      // 5. Create Stripe checkout session
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-checkout-session",
        { body: { quoteId } }
      );

      if (fnError) throw new Error(fnError.message || "Failed to create checkout session");
      if (!data?.success || !data?.checkoutUrl) throw new Error(data?.error || "Failed to create checkout session");

      // 6. Redirect to Stripe
      window.location.href = data.checkoutUrl;

    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "An error occurred. Please try again.");
      toast.error(err.message || "Failed to process payment");
      setPayLoading(false);
    }
  };

  // Handle Save and Email — saves all data then navigates to saved page
  const handleSaveAndEmail = async () => {
    if (!validateForm()) {
      toast.error("Please complete billing information before saving");
      return;
    }

    setSavingQuote(true);
    setError(null);

    try {
      const quoteId = state.quoteId;
      if (!quoteId) throw new Error("Quote ID not found.");

      const selectedPhysicalObj = physicalOptions.find(opt => opt.code === selectedPhysicalOption);
      const needsShipping = physicalOptions
        .filter(opt => opt.requires_address)
        .some(opt => opt.code === selectedPhysicalOption);

      const shipAddr = sameAsBilling ? billingAddress : shippingAddress;

      await supabase
        .from("quotes")
        .update({
          turnaround_type: turnaroundType,
          rush_fee: pricing.turnaroundFee,
          physical_delivery_option_id: selectedPhysicalObj?.id || null,
          billing_address: {
            firstName: billingAddress.fullName.split(" ")[0] || billingAddress.fullName,
            lastName: billingAddress.fullName.split(" ").slice(1).join(" ") || "",
            company: state.companyName || "",
            addressLine1: billingAddress.streetAddress,
            addressLine2: "",
            city: billingAddress.city,
            state: billingAddress.province,
            postalCode: billingAddress.postalCode,
            country: billingAddress.country,
            phone: state.phone || "",
          },
          shipping_address: needsShipping ? {
            firstName: shipAddr.fullName.split(" ")[0] || shipAddr.fullName,
            lastName: shipAddr.fullName.split(" ").slice(1).join(" ") || "",
            company: state.companyName || "",
            addressLine1: shipAddr.streetAddress,
            addressLine2: "",
            city: shipAddr.city,
            state: shipAddr.province,
            postalCode: shipAddr.postalCode,
            country: shipAddr.country,
            phone: state.phone || "",
          } : null,
          calculated_totals: {
            translation_total: pricing.translationTotal,
            certification_total: pricing.certificationTotal,
            subtotal: pricing.baseSubtotal,
            rush_fee: pricing.turnaroundFee,
            delivery_fee: pricing.deliveryFee,
            tax_rate: pricing.taxRate,
            tax_name: pricing.taxName,
            tax_amount: pricing.taxAmount,
            total: pricing.finalTotal,
          },
          total: pricing.finalTotal,
          status: "pending_payment",
          saved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      await supabase.functions.invoke("send-quote-link-email", { body: { quoteId } });
      navigate(`/quote/saved?quote_id=${quoteId}`);
    } catch (err: any) {
      console.error("Save and email error:", err);
      setError(err.message || "Failed to save quote.");
      toast.error(err.message || "Failed to save quote");
      setSavingQuote(false);
    }
  };

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

  // ── Render: Full-page states (early returns) ───────────────────────────

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

  // No data / error state (only show when there's genuinely no pricing)
  if (processingState === "no_data" || (documents.length === 0 && totals.subtotal <= 0)) {
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

  // Friendly date label helper — display-only, does not affect date calculations
  const getFriendlyDateLabel = (date: Date): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === 2) return "Day after tomorrow";

    const dayName = target.toLocaleDateString("en-US", { weekday: "long" });
    if (diffDays <= 6) return `This ${dayName}`;
    if (diffDays <= 13) return `Next ${dayName}`;

    return `${diffDays} days`;
  };

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

  // ── Render: Main content ───────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-cethos-navy mb-2">
          Review & Checkout
        </h2>
        <p className="text-cethos-gray">
          Review your quote, choose options, and pay securely
        </p>
        {state.quoteNumber && (
          <p className="text-sm text-gray-400 mt-1">
            Quote ref: <span className="font-medium text-gray-500">{state.quoteNumber}</span>
          </p>
        )}
      </div>

      {/* Expiry Warning Banner */}
      {expiresAt &&
        (() => {
          const daysUntilExpiry = Math.ceil(
            (new Date(expiresAt).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          );
          return daysUntilExpiry > 0 && daysUntilExpiry <= 7 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 font-medium">
                  Quote expires in {daysUntilExpiry} day
                  {daysUntilExpiry !== 1 ? "s" : ""}
                </p>
                <p className="text-amber-700 text-sm">
                  Complete your payment before{" "}
                  {new Date(expiresAt).toLocaleDateString()} to secure this
                  price.
                </p>
              </div>
            </div>
          ) : null;
        })()}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex flex-col xl:flex-row gap-8">

      {/* LEFT COLUMN */}
      <div className="flex-1 min-w-0">

      {/* Document Breakdown */}
      <div className="bg-white rounded-xl border border-cethos-border shadow-cethos-card overflow-hidden mb-6">
        <div className="px-4 sm:px-6 py-4 bg-cethos-bg-light border-b border-cethos-border">
          <h2 className="font-semibold text-gray-900">
            {documents.length > 0 ? "Documents" : "Quote Details"}
          </h2>
        </div>
        {documents.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {documents.map((doc, index) => (
              <div key={doc.id} className="px-4 sm:px-6 py-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="font-medium text-gray-900 truncate">
                      {doc.quote_files?.original_filename && doc.quote_files.original_filename !== "Unknown"
                        ? doc.quote_files.original_filename
                        : `Document ${index + 1}`}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-xs bg-cethos-teal-50 text-cethos-teal px-2 py-0.5 rounded whitespace-nowrap">
                        {sourceLanguageName || doc.language_name || doc.detected_language} → {targetLanguageName}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded whitespace-nowrap">
                        {doc.billable_pages.toFixed(1)} pages
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="font-semibold text-gray-900 whitespace-nowrap">
                      ${parseFloat(doc.line_total).toFixed(2)}
                    </p>
                    {parseFloat(doc.certification_price) > 0 && (
                      <p className="text-xs text-gray-500 whitespace-nowrap">
                        +${parseFloat(doc.certification_price).toFixed(2)} cert
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-4">
            <p className="text-sm text-gray-600">
              This quote was prepared by our team.
            </p>
            {sourceLanguageName && targetLanguageName && (
              <p className="text-xs text-gray-500 mt-1">
                {sourceLanguageName} → {targetLanguageName}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Price Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Price Breakdown</h2>
        </div>
        <div className="px-4 sm:px-6 py-4 space-y-3">
          <div>
            <div className="flex justify-between text-gray-700">
              <span>Certified Translation</span>
              <span className="whitespace-nowrap">${totals.translationSubtotal.toFixed(2)}</span>
            </div>
            {documents.length > 0 && (
              <div className="text-xs text-gray-500 ml-4 mt-0.5 whitespace-nowrap">
                {totalBillablePages.toFixed(1)} pages × ${effectiveRate.toFixed(2)} per page
              </div>
            )}
          </div>
          {totals.certificationTotal > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>
                Certification ({documents.length} document
                {documents.length !== 1 ? "s" : ""})
              </span>
              <span className="whitespace-nowrap">${totals.certificationTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-gray-200 pt-3 flex justify-between font-medium text-gray-900">
            <span>Subtotal</span>
            <span className="whitespace-nowrap">${totals.subtotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* HITL Request Banner - Hidden when customer came via staff email link (already reviewed) */}
      {!hitlRequested && !state.isStaffReviewed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
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
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
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

      {/* Turnaround Time Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Turnaround Time</h2>
          <p className="text-sm text-gray-500">Choose your delivery speed</p>
        </div>
        <div className="px-4 sm:px-6 py-4 space-y-3">
          {/* Debug info */}
          {turnaroundOptions.length === 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                Turnaround options not loaded. Please run the database setup
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
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-600 flex-shrink-0" />
                    <p className="font-medium text-gray-900">
                      {standardOption.name}
                    </p>
                  </div>
                  <span className="text-gray-600 whitespace-nowrap">Included</span>
                </div>
                <p className="text-sm mt-1">
                  Ready by{" "}
                  <span className="font-semibold text-gray-900 text-base">
                    {format(standardDeliveryDate, "MMM d")}
                  </span>
                  <span className="mx-1.5 text-gray-300">&middot;</span>
                  <span className="font-medium text-cethos-teal">
                    {getFriendlyDateLabel(standardDeliveryDate)}
                  </span>
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

          {/* Rush Option - Always Available */}
          {rushOption && (
            <label
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                turnaroundType === "rush"
                  ? "border-cethos-teal bg-cethos-teal-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="turnaround"
                value="rush"
                checked={turnaroundType === "rush"}
                onChange={() => setTurnaroundType("rush")}
                className="sr-only"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Zap className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="font-medium text-gray-900">
                      {rushOption.name}
                    </p>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded whitespace-nowrap">
                      +{((rushMultiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="font-semibold text-amber-600 whitespace-nowrap">
                    +${(totals.subtotal * (rushMultiplier - 1)).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm mt-1">
                  Ready by{" "}
                  <span className="font-semibold text-gray-900 text-base">
                    {format(rushDeliveryDate, "MMM d")}
                  </span>
                  <span className="mx-1.5 text-gray-300">&middot;</span>
                  <span className="font-medium text-amber-600">
                    {getFriendlyDateLabel(rushDeliveryDate)}
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  {rushTurnaroundDays} day{rushTurnaroundDays !== 1 ? "s" : ""}{" "}
                  faster turnaround
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
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <p className="font-medium text-gray-900">
                      {sameDayOption.name}
                    </p>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded whitespace-nowrap">
                      +{((sameDayMultiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="font-semibold text-green-600 whitespace-nowrap">
                    +${(totals.subtotal * (sameDayMultiplier - 1)).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm mt-1">
                  Ready{" "}
                  <span className="font-semibold text-gray-900 text-base">
                    {format(new Date(), "MMM d")}
                  </span>
                  <span className="mx-1.5 text-gray-300">&middot;</span>
                  <span className="font-medium text-green-600">Today</span>
                  <span className="text-gray-400 text-xs ml-1">by 6:00 PM MST</span>
                </p>
                <p className="text-xs text-gray-400">
                  Order by 2:00 PM MST &bull; Limited availability
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

      {/* Digital Delivery Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Digital Delivery
        </h3>
        <p className="text-sm text-gray-500 mb-4">Select all that apply</p>

        <div className="space-y-3">
          {digitalOptions.map((option) => (
            <label
              key={option.id}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 ${
                option.is_always_selected
                  ? "border-green-200 bg-green-50 cursor-not-allowed"
                  : selectedDigitalOptions.includes(option.code)
                  ? "border-cethos-teal bg-cethos-teal-50 cursor-pointer"
                  : "border-gray-200 hover:border-gray-300 cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={
                  selectedDigitalOptions.includes(option.code) ||
                  option.is_always_selected
                }
                onChange={() => {
                  if (option.is_always_selected) return;
                  setSelectedDigitalOptions((prev) =>
                    prev.includes(option.code)
                      ? prev.filter((c) => c !== option.code)
                      : [...prev, option.code]
                  );
                }}
                disabled={option.is_always_selected}
                className="h-4 w-4 rounded border-gray-300 text-cethos-teal"
              />
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedDigitalOptions.includes(option.code) ||
                  option.is_always_selected
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {option.code === "email" ? (
                  <Mail className="w-5 h-5" />
                ) : (
                  <Globe className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {option.name}
                  </span>
                  <span className="text-sm text-gray-600">
                    {option.price === 0
                      ? "FREE"
                      : `$${option.price.toFixed(2)}`}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{option.description}</p>
                {option.is_always_selected && (
                  <span className="text-xs text-green-600">
                    (Always included)
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Physical Delivery Section - DROPDOWN */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Physical Delivery
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Choose how you'd like to receive certified hard copies
        </p>

        <select
          value={selectedPhysicalOption}
          onChange={(e) => {
            setSelectedPhysicalOption(e.target.value);
            if (errors.physicalDelivery) {
              setErrors((prev) => ({ ...prev, physicalDelivery: "" }));
            }
          }}
          className={`w-full px-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal text-gray-900 ${
            errors.physicalDelivery ? "border-red-500" : "border-gray-300"
          } ${!selectedPhysicalOption ? "text-gray-400" : ""}`}
        >
          <option value="" disabled>
            Select a delivery option...
          </option>
          <option value="none">No physical copy needed (Digital only) - FREE</option>
          {physicalOptions.map((option) => (
            <option key={option.id} value={option.code}>
              {option.name} -{" "}
              {option.price === 0 ? "FREE" : `$${option.price.toFixed(2)}`}
            </option>
          ))}
        </select>

        {/* Show error message if no option selected */}
        {errors.physicalDelivery && (
          <p className="text-red-500 text-sm mt-1">{errors.physicalDelivery}</p>
        )}

        {/* Show description for selected option */}
        {selectedPhysicalOption && selectedPhysicalOption !== "none" && (
          <p className="text-sm text-gray-500 mt-2">
            {
              physicalOptions.find(
                (opt) => opt.code === selectedPhysicalOption
              )?.description
            }
          </p>
        )}
      </div>

      {/* Shipping Address Form - Show when mail/courier selected */}
      {needsShippingAddress && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Shipping Address
          </h3>

          {/* Same as Billing Checkbox */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sameAsBilling}
                onChange={(e) => handleSameAsBillingChange(e.target.checked)}
                className="w-4 h-4 text-cethos-teal border-gray-300 rounded focus:ring-2 focus:ring-cethos-teal"
              />
              <span className="text-sm font-medium text-gray-700">
                Same as billing address
              </span>
            </label>
          </div>

          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shippingAddress.fullName}
                onChange={(e) =>
                  handleShippingFieldChange("fullName", e.target.value)
                }
                onBlur={() => handleShippingFieldBlur("fullName")}
                disabled={sameAsBilling}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                  sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                } ${
                  touched.shipping_fullName && errors.shipping_fullName
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
                placeholder="John Doe"
              />
              {touched.shipping_fullName && errors.shipping_fullName && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.shipping_fullName}
                </p>
              )}
            </div>

            {/* Country */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country <span className="text-red-500">*</span>
              </label>
              <select
                value={shippingAddress.country}
                onChange={(e) =>
                  handleShippingFieldChange("country", e.target.value)
                }
                disabled={sameAsBilling}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                  sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                }`}
              >
                <option value="">Select country...</option>
                {commonCountries.length > 0 && (
                  <optgroup label="Common Countries">
                    {commonCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherCountries.length > 0 && (
                  <optgroup label="All Countries">
                    {otherCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Street Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shippingAddress.streetAddress}
                onChange={(e) =>
                  handleShippingFieldChange("streetAddress", e.target.value)
                }
                onBlur={() => handleShippingFieldBlur("streetAddress")}
                disabled={sameAsBilling}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                  sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                } ${
                  touched.shipping_streetAddress &&
                  errors.shipping_streetAddress
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
                placeholder="123 Main Street"
              />
              {touched.shipping_streetAddress &&
                errors.shipping_streetAddress && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.shipping_streetAddress}
                  </p>
                )}
            </div>

            {/* City and Province/State */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={shippingAddress.city}
                  onChange={(e) =>
                    handleShippingFieldChange("city", e.target.value)
                  }
                  onBlur={() => handleShippingFieldBlur("city")}
                  disabled={sameAsBilling}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                    sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                  } ${
                    touched.shipping_city && errors.shipping_city
                      ? "border-red-500"
                      : "border-gray-300"
                  }`}
                  placeholder="Calgary"
                />
                {touched.shipping_city && errors.shipping_city && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.shipping_city}
                  </p>
                )}
              </div>

              {/* Province/State - Conditional */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getProvinceLabel(shippingAddress.country)}{" "}
                  {(shippingAddress.country === "CA" ||
                    shippingAddress.country === "US") && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                {shippingAddress.country === "CA" ? (
                  <select
                    value={shippingAddress.province}
                    onChange={(e) =>
                      handleShippingFieldChange("province", e.target.value)
                    }
                    disabled={sameAsBilling}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                      sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {CANADIAN_PROVINCES.map((province) => (
                      <option key={province.code} value={province.code}>
                        {province.name}
                      </option>
                    ))}
                  </select>
                ) : shippingAddress.country === "US" ? (
                  <select
                    value={shippingAddress.province}
                    onChange={(e) =>
                      handleShippingFieldChange("province", e.target.value)
                    }
                    disabled={sameAsBilling}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                      sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <option value="">Select state...</option>
                    {US_STATES.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={shippingAddress.province}
                    onChange={(e) =>
                      handleShippingFieldChange("province", e.target.value)
                    }
                    onBlur={() => handleShippingFieldBlur("province")}
                    disabled={sameAsBilling}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                      sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                    }`}
                    placeholder="Province/State (optional)"
                  />
                )}
                {touched.shipping_province && errors.shipping_province && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.shipping_province}
                  </p>
                )}
              </div>
            </div>

            {/* Postal Code */}
            <div className="sm:w-1/2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {getPostalCodeLabel(shippingAddress.country)}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shippingAddress.postalCode}
                onChange={(e) =>
                  handleShippingFieldChange(
                    "postalCode",
                    shippingAddress.country === "CA"
                      ? e.target.value.toUpperCase()
                      : e.target.value
                  )
                }
                onBlur={() => handleShippingFieldBlur("postalCode")}
                disabled={sameAsBilling}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                  sameAsBilling ? "bg-gray-50 cursor-not-allowed" : ""
                } ${
                  touched.shipping_postalCode && errors.shipping_postalCode
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
                placeholder={
                  shippingAddress.country === "CA"
                    ? "T2P 1J9"
                    : shippingAddress.country === "US"
                    ? "12345"
                    : "Postal code"
                }
                maxLength={
                  shippingAddress.country === "CA"
                    ? 7
                    : shippingAddress.country === "US"
                    ? 10
                    : 20
                }
              />
              {touched.shipping_postalCode && errors.shipping_postalCode && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.shipping_postalCode}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pickup Location - Only show when pickup selected */}
      {isPickupSelected && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Pickup Location
          </h3>

          {pickupLocations.length === 1 ? (
            <div className="p-4 bg-cethos-teal-50 border border-cethos-teal/20 rounded-lg">
              <p className="font-medium text-gray-900">
                {pickupLocations[0].name}
              </p>
              <p className="text-gray-600">
                {pickupLocations[0].address_line1}
              </p>
              {pickupLocations[0].address_line2 && (
                <p className="text-gray-600">
                  {pickupLocations[0].address_line2}
                </p>
              )}
              <p className="text-gray-600">
                {pickupLocations[0].city}, {pickupLocations[0].state}{" "}
                {pickupLocations[0].postal_code}
              </p>
              {pickupLocations[0].phone && (
                <p className="text-gray-500 text-sm mt-2">
                  📞 {pickupLocations[0].phone}
                </p>
              )}
              {pickupLocations[0].hours && (
                <p className="text-gray-500 text-sm">
                  🕐 {pickupLocations[0].hours}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select pickup location
              </label>
              <select
                value={selectedPickupLocation}
                onChange={(e) => setSelectedPickupLocation(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">Choose a location...</option>
                {pickupLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} - {loc.city}
                  </option>
                ))}
              </select>

              {selectedPickupLocation && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg">
                  {(() => {
                    const loc = pickupLocations.find(
                      (l) => l.id === selectedPickupLocation
                    );
                    if (!loc) return null;
                    return (
                      <>
                        <p className="font-medium text-gray-900">{loc.name}</p>
                        <p className="text-gray-600">{loc.address_line1}</p>
                        <p className="text-gray-600">
                          {loc.city}, {loc.state} {loc.postal_code}
                        </p>
                        {loc.hours && (
                          <p className="text-gray-500 text-sm mt-2">
                            🕐 {loc.hours}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {errors.pickupLocation && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.pickupLocation}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Billing Information */}
      <div className="bg-white rounded-xl border border-cethos-border p-6 mb-6 shadow-cethos-card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Billing Information
        </h3>

        {geoLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Detecting your location...</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={billingAddress.fullName}
              onChange={(e) =>
                handleBillingFieldChange("fullName", e.target.value)
              }
              onBlur={() => handleBillingFieldBlur("fullName")}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                touched.billing_fullName && errors.billing_fullName
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="John Doe"
            />
            {touched.billing_fullName && errors.billing_fullName && (
              <p className="text-xs text-red-600 mt-1">
                {errors.billing_fullName}
              </p>
            )}
          </div>

          {/* Country */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country <span className="text-red-500">*</span>
            </label>
            <select
              value={billingAddress.country}
              onChange={(e) =>
                handleBillingFieldChange("country", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal"
            >
              <option value="">Select country...</option>
              {commonCountries.length > 0 && (
                <optgroup label="Common Countries">
                  {commonCountries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherCountries.length > 0 && (
                <optgroup label="All Countries">
                  {otherCountries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Street Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={billingAddress.streetAddress}
              onChange={(e) =>
                handleBillingFieldChange("streetAddress", e.target.value)
              }
              onBlur={() => handleBillingFieldBlur("streetAddress")}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                touched.billing_streetAddress && errors.billing_streetAddress
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="123 Main Street"
            />
            {touched.billing_streetAddress && errors.billing_streetAddress && (
              <p className="text-xs text-red-600 mt-1">
                {errors.billing_streetAddress}
              </p>
            )}
          </div>

          {/* City and Province/State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={billingAddress.city}
                onChange={(e) =>
                  handleBillingFieldChange("city", e.target.value)
                }
                onBlur={() => handleBillingFieldBlur("city")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                  touched.billing_city && errors.billing_city
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
                placeholder="Calgary"
              />
              {touched.billing_city && errors.billing_city && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.billing_city}
                </p>
              )}
            </div>

            {/* Province/State - Conditional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {getProvinceLabel(billingAddress.country)}{" "}
                {(billingAddress.country === "CA" ||
                  billingAddress.country === "US") && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              {billingAddress.country === "CA" ? (
                <select
                  value={billingAddress.province}
                  onChange={(e) =>
                    handleBillingFieldChange("province", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal"
                >
                  {CANADIAN_PROVINCES.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.name}
                    </option>
                  ))}
                </select>
              ) : billingAddress.country === "US" ? (
                <select
                  value={billingAddress.province}
                  onChange={(e) =>
                    handleBillingFieldChange("province", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal"
                >
                  <option value="">Select state...</option>
                  {US_STATES.map((usState) => (
                    <option key={usState.code} value={usState.code}>
                      {usState.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={billingAddress.province}
                  onChange={(e) =>
                    handleBillingFieldChange("province", e.target.value)
                  }
                  onBlur={() => handleBillingFieldBlur("province")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal"
                  placeholder="Province/State (optional)"
                />
              )}
              {touched.billing_province && errors.billing_province && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.billing_province}
                </p>
              )}
            </div>
          </div>

          {/* Postal Code */}
          <div className="sm:w-1/2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {getPostalCodeLabel(billingAddress.country)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={billingAddress.postalCode}
              onChange={(e) =>
                handleBillingFieldChange(
                  "postalCode",
                  billingAddress.country === "CA"
                    ? e.target.value.toUpperCase()
                    : e.target.value
                )
              }
              onBlur={() => handleBillingFieldBlur("postalCode")}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal ${
                touched.billing_postalCode && errors.billing_postalCode
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder={
                billingAddress.country === "CA"
                  ? "T2P 1J9"
                  : billingAddress.country === "US"
                  ? "12345"
                  : "Postal code"
              }
              maxLength={
                billingAddress.country === "CA"
                  ? 7
                  : billingAddress.country === "US"
                  ? 10
                  : 20
              }
            />
            {touched.billing_postalCode && errors.billing_postalCode && (
              <p className="text-xs text-red-600 mt-1">
                {errors.billing_postalCode}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <StartOverLink />
        <button
          onClick={goToPreviousStep}
          disabled={saving || payLoading}
          className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
        >
          &larr; Back
        </button>
      </div>

      </div>{/* END LEFT COLUMN */}

      {/* RIGHT COLUMN — Sticky Order Summary */}
      <div className="w-full xl:w-[340px] flex-shrink-0">
        <div className="xl:sticky xl:top-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Order Summary</h3>
            </div>

            <div className="px-6 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Translation</span>
                  <span className="text-gray-900 font-medium whitespace-nowrap">${pricing.translationTotal.toFixed(2)}</span>
                </div>

                {pricing.certificationTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Certification</span>
                    <span className="text-gray-900 font-medium whitespace-nowrap">${pricing.certificationTotal.toFixed(2)}</span>
                  </div>
                )}

                {pricing.turnaroundFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {turnaroundType === "rush" ? "Rush Fee" : "Same-Day Fee"}
                    </span>
                    <span className="text-gray-900 font-medium whitespace-nowrap">${pricing.turnaroundFee.toFixed(2)}</span>
                  </div>
                )}

                {pricing.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delivery</span>
                    <span className="text-gray-900 font-medium whitespace-nowrap">${pricing.deliveryFee.toFixed(2)}</span>
                  </div>
                )}

                {pricing.taxRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{pricing.taxName} ({(pricing.taxRate * 100).toFixed(0)}%)</span>
                    <span className="text-gray-900 font-medium whitespace-nowrap">${pricing.taxAmount.toFixed(2)}</span>
                  </div>
                )}

                {pricing.taxRate === 0 && billingAddress.country !== "CA" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax</span>
                    <span className="text-gray-500 font-medium">Not applicable</span>
                  </div>
                )}

                <div className="pt-3 border-t-2 border-gray-300 flex justify-between items-center">
                  <span className="text-xl font-bold text-gray-900">TOTAL CAD</span>
                  <span className="text-2xl font-bold text-gray-900 whitespace-nowrap">${pricing.finalTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Pay Button — hidden on mobile */}
              <button
                onClick={handlePay}
                disabled={payLoading || pricing.finalTotal <= 0 || hitlRequested || hitlRequired}
                className="hidden xl:flex w-full mt-6 py-3 px-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed items-center justify-center gap-2"
              >
                {payLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : hitlRequested || hitlRequired ? (
                  "Awaiting Review"
                ) : (
                  <><CreditCard className="w-5 h-5" /> Pay ${pricing.finalTotal.toFixed(2)} CAD</>
                )}
              </button>

              {/* Security badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mt-3">
                <Lock className="w-3 h-3" />
                <span>Secure payment powered by Stripe</span>
              </div>

              {/* E-Transfer (staff_manual only) */}
              {entryPoint === "staff_manual" && (
                <div className="mt-4">
                  <div className="text-center mb-2"><span className="text-xs text-gray-500">or</span></div>
                  <button
                    onClick={() => navigate(`/etransfer/confirm?quote_id=${state.quoteId}`)}
                    disabled={payLoading || pricing.finalTotal <= 0}
                    className="w-full py-2.5 px-4 border-2 border-cethos-teal text-cethos-teal rounded-xl hover:bg-cethos-teal hover:text-white transition-colors font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Mail className="w-4 h-4" /> Pay by E-Transfer
                  </button>
                </div>
              )}

              {/* Save & Email */}
              <div className="text-center mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Not ready to pay now?</p>
                <button
                  onClick={handleSaveAndEmail}
                  disabled={savingQuote || pricing.finalTotal <= 0}
                  className="text-sm text-cethos-teal hover:underline disabled:opacity-50"
                >
                  {savingQuote ? "Saving..." : "Save and email my quote"}
                </button>
              </div>

              {/* Quote info */}
              {state.quoteNumber && (
                <p className="text-xs text-gray-400 text-center mt-3">Quote: {state.quoteNumber}</p>
              )}

              {/* Terms */}
              <p className="text-xs text-gray-400 text-center mt-2">
                By clicking &quot;Pay&quot;, you agree to our{" "}
                <a href="/terms" className="text-cethos-teal hover:underline">Terms</a>
                {" & "}
                <a href="/privacy" className="text-cethos-teal hover:underline">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
      </div>{/* END RIGHT COLUMN */}

      </div>{/* END Two-column layout */}

      {/* Mobile sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 xl:hidden z-40 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">Total</span>
          <span className="text-lg font-bold text-gray-900">${pricing.finalTotal.toFixed(2)} CAD</span>
        </div>
        <button
          onClick={handlePay}
          disabled={payLoading || pricing.finalTotal <= 0 || hitlRequested || hitlRequired}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold disabled:opacity-50"
        >
          {payLoading ? "Processing..." : hitlRequested || hitlRequired ? "Awaiting Review" : `Pay $${pricing.finalTotal.toFixed(2)} CAD`}
        </button>
      </div>
      {/* Spacer for mobile sticky footer */}
      <div className="h-28 xl:hidden" />

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
