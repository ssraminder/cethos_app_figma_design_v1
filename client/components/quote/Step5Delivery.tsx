import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  ChevronRight,
  Clock,
  Zap,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Mail,
  MapPin,
  Calendar,
  Package,
} from "lucide-react";
import StartOverLink from "@/components/StartOverLink";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/pricing";

// ── Types ───────────────────────────────────────────────────────────────────

interface TurnaroundOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  multiplier: number;
  estimated_days: number;
  days_reduction: number | null;
  fee_type: string;
  fee_value: number;
  is_default: boolean;
  sort_order: number;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  estimated_days: number | null;
  is_physical: boolean;
  requires_address: boolean;
  delivery_type: string;
  delivery_group: string;
  is_always_selected: boolean;
  sort_order: number;
}

interface PickupLocation {
  id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  phone: string | null;
  hours: string | null;
}

interface TaxRateRow {
  id: string;
  region_code: string;
  region_name: string;
  tax_name: string;
  rate: number;
}

interface ProvinceInfo {
  code: string;
  name: string;
  taxName: string;
  totalRate: number;
  taxRateId: string;
}

interface AddressFields {
  full_name: string;
  street_address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

interface NotarizedDocInfo {
  result_id: string;
  file_name: string;
  line_total: number;
  certification_price: number;
}

interface DocAnalysis {
  id: string;
  file_name: string;
  detected_document_type: string;
  line_total: number;
  certification_type_id: string | null;
  certification_code: string | null;
  certification_price: number;
  billable_pages: number;
}

interface PricingState {
  translation_total: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  subtotal: number;
  tax_rate: number;
  tax_name: string;
  tax_amount: number;
  total: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const EMPTY_ADDRESS: AddressFields = {
  full_name: "",
  street_address: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Canada",
};

// ── Component ───────────────────────────────────────────────────────────────

export default function Step5Delivery() {
  const { state, goToNextStep, goToPreviousStep } = useQuote();

  // ── Loading / UI state ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // ── Turnaround state ────────────────────────────────────────────────────
  const [turnaroundOptions, setTurnaroundOptions] = useState<TurnaroundOption[]>([]);
  const [selectedTurnaround, setSelectedTurnaround] = useState<string>("standard");
  const [sameDayEligible, setSameDayEligible] = useState(false);
  const [sameDayAdditionalFee, setSameDayAdditionalFee] = useState(0);
  const [notarizedDocs, setNotarizedDocs] = useState<NotarizedDocInfo[]>([]);
  const [docAnalyses, setDocAnalyses] = useState<DocAnalysis[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);

  // ── Delivery state ──────────────────────────────────────────────────────
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [selectedDigitalOptions, setSelectedDigitalOptions] = useState<string[]>(["online_portal", "email"]);
  const [selectedPhysicalOption, setSelectedPhysicalOption] = useState<string>("none");
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<string>("");

  // ── Billing address state ───────────────────────────────────────────────
  const [billingAddress, setBillingAddress] = useState<AddressFields>({
    ...EMPTY_ADDRESS,
    full_name: state.fullName || "",
  });

  // ── Shipping address state ──────────────────────────────────────────────
  const [shippingAddress, setShippingAddress] = useState<AddressFields>({ ...EMPTY_ADDRESS });
  const [sameAsBilling, setSameAsBilling] = useState(true);

  // ── Tax state ───────────────────────────────────────────────────────────
  const [provinces, setProvinces] = useState<ProvinceInfo[]>([]);
  const [selectedTaxRate, setSelectedTaxRate] = useState(0.05);
  const [selectedTaxName, setSelectedTaxName] = useState("GST");
  const [selectedTaxRateId, setSelectedTaxRateId] = useState<string>("");

  // ── Pricing state ───────────────────────────────────────────────────────
  const [basePricing, setBasePricing] = useState<{ translation_total: number; certification_total: number } | null>(null);

  // ── Derived values ──────────────────────────────────────────────────────

  const hasNotarization = notarizedDocs.length > 0;

  const digitalOptions = useMemo(
    () => deliveryOptions.filter((o) => o.delivery_group === "digital"),
    [deliveryOptions],
  );

  const physicalOptions = useMemo(
    () => deliveryOptions.filter((o) => o.delivery_group === "physical"),
    [deliveryOptions],
  );

  const needsShippingAddress = useMemo(() => {
    if (selectedPhysicalOption === "none" || selectedPhysicalOption === "pickup") return false;
    const opt = physicalOptions.find((o) => o.code === selectedPhysicalOption);
    return opt?.requires_address ?? false;
  }, [selectedPhysicalOption, physicalOptions]);

  const isPickupSelected = selectedPhysicalOption === "pickup";

  const selectedTurnaroundOption = useMemo(
    () => turnaroundOptions.find((t) => t.code === selectedTurnaround),
    [turnaroundOptions, selectedTurnaround],
  );

  // Calculate rush-eligible subtotal (excludes notarized docs)
  const rushEligibleSubtotal = useMemo(() => {
    if (!basePricing) return 0;
    if (!hasNotarization) return basePricing.translation_total + basePricing.certification_total;
    const notarizedTotal = notarizedDocs.reduce(
      (sum, d) => sum + d.line_total + d.certification_price,
      0,
    );
    return basePricing.translation_total + basePricing.certification_total - notarizedTotal;
  }, [basePricing, notarizedDocs, hasNotarization]);

  // Calculate rush fee based on selection and fee_type
  const rushFee = useMemo(() => {
    if (!selectedTurnaroundOption || selectedTurnaround === "standard") return 0;
    const baseFee = selectedTurnaroundOption.fee_type === "percentage"
      ? rushEligibleSubtotal * (selectedTurnaroundOption.fee_value / 100)
      : selectedTurnaroundOption.fee_value;
    // Same-day includes additional_fee from eligibility record
    if (selectedTurnaround === "same_day") {
      return baseFee + sameDayAdditionalFee;
    }
    return baseFee;
  }, [selectedTurnaround, selectedTurnaroundOption, rushEligibleSubtotal, sameDayAdditionalFee]);

  // Calculate delivery fee
  const deliveryFee = useMemo(() => {
    if (selectedPhysicalOption === "none") return 0;
    const opt = physicalOptions.find((o) => o.code === selectedPhysicalOption);
    return opt?.price ?? 0;
  }, [selectedPhysicalOption, physicalOptions]);

  // Full pricing calculation
  const pricing: PricingState | null = useMemo(() => {
    if (!basePricing) return null;
    const subtotal = basePricing.translation_total + basePricing.certification_total;
    const taxableAmount = subtotal + rushFee + deliveryFee;
    const taxAmount = taxableAmount * selectedTaxRate;
    const total = taxableAmount + taxAmount;
    return {
      translation_total: basePricing.translation_total,
      certification_total: basePricing.certification_total,
      rush_fee: rushFee,
      delivery_fee: deliveryFee,
      subtotal,
      tax_rate: selectedTaxRate,
      tax_name: selectedTaxName,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [basePricing, rushFee, deliveryFee, selectedTaxRate, selectedTaxName]);

  // ── Delivery date calculations ──────────────────────────────────────────

  /**
   * Add N business days to a start date, skipping weekends and holidays.
   */
  const addBusinessDays = useCallback(
    (startDate: Date, businessDays: number): Date => {
      const holidaySet = new Set(holidays);
      const current = new Date(startDate);
      let added = 0;

      while (added < businessDays) {
        current.setDate(current.getDate() + 1);
        const day = current.getDay();
        const dateStr = current.toISOString().split("T")[0];
        if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
          added++;
        }
      }
      return current;
    },
    [holidays],
  );

  /**
   * Determine the effective start date based on 4:30 PM America/Toronto cutoff.
   * If current time is after 4:30 PM → day 1 starts next business day.
   */
  const getEffectiveStartDate = useCallback((): Date => {
    const now = new Date();
    const torontoTime = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Toronto" }),
    );
    const hours = torontoTime.getHours();
    const minutes = torontoTime.getMinutes();

    // After 4:30 PM → start counting from tomorrow
    if (hours > 16 || (hours === 16 && minutes >= 30)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return now;
  }, []);

  /**
   * Calculate standard turnaround days based on billable pages.
   * Base: 2 business days for up to 2 pages
   * +1 business day for every additional 2 pages
   */
  const getStandardDays = useCallback((billablePages: number): number => {
    const pages = Math.ceil(billablePages);
    if (pages <= 2) return 2;
    return 2 + Math.ceil((pages - 2) / 2);
  }, []);

  /**
   * Calculate rush turnaround days based on billable pages.
   * Base: 1 business day for up to 2 pages
   * +1 business day for every additional 3 pages
   */
  const getRushDays = useCallback((billablePages: number): number => {
    const pages = Math.ceil(billablePages);
    if (pages <= 2) return 1;
    return 1 + Math.ceil((pages - 2) / 3);
  }, []);

  // Total billable pages across all documents
  const totalBillablePages = useMemo(
    () => docAnalyses.reduce((sum, d) => sum + (d.billable_pages || 1), 0),
    [docAnalyses],
  );

  const standardDays = useMemo(
    () => getStandardDays(totalBillablePages),
    [getStandardDays, totalBillablePages],
  );

  const rushDays = useMemo(
    () => getRushDays(totalBillablePages),
    [getRushDays, totalBillablePages],
  );

  const effectiveStartDate = useMemo(
    () => getEffectiveStartDate(),
    [getEffectiveStartDate],
  );

  const standardDeliveryDate = useMemo(
    () => addBusinessDays(effectiveStartDate, standardDays),
    [addBusinessDays, effectiveStartDate, standardDays],
  );

  const rushDeliveryDate = useMemo(
    () => addBusinessDays(effectiveStartDate, rushDays),
    [addBusinessDays, effectiveStartDate, rushDays],
  );

  const formatDate = (date: Date | null): string => {
    if (!date) return "—";
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  // ── Data fetching ───────────────────────────────────────────────────────

  useEffect(() => {
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update tax when billing province changes
  useEffect(() => {
    if (provinces.length === 0) return;
    const province = provinces.find((p) => p.code === billingAddress.province);
    if (province) {
      setSelectedTaxRate(province.totalRate);
      setSelectedTaxName(province.taxName);
      setSelectedTaxRateId(province.taxRateId);
    }
  }, [billingAddress.province, provinces]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [
        turnaroundRes,
        deliveryRes,
        pickupRes,
        taxRatesRes,
        holidaysRes,
        pricingRes,
        docsRes,
      ] = await Promise.all([
        // 1. Turnaround options
        supabase
          .from("turnaround_options")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        // 2. Delivery options
        supabase
          .from("delivery_options")
          .select("*")
          .eq("is_active", true)
          .eq("category", "delivery")
          .order("delivery_group")
          .order("sort_order"),
        // 3. Pickup locations
        supabase
          .from("pickup_locations")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        // 4. Tax rates (provinces)
        supabase
          .from("tax_rates")
          .select("id, region_code, region_name, tax_name, rate")
          .eq("region_type", "province")
          .eq("is_active", true)
          .order("region_name"),
        // 5. Holidays
        supabase
          .from("holidays")
          .select("holiday_date")
          .gte("holiday_date", new Date().toISOString().split("T")[0]),
        // 6. Current pricing from quote
        state.quoteId
          ? supabase
              .from("quotes")
              .select("subtotal, calculated_totals, turnaround_option_id, turnaround_type, billing_address, shipping_address, physical_delivery_option_id, digital_delivery_options, selected_pickup_location_id")
              .eq("id", state.quoteId)
              .single()
          : Promise.resolve({ data: null, error: null }),
        // 7. Document analyses with certification info
        state.quoteId
          ? supabase
              .from("ai_analysis_results")
              .select(`
                id,
                detected_document_type,
                line_total,
                certification_type_id,
                billable_pages,
                certification_types(code, price),
                quote_files!inner(original_filename)
              `)
              .eq("quote_id", state.quoteId)
          : Promise.resolve({ data: null, error: null }),
      ]);

      // Process turnaround options
      if (turnaroundRes.error) throw turnaroundRes.error;
      setTurnaroundOptions(turnaroundRes.data || []);

      // Process delivery options
      if (deliveryRes.error) throw deliveryRes.error;
      setDeliveryOptions(deliveryRes.data || []);

      // Process pickup locations
      if (pickupRes.error) throw pickupRes.error;
      setPickupLocations(pickupRes.data || []);
      if (pickupRes.data?.length === 1) {
        setSelectedPickupLocation(pickupRes.data[0].id);
      }

      // Process tax rates — group by region_code to handle multi-row provinces (e.g., QC: GST+QST)
      if (taxRatesRes.error) throw taxRatesRes.error;
      const taxData = taxRatesRes.data || [];
      const provinceMap = new Map<string, ProvinceInfo>();
      for (const row of taxData) {
        // Strip "CA-" prefix if present
        const shortCode = row.region_code.replace(/^CA-/i, "").toUpperCase();
        const existing = provinceMap.get(shortCode);
        if (existing) {
          existing.totalRate += Number(row.rate);
          existing.taxName = existing.taxName + " + " + row.tax_name;
        } else {
          provinceMap.set(shortCode, {
            code: shortCode,
            name: row.region_name,
            taxName: row.tax_name,
            totalRate: Number(row.rate),
            taxRateId: row.id,
          });
        }
      }
      const provincesArr = Array.from(provinceMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setProvinces(provincesArr);

      // Set default province if none selected
      if (!billingAddress.province && provincesArr.length > 0) {
        const defaultProv = provincesArr.find((p) => p.code === "AB") || provincesArr[0];
        setBillingAddress((prev) => ({ ...prev, province: defaultProv.code }));
      }

      // Process holidays
      if (holidaysRes.error) throw holidaysRes.error;
      setHolidays((holidaysRes.data || []).map((h: any) => h.holiday_date));

      // Process document analyses and notarization detection — do this BEFORE pricing
      // so we can use analyses as a fallback for basePricing
      let analyses: DocAnalysis[] = [];
      if (docsRes.data) {
        analyses = (docsRes.data as any[]).map((d: any) => ({
          id: d.id,
          file_name: (d.quote_files as any)?.original_filename || "Document",
          detected_document_type: d.detected_document_type || "",
          line_total: Number(d.line_total) || 0,
          certification_type_id: d.certification_type_id,
          certification_code: (d.certification_types as any)?.code || null,
          certification_price: Number((d.certification_types as any)?.price) || 0,
          billable_pages: Number(d.billable_pages) || 1,
        }));
        setDocAnalyses(analyses);

        // Find notarized docs
        const notarized = analyses
          .filter((d) => d.certification_code === "notarization")
          .map((d) => ({
            result_id: d.id,
            file_name: d.file_name,
            line_total: d.line_total,
            certification_price: d.certification_price,
          }));
        setNotarizedDocs(notarized);
      }

      // Process quote pricing
      if (pricingRes.data) {
        const quote = pricingRes.data as any;
        if (quote.calculated_totals) {
          setBasePricing({
            translation_total: Number(quote.calculated_totals.translation_total) || 0,
            certification_total: Number(quote.calculated_totals.certification_total) || 0,
          });
        } else if (quote.subtotal != null && Number(quote.subtotal) > 0) {
          // Fallback: use quote.subtotal and split into components from analyses
          const translationTotal = analyses.reduce((sum, d) => sum + d.line_total, 0);
          const certificationTotal = analyses.reduce((sum, d) => sum + d.certification_price, 0);
          const analysisSum = translationTotal + certificationTotal;
          if (analysisSum > 0) {
            setBasePricing({ translation_total: translationTotal, certification_total: certificationTotal });
          } else {
            // Can't split — treat entire subtotal as translation
            setBasePricing({ translation_total: Number(quote.subtotal), certification_total: 0 });
          }
        } else if (analyses.length > 0) {
          // Fallback: compute from document analyses
          const translationTotal = analyses.reduce((sum, d) => sum + d.line_total, 0);
          const certificationTotal = analyses.reduce((sum, d) => sum + d.certification_price, 0);
          if (translationTotal + certificationTotal > 0) {
            setBasePricing({ translation_total: translationTotal, certification_total: certificationTotal });
          }
        }

        // Restore previous selections if user navigated back
        if (quote.turnaround_type) {
          setSelectedTurnaround(quote.turnaround_type);
        }
        if (quote.billing_address) {
          const ba = quote.billing_address;
          setBillingAddress({
            full_name: ba.full_name || ba.firstName
              ? `${ba.firstName || ""} ${ba.lastName || ""}`.trim()
              : state.fullName || "",
            street_address: ba.street_address || ba.addressLine1 || "",
            city: ba.city || "",
            province: ba.province || ba.state || "",
            postal_code: ba.postal_code || ba.postalCode || "",
            country: ba.country || "Canada",
          });
        }
        if (quote.shipping_address) {
          const sa = quote.shipping_address;
          setShippingAddress({
            full_name: sa.full_name || sa.firstName
              ? `${sa.firstName || ""} ${sa.lastName || ""}`.trim()
              : "",
            street_address: sa.street_address || sa.addressLine1 || "",
            city: sa.city || "",
            province: sa.province || sa.state || "",
            postal_code: sa.postal_code || sa.postalCode || "",
            country: sa.country || "Canada",
          });
          setSameAsBilling(sa.same_as_billing ?? false);
        }
        if (quote.digital_delivery_options && Array.isArray(quote.digital_delivery_options)) {
          setSelectedDigitalOptions(
            quote.digital_delivery_options.length > 0
              ? quote.digital_delivery_options
              : ["online_portal", "email"],
          );
        }
        if (quote.selected_pickup_location_id) {
          setSelectedPickupLocation(quote.selected_pickup_location_id);
        }
        // Restore physical delivery option
        if (quote.physical_delivery_option_id) {
          // Look up the code from the delivery options
          const physOpt = (deliveryRes.data || []).find(
            (o: any) => o.id === quote.physical_delivery_option_id,
          );
          if (physOpt) {
            setSelectedPhysicalOption(physOpt.code);
          }
        }
      }

      // Check same-day eligibility
      await checkSameDayEligibility();
    } catch (err) {
      console.error("Error fetching Step 5 data:", err);
      toast.error("Failed to load delivery options");
    } finally {
      setLoading(false);
    }
  };

  const checkSameDayEligibility = async () => {
    try {
      // Check current time vs 4:30 PM America/Toronto cutoff
      const now = new Date();
      const torontoTime = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Toronto" }),
      );
      const hours = torontoTime.getHours();
      const minutes = torontoTime.getMinutes();

      if (hours > 16 || (hours === 16 && minutes >= 30)) {
        setSameDayEligible(false);
        return;
      }
      // Check if weekday
      if (torontoTime.getDay() === 0 || torontoTime.getDay() === 6) {
        setSameDayEligible(false);
        return;
      }
      // Check if today is a holiday (no is_active filter)
      const todayStr = torontoTime.toISOString().split("T")[0];
      const { data: holiday } = await supabase
        .from("holidays")
        .select("id")
        .eq("holiday_date", todayStr)
        .maybeSingle();
      if (holiday) {
        setSameDayEligible(false);
        return;
      }
      // Check language + document type + intended_use eligibility
      if (!state.quoteId) {
        setSameDayEligible(false);
        return;
      }
      const { data: quote } = await supabase
        .from("quotes")
        .select(`
          source_language:languages!quotes_source_language_id_fkey(code),
          target_language:languages!quotes_target_language_id_fkey(code),
          ai_analysis_results(detected_document_type),
          intended_use:intended_uses!quotes_intended_use_id_fkey(code)
        `)
        .eq("id", state.quoteId)
        .single();

      if (!quote) {
        setSameDayEligible(false);
        return;
      }

      const sourceCode = (quote.source_language as any)?.code;
      const targetCode = (quote.target_language as any)?.code;
      const docTypes = (quote.ai_analysis_results as any[])?.map(
        (r) => r.detected_document_type,
      ) || [];
      const intendedUseCode = (quote.intended_use as any)?.code;

      if (!sourceCode || !targetCode || docTypes.length === 0) {
        setSameDayEligible(false);
        return;
      }

      // Check eligibility for each document type with intended_use
      const { data: eligible } = await supabase
        .from("same_day_eligibility")
        .select("id, additional_fee")
        .eq("source_language", sourceCode)
        .eq("target_language", targetCode)
        .in("document_type", docTypes)
        .eq("intended_use", intendedUseCode)
        .eq("is_active", true);

      if (eligible && eligible.length > 0) {
        setSameDayEligible(true);
        // Sum additional fees from all matching eligibility records
        const totalAdditionalFee = eligible.reduce(
          (sum, e) => sum + (Number(e.additional_fee) || 0),
          0,
        );
        setSameDayAdditionalFee(totalAdditionalFee);
      } else {
        setSameDayEligible(false);
        setSameDayAdditionalFee(0);
      }
    } catch (err) {
      console.error("Error checking same-day eligibility:", err);
      setSameDayEligible(false);
      setSameDayAdditionalFee(0);
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleTurnaroundChange = (code: string) => {
    // Don't allow selecting locked same-day
    if (code === "same_day" && !sameDayEligible) return;
    // Don't allow rush/same-day if ALL docs are notarized
    if ((code === "rush" || code === "same_day") && hasNotarization) {
      const allNotarized = docAnalyses.every((d) =>
        notarizedDocs.some((n) => n.result_id === d.id),
      );
      if (allNotarized) return;
    }
    setSelectedTurnaround(code);
  };

  const handleDigitalToggle = (code: string) => {
    if (code === "online_portal") return; // Can't toggle portal
    setSelectedDigitalOptions((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code],
    );
  };

  const handlePhysicalChange = (code: string) => {
    setSelectedPhysicalOption(code);
  };

  const handleBillingChange = (field: keyof AddressFields, value: string) => {
    setBillingAddress((prev) => ({ ...prev, [field]: value }));
    if (sameAsBilling) {
      setShippingAddress((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleShippingChange = (field: keyof AddressFields, value: string) => {
    setShippingAddress((prev) => ({ ...prev, [field]: value }));
  };

  const handleSameAsBillingChange = (checked: boolean) => {
    setSameAsBilling(checked);
    if (checked) {
      setShippingAddress({ ...billingAddress });
    }
  };

  // ── Province name lookup ────────────────────────────────────────────────

  const getProvinceName = (code: string): string => {
    const prov = provinces.find((p) => p.code === code);
    return prov?.name || code;
  };

  // ── Validation ──────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    // Turnaround must be selected
    if (!selectedTurnaround) {
      newErrors.push("Please select a turnaround speed");
    }

    // Billing address validation
    if (!billingAddress.full_name.trim()) {
      newErrors.push("Billing full name is required");
    }
    if (!billingAddress.street_address.trim()) {
      newErrors.push("Billing street address is required");
    }
    if (!billingAddress.city.trim()) {
      newErrors.push("Billing city is required");
    }
    if (!billingAddress.province) {
      newErrors.push("Billing province is required");
    }
    if (!billingAddress.postal_code.trim()) {
      newErrors.push("Billing postal code is required");
    } else {
      const postalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
      if (!postalRegex.test(billingAddress.postal_code.trim())) {
        newErrors.push("Please enter a valid Canadian postal code (e.g., T2P 1J9)");
      }
    }

    // Shipping address validation (when needed and not same-as-billing)
    if (needsShippingAddress && !sameAsBilling) {
      if (!shippingAddress.full_name.trim()) {
        newErrors.push("Shipping full name is required");
      }
      if (!shippingAddress.street_address.trim()) {
        newErrors.push("Shipping street address is required");
      }
      if (!shippingAddress.city.trim()) {
        newErrors.push("Shipping city is required");
      }
      if (!shippingAddress.province) {
        newErrors.push("Shipping province is required");
      }
      if (!shippingAddress.postal_code.trim()) {
        newErrors.push("Shipping postal code is required");
      }
    }

    // Pickup location validation
    if (isPickupSelected && pickupLocations.length > 1 && !selectedPickupLocation) {
      newErrors.push("Please select a pickup location");
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  // ── Save and navigate ───────────────────────────────────────────────────

  const handleContinue = async () => {
    if (!validateForm()) {
      toast.error("Please complete all required fields");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    try {
      if (!state.quoteId || !pricing) {
        throw new Error("Quote data not available");
      }

      // Find selected turnaround option & physical delivery option IDs
      const turnaroundOpt = turnaroundOptions.find((t) => t.code === selectedTurnaround);
      const physicalOpt =
        selectedPhysicalOption !== "none"
          ? physicalOptions.find((o) => o.code === selectedPhysicalOption)
          : null;

      // Build shipping address data
      const shippingData = needsShippingAddress
        ? {
            full_name: sameAsBilling ? billingAddress.full_name : shippingAddress.full_name,
            street_address: sameAsBilling ? billingAddress.street_address : shippingAddress.street_address,
            city: sameAsBilling ? billingAddress.city : shippingAddress.city,
            province: sameAsBilling ? billingAddress.province : shippingAddress.province,
            province_name: sameAsBilling
              ? getProvinceName(billingAddress.province)
              : getProvinceName(shippingAddress.province),
            postal_code: sameAsBilling ? billingAddress.postal_code : shippingAddress.postal_code,
            country: "Canada",
            same_as_billing: sameAsBilling,
          }
        : null;

      // Calculate translation completion date
      let translationReadyDate: Date | null = null;
      if (selectedTurnaround === "standard") {
        translationReadyDate = standardDeliveryDate;
      } else if (selectedTurnaround === "rush") {
        translationReadyDate = rushDeliveryDate;
      } else if (selectedTurnaround === "same_day") {
        translationReadyDate = new Date();
      }

      // Calculate estimated delivery date (includes physical transit days)
      let estimatedDeliveryDate: Date | null = translationReadyDate;
      if (translationReadyDate && physicalOpt && physicalOpt.estimated_days && physicalOpt.estimated_days > 0) {
        // Add transit days for physical shipping
        estimatedDeliveryDate = addBusinessDays(translationReadyDate, physicalOpt.estimated_days);
      }

      const promisedDate = translationReadyDate
        ? translationReadyDate.toISOString().split("T")[0]
        : null;
      const estimatedDeliveryDateStr = estimatedDeliveryDate
        ? estimatedDeliveryDate.toISOString()
        : null;

      // Digital delivery option IDs
      const digitalOptIds = deliveryOptions
        .filter((o) => o.delivery_group === "digital" && selectedDigitalOptions.includes(o.code))
        .map((o) => o.id);

      // Update quote with all Step 5 data
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          // Turnaround
          turnaround_option_id: turnaroundOpt?.id || null,
          turnaround_type: selectedTurnaround,
          is_rush: selectedTurnaround === "rush" || selectedTurnaround === "same_day",
          rush_fee: pricing.rush_fee,
          // Delivery
          physical_delivery_option_id: physicalOpt?.id || null,
          digital_delivery_options: digitalOptIds,
          delivery_fee: pricing.delivery_fee,
          selected_pickup_location_id: isPickupSelected ? selectedPickupLocation || null : null,
          // Address
          billing_address: {
            full_name: billingAddress.full_name,
            street_address: billingAddress.street_address,
            city: billingAddress.city,
            province: billingAddress.province,
            province_name: getProvinceName(billingAddress.province),
            postal_code: billingAddress.postal_code.toUpperCase(),
            country: "Canada",
          },
          shipping_address: shippingData,
          // Tax
          tax_rate_id: selectedTaxRateId || null,
          tax_rate: pricing.tax_rate,
          tax_amount: pricing.tax_amount,
          // Totals
          subtotal: pricing.subtotal,
          total: pricing.total,
          calculated_totals: pricing,
          // Delivery date
          promised_delivery_date: promisedDate,
          estimated_delivery_date: estimatedDeliveryDateStr,
          // Status
          status: "pending_payment",
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.quoteId)
        .in("status", ["quote_ready", "lead", "details_pending", "draft", "pending_payment"]);

      if (updateError) throw updateError;

      goToNextStep();
    } catch (err) {
      console.error("Error saving Step 5 data:", err);
      toast.error("Failed to save delivery and billing information");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
        <p className="text-sm text-gray-500">Loading delivery options...</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 pb-8 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-cethos-navy mb-2">
          Turnaround, Delivery & Billing
        </h2>
        <p className="text-cethos-gray">
          Choose your speed, delivery method, and enter billing.
        </p>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── SECTION 1: TURNAROUND SPEED ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
          1. Turnaround Speed
        </h3>

        {/* Notarization Alert */}
        {hasNotarization && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">
                Notarization Detected
              </p>
              <p className="text-sm text-amber-800 mt-1">
                Your {notarizedDocs.map((d) => d.file_name).join(", ")} requires
                notarization, which adds 1 business day to standard processing.
                Rush and Same Day are not available for notarized documents.
              </p>
            </div>
          </div>
        )}

        {/* Rush Upsell Banner — show when standard is selected and rush-eligible docs exist */}
        {selectedTurnaround === "standard" &&
          rushEligibleSubtotal > 0 &&
          turnaroundOptions.some((t) => t.code === "rush") && (
            <div
              className="mb-4 p-4 rounded-xl border-2 border-amber-400 cursor-pointer hover:shadow-md transition-shadow"
              style={{
                background: "linear-gradient(135deg, rgb(255 251 235), rgb(255 247 237))",
              }}
              onClick={() => handleTurnaroundChange("rush")}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-amber-900 text-sm">
                  Need your documents faster? Get them by {formatDate(rushDeliveryDate)}
                </span>
              </div>
              <p className="text-xs text-amber-700 ml-6">
                {hasNotarization
                  ? "Rush available for non-notarized documents only"
                  : "Rush available for all documents"}
                {" · "}+{formatCurrency(
                  (() => {
                    const rushOpt = turnaroundOptions.find((t) => t.code === "rush");
                    if (!rushOpt) return 0;
                    return rushOpt.fee_type === "percentage"
                      ? rushEligibleSubtotal * (rushOpt.fee_value / 100)
                      : rushOpt.fee_value;
                  })()
                )}
              </p>
            </div>
          )}

        {/* Turnaround Options */}
        <div className="space-y-3">
          {turnaroundOptions.map((option) => {
            const isSelected = selectedTurnaround === option.code;
            const isLocked =
              option.code === "same_day" && !sameDayEligible;
            const allNotarized =
              hasNotarization &&
              docAnalyses.every((d) =>
                notarizedDocs.some((n) => n.result_id === d.id),
              );
            const isDisabledByNotarization =
              (option.code === "rush" || option.code === "same_day") && allNotarized;

            // Calculate fee for this option based on fee_type
            let feeDisplay = "";
            let feeAmount = 0;
            if (option.code === "standard") {
              feeDisplay = "Included";
            } else if (option.code === "rush") {
              feeAmount = option.fee_type === "percentage"
                ? rushEligibleSubtotal * (option.fee_value / 100)
                : option.fee_value;
              feeDisplay = `+${formatCurrency(feeAmount)} rush fee`;
            } else if (option.code === "same_day") {
              feeAmount = (option.fee_type === "percentage"
                ? rushEligibleSubtotal * (option.fee_value / 100)
                : option.fee_value) + sameDayAdditionalFee;
              feeDisplay = isLocked ? "—" : `+${formatCurrency(feeAmount)}`;
            }

            // Delivery date for this option
            let deliveryDateDisplay = "";
            if (option.code === "standard") {
              deliveryDateDisplay = formatDate(standardDeliveryDate);
            } else if (option.code === "rush") {
              deliveryDateDisplay = formatDate(rushDeliveryDate);
            } else if (option.code === "same_day") {
              deliveryDateDisplay = isLocked ? "Not available" : "Today";
            }

            // Labels for notarization context
            let badgeText = "";
            if (option.code === "rush" && hasNotarization && !allNotarized) {
              const eligibleNames = docAnalyses
                .filter((d) => !notarizedDocs.some((n) => n.result_id === d.id))
                .map((d) => d.file_name);
              badgeText = eligibleNames.join(", ") + " only";
            }

            return (
              <label
                key={option.id}
                className={`flex items-start gap-3.5 p-4 rounded-xl border-2 transition-all ${
                  isLocked || isDisabledByNotarization
                    ? "opacity-[0.42] cursor-not-allowed border-gray-200 bg-gray-50"
                    : isSelected
                      ? option.code === "rush"
                        ? "border-amber-400 bg-amber-50 shadow-[0_0_0_1px_rgb(251_191_36)] cursor-pointer"
                        : "border-teal-500 bg-teal-50 cursor-pointer"
                      : "border-gray-200 hover:border-gray-300 cursor-pointer"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  if (!isLocked && !isDisabledByNotarization) {
                    handleTurnaroundChange(option.code);
                  }
                }}
              >
                {/* Radio circle */}
                <div
                  className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    isSelected
                      ? "border-teal-500"
                      : "border-gray-300"
                  }`}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {option.name}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">
                        Selected
                      </span>
                    )}
                    {option.code === "rush" && badgeText && (
                      <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Zap className="w-3 h-3" /> {badgeText}
                      </span>
                    )}
                    {isLocked && (
                      <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {option.code === "standard" && (
                      <>
                        {standardDays} business day{standardDays !== 1 ? "s" : ""}
                      </>
                    )}
                    {option.code === "rush" && (
                      <>
                        {rushDays} business day{rushDays !== 1 ? "s" : ""} · +{option.fee_value}%{option.fee_type !== "percentage" ? ` (+${formatCurrency(option.fee_value)})` : ""} on eligible documents
                      </>
                    )}
                    {option.code === "same_day" && (
                      <>
                        +{option.fee_value}%
                        {isLocked
                          ? " · Not available for this combination"
                          : " · Same business day delivery"}
                      </>
                    )}
                  </p>
                  {!isLocked && option.code !== "same_day" && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Estimated delivery: {deliveryDateDisplay}
                    </p>
                  )}
                  {option.code === "same_day" && !isLocked && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Delivery: Today
                    </p>
                  )}
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                  <span className={`text-sm font-medium ${
                    feeAmount === 0 ? "text-green-600" : "font-mono text-gray-700"
                  }`}>
                    {feeDisplay}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ─── SECTION 2: DELIVERY METHOD ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
          2. Delivery Method
        </h3>

        {/* Digital Delivery */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Digital Delivery</p>
          <div className="space-y-2">
            {digitalOptions.map((option) => {
              const isAlwaysOn = option.is_always_selected || option.code === "online_portal";
              const isChecked =
                isAlwaysOn || selectedDigitalOptions.includes(option.code);

              return (
                <label
                  key={option.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border-[1.5px] transition-all ${
                    isAlwaysOn
                      ? "border-teal-200 bg-teal-50 cursor-default"
                      : isChecked
                        ? "border-teal-500 bg-teal-50 cursor-pointer"
                        : "border-gray-200 hover:border-gray-300 cursor-pointer"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isAlwaysOn) handleDigitalToggle(option.code);
                  }}
                >
                  {isAlwaysOn ? (
                    <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleDigitalToggle(option.code)}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {option.code === "online_portal" ? (
                        <Globe className="w-4 h-4 text-teal-600" />
                      ) : (
                        <Mail className="w-4 h-4 text-gray-500" />
                      )}
                      <span className="font-medium text-gray-900 text-sm">
                        {option.name}
                      </span>
                      {isAlwaysOn && (
                        <span className="text-[10px] text-teal-600 font-medium">
                          — always included
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <p className="text-xs text-gray-500 mt-0.5 ml-6">
                        {option.description}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-mono font-medium text-green-600 flex-shrink-0">
                    FREE
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Physical Delivery */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">
            Physical Delivery <span className="text-red-500">(required)</span>
          </p>
          <div className="space-y-2">
            {/* No physical copy option */}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border-[1.5px] transition-all cursor-pointer ${
                selectedPhysicalOption === "none"
                  ? "border-teal-500 bg-teal-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={(e) => {
                e.preventDefault();
                handlePhysicalChange("none");
              }}
            >
              <div
                className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  selectedPhysicalOption === "none" ? "border-teal-500" : "border-gray-300"
                }`}
              >
                {selectedPhysicalOption === "none" && (
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                )}
              </div>
              <span className="flex-1 font-medium text-gray-900 text-sm">
                No physical delivery needed
              </span>
              <span className="text-sm font-mono font-medium text-green-600 flex-shrink-0">FREE</span>
            </label>

            {physicalOptions.map((option) => {
              const isSelected = selectedPhysicalOption === option.code;

              return (
                <div key={option.id}>
                  <label
                    className={`flex items-center gap-3 p-3 rounded-lg border-[1.5px] transition-all cursor-pointer ${
                      isSelected
                        ? "border-teal-500 bg-teal-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      handlePhysicalChange(option.code);
                    }}
                  >
                    <div
                      className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        isSelected ? "border-teal-500" : "border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900 text-sm">
                        {option.name}
                      </span>
                      {option.estimated_days != null && option.estimated_days > 0 && (
                        <span className="text-xs text-gray-500 ml-1">
                          (+{option.estimated_days} day{option.estimated_days !== 1 ? "s" : ""})
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-medium flex-shrink-0">
                      {option.price === 0 ? (
                        <span className="text-green-600">FREE</span>
                      ) : (
                        <span className="text-gray-700">{formatCurrency(option.price)}</span>
                      )}
                    </span>
                  </label>

                  {/* Pickup location info */}
                  {isSelected && option.delivery_type === "pickup" && pickupLocations.length > 0 && (
                    <div className="ml-8 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      {pickupLocations.length === 1 ? (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-gray-900">{pickupLocations[0].name}</p>
                            <p className="text-gray-600">{pickupLocations[0].address_line1}</p>
                            {pickupLocations[0].address_line2 && (
                              <p className="text-gray-600">{pickupLocations[0].address_line2}</p>
                            )}
                            <p className="text-gray-600">
                              {pickupLocations[0].city}, {pickupLocations[0].province}{" "}
                              {pickupLocations[0].postal_code}
                            </p>
                            {pickupLocations[0].hours && (
                              <p className="text-gray-500 text-xs mt-1">
                                Hours: {pickupLocations[0].hours}
                              </p>
                            )}
                            {pickupLocations[0].phone && (
                              <p className="text-gray-500 text-xs">
                                Phone: {pickupLocations[0].phone}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select pickup location
                          </label>
                          <select
                            value={selectedPickupLocation}
                            onChange={(e) => setSelectedPickupLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="">Choose a location...</option>
                            {pickupLocations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name} — {loc.city}, {loc.province}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── SECTION 3: BILLING ADDRESS ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
          3. Billing Address
        </h3>

        <div className="space-y-4">
          {/* Full Name + Street Address — 2-col on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={billingAddress.full_name}
                onChange={(e) => handleBillingChange("full_name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                placeholder="Maria Garcia"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={billingAddress.street_address}
                onChange={(e) => handleBillingChange("street_address", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                placeholder="123 Main St, Apt 4B"
              />
            </div>
          </div>

          {/* City + Province */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={billingAddress.city}
                onChange={(e) => handleBillingChange("city", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                placeholder="Calgary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Province <span className="text-red-500">*</span>
              </label>
              <select
                value={billingAddress.province}
                onChange={(e) => handleBillingChange("province", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
              >
                <option value="">Select province...</option>
                {provinces.map((prov) => (
                  <option key={prov.code} value={prov.code}>
                    {prov.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Postal Code + Country */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Postal Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={billingAddress.postal_code}
                onChange={(e) =>
                  handleBillingChange("postal_code", e.target.value.toUpperCase())
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                placeholder="T2P 1J9"
                maxLength={7}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value="Canada"
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 4: SHIPPING ADDRESS (conditional) ───────────────────── */}
      {needsShippingAddress && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            4. Shipping Address
          </h3>

          {/* Same as billing checkbox */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={sameAsBilling}
              onChange={(e) => handleSameAsBillingChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Same as billing address
            </span>
          </label>

          <div className="space-y-4">
            {/* Full Name + Street Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sameAsBilling ? billingAddress.full_name : shippingAddress.full_name}
                  onChange={(e) => handleShippingChange("full_name", e.target.value)}
                  disabled={sameAsBilling}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm ${
                    sameAsBilling ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""
                  }`}
                  placeholder="Maria Garcia"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sameAsBilling ? billingAddress.street_address : shippingAddress.street_address}
                  onChange={(e) => handleShippingChange("street_address", e.target.value)}
                  disabled={sameAsBilling}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm ${
                    sameAsBilling ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""
                  }`}
                  placeholder="123 Main St, Apt 4B"
                />
              </div>
            </div>

            {/* City + Province */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sameAsBilling ? billingAddress.city : shippingAddress.city}
                  onChange={(e) => handleShippingChange("city", e.target.value)}
                  disabled={sameAsBilling}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm ${
                    sameAsBilling ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""
                  }`}
                  placeholder="Calgary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Province <span className="text-red-500">*</span>
                </label>
                <select
                  value={sameAsBilling ? billingAddress.province : shippingAddress.province}
                  onChange={(e) => handleShippingChange("province", e.target.value)}
                  disabled={sameAsBilling}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm ${
                    sameAsBilling ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""
                  }`}
                >
                  <option value="">Select province...</option>
                  {provinces.map((prov) => (
                    <option key={prov.code} value={prov.code}>
                      {prov.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Postal Code + Country */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Postal Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sameAsBilling ? billingAddress.postal_code : shippingAddress.postal_code}
                  onChange={(e) =>
                    handleShippingChange("postal_code", e.target.value.toUpperCase())
                  }
                  disabled={sameAsBilling}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm ${
                    sameAsBilling ? "bg-gray-50 cursor-not-allowed text-gray-500" : ""
                  }`}
                  placeholder="T2P 1J9"
                  maxLength={7}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value="Canada"
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION 5: ORDER TOTAL ──────────────────────────────────────── */}
      {pricing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Order Total
          </h3>

          <div className="space-y-2.5">
            {/* Translation */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Translation ({docAnalyses.length} doc{docAnalyses.length !== 1 ? "s" : ""})
              </span>
              <span className="font-mono font-medium text-gray-900">
                {formatCurrency(pricing.translation_total)}
              </span>
            </div>

            {/* Certifications */}
            {pricing.certification_total > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Certifications</span>
                <span className="font-mono font-medium text-gray-900">
                  {formatCurrency(pricing.certification_total)}
                </span>
              </div>
            )}

            {/* Rush Fee */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Rush Fee</span>
              <span className={`font-mono font-medium ${pricing.rush_fee > 0 ? "text-amber-700" : "text-gray-400"}`}>
                {pricing.rush_fee > 0
                  ? formatCurrency(pricing.rush_fee)
                  : "$0.00"}
              </span>
            </div>

            {/* Delivery */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Delivery</span>
              <span className={`font-mono font-medium ${pricing.delivery_fee > 0 ? "text-gray-900" : "text-gray-400"}`}>
                {pricing.delivery_fee > 0
                  ? formatCurrency(pricing.delivery_fee)
                  : "$0.00"}
              </span>
            </div>

            {/* Subtotal divider */}
            <div className="border-t border-gray-200 pt-2.5 flex justify-between text-sm">
              <span className="text-gray-700 font-medium">Subtotal</span>
              <span className="font-mono font-semibold text-gray-900">
                {formatCurrency(pricing.subtotal + pricing.rush_fee + pricing.delivery_fee)}
              </span>
            </div>

            {/* Tax */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {pricing.tax_name} ({(pricing.tax_rate * 100).toFixed(pricing.tax_rate * 100 % 1 === 0 ? 0 : 2)}%
                {billingAddress.province ? ` — ${getProvinceName(billingAddress.province)}` : ""})
              </span>
              <span className="font-mono font-medium text-gray-900">
                {formatCurrency(pricing.tax_amount)}
              </span>
            </div>

            {/* Total */}
            <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-2xl font-bold font-mono text-gray-900">
                {formatCurrency(pricing.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── NAVIGATION ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <StartOverLink />
        <div className="flex items-center gap-3">
          <button
            onClick={goToPreviousStep}
            disabled={saving}
            className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          <button
            onClick={handleContinue}
            disabled={saving}
            className="px-6 py-2.5 bg-cethos-teal text-white rounded-lg hover:opacity-90 font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Proceed to Payment
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
