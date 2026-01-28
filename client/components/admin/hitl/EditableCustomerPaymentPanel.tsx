import React, { useState, useEffect } from "react";
import {
  Mail,
  Phone,
  User,
  Edit2,
  Save,
  X,
  CreditCard,
  MapPin,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  description: string;
  is_online: boolean;
  requires_staff_confirmation: boolean;
}

interface EditableCustomerPaymentPanelProps {
  quoteId: string;
  customerId: string;
  staffId: string;
  initialData: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    companyName?: string;
    shippingAddress?: string;
    billingAddress?: string;
    paymentMethodId?: string;
  };
  loading?: boolean;
  onUpdate?: () => void;
}

export default function EditableCustomerPaymentPanel({
  quoteId,
  customerId,
  staffId,
  initialData,
  loading = false,
  onUpdate,
}: EditableCustomerPaymentPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Edit state
  const [editValues, setEditValues] = useState({
    customerName: initialData.customerName,
    customerEmail: initialData.customerEmail,
    customerPhone: initialData.customerPhone || "",
    companyName: initialData.companyName || "",
    shippingAddress: initialData.shippingAddress || "",
    billingAddress: initialData.billingAddress || "",
    paymentMethodId: initialData.paymentMethodId || "",
    sameAsShipping: false,
  });

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const loadPaymentMethods = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error("Error loading payment methods:", error);
    }
  };

  const saveChanges = async () => {
    if (!supabase) return;

    if (!editValues.customerName.trim() || !editValues.customerEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }

    setIsSaving(true);

    try {
      // Update customer information
      const { error: customerError } = await supabase
        .from("customers")
        .update({
          full_name: editValues.customerName,
          email: editValues.customerEmail,
          phone: editValues.customerPhone || null,
          company_name: editValues.companyName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (customerError) throw customerError;

      // Update quote with payment method and addresses
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          shipping_address: editValues.shippingAddress || null,
          billing_address: editValues.billingAddress || null,
          payment_method_id: editValues.paymentMethodId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (quoteError) throw quoteError;

      // Log staff activity
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        action: "update_customer_payment_info",
        details: {
          quote_id: quoteId,
          customer_id: customerId,
          changes: {
            customer_info_updated: true,
            payment_method_updated: !!editValues.paymentMethodId,
            addresses_updated:
              !!editValues.shippingAddress || !!editValues.billingAddress,
          },
        },
        created_at: new Date().toISOString(),
      });

      setIsEditing(false);
      toast.success("Customer and payment information updated");

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditValues({
      customerName: initialData.customerName,
      customerEmail: initialData.customerEmail,
      customerPhone: initialData.customerPhone || "",
      companyName: initialData.companyName || "",
      shippingAddress: initialData.shippingAddress || "",
      billingAddress: initialData.billingAddress || "",
      paymentMethodId: initialData.paymentMethodId || "",
      sameAsShipping: false,
    });
    setIsEditing(false);
  };

  const handleSameAsShippingChange = (checked: boolean) => {
    setEditValues({
      ...editValues,
      sameAsShipping: checked,
      billingAddress: checked ? editValues.shippingAddress : "",
    });
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-3">
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
        <h3 className="text-sm font-semibold text-gray-900">
          Customer & Payment
        </h3>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={saveChanges}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 flex items-center gap-1"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Customer Information */}
      <div className="px-4 py-3">
        <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3 flex items-center gap-1">
          <User className="w-3 h-3" />
          Customer Information
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Full Name *
            </label>
            {isEditing ? (
              <input
                type="text"
                value={editValues.customerName}
                onChange={(e) =>
                  setEditValues({ ...editValues, customerName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="John Doe"
              />
            ) : (
              <p className="text-sm font-medium text-gray-900">
                {editValues.customerName}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Email *</label>
            {isEditing ? (
              <input
                type="email"
                value={editValues.customerEmail}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    customerEmail: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="john@example.com"
              />
            ) : (
              <a
                href={`mailto:${editValues.customerEmail}`}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {editValues.customerEmail}
              </a>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Phone</label>
            {isEditing ? (
              <input
                type="tel"
                value={editValues.customerPhone}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    customerPhone: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="+1 (555) 123-4567"
              />
            ) : editValues.customerPhone ? (
              <a
                href={`tel:${editValues.customerPhone}`}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {editValues.customerPhone}
              </a>
            ) : (
              <p className="text-sm text-gray-400 italic">Not provided</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Company Name
            </label>
            {isEditing ? (
              <input
                type="text"
                value={editValues.companyName}
                onChange={(e) =>
                  setEditValues({ ...editValues, companyName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Acme Corporation"
              />
            ) : editValues.companyName ? (
              <p className="text-sm font-medium text-gray-900">
                {editValues.companyName}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">Not provided</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="px-4 py-3">
        <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3 flex items-center gap-1">
          <CreditCard className="w-3 h-3" />
          Payment Method
        </h4>
        {isEditing ? (
          <select
            value={editValues.paymentMethodId}
            onChange={(e) =>
              setEditValues({ ...editValues, paymentMethodId: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="">Select payment method...</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
                {method.is_online ? " (Online)" : " (Offline)"}
              </option>
            ))}
          </select>
        ) : editValues.paymentMethodId ? (
          <p className="text-sm font-medium text-gray-900">
            {
              paymentMethods.find((m) => m.id === editValues.paymentMethodId)
                ?.name
            }
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">Not selected</p>
        )}
      </div>

      {/* Shipping Address */}
      <div className="px-4 py-3">
        <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          Shipping Address
        </h4>
        {isEditing ? (
          <textarea
            value={editValues.shippingAddress}
            onChange={(e) =>
              setEditValues({
                ...editValues,
                shippingAddress: e.target.value,
                billingAddress: editValues.sameAsShipping
                  ? e.target.value
                  : editValues.billingAddress,
              })
            }
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="123 Main St, Suite 100&#10;Toronto, ON M5H 2N2&#10;Canada"
          />
        ) : editValues.shippingAddress ? (
          <p className="text-sm text-gray-900 whitespace-pre-line">
            {editValues.shippingAddress}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">Not provided</p>
        )}
      </div>

      {/* Billing Address */}
      <div className="px-4 py-3">
        <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          Billing Address
        </h4>

        {isEditing && (
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editValues.sameAsShipping}
              onChange={(e) => handleSameAsShippingChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-600">
              Same as shipping address
            </span>
          </label>
        )}

        {isEditing ? (
          <textarea
            value={editValues.billingAddress}
            onChange={(e) =>
              setEditValues({ ...editValues, billingAddress: e.target.value })
            }
            rows={3}
            disabled={editValues.sameAsShipping}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="123 Main St, Suite 100&#10;Toronto, ON M5H 2N2&#10;Canada"
          />
        ) : editValues.billingAddress ? (
          <p className="text-sm text-gray-900 whitespace-pre-line">
            {editValues.billingAddress}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">Not provided</p>
        )}
      </div>
    </div>
  );
}
