import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { MapPin, Truck, Plus, Edit2, X, Check, Package } from "lucide-react";

interface Address {
  name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  province?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface Props {
  quoteId: string;
  billingAddress: Address | null;
  shippingAddress: Address | null;
  physicalDeliveryOptionId: string | null;
  customerName: string;
  customerEmail?: string;
  loading?: boolean;
  onUpdate?: () => void | Promise<void>;
}

export default function AddressesDeliveryPanel({
  quoteId,
  billingAddress,
  shippingAddress,
  physicalDeliveryOptionId,
  customerName,
  customerEmail,
  loading = false,
  onUpdate,
}: Props) {
  const [editingBilling, setEditingBilling] = useState(false);
  const [editingShipping, setEditingShipping] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for billing
  const [billingForm, setBillingForm] = useState<Address>({
    name: billingAddress?.name || customerName || "",
    address_line1: billingAddress?.address_line1 || "",
    address_line2: billingAddress?.address_line2 || "",
    city: billingAddress?.city || "",
    province: billingAddress?.province || billingAddress?.state || "",
    postal_code: billingAddress?.postal_code || "",
    country: billingAddress?.country || "Canada",
  });

  // Form state for shipping
  const [shippingForm, setShippingForm] = useState<Address>({
    name: shippingAddress?.name || customerName || "",
    address_line1: shippingAddress?.address_line1 || "",
    address_line2: shippingAddress?.address_line2 || "",
    city: shippingAddress?.city || "",
    province: shippingAddress?.province || shippingAddress?.state || "",
    postal_code: shippingAddress?.postal_code || "",
    country: shippingAddress?.country || "Canada",
  });

  const handleSaveBilling = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ billing_address: billingForm })
        .eq("id", quoteId);

      if (error) throw error;

      setEditingBilling(false);
      onUpdate?.();
    } catch (error) {
      console.error("Failed to save billing address:", error);
      alert("Failed to save billing address");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveShipping = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ shipping_address: shippingForm })
        .eq("id", quoteId);

      if (error) throw error;

      setEditingShipping(false);
      onUpdate?.();
    } catch (error) {
      console.error("Failed to save shipping address:", error);
      alert("Failed to save shipping address");
    } finally {
      setSaving(false);
    }
  };

  const renderAddressDisplay = (address: Address | null, isDigitalOnly: boolean = false) => {
    if (isDigitalOnly && !address) {
      return (
        <div className="flex items-center gap-2 text-gray-500 italic text-sm">
          <Package className="w-4 h-4" />
          <span>Digital delivery only</span>
        </div>
      );
    }

    if (!address || !address.address_line1) {
      return (
        <p className="text-sm text-gray-500 italic">No address on file</p>
      );
    }

    return (
      <div className="text-sm text-gray-700 space-y-0.5">
        {address.name && <p className="font-medium text-gray-900">{address.name}</p>}
        <p>{address.address_line1}</p>
        {address.address_line2 && <p>{address.address_line2}</p>}
        <p>
          {address.city}, {address.province || address.state} {address.postal_code}
        </p>
        <p>{address.country || "Canada"}</p>
      </div>
    );
  };

  const renderAddressForm = (
    form: Address,
    setForm: React.Dispatch<React.SetStateAction<Address>>,
    onSave: () => void,
    onCancel: () => void
  ) => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <input
          type="text"
          value={form.name || ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          placeholder="Full name"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1</label>
        <input
          type="text"
          value={form.address_line1 || ""}
          onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          placeholder="Street address"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2</label>
        <input
          type="text"
          value={form.address_line2 || ""}
          onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          placeholder="Apt, Suite, Unit (optional)"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
          <input
            type="text"
            value={form.city || ""}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            placeholder="City"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Province</label>
          <input
            type="text"
            value={form.province || ""}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            placeholder="Province"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Postal Code</label>
          <input
            type="text"
            value={form.postal_code || ""}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            placeholder="A1A 1A1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
          <input
            type="text"
            value={form.country || ""}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            placeholder="Canada"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {saving ? (
            "Saving..."
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save
            </>
          )}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-100 rounded-lg h-32"></div>
          <div className="bg-gray-100 rounded-lg h-32"></div>
        </div>
      </div>
    );
  }

  const isDigitalOnly = !physicalDeliveryOptionId && !shippingAddress;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Billing Address Column */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Billing Address</h4>
          </div>
          {!editingBilling && (
            <button
              onClick={() => {
                setBillingForm({
                  name: billingAddress?.name || customerName || "",
                  address_line1: billingAddress?.address_line1 || "",
                  address_line2: billingAddress?.address_line2 || "",
                  city: billingAddress?.city || "",
                  province: billingAddress?.province || billingAddress?.state || "",
                  postal_code: billingAddress?.postal_code || "",
                  country: billingAddress?.country || "Canada",
                });
                setEditingBilling(true);
              }}
              className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              {billingAddress ? (
                <>
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </>
              )}
            </button>
          )}
        </div>

        {editingBilling ? (
          renderAddressForm(
            billingForm,
            setBillingForm,
            handleSaveBilling,
            () => setEditingBilling(false)
          )
        ) : (
          renderAddressDisplay(billingAddress)
        )}
      </div>

      {/* Shipping & Delivery Column */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <Truck className="w-4 h-4 text-green-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Shipping & Delivery</h4>
          </div>
          {!editingShipping && (
            <button
              onClick={() => {
                setShippingForm({
                  name: shippingAddress?.name || customerName || "",
                  address_line1: shippingAddress?.address_line1 || "",
                  address_line2: shippingAddress?.address_line2 || "",
                  city: shippingAddress?.city || "",
                  province: shippingAddress?.province || shippingAddress?.state || "",
                  postal_code: shippingAddress?.postal_code || "",
                  country: shippingAddress?.country || "Canada",
                });
                setEditingShipping(true);
              }}
              className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              {shippingAddress ? (
                <>
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </>
              )}
            </button>
          )}
        </div>

        {editingShipping ? (
          renderAddressForm(
            shippingForm,
            setShippingForm,
            handleSaveShipping,
            () => setEditingShipping(false)
          )
        ) : (
          renderAddressDisplay(shippingAddress, isDigitalOnly)
        )}
      </div>
    </div>
  );
}
