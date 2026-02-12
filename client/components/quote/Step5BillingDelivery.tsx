import { useState, useEffect, useMemo } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Globe,
  Mail,
  MapPin,
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

interface PricingSummary {
  translation_total: number;
  certification_total: number;
  subtotal: number;
  rush_fee: number;
  delivery_fee: number;
  tax_amount: number;
  tax_rate: number;
  tax_name?: string;
  total: number;
}

interface GeoLocationData {
  country_code: string;
  region_code: string;
  city: string;
  postal: string;
}

export default function Step5BillingDelivery() {
  const { state, updateState, goToNextStep, goToPreviousStep } = useQuote();

  // Delivery options from database
  const [digitalOptions, setDigitalOptions] = useState<DeliveryOption[]>([]);
  const [physicalOptions, setPhysicalOptions] = useState<DeliveryOption[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [countries, setCountries] = useState<
    { code: string; name: string; is_common: boolean }[]
  >([]);

  // Selection state
  const [selectedDigitalOptions, setSelectedDigitalOptions] = useState<
    string[]
  >(["online_portal"]);
  const [selectedPhysicalOption, setSelectedPhysicalOption] =
    useState<string>("");
  const [selectedPickupLocation, setSelectedPickupLocation] =
    useState<string>("");

  const [billingAddress, setBillingAddress] = useState<Address>({
    fullName:
      state.firstName && state.lastName
        ? `${state.firstName} ${state.lastName}`.trim()
        : "",
    streetAddress: "",
    city: "",
    province: "",
    postalCode: "",
    country: "CA",
  });

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

  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Tax rate state
  const [taxRate, setTaxRate] = useState(0.05);
  const [taxName, setTaxName] = useState("GST");

  // Document summary state
  const [sourceLanguageName, setSourceLanguageName] = useState("");
  const [targetLanguageName, setTargetLanguageName] = useState("");
  const [documentGroups, setDocumentGroups] = useState<any[]>([]);

  // Separate common and other countries
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

  // Derived state
  const needsShippingAddress = physicalOptions
    .filter((opt) => opt.requires_address)
    .some((opt) => opt.code === selectedPhysicalOption);

  const isPickupSelected = selectedPhysicalOption === "pickup";

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

  // Initialize with geolocation
  useEffect(() => {
    const initializeWithGeoLocation = async () => {
      setGeoLoading(true);
      
      // Check if user already has billing address saved (went back from Step 6)
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

  useEffect(() => {
    fetchDeliveryData();
  }, []);

  useEffect(() => {
    if (pricing) {
      recalculateTotal();
    }
  }, [selectedPhysicalOption, pricing, taxRate]);

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

        // Fetch source and target language names
        const { data: langData } = await supabase
          .from("quotes")
          .select(`
            source_language:languages!quotes_source_language_id_fkey(name),
            target_language:languages!quotes_target_language_id_fkey(name)
          `)
          .eq("id", state.quoteId)
          .single();

        if (langData) {
          setSourceLanguageName((langData.source_language as any)?.name || "");
          setTargetLanguageName((langData.target_language as any)?.name || "");
        }

        // Fetch document groups with file info
        const { data: docGroups } = await supabase
          .from("quote_document_groups")
          .select(`
            id,
            group_label,
            document_type,
            billable_pages,
            total_word_count,
            line_total,
            quote_page_group_assignments(
              quote_files(original_filename)
            )
          `)
          .eq("quote_id", state.quoteId)
          .order("group_number");

        if (docGroups) {
          setDocumentGroups(docGroups);
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

    const baseSubtotal =
      pricing.translation_total + pricing.certification_total;
    const subtotalWithRushAndDelivery =
      baseSubtotal + (pricing.rush_fee || 0) + deliveryFee;
    const taxAmount = subtotalWithRushAndDelivery * taxRate;
    const total = subtotalWithRushAndDelivery + taxAmount;

    setPricing({
      ...pricing,
      delivery_fee: deliveryFee,
      tax_rate: taxRate,
      tax_name: taxName,
      tax_amount: taxAmount,
      total,
    });
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

  const handleContinue = async () => {
    if (!validateForm()) {
      toast.error("Please complete all required fields");
      return;
    }

    setSaving(true);
    try {
      if (state.quoteId && pricing) {
        const selectedPhysicalOptionObj = physicalOptions.find(
          (opt) => opt.code === selectedPhysicalOption
        );

        const { error } = await supabase
          .from("quotes")
          .update({
            physical_delivery_option_id: selectedPhysicalOptionObj?.id || null,
            selected_pickup_location_id: isPickupSelected
              ? selectedPickupLocation
              : null,
            billing_address: {
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
              country: billingAddress.country,
              phone: state.phone || "",
            },
            shipping_address: needsShippingAddress
              ? {
                  firstName:
                    shippingAddress.fullName.split(" ")[0] ||
                    shippingAddress.fullName,
                  lastName:
                    shippingAddress.fullName.split(" ").slice(1).join(" ") ||
                    "",
                  company: state.companyName || "",
                  addressLine1: shippingAddress.streetAddress,
                  addressLine2: "",
                  city: shippingAddress.city,
                  state: shippingAddress.province,
                  postalCode: shippingAddress.postalCode,
                  country: shippingAddress.country,
                  phone: state.phone || "",
                }
              : null,
            calculated_totals: {
              ...pricing,
              tax_name: taxName,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", state.quoteId);

        if (error) throw error;

        // Update quote status to pending_payment (only from allowed statuses)
        const { error: statusError } = await supabase
          .from("quotes")
          .update({
            status: "pending_payment",
            updated_at: new Date().toISOString(),
          })
          .eq("id", state.quoteId)
          .in("status", ["draft", "lead", "quote_ready"]); // Only update from these statuses

        if (statusError) {
          console.error("Failed to update quote status to pending_payment:", statusError);
          // Don't block the user, just log the error
        }
      }

      updateState({
        physicalDeliveryOption: selectedPhysicalOption,
        pickupLocationId: isPickupSelected ? selectedPickupLocation : null,
        deliveryFee: pricing?.delivery_fee || 0,
        billingAddress: {
          firstName:
            billingAddress.fullName.split(" ")[0] || billingAddress.fullName,
          lastName:
            billingAddress.fullName.split(" ").slice(1).join(" ") || "",
          company: state.companyName || "",
          addressLine1: billingAddress.streetAddress,
          addressLine2: "",
          city: billingAddress.city,
          state: billingAddress.province,
          postalCode: billingAddress.postalCode,
          country: billingAddress.country,
          phone: state.phone || "",
        },
        shippingAddress: needsShippingAddress
          ? {
              firstName:
                shippingAddress.fullName.split(" ")[0] ||
                shippingAddress.fullName,
              lastName:
                shippingAddress.fullName.split(" ").slice(1).join(" ") || "",
              company: state.companyName || "",
              addressLine1: shippingAddress.streetAddress,
              addressLine2: "",
              city: shippingAddress.city,
              state: shippingAddress.province,
              postalCode: shippingAddress.postalCode,
              country: shippingAddress.country,
              phone: state.phone || "",
            }
          : null,
      });

      await goToNextStep();
    } catch (err) {
      console.error("Error saving billing and delivery:", err);
      toast.error("Failed to save billing information");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-cethos-navy mb-2">
          Billing & Delivery
        </h2>
        <p className="text-cethos-gray">
          Enter your billing address and choose delivery method
        </p>
        {state.quoteNumber && (
          <p className="text-sm text-gray-400 mt-1">
            Quote ref: <span className="font-medium text-gray-500">{state.quoteNumber}</span>
          </p>
        )}
      </div>

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
                  {US_STATES.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name}
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

      {/* Document Summary */}
      {documentGroups.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Your Documents
          </h3>

          {/* Language pair */}
          {sourceLanguageName && targetLanguageName && (
            <div className="flex items-center gap-2 text-sm text-gray-700 mb-4">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="font-medium">{sourceLanguageName}</span>
              <span className="text-gray-400">&rarr;</span>
              <span className="font-medium">{targetLanguageName}</span>
            </div>
          )}

          {/* Document table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Document</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Type</th>
                  <th className="text-right py-2 pr-4 text-gray-500 font-medium">Words</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Pages</th>
                </tr>
              </thead>
              <tbody>
                {documentGroups.map((group: any) => {
                  const filenames = (group.quote_page_group_assignments || [])
                    .map((a: any) => a.quote_files?.original_filename)
                    .filter(Boolean);
                  const uniqueFilenames = [...new Set(filenames)] as string[];
                  const displayName = uniqueFilenames.length > 0
                    ? uniqueFilenames.join(", ")
                    : group.group_label || "Document";

                  const formatType = (type: string) =>
                    type
                      ? type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                      : "\u2014";

                  return (
                    <tr key={group.id} className="border-b border-gray-100">
                      <td className="py-2.5 pr-4 text-gray-900">
                        <div className="font-medium truncate max-w-[200px]" title={displayName}>
                          {displayName}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">
                        {formatType(group.document_type)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-gray-600">
                        {(group.total_word_count || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono text-gray-600">
                        {Number(group.billable_pages || 0).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={2} className="py-2.5 font-medium text-gray-700">
                    Total ({documentGroups.length} doc{documentGroups.length !== 1 ? "s" : ""})
                  </td>
                  <td className="py-2.5 text-right font-mono font-medium text-gray-700">
                    {documentGroups
                      .reduce((sum: number, g: any) => sum + (g.total_word_count || 0), 0)
                      .toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right font-mono font-medium text-gray-700">
                    {documentGroups
                      .reduce((sum: number, g: any) => sum + Number(g.billable_pages || 0), 0)
                      .toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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

            {taxRate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {taxName} ({(taxRate * 100).toFixed(0)}%)
                </span>
                <span className="text-gray-900 font-medium">
                  ${pricing.tax_amount.toFixed(2)}
                </span>
              </div>
            )}

            {taxRate === 0 && billingAddress.country !== "CA" && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-500 font-medium">
                  Not applicable
                </span>
              </div>
            )}

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
      <div className="flex items-center justify-between">
        <StartOverLink />
        <div className="flex items-center gap-4">
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
            className="flex-1 px-6 py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
    </div>
  );
}
