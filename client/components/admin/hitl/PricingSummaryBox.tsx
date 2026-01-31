import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  RefreshCw,
  Plus,
  X,
  ChevronDown,
  DollarSign,
  AlertCircle,
  CreditCard,
  Clock,
  Truck,
  Globe,
  Mail,
  Check,
  Package,
  Edit2,
} from "lucide-react";

// Types
interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface TaxRate {
  id: string;
  region_code: string;
  region_name: string;
  tax_name: string;
  rate: number;
}

interface QuoteCertification {
  id: string;
  certification_type_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface QuoteAdjustment {
  id: string;
  adjustment_type: "discount" | "surcharge";
  value_type: "fixed" | "percentage";
  value: number;
  calculated_amount: number;
  reason: string;
}

interface TurnaroundOption {
  id: string;
  code: string;
  name: string;
  description: string;
  multiplier: number;
  is_rush: boolean;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  estimated_days: number | null;
  requires_address: boolean;
  is_always_selected: boolean;
  category: string;
  delivery_type: string;
  is_physical: boolean;
}

interface TurnaroundSettings {
  rushMultiplier: number;
  sameDayMultiplier: number;
  standardDays: number;
  rushDays: number;
}

interface PricingData {
  subtotal: number;
  certifications: QuoteCertification[];
  adjustments: QuoteAdjustment[];
  taxRateId: string | null;
  taxRate: number;
  taxAmount: number;
  total: number;
  rushFee: number;
  deliveryFee: number;
  turnaroundType: string;
  turnaroundDays: number;
  isRush: boolean;
  rushFeeType: "auto" | "percentage" | "fixed";
  rushFeeCustomValue: number | null;
  selectedDeliveryOptions: string[];
  physicalDeliveryOptionId: string | null;
  documentCount: number;
}

interface Props {
  quoteId: string;
  staffId?: string;
  onPricingChange?: () => void;
  // Action button handlers
  showActions?: boolean;
  isSubmitting?: boolean;
  onManualPayment?: () => void;
  hasShippingAddress?: boolean;
  onAddAddress?: () => void;
  // Quote status for conditional rendering
  quoteStatus?: string;
}

export default function PricingSummaryBox({
  quoteId,
  staffId,
  onPricingChange,
  showActions = false,
  isSubmitting = false,
  onManualPayment,
  hasShippingAddress = false,
  onAddAddress,
  quoteStatus,
}: Props) {
  // State
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [turnaroundOptions, setTurnaroundOptions] = useState<TurnaroundOption[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [turnaroundSettings, setTurnaroundSettings] = useState<TurnaroundSettings>({
    rushMultiplier: 0.30,
    sameDayMultiplier: 2.00,
    standardDays: 2,
    rushDays: 1,
  });
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dropdown states
  const [showCertDropdown, setShowCertDropdown] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  // Turnaround and Delivery state
  const [selectedTurnaround, setSelectedTurnaround] = useState<string>("standard");
  const [emailDeliveryEnabled, setEmailDeliveryEnabled] = useState(false);
  const [selectedPhysicalDelivery, setSelectedPhysicalDelivery] = useState<string>("");

  // Rush fee override state
  const [rushOverrideEnabled, setRushOverrideEnabled] = useState(false);
  const [rushOverrideType, setRushOverrideType] = useState<"percentage" | "fixed">("percentage");
  const [rushOverrideValue, setRushOverrideValue] = useState<string>("");

  // Adjustment form state
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: "discount" as "discount" | "surcharge",
    valueType: "fixed" as "fixed" | "percentage",
    value: "",
    reason: "",
  });

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData();
  }, [quoteId]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch quote pricing data including turnaround and delivery info
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          subtotal,
          certification_total,
          rush_fee,
          delivery_fee,
          tax_rate_id,
          tax_rate,
          tax_amount,
          total,
          calculated_totals,
          turnaround_type,
          turnaround_days,
          is_rush,
          rush_fee_type,
          rush_fee_custom_value,
          digital_delivery_options,
          physical_delivery_option_id
        `
        )
        .eq("id", quoteId)
        .single();

      if (quoteError) throw quoteError;

      // Fetch document count for certifications display
      const { count: docCount, error: docCountError } = await supabase
        .from("quote_files")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", quoteId);

      if (docCountError) {
        console.warn("Error fetching document count:", docCountError);
      }

      // Fetch turnaround settings from app_settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "rush_multiplier",
          "same_day_multiplier",
          "turnaround_base_days",
          "rush_turnaround_days"
        ]);

      if (settingsError) {
        console.warn("Error fetching turnaround settings:", settingsError);
      } else if (settingsData) {
        const newSettings: TurnaroundSettings = {
          rushMultiplier: 0.30,
          sameDayMultiplier: 2.00,
          standardDays: 2,
          rushDays: 1,
        };
        settingsData.forEach((s) => {
          if (s.setting_key === "rush_multiplier") {
            newSettings.rushMultiplier = parseFloat(s.setting_value) || 0.30;
          } else if (s.setting_key === "same_day_multiplier") {
            newSettings.sameDayMultiplier = parseFloat(s.setting_value) || 2.00;
          } else if (s.setting_key === "turnaround_base_days") {
            newSettings.standardDays = parseInt(s.setting_value) || 2;
          } else if (s.setting_key === "rush_turnaround_days") {
            newSettings.rushDays = parseInt(s.setting_value) || 1;
          }
        });
        setTurnaroundSettings(newSettings);
      }

      // Fetch quote certifications
      const { data: certsData, error: certsError } = await supabase
        .from("quote_certifications")
        .select(
          `
          id,
          certification_type_id,
          price,
          quantity,
          certification_types (name)
        `
        )
        .eq("quote_id", quoteId);

      if (certsError && certsError.code !== "PGRST116") {
        // PGRST116 = table doesn't exist yet, which is fine
        console.warn("Error fetching quote certifications:", certsError);
      }

      // Fetch adjustments
      const { data: adjData, error: adjError } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", quoteId);

      if (adjError && adjError.code !== "PGRST116") {
        console.warn("Error fetching adjustments:", adjError);
      }

      // Fetch certification types for dropdown
      const { data: certTypes, error: certTypesError } = await supabase
        .from("certification_types")
        .select("id, code, name, price")
        .eq("is_active", true)
        .order("sort_order");

      if (certTypesError) throw certTypesError;

      // Fetch tax rates for dropdown
      const { data: taxes, error: taxError } = await supabase
        .from("tax_rates")
        .select("id, region_code, region_name, tax_name, rate")
        .eq("is_active", true)
        .order("region_name");

      if (taxError) throw taxError;

      // Fetch turnaround options
      const { data: turnaroundData, error: turnaroundError } = await supabase
        .from("delivery_options")
        .select("id, code, name, description, multiplier, is_rush")
        .eq("category", "turnaround")
        .eq("is_active", true)
        .order("sort_order");

      if (turnaroundError) {
        console.warn("Error fetching turnaround options:", turnaroundError);
      }

      // Fetch delivery options (both digital and physical)
      const { data: deliveryData, error: deliveryError } = await supabase
        .from("delivery_options")
        .select("id, code, name, description, price, estimated_days, requires_address, is_always_selected, category, delivery_type, is_physical")
        .eq("is_active", true)
        .order("sort_order");

      if (deliveryError) {
        console.warn("Error fetching delivery options:", deliveryError);
      }

      // Set state
      setCertificationTypes(certTypes || []);
      setTaxRates(taxes || []);
      setTurnaroundOptions(turnaroundData || []);
      setDeliveryOptions(deliveryData || []);

      // Set selected values from quote data
      setSelectedTurnaround(quoteData?.turnaround_type || "standard");

      // Set rush override state from quote data
      const rushFeeType = quoteData?.rush_fee_type || "auto";
      setRushOverrideEnabled(rushFeeType !== "auto");
      if (rushFeeType === "percentage") {
        setRushOverrideType("percentage");
        setRushOverrideValue(String(quoteData?.rush_fee_custom_value || ""));
      } else if (rushFeeType === "fixed") {
        setRushOverrideType("fixed");
        setRushOverrideValue(String(quoteData?.rush_fee_custom_value || ""));
      } else {
        // Auto - set default based on turnaround type
        setRushOverrideType("percentage");
        setRushOverrideValue("");
      }

      // Check if email delivery is enabled in digital_delivery_options
      const digitalOptions = quoteData?.digital_delivery_options || [];
      const emailOption = deliveryData?.find((d: DeliveryOption) => d.code === "email");
      if (emailOption && digitalOptions.includes(emailOption.id)) {
        setEmailDeliveryEnabled(true);
      } else {
        setEmailDeliveryEnabled(false);
      }

      setSelectedPhysicalDelivery(quoteData?.physical_delivery_option_id || "");

      setPricing({
        subtotal:
          quoteData?.subtotal || quoteData?.calculated_totals?.subtotal || 0,
        certifications: (certsData || []).map((c: any) => ({
          id: c.id,
          certification_type_id: c.certification_type_id,
          name: c.certification_types?.name || "Unknown",
          price: c.price,
          quantity: c.quantity,
        })),
        adjustments: adjData || [],
        taxRateId: quoteData?.tax_rate_id,
        taxRate: quoteData?.tax_rate || 0.05,
        taxAmount:
          quoteData?.tax_amount ||
          quoteData?.calculated_totals?.tax_amount ||
          0,
        total: quoteData?.total || quoteData?.calculated_totals?.total || 0,
        rushFee:
          quoteData?.rush_fee || quoteData?.calculated_totals?.rush_fee || 0,
        deliveryFee: quoteData?.delivery_fee || 0,
        turnaroundType: quoteData?.turnaround_type || "standard",
        turnaroundDays: quoteData?.turnaround_days || 2,
        isRush: quoteData?.is_rush || false,
        rushFeeType: quoteData?.rush_fee_type || "auto",
        rushFeeCustomValue: quoteData?.rush_fee_custom_value || null,
        selectedDeliveryOptions: quoteData?.digital_delivery_options || [],
        physicalDeliveryOptionId: quoteData?.physical_delivery_option_id || null,
        documentCount: docCount || 0,
      });
    } catch (err: any) {
      console.error("Error fetching pricing data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add certification (quote-level - applies to all docs)
  const handleAddCertification = async (certTypeId: string) => {
    const certType = certificationTypes.find((c) => c.id === certTypeId);
    if (!certType) return;

    const docCount = pricing?.documentCount || 1;
    const totalCost = certType.price * docCount;

    // Confirm with user
    const confirmed = window.confirm(
      `Apply "${certType.name}" to entire quote?\n\n` +
      `Cost: ${formatCurrency(certType.price)} × ${docCount} document${docCount !== 1 ? "s" : ""} = ${formatCurrency(totalCost)}`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.from("quote_certifications").insert({
        quote_id: quoteId,
        certification_type_id: certTypeId,
        price: certType.price,
        quantity: docCount,
        added_by: staffId || null,
      });

      if (error) throw error;

      setShowCertDropdown(false);
      toast.success(`${certType.name} applied to ${docCount} document${docCount !== 1 ? "s" : ""}`);
      await handleRecalculate();
    } catch (err: any) {
      console.error("Error adding certification:", err);
      setError(err.message);
    }
  };

  // Remove certification
  const handleRemoveCertification = async (certId: string) => {
    try {
      const { error } = await supabase
        .from("quote_certifications")
        .delete()
        .eq("id", certId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error removing certification:", err);
      setError(err.message);
    }
  };

  // Add adjustment
  const handleAddAdjustment = async () => {
    if (!adjustmentForm.value || parseFloat(adjustmentForm.value) <= 0) {
      setError("Please enter a valid value");
      return;
    }

    try {
      const { error } = await supabase.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: adjustmentForm.type,
        value_type: adjustmentForm.valueType,
        value: parseFloat(adjustmentForm.value),
        reason: adjustmentForm.reason || null,
        added_by: staffId || null,
      });

      if (error) throw error;

      setShowAdjustmentModal(false);
      setAdjustmentForm({
        type: "discount",
        valueType: "fixed",
        value: "",
        reason: "",
      });
      await handleRecalculate();
    } catch (err: any) {
      console.error("Error adding adjustment:", err);
      setError(err.message);
    }
  };

  // Remove adjustment
  const handleRemoveAdjustment = async (adjId: string) => {
    try {
      const { error } = await supabase
        .from("quote_adjustments")
        .delete()
        .eq("id", adjId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error removing adjustment:", err);
      setError(err.message);
    }
  };

  // Change tax rate
  const handleTaxRateChange = async (taxRateId: string) => {
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ tax_rate_id: taxRateId })
        .eq("id", quoteId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error updating tax rate:", err);
      setError(err.message);
    }
  };

  // Recalculate totals
  const handleRecalculate = async () => {
    setRecalculating(true);
    setError(null);

    try {
      const { error } = await supabase.rpc("recalculate_quote_totals", {
        p_quote_id: quoteId,
      });

      if (error) throw error;

      await fetchAllData();
      onPricingChange?.();
    } catch (err: any) {
      console.error("Error recalculating:", err);
      setError(err.message);
    } finally {
      setRecalculating(false);
    }
  };

  // Handle turnaround change
  const handleTurnaroundChange = async (turnaroundCode: string) => {
    try {
      setSelectedTurnaround(turnaroundCode);

      const isRush = turnaroundCode !== "standard";
      const days = turnaroundCode === "standard"
        ? turnaroundSettings.standardDays
        : turnaroundCode === "rush"
          ? turnaroundSettings.rushDays
          : 0; // same_day

      // Calculate rush fee based on subtotal and turnaround type
      const subtotal = pricing?.subtotal || 0;
      let newRushFee = 0;
      if (turnaroundCode === "rush") {
        newRushFee = subtotal * turnaroundSettings.rushMultiplier;
      } else if (turnaroundCode === "same_day") {
        newRushFee = subtotal * (turnaroundSettings.sameDayMultiplier - 1);
      }

      const { error } = await supabase
        .from("quotes")
        .update({
          turnaround_type: turnaroundCode,
          turnaround_days: days,
          is_rush: isRush,
          rush_fee: newRushFee,
          rush_fee_type: "auto",  // Reset to auto when changing turnaround
          rush_fee_custom_value: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", quoteId);

      if (error) throw error;

      // Reset override state
      setRushOverrideEnabled(false);
      setRushOverrideValue("");

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error updating turnaround:", err);
      setError(err.message);
      // Revert optimistic update
      setSelectedTurnaround(pricing?.turnaroundType || "standard");
    }
  };

  // Handle rush fee override toggle
  const handleRushOverrideToggle = async (enabled: boolean) => {
    if (!enabled) {
      // Reset to auto
      try {
        const subtotal = pricing?.subtotal || 0;
        let newRushFee = 0;
        if (selectedTurnaround === "rush") {
          newRushFee = subtotal * turnaroundSettings.rushMultiplier;
        } else if (selectedTurnaround === "same_day") {
          newRushFee = subtotal * (turnaroundSettings.sameDayMultiplier - 1);
        }

        const { error } = await supabase
          .from("quotes")
          .update({
            rush_fee_type: "auto",
            rush_fee_custom_value: null,
            rush_fee: newRushFee,
            updated_at: new Date().toISOString()
          })
          .eq("id", quoteId);

        if (error) throw error;

        setRushOverrideEnabled(false);
        setRushOverrideValue("");
        await handleRecalculate();
      } catch (err: any) {
        console.error("Error resetting rush override:", err);
        setError(err.message);
      }
    } else {
      // Just enable the override UI
      setRushOverrideEnabled(true);
      // Set default value based on current turnaround
      if (selectedTurnaround === "rush") {
        setRushOverrideValue(String(turnaroundSettings.rushMultiplier * 100));
      } else if (selectedTurnaround === "same_day") {
        setRushOverrideValue(String((turnaroundSettings.sameDayMultiplier - 1) * 100));
      }
    }
  };

  // Apply rush fee override
  const handleApplyRushOverride = async () => {
    const value = parseFloat(rushOverrideValue);
    if (isNaN(value) || value < 0) {
      toast.error("Please enter a valid value");
      return;
    }

    try {
      const subtotal = pricing?.subtotal || 0;
      let newRushFee = 0;

      if (rushOverrideType === "percentage") {
        newRushFee = subtotal * (value / 100);
      } else {
        newRushFee = value;
      }

      const { error } = await supabase
        .from("quotes")
        .update({
          rush_fee_type: rushOverrideType,
          rush_fee_custom_value: value,
          rush_fee: newRushFee,
          updated_at: new Date().toISOString()
        })
        .eq("id", quoteId);

      if (error) throw error;

      toast.success("Rush fee override applied");
      await handleRecalculate();
    } catch (err: any) {
      console.error("Error applying rush override:", err);
      setError(err.message);
    }
  };

  // Handle email delivery toggle
  const handleEmailDeliveryToggle = async (enabled: boolean) => {
    try {
      setEmailDeliveryEnabled(enabled);

      const emailOption = deliveryOptions.find(d => d.code === "email");
      if (!emailOption) return;

      let newDigitalOptions = pricing?.selectedDeliveryOptions || [];

      if (enabled) {
        // Add email option if not already present
        if (!newDigitalOptions.includes(emailOption.id)) {
          newDigitalOptions = [...newDigitalOptions, emailOption.id];
        }
      } else {
        // Remove email option
        newDigitalOptions = newDigitalOptions.filter(id => id !== emailOption.id);
      }

      const { error } = await supabase
        .from("quotes")
        .update({ digital_delivery_options: newDigitalOptions })
        .eq("id", quoteId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error updating email delivery:", err);
      setError(err.message);
      // Revert optimistic update
      setEmailDeliveryEnabled(!enabled);
    }
  };

  // Handle physical delivery change
  const handlePhysicalDeliveryChange = async (optionId: string) => {
    const selectedOption = deliveryOptions.find(d => d.id === optionId);

    try {
      // Always update state first - don't block selection
      setSelectedPhysicalDelivery(optionId);

      // Show warning if address is required but not available (don't block selection)
      if (selectedOption?.requires_address && !hasShippingAddress) {
        toast.warning(
          "This delivery method requires a shipping address. Please add one in the Addresses section.",
          { duration: 5000 }
        );
      }

      // Calculate delivery fee
      const deliveryFee = selectedOption?.price || 0;

      const { error } = await supabase
        .from("quotes")
        .update({
          physical_delivery_option_id: optionId || null,
          delivery_fee: deliveryFee
        })
        .eq("id", quoteId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error updating physical delivery:", err);
      setError(err.message);
      // Revert optimistic update
      setSelectedPhysicalDelivery(pricing?.physicalDeliveryOptionId || "");
    }
  };

  // Calculate rush fee for display based on turnaround type and override settings
  const calculateRushFeeForType = (turnaroundType: string) => {
    const subtotal = pricing?.subtotal || 0;
    if (turnaroundType === "standard") return 0;
    if (turnaroundType === "rush") {
      return subtotal * turnaroundSettings.rushMultiplier;
    }
    if (turnaroundType === "same_day") {
      return subtotal * (turnaroundSettings.sameDayMultiplier - 1);
    }
    return 0;
  };

  // Calculate current rush fee (with override if applicable)
  const calculateRushFee = () => {
    if (selectedTurnaround === "standard") return 0;

    // If override is enabled and applied
    if (rushOverrideEnabled && pricing?.rushFeeType !== "auto") {
      const value = pricing?.rushFeeCustomValue || 0;
      if (pricing?.rushFeeType === "percentage") {
        return (pricing?.subtotal || 0) * (value / 100);
      } else {
        return value;
      }
    }

    // Auto calculation
    return calculateRushFeeForType(selectedTurnaround);
  };

  // Calculate delivery fee for display
  const calculateDeliveryFee = () => {
    let total = 0;

    // Email delivery fee
    if (emailDeliveryEnabled) {
      const emailOption = deliveryOptions.find(d => d.code === "email");
      total += emailOption?.price || 0;
    }

    // Physical delivery fee
    if (selectedPhysicalDelivery) {
      const physicalOption = deliveryOptions.find(d => d.id === selectedPhysicalDelivery);
      total += physicalOption?.price || 0;
    }

    return total;
  };

  // Get physical delivery options (using is_physical flag from database)
  const physicalDeliveryOptions = deliveryOptions.filter(d => d.is_physical === true);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);
  };

  // Format percentage
  const formatPercent = (rate: number) => {
    return `${(rate * 100).toFixed(rate % 0.01 === 0 ? 0 : 2)}%`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" />
          Pricing Summary
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Subtotal */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Subtotal:</span>
          <span className="font-medium">
            {formatCurrency(pricing?.subtotal || 0)}
          </span>
        </div>

        <hr className="border-gray-200" />

        {/* Certifications Section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Quote Certifications
          </p>

          {/* Certification List */}
          {pricing?.certifications && pricing.certifications.length > 0 ? (
            <div className="space-y-2 mb-2">
              {pricing.certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="flex items-center justify-between bg-blue-50 rounded-md px-3 py-2 border border-blue-100"
                >
                  <div>
                    <span className="text-sm text-gray-700">{cert.name}</span>
                    {cert.quantity > 1 && (
                      <span className="ml-1 text-xs text-gray-500">
                        × {cert.quantity} docs
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-blue-700">
                      +{formatCurrency(cert.price * cert.quantity)}
                    </span>
                    <button
                      onClick={() => handleRemoveCertification(cert.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove certification"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mb-2">
              No quote certifications added
            </p>
          )}

          {/* Add Certification Dropdown - Show with document count */}
          <div className="relative">
            <button
              onClick={() => setShowCertDropdown(!showCertDropdown)}
              className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Certification
              {pricing?.documentCount ? (
                <span className="text-gray-400 text-xs ml-1">
                  (for {pricing.documentCount} doc{pricing.documentCount !== 1 ? "s" : ""})
                </span>
              ) : null}
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showCertDropdown ? "rotate-180" : ""}`}
              />
            </button>

            {showCertDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {certificationTypes.map((type) => {
                  const docCount = pricing?.documentCount || 1;
                  const totalPrice = type.price * docCount;
                  return (
                    <button
                      key={type.id}
                      onClick={() => handleAddCertification(type.id)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <div className="flex justify-between">
                        <span>{type.name}</span>
                        <span className="text-teal-600 font-medium">
                          {formatCurrency(totalPrice)}
                        </span>
                      </div>
                      {docCount > 1 && (
                        <div className="text-xs text-gray-400">
                          {formatCurrency(type.price)} × {docCount} docs
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Adjustments Section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Adjustments
          </p>

          {/* Adjustments List */}
          {pricing?.adjustments && pricing.adjustments.length > 0 ? (
            <div className="space-y-2 mb-2">
              {pricing.adjustments.map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2"
                >
                  <div>
                    <span className="text-sm text-gray-700 capitalize">
                      {adj.adjustment_type}
                    </span>
                    {adj.reason && (
                      <p className="text-xs text-gray-500">{adj.reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        adj.adjustment_type === "discount"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {adj.adjustment_type === "discount" ? "-" : "+"}
                      {adj.value_type === "percentage"
                        ? `${adj.value}%`
                        : formatCurrency(adj.value)}
                    </span>
                    <button
                      onClick={() => handleRemoveAdjustment(adj.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove adjustment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mb-2">No adjustments</p>
          )}

          {/* Add Adjustment Button */}
          <button
            onClick={() => setShowAdjustmentModal(true)}
            className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Discount / Surcharge
          </button>
        </div>

        <hr className="border-gray-200" />

        {/* TURNAROUND Section - Radio Buttons */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Turnaround
          </p>

          <div className="space-y-2">
            {/* Standard Option */}
            <label className="flex items-center justify-between cursor-pointer p-2 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="turnaround"
                  checked={selectedTurnaround === "standard"}
                  onChange={() => handleTurnaroundChange("standard")}
                  className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">
                  Standard ({turnaroundSettings.standardDays} {turnaroundSettings.standardDays === 1 ? "day" : "days"})
                </span>
              </div>
              <span className="text-sm text-gray-500">+$0.00</span>
            </label>

            {/* Rush Option */}
            <label className="flex items-center justify-between cursor-pointer p-2 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="turnaround"
                  checked={selectedTurnaround === "rush"}
                  onChange={() => handleTurnaroundChange("rush")}
                  className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">
                  Rush ({turnaroundSettings.rushDays} {turnaroundSettings.rushDays === 1 ? "day" : "days"}, +{(turnaroundSettings.rushMultiplier * 100).toFixed(0)}%)
                </span>
              </div>
              <span className="text-sm text-orange-600 font-medium">
                +{formatCurrency(calculateRushFeeForType("rush"))}
              </span>
            </label>

            {/* Same Day Option */}
            <label className="flex items-center justify-between cursor-pointer p-2 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="turnaround"
                  checked={selectedTurnaround === "same_day"}
                  onChange={() => handleTurnaroundChange("same_day")}
                  className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">
                  Same Day (+{((turnaroundSettings.sameDayMultiplier - 1) * 100).toFixed(0)}%)
                </span>
              </div>
              <span className="text-sm text-orange-600 font-medium">
                +{formatCurrency(calculateRushFeeForType("same_day"))}
              </span>
            </label>
          </div>

          {/* Rush Fee Override - Only show when rush or same_day is selected */}
          {selectedTurnaround !== "standard" && (
            <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rushOverrideEnabled}
                  onChange={(e) => handleRushOverrideToggle(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Edit2 className="w-3 h-3" />
                  Override rush fee
                </span>
              </label>

              {rushOverrideEnabled && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={rushOverrideType === "percentage"}
                        onChange={() => setRushOverrideType("percentage")}
                        className="w-3.5 h-3.5 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-600">Percentage</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={rushOverrideType === "fixed"}
                        onChange={() => setRushOverrideType("fixed")}
                        className="w-3.5 h-3.5 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-600">Fixed $</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    {rushOverrideType === "fixed" && (
                      <span className="text-sm text-gray-500">$</span>
                    )}
                    <input
                      type="number"
                      value={rushOverrideValue}
                      onChange={(e) => setRushOverrideValue(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      min="0"
                      step={rushOverrideType === "percentage" ? "1" : "0.01"}
                      placeholder={rushOverrideType === "percentage" ? "30" : "50.00"}
                    />
                    {rushOverrideType === "percentage" && (
                      <span className="text-sm text-gray-500">%</span>
                    )}
                    <button
                      onClick={handleApplyRushOverride}
                      className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 transition-colors"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Preview calculated fee */}
                  {rushOverrideValue && (
                    <div className="text-xs text-gray-500">
                      Preview: {rushOverrideType === "percentage"
                        ? `${rushOverrideValue}% = ${formatCurrency((pricing?.subtotal || 0) * (parseFloat(rushOverrideValue) / 100))}`
                        : formatCurrency(parseFloat(rushOverrideValue) || 0)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Current Rush Fee Display */}
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
            <span className="text-gray-600 text-sm">Rush Fee:</span>
            <span className={`font-medium text-sm ${calculateRushFee() > 0 ? "text-orange-600" : "text-gray-500"}`}>
              {calculateRushFee() > 0 ? `+${formatCurrency(calculateRushFee())}` : formatCurrency(0)}
              {rushOverrideEnabled && pricing?.rushFeeType !== "auto" && (
                <span className="ml-1 text-xs text-gray-400">(custom)</span>
              )}
            </span>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* DELIVERY OPTIONS Section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Truck className="w-3 h-3" />
            Delivery Options
          </p>

          <div className="space-y-3">
            {/* Online Portal - Always on */}
            <div className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-md border border-green-200">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-700">Online Portal</span>
                </div>
              </div>
              <span className="text-sm text-gray-500">included</span>
            </div>

            {/* Email Delivery - Toggle */}
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md border border-gray-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEmailDeliveryToggle(!emailDeliveryEnabled)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    emailDeliveryEnabled
                      ? "bg-teal-500 border-teal-500"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {emailDeliveryEnabled && <Check className="w-3 h-3 text-white" />}
                </button>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">Email Delivery</span>
                </div>
              </div>
              <span className="text-sm text-gray-500">
                {formatCurrency(deliveryOptions.find(d => d.code === "email")?.price || 0)}
              </span>
            </div>

            {/* Physical Delivery - Dropdown */}
            <div className="py-2 px-3 bg-gray-50 rounded-md border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">Physical:</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <select
                  value={selectedPhysicalDelivery}
                  onChange={(e) => handlePhysicalDeliveryChange(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">None - Digital Only</option>
                  {physicalDeliveryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} {option.estimated_days ? `(${option.estimated_days} days)` : ""}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-500 w-20 text-right">
                  {formatCurrency(
                    deliveryOptions.find(d => d.id === selectedPhysicalDelivery)?.price || 0
                  )}
                </span>
              </div>
              {selectedPhysicalDelivery &&
                deliveryOptions.find(d => d.id === selectedPhysicalDelivery)?.requires_address &&
                !hasShippingAddress && (
                  <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200 text-sm text-amber-700">
                    Physical delivery requires a shipping address.{" "}
                    {onAddAddress && (
                      <button
                        onClick={onAddAddress}
                        className="text-amber-800 underline hover:text-amber-900"
                      >
                        Add Address
                      </button>
                    )}
                  </div>
                )}
            </div>

            {/* Delivery Fee Total */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-600 text-sm">Delivery Fee:</span>
              <span className="font-medium text-sm">
                {formatCurrency(calculateDeliveryFee())}
              </span>
            </div>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Tax Section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Tax
          </p>

          {/* Tax Rate Dropdown */}
          <select
            value={pricing?.taxRateId || ""}
            onChange={(e) => handleTaxRateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">Select Tax Rate...</option>
            {taxRates.map((tax) => (
              <option key={tax.id} value={tax.id}>
                {tax.region_name} ({tax.tax_name} {formatPercent(tax.rate)})
              </option>
            ))}
          </select>

          <div className="flex justify-between items-center mt-2">
            <span className="text-gray-600">Tax Amount:</span>
            <span className="font-medium">
              {formatCurrency(pricing?.taxAmount || 0)}
            </span>
          </div>
        </div>

        <hr className="border-gray-300" />

        {/* Total */}
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-900">TOTAL:</span>
          <span className="text-xl font-bold text-green-600">
            {formatCurrency(pricing?.total || 0)}
          </span>
        </div>

        {/* Recalculate Button */}
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${recalculating ? "animate-spin" : ""}`}
          />
          {recalculating ? "Recalculating..." : "Recalculate Totals"}
        </button>

        {/* Action Buttons - Manual Payment (only for approved or awaiting_payment) */}
        {showActions && ['approved', 'awaiting_payment'].includes(quoteStatus || '') && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={onManualPayment}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-4 h-4" />
              Manual Payment
            </button>
          </div>
        )}
      </div>

      {/* Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Adjustment</h3>

            {/* Type Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, type: "discount" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.type === "discount"
                    ? "bg-green-100 text-green-700 border-2 border-green-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Discount
              </button>
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, type: "surcharge" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.type === "surcharge"
                    ? "bg-red-100 text-red-700 border-2 border-red-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Surcharge
              </button>
            </div>

            {/* Value Type Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, valueType: "fixed" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.valueType === "fixed"
                    ? "bg-blue-100 text-blue-700 border-2 border-blue-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Fixed ($)
              </button>
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, valueType: "percentage" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.valueType === "percentage"
                    ? "bg-blue-100 text-blue-700 border-2 border-blue-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Percentage (%)
              </button>
            </div>

            {/* Value Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value {adjustmentForm.valueType === "fixed" ? "($)" : "(%)"}
              </label>
              <input
                type="number"
                step={adjustmentForm.valueType === "fixed" ? "0.01" : "1"}
                min="0"
                value={adjustmentForm.value}
                onChange={(e) =>
                  setAdjustmentForm((f) => ({ ...f, value: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder={
                  adjustmentForm.valueType === "fixed" ? "25.00" : "10"
                }
              />
            </div>

            {/* Reason Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={adjustmentForm.reason}
                onChange={(e) =>
                  setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="e.g., Loyalty discount, Rush fee"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAdjustmentModal(false);
                  setAdjustmentForm({
                    type: "discount",
                    valueType: "fixed",
                    value: "",
                    reason: "",
                  });
                }}
                className="flex-1 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAdjustment}
                className="flex-1 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
              >
                Add {adjustmentForm.type === "discount" ? "Discount" : "Surcharge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
