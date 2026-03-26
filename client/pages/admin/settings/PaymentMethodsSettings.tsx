import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Edit2,
  Save,
  X,
  Trash2,
  ChevronUp,
  ChevronDown,
  CreditCard,
  Check,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Wand2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

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

interface Branch {
  id: number;
  legal_name: string;
  code: string;
}

interface BranchPaymentMethod {
  id: string;
  branch_id: number;
  payment_method_id: string;
  is_enabled: boolean;
  details: Record<string, string>;
  display_instructions: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Detail field definitions per method code ───────────────────────────────

const DETAIL_FIELDS: Record<
  string,
  { key: string; label: string; placeholder: string; type?: string }[]
> = {
  etransfer: [
    { key: "email", label: "E-Transfer Email", placeholder: "payments@cethos.com" },
  ],
  wire: [
    { key: "bank_name", label: "Bank Name", placeholder: "TD Canada Trust" },
    { key: "institution", label: "Institution #", placeholder: "004" },
    { key: "transit", label: "Transit #", placeholder: "12345" },
    { key: "account", label: "Account #", placeholder: "1234567" },
    { key: "swift", label: "SWIFT Code", placeholder: "TDOMCATTTOR" },
  ],
  cheque: [
    { key: "payable_to", label: "Payable To", placeholder: "Cethos Solutions Inc." },
    {
      key: "address",
      label: "Mailing Address",
      placeholder: "123 Main St, Calgary AB T2P 1J9",
      type: "textarea",
    },
  ],
  direct_deposit: [
    { key: "bank_name", label: "Bank Name", placeholder: "TD Canada Trust" },
    { key: "institution", label: "Institution #", placeholder: "004" },
    { key: "transit", label: "Transit #", placeholder: "12345" },
    { key: "account", label: "Account #", placeholder: "1234567" },
  ],
  paypal: [
    { key: "email", label: "PayPal Email", placeholder: "paypal@cethos.com" },
  ],
  cash: [],
  stripe: [],
  online: [],
  terminal: [],
  account: [],
};

// ── Auto-generate display instructions from details ────────────────────────

function generateInstructions(
  code: string,
  details: Record<string, string>,
): string {
  switch (code) {
    case "etransfer":
      return details.email
        ? `Send Interac e-Transfer to: ${details.email}`
        : "";
    case "wire":
      return details.bank_name
        ? `Wire Transfer — ${details.bank_name}, Transit: ${details.transit}, Account: ${details.account}${details.swift ? ", SWIFT: " + details.swift : ""}`
        : "";
    case "cheque":
      return details.payable_to
        ? `Make cheque payable to ${details.payable_to}${details.address ? " and mail to: " + details.address : ""}`
        : "";
    case "direct_deposit":
      return details.bank_name
        ? `Direct Deposit — ${details.bank_name}, Transit: ${details.transit}, Account: ${details.account}`
        : "";
    case "paypal":
      return details.email ? `Send PayPal payment to: ${details.email}` : "";
    case "cash":
      return "Cash payment accepted at our office.";
    case "stripe":
    case "online":
      return "Pay online via credit/debit card at portal.cethos.com";
    default:
      return "";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hasPlaceholderBrackets(text: string): boolean {
  return /\[[A-Z_]+\]/.test(text || "");
}

function getDetailFields(code: string) {
  return DETAIL_FIELDS[code] || [];
}

function parseDetails(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw as Record<string, string>;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PaymentMethodsSettings() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchPayments, setBranchPayments] = useState<BranchPaymentMethod[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(
    new Set(),
  );
  const [savingBpmId, setSavingBpmId] = useState<string | null>(null);

  // Local edits for branch payment methods (keyed by bpm id)
  const [bpmEdits, setBpmEdits] = useState<
    Record<string, { details: Record<string, string>; display_instructions: string; is_enabled: boolean }>
  >({});

  // Form state for editing/adding base payment methods
  const [formData, setFormData] = useState<Partial<PaymentMethod>>({
    name: "",
    code: "",
    description: "",
    is_online: false,
    requires_staff_confirmation: false,
    is_active: true,
    icon: "credit-card",
  });

  // ── Data loading ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!supabase) return;

    try {
      const [pmResult, branchResult, bpmResult] = await Promise.all([
        supabase
          .from("payment_methods")
          .select("*")
          .order("display_order"),
        supabase
          .from("branches")
          .select("id, legal_name, code")
          .eq("is_active", true)
          .order("id"),
        supabase
          .from("branch_payment_methods")
          .select("*")
          .order("sort_order"),
      ]);

      if (pmResult.error) throw pmResult.error;
      if (branchResult.error) throw branchResult.error;
      if (bpmResult.error) throw bpmResult.error;

      const methods = pmResult.data || [];
      const branchList = branchResult.data || [];
      const bpmList = bpmResult.data || [];

      setPaymentMethods(methods);
      setBranches(branchList);
      setBranchPayments(bpmList);

      // PHASE 2: Auto-create missing branch_payment_methods rows
      const rowsToInsert: {
        branch_id: number;
        payment_method_id: string;
        is_enabled: boolean;
        details: Record<string, string>;
        display_instructions: string;
        sort_order: number;
      }[] = [];

      for (const pm of methods) {
        for (const branch of branchList) {
          const exists = bpmList.some(
            (bp) =>
              bp.payment_method_id === pm.id && bp.branch_id === branch.id,
          );
          if (!exists) {
            rowsToInsert.push({
              branch_id: branch.id,
              payment_method_id: pm.id,
              is_enabled: false,
              details: {},
              display_instructions: "",
              sort_order: pm.display_order || 0,
            });
          }
        }
      }

      if (rowsToInsert.length > 0) {
        const { data: newRows, error: insertError } = await supabase
          .from("branch_payment_methods")
          .insert(rowsToInsert)
          .select("*");

        if (insertError) {
          console.error("Error auto-creating branch payment rows:", insertError);
        } else if (newRows) {
          setBranchPayments((prev) => [...prev, ...newRows]);
        }
      }

      // Auto-expand methods that have branch-specific detail fields
      const autoExpand = new Set<string>();
      for (const pm of methods) {
        if (getDetailFields(pm.code).length > 0) {
          autoExpand.add(pm.id);
        }
      }
      setExpandedMethods(autoExpand);

      // Auto-fix BPMs that have filled details but stale placeholder instructions
      const fixedEdits: Record<string, { details: Record<string, string>; display_instructions: string; is_enabled: boolean }> = {};

      // We need the final bpm list including any newly inserted rows
      // Re-fetch if we inserted, otherwise use bpmList
      let finalBpms = bpmList;
      if (rowsToInsert.length > 0) {
        const { data: refreshed } = await supabase
          .from("branch_payment_methods")
          .select("*")
          .order("sort_order");
        if (refreshed) {
          finalBpms = refreshed;
          setBranchPayments(refreshed);
        }
      }

      for (const bpm of finalBpms) {
        const pm = methods.find((m) => m.id === bpm.payment_method_id);
        if (!pm) continue;

        const details = parseDetails(bpm.details);
        const instructions = bpm.display_instructions || "";
        const hasValues = Object.values(details).some((v) => v && v.trim().length > 0);

        // If details have real values but instructions still have placeholders, auto-generate
        if (hasValues && hasPlaceholderBrackets(instructions)) {
          const generated = generateInstructions(pm.code, details);
          if (generated) {
            fixedEdits[bpm.id] = {
              details,
              display_instructions: generated,
              is_enabled: bpm.is_enabled,
            };
          }
        }
      }

      if (Object.keys(fixedEdits).length > 0) {
        setBpmEdits(fixedEdits);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Initialize local edit state for a BPM row ────────────────────────

  const getBpmEdit = (bpm: BranchPaymentMethod) => {
    if (bpmEdits[bpm.id]) return bpmEdits[bpm.id];
    return {
      details: parseDetails(bpm.details),
      display_instructions: bpm.display_instructions || "",
      is_enabled: bpm.is_enabled,
    };
  };

  const updateBpmEdit = (
    bpmId: string,
    bpm: BranchPaymentMethod,
    patch: Partial<{ details: Record<string, string>; display_instructions: string; is_enabled: boolean }>,
    methodCode?: string,
  ) => {
    const current = getBpmEdit(bpm);
    const updated = { ...current, ...patch };

    // Auto-regenerate display instructions when detail fields change
    if (patch.details && methodCode) {
      updated.display_instructions = generateInstructions(methodCode, patch.details);
    }

    setBpmEdits((prev) => ({
      ...prev,
      [bpmId]: updated,
    }));
  };

  // ── Save a single branch payment method ──────────────────────────────

  const saveBranchPaymentMethod = async (bpm: BranchPaymentMethod) => {
    if (!supabase) return;
    const edit = getBpmEdit(bpm);

    setSavingBpmId(bpm.id);
    try {
      const { error } = await supabase
        .from("branch_payment_methods")
        .update({
          is_enabled: edit.is_enabled,
          details: edit.details,
          display_instructions: edit.display_instructions,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bpm.id);

      if (error) {
        toast.error("Save failed: " + error.message);
      } else {
        toast.success("Payment method details saved");
        // Update local state
        setBranchPayments((prev) =>
          prev.map((bp) =>
            bp.id === bpm.id
              ? {
                  ...bp,
                  is_enabled: edit.is_enabled,
                  details: edit.details,
                  display_instructions: edit.display_instructions,
                }
              : bp,
          ),
        );
        // Clear edit state for this row
        setBpmEdits((prev) => {
          const next = { ...prev };
          delete next[bpm.id];
          return next;
        });
      }
    } catch (error) {
      console.error("Error saving branch payment method:", error);
      toast.error("Failed to save");
    } finally {
      setSavingBpmId(null);
    }
  };

  // ── Base payment method CRUD (existing) ──────────────────────────────

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
      loadData();
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
      loadData();
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
        currentStatus ? "Payment method deactivated" : "Payment method activated",
      );
      loadData();
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
      loadData();
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
      loadData();
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
      loadData();
    } catch (error) {
      console.error("Error updating order:", error);
      toast.error("Failed to update order");
    }
  };

  // ── Expand/collapse ──────────────────────────────────────────────────

  const toggleExpand = (methodId: string) => {
    setExpandedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(methodId)) {
        next.delete(methodId);
      } else {
        next.add(methodId);
      }
      return next;
    });
  };

  // ── Branch config status per method ──────────────────────────────────

  const getBranchConfigStatus = (methodId: string) => {
    const bpms = branchPayments.filter((bp) => bp.payment_method_id === methodId);
    const configured = bpms.filter((bp) => {
      // Use local edit state if available, otherwise use saved data
      const edit = bpmEdits[bp.id];
      const isEnabled = edit ? edit.is_enabled : bp.is_enabled;
      const instructions = edit
        ? edit.display_instructions || ""
        : bp.display_instructions || "";
      return (
        isEnabled &&
        instructions.length > 0 &&
        !hasPlaceholderBrackets(instructions)
      );
    });
    return { total: bpms.length, configured: configured.length };
  };

  // ── Render ───────────────────────────────────────────────────────────

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
            Manage available payment methods and branch-specific receiving
            details
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
      <div className="space-y-3">
        {paymentMethods.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              No payment methods configured
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Add your first payment method
            </button>
          </div>
        ) : (
          paymentMethods.map((method, index) => {
            const isExpanded = expandedMethods.has(method.id);
            const methodBpms = branchPayments.filter(
              (bp) => bp.payment_method_id === method.id,
            );
            const hasDetailFields = getDetailFields(method.code).length > 0;
            const status = getBranchConfigStatus(method.id);

            return (
              <div
                key={method.id}
                className={`bg-white border rounded-lg overflow-hidden ${
                  !method.is_active
                    ? "border-gray-200 opacity-60"
                    : "border-gray-200"
                }`}
              >
                {/* Method header */}
                {editingId === method.id ? (
                  <div className="p-4 space-y-3">
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
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
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
                            setFormData({
                              ...formData,
                              is_online: e.target.checked,
                            })
                          }
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">
                          Online Payment
                        </span>
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
                            setFormData({
                              ...formData,
                              is_active: e.target.checked,
                            })
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
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          {/* Expand/collapse toggle */}
                          <button
                            onClick={() => toggleExpand(method.id)}
                            className="p-0.5 hover:bg-gray-100 rounded transition-transform"
                          >
                            <ChevronRight
                              className={`w-4 h-4 text-gray-400 transition-transform ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            />
                          </button>

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

                          {/* PHASE 3: Config status indicator */}
                          {status.total > 0 && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${
                                status.configured === status.total
                                  ? "bg-green-100 text-green-700"
                                  : status.configured > 0
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-50 text-red-600"
                              }`}
                            >
                              {status.configured === status.total ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3" />
                                  Configured for {status.total} branches
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3 h-3" />
                                  {status.configured}/{status.total} branches
                                  configured
                                </>
                              )}
                            </span>
                          )}
                        </div>
                        {method.description && (
                          <p className="text-sm text-gray-600 ml-7">
                            {method.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
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
                        <button
                          onClick={() =>
                            toggleActive(method.id, method.is_active)
                          }
                          className={`p-2 rounded transition-colors ${
                            method.is_active
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                          title={method.is_active ? "Deactivate" : "Activate"}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => startEdit(method)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteMethod(method.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* PHASE 1: Branch-specific receiving details (expandable) */}
                {isExpanded && (
                  <div className="border-t-2 border-indigo-100 bg-gray-50">
                    <div className="px-4 pt-3 pb-1">
                      <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                        Branch Receiving Details
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Configure payment details per branch — these appear on customer invoices
                      </p>
                    </div>
                    {branches.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">
                        No active branches found.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                        {branches.map((branch) => {
                          const bpm = methodBpms.find(
                            (bp) => bp.branch_id === branch.id,
                          );
                          if (!bpm) return null;

                          const edit = getBpmEdit(bpm);
                          const fields = getDetailFields(method.code);
                          const showWarning = hasPlaceholderBrackets(
                            edit.display_instructions,
                          );
                          const isSavingThis = savingBpmId === bpm.id;

                          return (
                            <div key={branch.id} className="p-4 space-y-3">
                              {/* Branch header */}
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-gray-800">
                                  {branch.legal_name}
                                  <span className="ml-1.5 text-xs font-normal text-gray-500">
                                    ({branch.code})
                                  </span>
                                </h4>
                                {showWarning && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Placeholder
                                  </span>
                                )}
                                {!showWarning &&
                                  edit.is_enabled &&
                                  edit.display_instructions.length > 0 && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Ready
                                    </span>
                                  )}
                              </div>

                              {/* Enabled toggle */}
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={edit.is_enabled}
                                  onChange={(e) =>
                                    updateBpmEdit(bpm.id, bpm, {
                                      is_enabled: e.target.checked,
                                    })
                                  }
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-700">
                                  Enabled for this branch
                                </span>
                              </label>

                              {/* Detail input fields */}
                              {fields.length > 0 && (
                                <div className="space-y-2">
                                  {fields.map((field) => (
                                    <div key={field.key}>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        {field.label}
                                      </label>
                                      {field.type === "textarea" ? (
                                        <textarea
                                          value={edit.details[field.key] || ""}
                                          onChange={(e) => {
                                            const newDetails = {
                                              ...edit.details,
                                              [field.key]: e.target.value,
                                            };
                                            updateBpmEdit(bpm.id, bpm, {
                                              details: newDetails,
                                            }, method.code);
                                          }}
                                          rows={2}
                                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                                          placeholder={field.placeholder}
                                        />
                                      ) : (
                                        <input
                                          type="text"
                                          value={edit.details[field.key] || ""}
                                          onChange={(e) => {
                                            const newDetails = {
                                              ...edit.details,
                                              [field.key]: e.target.value,
                                            };
                                            updateBpmEdit(bpm.id, bpm, {
                                              details: newDetails,
                                            }, method.code);
                                          }}
                                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                                          placeholder={field.placeholder}
                                        />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Display instructions */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Invoice Display Text
                                </label>
                                <textarea
                                  value={edit.display_instructions}
                                  onChange={(e) =>
                                    updateBpmEdit(bpm.id, bpm, {
                                      display_instructions: e.target.value,
                                    })
                                  }
                                  rows={2}
                                  className={`w-full px-3 py-1.5 border rounded text-sm ${
                                    showWarning
                                      ? "border-amber-300 bg-amber-50"
                                      : "border-gray-300"
                                  }`}
                                  placeholder="Text that appears on customer invoices"
                                />
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    const generated = generateInstructions(
                                      method.code,
                                      edit.details,
                                    );
                                    updateBpmEdit(bpm.id, bpm, {
                                      display_instructions: generated,
                                    });
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                                  title="Generate invoice text from detail fields"
                                >
                                  <Wand2 className="w-3 h-3" />
                                  Auto-generate
                                </button>
                                <button
                                  onClick={() => saveBranchPaymentMethod(bpm)}
                                  disabled={isSavingThis}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                  {isSavingThis ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Save className="w-3 h-3" />
                                  )}
                                  {isSavingThis ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
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
