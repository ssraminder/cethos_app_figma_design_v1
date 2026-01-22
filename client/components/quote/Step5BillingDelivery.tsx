import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  X,
  Mail,
  Send,
  Zap,
  MapPin,
  ChevronRight,
  Loader2,
  Globe,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

// Canadian Provinces Data
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

interface BillingAddress {
  fullName: string;
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
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

export default function Step5BillingDelivery() {
  const { state, updateState, goToNextStep, goToPreviousStep } = useQuote();

  // Delivery options from database
  const [digitalOptions, setDigitalOptions] = useState<DeliveryOption[]>([]);
  const [physicalOptions, setPhysicalOptions] = useState<DeliveryOption[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);

  // Selection state
  const [selectedDigitalOptions, setSelectedDigitalOptions] = useState<
    string[]
  >(["online_portal"]);
  const [selectedPhysicalOption, setSelectedPhysicalOption] =
    useState<string>("none");
  const [selectedPickupLocation, setSelectedPickupLocation] =
    useState<string>("");

  const [billingAddress, setBillingAddress] = useState<BillingAddress>({
    fullName:
      state.firstName && state.lastName
        ? `${state.firstName} ${state.lastName}`.trim()
        : "",
    streetAddress: "",
    city: "",
    province: "AB",
    postalCode: "",
  });

  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Derived state
  const needsShippingAddress = physicalOptions
    .filter((opt) => opt.requires_address)
    .some((opt) => opt.code === selectedPhysicalOption);

  const isPickupSelected = selectedPhysicalOption === "pickup";

  useEffect(() => {
    fetchDeliveryData();
  }, []);

  useEffect(() => {
    if (pricing) {
      recalculateTotal();
    }
  }, [selectedPhysicalOption, pricing]);

  const fetchDeliveryData = async () => {
    setLoading(true);
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

      // If only one pickup location, auto-select it
      if (locations && locations.length === 1) {
        setSelectedPickupLocation(locations[0].id);
      }

      // Fetch pricing data
      if (state.quoteId) {
        const { data: quoteData, error } = await supabase
          .from("quotes")
          .select("calculated_totals")
          .eq("id", state.quoteId)
          .single();

        if (error) throw error;

        if (quoteData?.calculated_totals) {
          setPricing(quoteData.calculated_totals as PricingSummary);
        }

        // Pre-fill delivery selection if user went back
        if (state.physicalDeliveryOption) {
          setSelectedPhysicalOption(state.physicalDeliveryOption);
        }

        // Pre-fill billing address if user went back
        if (state.shippingAddress) {
          setBillingAddress({
            fullName:
              state.shippingAddress.firstName && state.shippingAddress.lastName
                ? `${state.shippingAddress.firstName} ${state.shippingAddress.lastName}`.trim()
                : billingAddress.fullName,
            streetAddress: state.shippingAddress.addressLine1 || "",
            city: state.shippingAddress.city || "",
            province: state.shippingAddress.state || "AB",
            postalCode: state.shippingAddress.postalCode || "",
          });
        }

        // Pre-fill pickup location if user went back
        if (state.pickupLocationId) {
          setSelectedPickupLocation(state.pickupLocationId);
        }
      }
    } catch (err) {
      console.error("Error fetching delivery data:", err);
      toast.error("Failed to load delivery options");
    } finally {
      setLoading(false);
    }
  };

  const recalculateTotal = () => {
    if (!pricing) return;

    const selectedOption = physicalOptions.find(
      (opt) => opt.code === selectedPhysicalOption,
    );
    const deliveryFee = selectedOption?.price || 0;

    // Subtotal already includes rush fee from Step 4
    const baseSubtotal =
      pricing.translation_total + pricing.certification_total;
    const subtotalWithRushAndDelivery =
      baseSubtotal + (pricing.rush_fee || 0) + deliveryFee;
    const taxAmount = subtotalWithRushAndDelivery * pricing.tax_rate;
    const total = subtotalWithRushAndDelivery + taxAmount;

    setPricing({
      ...pricing,
      delivery_fee: deliveryFee,
      tax_amount: taxAmount,
      total,
    });
  };

  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "fullName":
        return value.trim().length < 2 ? "Name is required" : "";
      case "streetAddress":
        return value.trim().length < 5 ? "Street address is required" : "";
      case "city":
        return value.trim().length < 2 ? "City is required" : "";
      case "postalCode":
        const postalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
        return !postalRegex.test(value.trim())
          ? "Valid postal code required (e.g., T2P 1J9)"
          : "";
      default:
        return "";
    }
  };

  const handleFieldChange = (field: keyof BillingAddress, value: string) => {
    setBillingAddress((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleFieldBlur = (field: keyof BillingAddress) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, billingAddress[field]);
    if (error) {
      setErrors((prev) => ({ ...prev, [field]: error }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate billing address
    Object.keys(billingAddress).forEach((key) => {
      const error = validateField(
        key,
        billingAddress[key as keyof BillingAddress],
      );
      if (error) {
        newErrors[key] = error;
      }
    });

    // If pickup selected and multiple locations exist, must select one
    if (
      isPickupSelected &&
      pickupLocations.length > 1 &&
      !selectedPickupLocation
    ) {
      newErrors.pickupLocation = "Please select a pickup location";
    }

    setErrors(newErrors);
    setTouched({
      fullName: true,
      streetAddress: true,
      city: true,
      province: true,
      postalCode: true,
    });

    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validateForm()) {
      toast.error("Please complete all required fields");
      return;
    }

    setSaving(true);
    try {
      // Save billing address and delivery selection to database
      if (state.quoteId && pricing) {
        const selectedPhysicalOptionObj = physicalOptions.find(
          (opt) => opt.code === selectedPhysicalOption,
        );

        const { error } = await supabase
          .from("quotes")
          .update({
            physical_delivery_option: selectedPhysicalOption,
            selected_pickup_location_id: isPickupSelected
              ? selectedPickupLocation
              : null,
            shipping_address: {
              firstName:
                billingAddress.fullName.split(" ")[0] ||
                billingAddress.fullName,
              lastName:
                billingAddress.fullName.split(" ").slice(1).join(" ") || "",
              company: state.companyName || "",
              addressLine1: billingAddress.streetAddress,
              addressLine2: "",
              city: billingAddress.city,
              state: billingAddress.province,
              postalCode: billingAddress.postalCode,
              country: "Canada",
              phone: state.phone || "",
            },
            calculated_totals: pricing,
            updated_at: new Date().toISOString(),
          })
          .eq("id", state.quoteId);

        if (error) throw error;
      }

      // Update context state
      updateState({
        physicalDeliveryOption: selectedPhysicalOption,
        pickupLocationId: isPickupSelected ? selectedPickupLocation : null,
        deliveryFee: pricing?.delivery_fee || 0,
        shippingAddress: {
          firstName:
            billingAddress.fullName.split(" ")[0] || billingAddress.fullName,
          lastName: billingAddress.fullName.split(" ").slice(1).join(" ") || "",
          company: state.companyName || "",
          addressLine1: billingAddress.streetAddress,
          addressLine2: "",
          city: billingAddress.city,
          state: billingAddress.province,
          postalCode: billingAddress.postalCode,
          country: "Canada",
          phone: state.phone || "",
        },
      });

      await goToNextStep();
    } catch (err) {
      console.error("Error saving billing and delivery:", err);
      toast.error("Failed to save billing information");
    } finally {
      setSaving(false);
    }
  };

  const getDeliveryIcon = (deliveryType: string, code: string) => {
    if (code === "pickup") return <MapPin className="w-5 h-5" />;
    if (deliveryType === "online") return <Globe className="w-5 h-5" />;
    if (code === "email") return <Mail className="w-5 h-5" />;
    if (code === "priority_mail") return <Send className="w-5 h-5" />;
    if (code.includes("express") || code.includes("courier"))
      return <Zap className="w-5 h-5" />;
    return <Truck className="w-5 h-5" />;
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
          Billing & Delivery
        </h2>
        <p className="text-gray-600">
          Enter your billing address and choose delivery method
        </p>
      </div>

      {/* Billing Address Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Billing Address
        </h3>

        <div className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={billingAddress.fullName}
              onChange={(e) => handleFieldChange("fullName", e.target.value)}
              onBlur={() => handleFieldBlur("fullName")}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                touched.fullName && errors.fullName
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="John Doe"
            />
            {touched.fullName && errors.fullName && (
              <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>
            )}
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
                handleFieldChange("streetAddress", e.target.value)
              }
              onBlur={() => handleFieldBlur("streetAddress")}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                touched.streetAddress && errors.streetAddress
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="123 Main Street"
            />
            {touched.streetAddress && errors.streetAddress && (
              <p className="text-xs text-red-600 mt-1">
                {errors.streetAddress}
              </p>
            )}
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={billingAddress.city}
              onChange={(e) => handleFieldChange("city", e.target.value)}
              onBlur={() => handleFieldBlur("city")}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                touched.city && errors.city
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="Calgary"
            />
            {touched.city && errors.city && (
              <p className="text-xs text-red-600 mt-1">{errors.city}</p>
            )}
          </div>

          {/* Province and Postal Code */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Province <span className="text-red-500">*</span>
              </label>
              <select
                value={billingAddress.province}
                onChange={(e) => handleFieldChange("province", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CANADIAN_PROVINCES.map((province) => (
                  <option key={province.code} value={province.code}>
                    {province.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Postal Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={billingAddress.postalCode}
                onChange={(e) =>
                  handleFieldChange("postalCode", e.target.value.toUpperCase())
                }
                onBlur={() => handleFieldBlur("postalCode")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  touched.postalCode && errors.postalCode
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
                placeholder="T2P 1J9"
                maxLength={7}
              />
              {touched.postalCode && errors.postalCode && (
                <p className="text-xs text-red-600 mt-1">{errors.postalCode}</p>
              )}
            </div>
          </div>
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
                    ? "border-blue-500 bg-blue-50 cursor-pointer"
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
                      : [...prev, option.code],
                  );
                }}
                disabled={option.is_always_selected}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedDigitalOptions.includes(option.code) ||
                  option.is_always_selected
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {getDeliveryIcon(option.delivery_type, option.code)}
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

      {/* Physical Delivery Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Physical Delivery (Optional)
        </h3>

        <div className="space-y-3">
          {/* None Option */}
          <label
            className={`flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all ${
              selectedPhysicalOption === "none"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-blue-300"
            }`}
          >
            <input
              type="radio"
              name="physicalDelivery"
              value="none"
              checked={selectedPhysicalOption === "none"}
              onChange={(e) => setSelectedPhysicalOption(e.target.value)}
              className="mt-1"
            />
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100 text-gray-600">
              <X className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">
                  No physical copy needed
                </span>
                <span className="text-green-600 font-semibold">FREE</span>
              </div>
              <p className="text-sm text-gray-600">Digital delivery only</p>
            </div>
            {selectedPhysicalOption === "none" && (
              <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
            )}
          </label>

          {/* Physical Options from Database */}
          {physicalOptions.map((option) => (
            <label
              key={option.id}
              className={`flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedPhysicalOption === option.code
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <input
                type="radio"
                name="physicalDelivery"
                value={option.code}
                checked={selectedPhysicalOption === option.code}
                onChange={(e) => setSelectedPhysicalOption(e.target.value)}
                className="mt-1"
              />
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  selectedPhysicalOption === option.code
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {getDeliveryIcon(option.delivery_type, option.code)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900">
                    {option.name}
                  </span>
                  <span
                    className={`font-semibold ${
                      option.price === 0 ? "text-green-600" : "text-gray-900"
                    }`}
                  >
                    {option.price === 0
                      ? "FREE"
                      : `$${option.price.toFixed(2)}`}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{option.description}</p>
              </div>
              {selectedPhysicalOption === option.code && (
                <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Pickup Location - Only show when pickup selected */}
      {isPickupSelected && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Pickup Location
          </h3>

          {pickupLocations.length === 1 ? (
            // Single location - just display it
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
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
                {pickupLocations[0].city}, {pickupLocations[0].province}{" "}
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
            // Multiple locations - show dropdown
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

              {/* Show selected location details */}
              {selectedPickupLocation && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg">
                  {(() => {
                    const loc = pickupLocations.find(
                      (l) => l.id === selectedPickupLocation,
                    );
                    if (!loc) return null;
                    return (
                      <>
                        <p className="font-medium text-gray-900">{loc.name}</p>
                        <p className="text-gray-600">{loc.address_line1}</p>
                        <p className="text-gray-600">
                          {loc.city}, {loc.province} {loc.postal_code}
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

      {/* Order Total Card */}
      {pricing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Order Summary
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900 font-medium">
                $
                {(
                  pricing.translation_total + pricing.certification_total
                ).toFixed(2)}
              </span>
            </div>

            {pricing.rush_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Turnaround Fee</span>
                <span className="text-gray-900 font-medium">
                  ${pricing.rush_fee.toFixed(2)}
                </span>
              </div>
            )}

            {pricing.delivery_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Delivery Fee</span>
                <span className="text-gray-900 font-medium">
                  ${pricing.delivery_fee.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Tax ({(pricing.tax_rate * 100).toFixed(0)}% GST)
              </span>
              <span className="text-gray-900 font-medium">
                ${pricing.tax_amount.toFixed(2)}
              </span>
            </div>

            <div className="pt-3 border-t-2 border-gray-300 flex justify-between items-center">
              <span className="text-xl font-bold text-gray-900">TOTAL CAD</span>
              <span className="text-2xl font-bold text-gray-900">
                ${pricing.total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

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
              Proceed to Payment
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
