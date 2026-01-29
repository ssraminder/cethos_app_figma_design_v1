import React, { useState, useEffect } from "react";
import { Home, ChevronDown, ChevronUp, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface BillingAddress {
  name?: string;
  company?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  province?: string; // State/Province
  postal_code: string;
  country: string;
  phone?: string;
  email?: string;
}

interface EditableBillingAddressPanelProps {
  quoteId: string;
  billingAddress: BillingAddress | null;
  customerName?: string;
  customerEmail?: string;
  loading?: boolean;
  onUpdate?: () => void;
}

export default function EditableBillingAddressPanel({
  quoteId,
  billingAddress,
  customerName,
  customerEmail,
  loading = false,
  onUpdate,
}: EditableBillingAddressPanelProps) {
  console.log("🏢 EditableBillingAddressPanel rendering:", {
    quoteId,
    billingAddress,
    customerName,
    customerEmail,
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
  const [email, setEmail] = useState("");

  useEffect(() => {
    resetForm();
  }, [billingAddress, customerName, customerEmail]);

  const resetForm = () => {
    if (billingAddress) {
      setName(billingAddress.name || customerName || "");
      setCompany(billingAddress.company || "");
      setAddressLine1(billingAddress.address_line1 || "");
      setAddressLine2(billingAddress.address_line2 || "");
      setCity(billingAddress.city || "");
      setProvince(billingAddress.province || "");
      setPostalCode(billingAddress.postal_code || "");
      setCountry(billingAddress.country || "Canada");
      setPhone(billingAddress.phone || "");
      setEmail(billingAddress.email || customerEmail || "");
    } else {
      // Default values
      setName(customerName || "");
      setCompany("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setProvince("");
      setPostalCode("");
      setCountry("Canada");
      setPhone("");
      setEmail(customerEmail || "");
    }
  };

  const handleSave = async () => {
    if (!addressLine1 || !city || !postalCode || !country) {
      alert("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      const address: BillingAddress = {
        name: name || customerName || "",
        company: company || undefined,
        address_line1: addressLine1,
        address_line2: addressLine2 || undefined,
        city,
        province: province || undefined,
        postal_code: postalCode,
        country,
        phone: phone || undefined,
        email: email || customerEmail || undefined,
      };

      const { error } = await supabase
        .from("quotes")
        .update({
          billing_address: address,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (error) throw error;

      alert("✅ Billing address saved successfully!");
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to save billing address:", error);
      alert("Failed to save billing address: " + (error as Error).message);
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition-colors flex-1 -ml-2 p-2 rounded"
        >
          <Home className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Billing Address
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
            className="ml-2 px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            {billingAddress ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {!isEditing ? (
            // View Mode
            billingAddress ? (
              <>
                {billingAddress.name && (
                  <p className="font-medium text-gray-900">
                    {billingAddress.name}
                  </p>
                )}
                {billingAddress.company && (
                  <p className="text-gray-700">{billingAddress.company}</p>
                )}
                <p className="text-gray-700">{billingAddress.address_line1}</p>
                {billingAddress.address_line2 && (
                  <p className="text-gray-700">
                    {billingAddress.address_line2}
                  </p>
                )}
                <p className="text-gray-700">
                  {billingAddress.city}
                  {billingAddress.province &&
                    `, ${billingAddress.province}`}{" "}
                  {billingAddress.postal_code}
                </p>
                <p className="text-gray-700 font-medium">
                  {billingAddress.country}
                </p>
                {billingAddress.phone && (
                  <p className="text-gray-600 text-xs">
                    Phone: {billingAddress.phone}
                  </p>
                )}
                {billingAddress.email && (
                  <p className="text-gray-600 text-xs">
                    Email: {billingAddress.email}
                  </p>
                )}
              </>
            ) : (
              <p className="text-gray-500 italic">No billing address on file</p>
            )
          ) : (
            // Edit Mode
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="John Doe"
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

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="billing@company.com"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={
                    isSaving ||
                    !addressLine1 ||
                    !city ||
                    !postalCode ||
                    !country
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save Address"}
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
