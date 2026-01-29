import React, { useState, useEffect } from "react";
import { Truck, ChevronDown, ChevronUp, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ShippingAddress {
  name?: string;
  company?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  province?: string;
  postal_code: string;
  country: string;
  phone?: string;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  delivery_group: string;
  delivery_type: string;
  requires_address: boolean;
}

interface EditableShippingAddressPanelProps {
  quoteId: string;
  shippingAddress: ShippingAddress | null;
  physicalDeliveryOptionId: string | null;
  customerName?: string;
  loading?: boolean;
  onUpdate?: () => void;
}

export default function EditableShippingAddressPanel({
  quoteId,
  shippingAddress,
  physicalDeliveryOptionId,
  customerName,
  loading = false,
  onUpdate,
}: EditableShippingAddressPanelProps) {
  console.log("🚚 EditableShippingAddressPanel rendering:", {
    quoteId,
    shippingAddress,
    physicalDeliveryOptionId,
    customerName,
    loading,
  });

  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Canada");
  const [phone, setPhone] = useState("");
  const [selectedDeliveryOptionId, setSelectedDeliveryOptionId] = useState("");

  // Delivery options
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);

  useEffect(() => {
    fetchDeliveryOptions();
  }, []);

  useEffect(() => {
    resetForm();
  }, [shippingAddress, physicalDeliveryOptionId, customerName]);

  const fetchDeliveryOptions = async () => {
    try {
      const { data, error } = await supabase
        .from("delivery_options")
        .select(
          "id, code, name, description, price, delivery_group, delivery_type, requires_address",
        )
        .eq("is_active", true)
        .eq("is_physical", true)
        .order("sort_order");

      if (error) throw error;
      setDeliveryOptions(data || []);
    } catch (error) {
      console.error("Error fetching delivery options:", error);
    }
  };

  const resetForm = () => {
    if (shippingAddress) {
      setName(shippingAddress.name || customerName || "");
      setCompany(shippingAddress.company || "");
      setAddressLine1(shippingAddress.address_line1 || "");
      setAddressLine2(shippingAddress.address_line2 || "");
      setCity(shippingAddress.city || "");
      setProvince(shippingAddress.province || "");
      setPostalCode(shippingAddress.postal_code || "");
      setCountry(shippingAddress.country || "Canada");
      setPhone(shippingAddress.phone || "");
    } else {
      setName(customerName || "");
      setCompany("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setProvince("");
      setPostalCode("");
      setCountry("Canada");
      setPhone("");
    }
    setSelectedDeliveryOptionId(physicalDeliveryOptionId || "");
  };

  const handleSave = async () => {
    const selectedOption = deliveryOptions.find(
      (opt) => opt.id === selectedDeliveryOptionId,
    );

    // If delivery requires address, validate address fields
    if (selectedOption?.requires_address) {
      if (!addressLine1 || !city || !postalCode || !country) {
        alert(
          "Please fill in all required address fields for this delivery method",
        );
        return;
      }
    }

    if (!selectedDeliveryOptionId) {
      alert("Please select a delivery method");
      return;
    }

    setIsSaving(true);
    try {
      const address: ShippingAddress | null = selectedOption?.requires_address
        ? {
            name: name || customerName || "",
            company: company || undefined,
            address_line1: addressLine1,
            address_line2: addressLine2 || undefined,
            city,
            province: province || undefined,
            postal_code: postalCode,
            country,
            phone: phone || undefined,
          }
        : null;

      const { error } = await supabase
        .from("quotes")
        .update({
          shipping_address: address,
          physical_delivery_option_id: selectedDeliveryOptionId,
          delivery_fee: selectedOption?.price || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (error) throw error;

      alert("✅ Shipping information saved successfully!");
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to save shipping information:", error);
      alert("Failed to save shipping information: " + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  const selectedOption = deliveryOptions.find(
    (opt) => opt.id === selectedDeliveryOptionId,
  );
  const requiresAddress = selectedOption?.requires_address || false;

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition-colors flex-1 -ml-2 p-2 rounded"
        >
          <Truck className="w-4 h-4 text-orange-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Shipping & Delivery
          </h3>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 ml-auto" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
          )}
        </button>
        {!isEditing && isExpanded && (
          <button
            onClick={() => setIsEditing(true)}
            className="ml-2 px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
          >
            {shippingAddress || physicalDeliveryOptionId ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {!isEditing ? (
            // View Mode
            <>
              {physicalDeliveryOptionId && selectedOption ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="font-medium text-blue-900">
                      {selectedOption.name}
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      {selectedOption.description}
                    </p>
                    {selectedOption.price > 0 && (
                      <p className="text-sm font-semibold text-blue-900 mt-2">
                        ${selectedOption.price.toFixed(2)}
                      </p>
                    )}
                  </div>

                  {shippingAddress && selectedOption.requires_address && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                        Delivery Address
                      </p>
                      {shippingAddress.name && (
                        <p className="font-medium text-gray-900">
                          {shippingAddress.name}
                        </p>
                      )}
                      {shippingAddress.company && (
                        <p className="text-gray-700">
                          {shippingAddress.company}
                        </p>
                      )}
                      <p className="text-gray-700">
                        {shippingAddress.address_line1}
                      </p>
                      {shippingAddress.address_line2 && (
                        <p className="text-gray-700">
                          {shippingAddress.address_line2}
                        </p>
                      )}
                      <p className="text-gray-700">
                        {shippingAddress.city}
                        {shippingAddress.province &&
                          `, ${shippingAddress.province}`}{" "}
                        {shippingAddress.postal_code}
                      </p>
                      <p className="text-gray-700 font-medium">
                        {shippingAddress.country}
                      </p>
                      {shippingAddress.phone && (
                        <p className="text-gray-600 text-xs mt-1">
                          Phone: {shippingAddress.phone}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-500 italic">
                  No shipping information on file (Digital delivery only)
                </p>
              )}
            </>
          ) : (
            // Edit Mode
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Delivery Method *
                </label>
                <select
                  value={selectedDeliveryOptionId}
                  onChange={(e) => setSelectedDeliveryOptionId(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select delivery method...</option>
                  {deliveryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}{" "}
                      {option.price > 0
                        ? `($${option.price.toFixed(2)})`
                        : "(Free)"}
                    </option>
                  ))}
                </select>
                {selectedOption && (
                  <p className="text-xs text-gray-600 mt-1">
                    {selectedOption.description}
                  </p>
                )}
              </div>

              {requiresAddress && (
                <>
                  <div className="border-t pt-3 mt-3">
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-3">
                      Delivery Address (Required)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">
                        Company (Optional)
                      </label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="ABC Corp"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Address Line 1 *
                    </label>
                    <input
                      type="text"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="123 Main Street"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Address Line 2 (Optional)
                    </label>
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="Apt 4B, Suite 100, etc."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">
                        City *
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="Toronto"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">
                        State/Province
                      </label>
                      <input
                        type="text"
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="ON, CA, TX, etc."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">
                        Postal/ZIP Code *
                      </label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="M5V 3A8 or 10001"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">
                        Country *
                      </label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="Canada, USA, Mexico, etc."
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !selectedDeliveryOptionId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save Shipping Info"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
