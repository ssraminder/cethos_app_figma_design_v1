import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Edit2, Save, X, Trash2, ChevronUp, ChevronDown, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";

interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  description: string;
  is_online: boolean;
  requires_staff_confirmation: boolean;
  is_active: boolean;
  display_order: number;
  icon: string;
  created_at: string;
  updated_at: string;
}

export default function PaymentMethodsSettings() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state for editing/adding
  const [formData, setFormData] = useState<Partial<PaymentMethod>>({
    name: "",
    code: "",
    description: "",
    is_online: false,
    requires_staff_confirmation: false,
    is_active: true,
    icon: "credit-card",
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
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error("Error loading payment methods:", error);
      toast.error("Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (method: PaymentMethod) => {
    setEditingId(method.id);
    setFormData({
      name: method.name,
      code: method.code,
      description: method.description,
      is_online: method.is_online,
      requires_staff_confirmation: method.requires_staff_confirmation,
      is_active: method.is_active,
      icon: method.icon,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      is_online: false,
      requires_staff_confirmation: false,
      is_active: true,
      icon: "credit-card",
    });
  };

  const saveEdit = async (methodId: string) => {
    if (!supabase || !formData.name || !formData.code) {
      toast.error("Name and code are required");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("payment_methods")
        .update({
          name: formData.name,
          code: formData.code,
          description: formData.description,
          is_online: formData.is_online,
          requires_staff_confirmation: formData.requires_staff_confirmation,
          is_active: formData.is_active,
          icon: formData.icon,
          updated_at: new Date().toISOString(),
        })
        .eq("id", methodId);

      if (error) throw error;

      toast.success("Payment method updated");
      loadPaymentMethods();
      cancelEdit();
    } catch (error) {
      console.error("Error updating payment method:", error);
      toast.error("Failed to update payment method");
    } finally {
      setIsSaving(false);
    }
  };

  const addNewMethod = async () => {
    if (!supabase || !formData.name || !formData.code) {
      toast.error("Name and code are required");
      return;
    }

    setIsSaving(true);

    try {
      // Get max display_order
      const maxOrder = paymentMethods.reduce(
        (max, method) => Math.max(max, method.display_order),
        0,
      );

      const { error } = await supabase.from("payment_methods").insert({
        name: formData.name,
        code: formData.code,
        description: formData.description || "",
        is_online: formData.is_online,
        requires_staff_confirmation: formData.requires_staff_confirmation,
        is_active: formData.is_active,
        display_order: maxOrder + 1,
        icon: formData.icon || "credit-card",
      });

      if (error) throw error;

      toast.success("Payment method added");
      loadPaymentMethods();
      setShowAddModal(false);
      cancelEdit();
    } catch (error) {
      console.error("Error adding payment method:", error);
      toast.error("Failed to add payment method");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (methodId: string, currentStatus: boolean) => {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from("payment_methods")
        .update({
          is_active: !currentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", methodId);

      if (error) throw error;

      toast.success(
        currentStatus
          ? "Payment method deactivated"
          : "Payment method activated",
      );
      loadPaymentMethods();
    } catch (error) {
      console.error("Error toggling payment method:", error);
      toast.error("Failed to update payment method");
    }
  };

  const deleteMethod = async (methodId: string) => {
    if (!supabase) return;

    if (
      !confirm(
        "Are you sure you want to delete this payment method? This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("payment_methods")
        .delete()
        .eq("id", methodId);

      if (error) throw error;

      toast.success("Payment method deleted");
      loadPaymentMethods();
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast.error("Failed to delete payment method");
    }
  };

  const moveUp = async (method: PaymentMethod) => {
    if (!supabase) return;

    const currentIndex = paymentMethods.findIndex((m) => m.id === method.id);
    if (currentIndex === 0) return;

    const previousMethod = paymentMethods[currentIndex - 1];

    try {
      // Swap display orders
      await Promise.all([
        supabase
          .from("payment_methods")
          .update({ display_order: previousMethod.display_order })
          .eq("id", method.id),
        supabase
          .from("payment_methods")
          .update({ display_order: method.display_order })
          .eq("id", previousMethod.id),
      ]);

      toast.success("Order updated");
      loadPaymentMethods();
    } catch (error) {
      console.error("Error updating order:", error);
      toast.error("Failed to update order");
    }
  };

  const moveDown = async (method: PaymentMethod) => {
    if (!supabase) return;

    const currentIndex = paymentMethods.findIndex((m) => m.id === method.id);
    if (currentIndex === paymentMethods.length - 1) return;

    const nextMethod = paymentMethods[currentIndex + 1];

    try {
      // Swap display orders
      await Promise.all([
        supabase
          .from("payment_methods")
          .update({ display_order: nextMethod.display_order })
          .eq("id", method.id),
        supabase
          .from("payment_methods")
          .update({ display_order: method.display_order })
          .eq("id", nextMethod.id),
      ]);

      toast.success("Order updated");
      loadPaymentMethods();
    } catch (error) {
      console.error("Error updating order:", error);
      toast.error("Failed to update order");
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Methods</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage available payment methods for quotes and orders
          </p>
        </div>
        <button
          onClick={() => {
            cancelEdit();
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Payment Method
        </button>
      </div>

      {/* Payment Methods List */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y">
        {paymentMethods.length === 0 ? (
          <div className="p-8 text-center">
            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">No payment methods configured</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Add your first payment method
            </button>
          </div>
        ) : (
          paymentMethods.map((method, index) => (
            <div
              key={method.id}
              className={`p-4 ${!method.is_active ? "bg-gray-50" : ""}`}
            >
              {editingId === method.id ? (
                /* Edit Mode */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        placeholder="Credit Card"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Code *
                      </label>
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) =>
                          setFormData({ ...formData, code: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        placeholder="credit_card"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Pay securely online with credit or debit card"
                    />
                  </div>

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_online}
                        onChange={(e) =>
                          setFormData({ ...formData, is_online: e.target.checked })
                        }
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Online Payment</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.requires_staff_confirmation}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            requires_staff_confirmation: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">
                        Requires Staff Confirmation
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) =>
                          setFormData({ ...formData, is_active: e.target.checked })
                        }
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Active</span>
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => saveEdit(method.id)}
                      disabled={isSaving}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold text-gray-900">
                        {method.name}
                      </h3>
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {method.code}
                      </span>
                      {method.is_online && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Online
                        </span>
                      )}
                      {method.requires_staff_confirmation && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          Needs Confirmation
                        </span>
                      )}
                      {!method.is_active && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{method.description}</p>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {/* Reorder buttons */}
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveUp(method)}
                        disabled={index === 0}
                        className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ChevronUp className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => moveDown(method)}
                        disabled={index === paymentMethods.length - 1}
                        className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>

                    {/* Active toggle */}
                    <button
                      onClick={() => toggleActive(method.id, method.is_active)}
                      className={`p-2 rounded transition-colors ${
                        method.is_active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                      title={method.is_active ? "Deactivate" : "Activate"}
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    {/* Edit button */}
                    <button
                      onClick={() => startEdit(method)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => deleteMethod(method.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Add Payment Method</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="Credit Card"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Code *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="credit_card"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="Pay securely online with credit or debit card"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_online}
                    onChange={(e) =>
                      setFormData({ ...formData, is_online: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Online Payment</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.requires_staff_confirmation}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        requires_staff_confirmation: e.target.checked,
                      })
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">
                    Requires Staff Confirmation
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData({ ...formData, is_active: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={addNewMethod}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? "Adding..." : "Add Payment Method"}
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    cancelEdit();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
