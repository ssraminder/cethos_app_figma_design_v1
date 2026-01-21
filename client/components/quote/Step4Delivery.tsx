import { useState, useEffect } from "react";
import { useQuote, ShippingAddress } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  delivery_group: "digital" | "physical";
  delivery_type: string;
  is_default_selected: boolean;
  requires_address: boolean;
  sort_order: number;
}

interface PickupLocation {
  id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  hours: string | null;
}

interface PricingSummary {
  translation_total: number;
  certification_total: number;
  subtotal: number;
  rush_fee: number;
  delivery_fee: number;
  tax_amount: number;
  tax_rate: number;
  total: number;
}

export default function Step4Delivery() {
  const { state, updateState, goToNextStep, goToPreviousStep } = useQuote();

  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [sameDayEligible, setSameDayEligible] = useState(false);
  const [rushAvailable, setRushAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Settings
  const [rushMultiplier, setRushMultiplier] = useState(1.3);
  const [sameDayMultiplier, setSameDayMultiplier] = useState(2.0);
  const [rushCutoffHour, setRushCutoffHour] = useState(16);
  const [rushCutoffMinute, setRushCutoffMinute] = useState(30);
  const [sameDayCutoffHour, setSameDayCutoffHour] = useState(14);
  const [sameDayCutoffMinute, setSameDayCutoffMinute] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      recalculatePricing();
    }
  }, [
    state.deliverySpeed,
    state.physicalDeliveryOption,
    state.digitalDeliveryOptions,
    loading,
  ]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch delivery options
      const { data: deliveryData, error: deliveryError } = await supabase
        .from("delivery_options")
        .select("*")
        .eq("is_active", true)
        .order("delivery_group", { ascending: false })
        .order("sort_order");

      if (deliveryError) throw deliveryError;
      setDeliveryOptions(deliveryData || []);

      // Fetch pickup locations
      const { data: pickupData, error: pickupError } = await supabase
        .from("pickup_locations")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (pickupError) throw pickupError;
      setPickupLocations(pickupData || []);

      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "rush_multiplier",
          "rush_cutoff_hour",
          "rush_cutoff_minute",
          "same_day_multiplier",
          "same_day_cutoff_hour",
          "same_day_cutoff_minute",
        ]);

      if (settingsError) throw settingsError;

      const settings = settingsData.reduce(
        (acc: any, s) => {
          acc[s.setting_key] = parseFloat(s.setting_value);
          return acc;
        },
        {} as Record<string, number>,
      );

      setRushMultiplier(settings.rush_multiplier || 1.3);
      setSameDayMultiplier(settings.same_day_multiplier || 2.0);
      setRushCutoffHour(settings.rush_cutoff_hour || 16);
      setRushCutoffMinute(settings.rush_cutoff_minute || 30);
      setSameDayCutoffHour(settings.same_day_cutoff_hour || 14);
      setSameDayCutoffMinute(settings.same_day_cutoff_minute || 0);

      // Check eligibility
      await checkSameDayEligibility();
      checkRushAvailability();

      // Fetch current pricing
      await fetchCurrentPricing();
    } catch (err) {
      console.error("Error fetching delivery data:", err);
      toast.error("Failed to load delivery options");
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentPricing = async () => {
    try {
      const { data: quote, error } = await supabase
        .from("quotes")
        .select("calculated_totals")
        .eq("id", state.quoteId)
        .single();

      if (error) throw error;
      if (quote?.calculated_totals) {
        setPricing(quote.calculated_totals as PricingSummary);
      }
    } catch (err) {
      console.error("Error fetching pricing:", err);
    }
  };

  const checkSameDayEligibility = async () => {
    try {
      // Check current time vs cutoff
      const now = new Date();
      const mstTime = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Edmonton" }),
      );

      if (
        mstTime.getHours() > sameDayCutoffHour ||
        (mstTime.getHours() === sameDayCutoffHour &&
          mstTime.getMinutes() >= sameDayCutoffMinute)
      ) {
        setSameDayEligible(false);
        return;
      }

      // Check if weekday
      const dayOfWeek = mstTime.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        setSameDayEligible(false);
        return;
      }

      // Check if holiday
      const dateStr = mstTime.toISOString().split("T")[0];
      const { data: holiday } = await supabase
        .from("holidays")
        .select("id")
        .eq("holiday_date", dateStr)
        .eq("is_active", true)
        .single();

      if (holiday) {
        setSameDayEligible(false);
        return;
      }

      // Check eligibility matrix - need to get language codes and document type
      const { data: quote } = await supabase
        .from("quotes")
        .select(
          `
          source_language:languages!quotes_source_language_id_fkey(code),
          target_language:languages!quotes_target_language_id_fkey(code),
          ai_analysis_results(assessed_document_type)
        `,
        )
        .eq("id", state.quoteId)
        .single();

      if (!quote) {
        setSameDayEligible(false);
        return;
      }

      const sourceCode = (quote.source_language as any)?.code;
      const targetCode = (quote.target_language as any)?.code;
      const docType = quote.ai_analysis_results?.[0]?.assessed_document_type;

      // Get intended use code
      const { data: intendedUse } = await supabase
        .from("intended_uses")
        .select("code")
        .eq("id", state.intendedUseId)
        .single();

      if (!sourceCode || !targetCode || !docType || !intendedUse) {
        setSameDayEligible(false);
        return;
      }

      // Check eligibility
      const { data: eligible } = await supabase
        .from("same_day_eligibility")
        .select("id")
        .eq("source_language", sourceCode)
        .eq("target_language", targetCode)
        .eq("document_type", docType)
        .eq("intended_use", intendedUse.code)
        .eq("is_active", true)
        .single();

      setSameDayEligible(!!eligible);
    } catch (err) {
      console.error("Error checking same-day eligibility:", err);
      setSameDayEligible(false);
    }
  };

  const checkRushAvailability = () => {
    const now = new Date();
    const mstTime = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Edmonton" }),
    );

    if (
      mstTime.getHours() < rushCutoffHour ||
      (mstTime.getHours() === rushCutoffHour &&
        mstTime.getMinutes() < rushCutoffMinute)
    ) {
      const dayOfWeek = mstTime.getDay();
      setRushAvailable(dayOfWeek >= 1 && dayOfWeek <= 5);
    } else {
      setRushAvailable(false);
    }
  };

  const recalculatePricing = async () => {
    if (!state.quoteId || !pricing) return;

    try {
      // Calculate delivery fee
      let deliveryFee = 0;
      if (state.physicalDeliveryOption) {
        const option = deliveryOptions.find(
          (o) => o.code === state.physicalDeliveryOption,
        );
        deliveryFee = option?.price || 0;
      }

      // Calculate rush/same-day fee
      const baseSubtotal =
        pricing.translation_total + pricing.certification_total;
      let rushFee = 0;
      if (state.deliverySpeed === "rush") {
        rushFee = baseSubtotal * (rushMultiplier - 1);
      } else if (state.deliverySpeed === "same_day") {
        rushFee = baseSubtotal * (sameDayMultiplier - 1);
      }

      const subtotal = baseSubtotal;
      const taxableAmount = subtotal + rushFee + deliveryFee;
      const taxAmount = taxableAmount * pricing.tax_rate;
      const total = taxableAmount + taxAmount;

      setPricing({
        ...pricing,
        rush_fee: rushFee,
        delivery_fee: deliveryFee,
        tax_amount: taxAmount,
        total,
      });
    } catch (err) {
      console.error("Error recalculating pricing:", err);
    }
  };

  const handleDigitalDeliveryToggle = (code: string) => {
    // Online portal cannot be removed
    if (code === "online_portal") return;

    if (state.digitalDeliveryOptions.includes(code)) {
      updateState({
        digitalDeliveryOptions: state.digitalDeliveryOptions.filter(
          (c) => c !== code,
        ),
      });
    } else {
      updateState({
        digitalDeliveryOptions: [...state.digitalDeliveryOptions, code],
      });
    }
  };

  const handlePhysicalDeliveryChange = (code: string | null) => {
    updateState({
      physicalDeliveryOption: code,
      pickupLocationId: code === "pickup" ? state.pickupLocationId : null,
      shippingAddress:
        code && code !== "pickup" && code !== "none"
          ? state.shippingAddress || {
              firstName: state.firstName || "",
              lastName: state.lastName || "",
              company: state.companyName || "",
              addressLine1: "",
              addressLine2: "",
              city: "",
              state: "",
              postalCode: "",
              country: "Canada",
              phone: state.phone || "",
            }
          : null,
    });
  };

  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    // At least one digital delivery option
    if (state.digitalDeliveryOptions.length === 0) {
      newErrors.push("At least one digital delivery option is required");
    }

    // If physical delivery selected (not null and not "none")
    if (
      state.physicalDeliveryOption &&
      state.physicalDeliveryOption !== "none"
    ) {
      const option = deliveryOptions.find(
        (o) => o.code === state.physicalDeliveryOption,
      );

      // If pickup, need location
      if (option?.delivery_type === "pickup" && !state.pickupLocationId) {
        newErrors.push("Please select a pickup location");
      }

      // If shipping, need address
      if (option?.requires_address && state.shippingAddress) {
        const addr = state.shippingAddress;
        if (!addr.firstName) newErrors.push("First name is required");
        if (!addr.lastName) newErrors.push("Last name is required");
        if (!addr.addressLine1) newErrors.push("Address is required");
        if (!addr.city) newErrors.push("City is required");
        if (!addr.state) newErrors.push("Province/State is required");
        if (!addr.postalCode) newErrors.push("Postal code is required");
        if (!addr.country) newErrors.push("Country is required");
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleContinue = async () => {
    if (!validateForm()) {
      toast.error("Please complete all required fields");
      return;
    }

    setSaving(true);
    try {
      // Save delivery options and updated pricing to database
      const { error } = await supabase
        .from("quotes")
        .update({
          delivery_speed: state.deliverySpeed,
          digital_delivery_options: state.digitalDeliveryOptions,
          physical_delivery_option: state.physicalDeliveryOption,
          pickup_location_id: state.pickupLocationId,
          shipping_address: state.shippingAddress,
          calculated_totals: pricing, // Save updated pricing
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.quoteId);

      if (error) throw error;

      await goToNextStep();
    } catch (err) {
      console.error("Error saving delivery options:", err);
      toast.error("Failed to save delivery options");
    } finally {
      setSaving(false);
    }
  };

  const digitalOptions = deliveryOptions.filter(
    (o) => o.delivery_group === "digital",
  );
  const physicalOptions = deliveryOptions.filter(
    (o) => o.delivery_group === "physical",
  );

  const needsShippingAddress =
    state.physicalDeliveryOption &&
    state.physicalDeliveryOption !== "none" &&
    deliveryOptions.find((o) => o.code === state.physicalDeliveryOption)
      ?.requires_address;

  const isPickup =
    state.physicalDeliveryOption &&
    deliveryOptions.find((o) => o.code === state.physicalDeliveryOption)
      ?.delivery_type === "pickup";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Delivery & Billing Options
        </h2>
        <p className="text-gray-600">
          Choose how and when you'd like to receive your translation
        </p>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Turnaround Time */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 uppercase text-sm">
          Turnaround Time
        </h3>
        <div className="space-y-3">
          {/* Standard */}
          <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:border-blue-300 transition-colors border-gray-200">
            <input
              type="radio"
              name="deliverySpeed"
              value="standard"
              checked={state.deliverySpeed === "standard"}
              onChange={(e) =>
                updateState({ deliverySpeed: e.target.value as any })
              }
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">
                  Standard Delivery
                </span>
                <span className="text-green-600 font-medium">Included</span>
              </div>
              <p className="text-sm text-gray-600">
                2-4 business days based on document length
              </p>
            </div>
          </label>

          {/* Rush */}
          <label
            className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:border-blue-300 transition-colors ${
              !rushAvailable
                ? "opacity-50 cursor-not-allowed"
                : "border-gray-200"
            }`}
          >
            <input
              type="radio"
              name="deliverySpeed"
              value="rush"
              checked={state.deliverySpeed === "rush"}
              onChange={(e) =>
                updateState({ deliverySpeed: e.target.value as any })
              }
              disabled={!rushAvailable}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">
                  Rush Delivery (+{((rushMultiplier - 1) * 100).toFixed(0)}%)
                </span>
                <span className="text-gray-900 font-medium">
                  +$
                  {pricing
                    ? (
                        (pricing.translation_total +
                          pricing.certification_total) *
                        (rushMultiplier - 1)
                      ).toFixed(2)
                    : "0.00"}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                1 day faster • Order by {rushCutoffHour}:
                {rushCutoffMinute.toString().padStart(2, "0")} MST today
              </p>
              {!rushAvailable && (
                <p className="text-xs text-red-600 mt-1">
                  Rush delivery is not available at this time
                </p>
              )}
            </div>
          </label>

          {/* Same-Day */}
          {sameDayEligible && (
            <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:border-blue-300 transition-colors border-gray-200">
              <input
                type="radio"
                name="deliverySpeed"
                value="same_day"
                checked={state.deliverySpeed === "same_day"}
                onChange={(e) =>
                  updateState({ deliverySpeed: e.target.value as any })
                }
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900">
                    Same-Day Delivery (+
                    {((sameDayMultiplier - 1) * 100).toFixed(0)}%)
                  </span>
                  <span className="text-gray-900 font-medium">
                    +$
                    {pricing
                      ? (
                          (pricing.translation_total +
                            pricing.certification_total) *
                          (sameDayMultiplier - 1)
                        ).toFixed(2)
                      : "0.00"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Ready TODAY by 6:00 PM MST • Order by {sameDayCutoffHour}:
                  {sameDayCutoffMinute.toString().padStart(2, "0")} MST •
                  Limited availability
                </p>
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Digital Delivery */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 uppercase text-sm">
          Digital Delivery (select all that apply)
        </h3>
        <div className="space-y-3">
          {digitalOptions.map((option) => (
            <label
              key={option.id}
              className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:border-blue-300 transition-colors ${
                option.code === "online_portal"
                  ? "opacity-75 cursor-not-allowed border-green-200 bg-green-50"
                  : "border-gray-200"
              }`}
            >
              <input
                type="checkbox"
                checked={state.digitalDeliveryOptions.includes(option.code)}
                onChange={() => handleDigitalDeliveryToggle(option.code)}
                disabled={option.code === "online_portal"}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900">
                    {option.name}
                  </span>
                  <span className="text-green-600 font-medium">
                    {option.price === 0
                      ? "FREE"
                      : `$${option.price.toFixed(2)}`}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{option.description}</p>
                {option.code === "online_portal" && (
                  <p className="text-xs text-gray-500 mt-1">
                    (Always included - cannot be removed)
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Physical Delivery */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 uppercase text-sm">
          Physical Delivery (optional - select one)
        </h3>
        <div className="space-y-3">
          {/* None option */}
          <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:border-blue-300 transition-colors border-gray-200">
            <input
              type="radio"
              name="physicalDelivery"
              value="none"
              checked={
                !state.physicalDeliveryOption ||
                state.physicalDeliveryOption === "none"
              }
              onChange={() => handlePhysicalDeliveryChange("none")}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">
                  No physical copy needed
                </span>
                <span className="text-green-600 font-medium">FREE</span>
              </div>
            </div>
          </label>

          {physicalOptions.map((option) => (
            <div key={option.id}>
              <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:border-blue-300 transition-colors border-gray-200">
                <input
                  type="radio"
                  name="physicalDelivery"
                  value={option.code}
                  checked={state.physicalDeliveryOption === option.code}
                  onChange={() => handlePhysicalDeliveryChange(option.code)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">
                      {option.name}
                    </span>
                    <span className="text-gray-900 font-medium">
                      {option.price === 0
                        ? "FREE"
                        : `$${option.price.toFixed(2)}`}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
              </label>

              {/* Pickup Location Dropdown */}
              {isPickup && state.physicalDeliveryOption === option.code && (
                <div className="ml-11 mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select pickup location
                  </label>
                  <select
                    value={state.pickupLocationId || ""}
                    onChange={(e) =>
                      updateState({ pickupLocationId: e.target.value || null })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a location...</option>
                    {pickupLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} - {loc.city}, {loc.state}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Shipping Address */}
      {needsShippingAddress && state.shippingAddress && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 uppercase text-sm">
            Shipping Address
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name *
              </label>
              <input
                type="text"
                value={state.shippingAddress.firstName}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      firstName: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                value={state.shippingAddress.lastName}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      lastName: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company (optional)
              </label>
              <input
                type="text"
                value={state.shippingAddress.company}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      company: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address Line 1 *
              </label>
              <input
                type="text"
                value={state.shippingAddress.addressLine1}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      addressLine1: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address Line 2 (optional)
              </label>
              <input
                type="text"
                value={state.shippingAddress.addressLine2}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      addressLine2: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City *
              </label>
              <input
                type="text"
                value={state.shippingAddress.city}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      city: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Province/State *
              </label>
              <input
                type="text"
                value={state.shippingAddress.state}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      state: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Postal Code *
              </label>
              <input
                type="text"
                value={state.shippingAddress.postalCode}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      postalCode: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country *
              </label>
              <select
                value={state.shippingAddress.country}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      country: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="Canada">Canada</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="Australia">Australia</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone (for delivery updates)
              </label>
              <input
                type="tel"
                value={state.shippingAddress.phone}
                onChange={(e) =>
                  updateState({
                    shippingAddress: {
                      ...state.shippingAddress!,
                      phone: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Price Summary */}
      {pricing && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 uppercase text-sm">
            Price Summary
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Translation</span>
              <span>${pricing.translation_total.toFixed(2)}</span>
            </div>
            {pricing.certification_total > 0 && (
              <div className="flex justify-between">
                <span>Certification</span>
                <span>${pricing.certification_total.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-gray-300 pt-2 flex justify-between font-medium">
              <span>Subtotal</span>
              <span>${pricing.subtotal.toFixed(2)}</span>
            </div>
            {pricing.rush_fee > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>
                  {state.deliverySpeed === "rush" ? "Rush" : "Same-Day"} Fee
                </span>
                <span>${pricing.rush_fee.toFixed(2)}</span>
              </div>
            )}
            {pricing.delivery_fee > 0 && (
              <div className="flex justify-between">
                <span>
                  Delivery (
                  {
                    deliveryOptions.find(
                      (o) => o.code === state.physicalDeliveryOption,
                    )?.name
                  }
                  )
                </span>
                <span>${pricing.delivery_fee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax ({(pricing.tax_rate * 100).toFixed(2)}%)</span>
              <span>${pricing.tax_amount.toFixed(2)}</span>
            </div>
            <div className="border-t-2 border-gray-400 pt-2 flex justify-between font-bold text-lg">
              <span>TOTAL CAD</span>
              <span>${pricing.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={goToPreviousStep}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          ← Back
        </button>
        <button
          onClick={handleContinue}
          disabled={saving}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue to Review →
        </button>
      </div>
    </div>
  );
}
