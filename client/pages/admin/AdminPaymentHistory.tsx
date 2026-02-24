import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import {
  RefreshCw,
  ChevronLeft,
  Receipt,
  Copy,
  Check,
  Send,
  Loader2,
  Pencil,
  XCircle,
  X,
} from "lucide-react";
import { format } from "date-fns";

interface PaymentRequest {
  id: string;
  amount: number;
  status: string;
  stripe_payment_link_url: string | null;
  email_sent_to: string | null;
  email_sent_at: string | null;
  reminder_sent_at: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
  customers: {
    full_name: string | null;
    email: string | null;
  } | null;
}

type FilterTab = "all" | "pending" | "paid" | "expired";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "expired", label: "Expired" },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    expired: "bg-gray-100 text-gray-700",
    cancelled: "bg-red-100 text-red-700",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    paid: "Paid",
    expired: "Expired",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[status] || "bg-gray-100 text-gray-700"}`}
    >
      {labels[status] || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
      aria-label="Copy payment URL"
      title="Copy payment URL"
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-600" />
      ) : (
        <Copy className="w-4 h-4 text-gray-500" />
      )}
    </button>
  );
}

export default function AdminPaymentHistory() {
  const { session, loading: authLoading } = useAdminAuthContext();
  const [records, setRecords] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [rowStates, setRowStates] = useState<
    Record<string, "idle" | "loading" | "success" | "error">
  >({});
  const [cancelStates, setCancelStates] = useState<
    Record<string, "idle" | "loading" | "success" | "error">
  >({});

  // Edit modal state
  const [editingRecord, setEditingRecord] = useState<PaymentRequest | null>(
    null,
  );
  const [editForm, setEditForm] = useState({
    email: "",
    full_name: "",
    amount: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("payment_requests")
      .select(
        `
        id,
        amount,
        status,
        stripe_payment_link_url,
        email_sent_to,
        email_sent_at,
        reminder_sent_at,
        paid_at,
        expires_at,
        created_at,
        customers (
          full_name,
          email
        )
      `,
      )
      .eq("reason", "deposit")
      .order("created_at", { ascending: false })
      .limit(100);

    if (fetchError) {
      setError("Failed to load payment links. Please try again.");
      setRecords([]);
    } else {
      setRecords((data as PaymentRequest[]) || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, fetchData]);

  const filteredRecords =
    activeTab === "all"
      ? records
      : records.filter((r) => r.status === activeTab);

  const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    return format(new Date(value), "MMM d, yyyy h:mm a");
  };

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    return format(new Date(value), "MMM d, yyyy");
  };

  const formatAmount = (amount: number) => {
    return `$${amount.toFixed(2)} CAD`;
  };

  const handleSendReminder = async (rowId: string) => {
    setRowStates((prev) => ({ ...prev, [rowId]: "loading" }));

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "send-deposit-reminder",
        {
          body: {
            payment_request_id: rowId,
            staff_id: session!.staffId,
          },
        },
      );

      if (fnError || !data?.success) {
        setRowStates((prev) => ({ ...prev, [rowId]: "error" }));
        setTimeout(() => {
          setRowStates((prev) => ({ ...prev, [rowId]: "idle" }));
        }, 5000);
        return;
      }

      // Update reminder_sent_at in local state
      setRecords((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, reminder_sent_at: data.reminder_sent_at }
            : r,
        ),
      );
      setRowStates((prev) => ({ ...prev, [rowId]: "success" }));
      setTimeout(() => {
        setRowStates((prev) => ({ ...prev, [rowId]: "idle" }));
      }, 3000);
    } catch {
      setRowStates((prev) => ({ ...prev, [rowId]: "error" }));
      setTimeout(() => {
        setRowStates((prev) => ({ ...prev, [rowId]: "idle" }));
      }, 5000);
    }
  };

  const handleCancelPayment = async (rowId: string) => {
    setCancelStates((prev) => ({ ...prev, [rowId]: "loading" }));

    try {
      const { error: updateError } = await supabase
        .from("payment_requests")
        .update({ status: "cancelled" })
        .eq("id", rowId);

      if (updateError) {
        setCancelStates((prev) => ({ ...prev, [rowId]: "error" }));
        setTimeout(() => {
          setCancelStates((prev) => ({ ...prev, [rowId]: "idle" }));
        }, 5000);
        return;
      }

      // Update status in local state
      setRecords((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, status: "cancelled" } : r,
        ),
      );
      setCancelStates((prev) => ({ ...prev, [rowId]: "success" }));
      setTimeout(() => {
        setCancelStates((prev) => ({ ...prev, [rowId]: "idle" }));
      }, 3000);
    } catch {
      setCancelStates((prev) => ({ ...prev, [rowId]: "error" }));
      setTimeout(() => {
        setCancelStates((prev) => ({ ...prev, [rowId]: "idle" }));
      }, 5000);
    }
  };

  const openEditModal = (record: PaymentRequest) => {
    setEditingRecord(record);
    setEditForm({
      email: record.email_sent_to || "",
      full_name: record.customers?.full_name || "",
      amount: String(record.amount),
    });
    setEditError(null);
    setEditSaving(false);
  };

  const handleEditSave = async () => {
    if (!editingRecord) return;

    const parsedAmount = parseFloat(editForm.amount);
    if (!editForm.email.trim() || !editForm.full_name.trim()) {
      setEditError("Email and full name are required.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditError("Amount must be greater than 0.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      const { error: updateError } = await supabase
        .from("payment_requests")
        .update({
          amount: parsedAmount,
          email_sent_to: editForm.email.trim(),
        })
        .eq("id", editingRecord.id);

      if (updateError) {
        setEditError("Failed to save changes. Please try again.");
        setEditSaving(false);
        return;
      }

      // Update local state
      setRecords((prev) =>
        prev.map((r) =>
          r.id === editingRecord.id
            ? {
                ...r,
                amount: parsedAmount,
                email_sent_to: editForm.email.trim(),
                customers: r.customers
                  ? { ...r.customers, full_name: editForm.full_name.trim() }
                  : { full_name: editForm.full_name.trim(), email: editForm.email.trim() },
              }
            : r,
        ),
      );
      setEditingRecord(null);
    } catch {
      setEditError("Something went wrong. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  if (authLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to="/admin/quick-payment"
            className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-800 font-medium mb-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Quick Payment
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">
            Deposit Payment Links
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            All payment links sent to customers via Quick Payment
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.key
                ? "bg-teal-600 text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paid At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Payment URL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    <p className="text-gray-500 mt-2">Loading...</p>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">
                      No deposit payment links found
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Payment links sent via Quick Payment will appear here
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {record.customers?.full_name ||
                          record.email_sent_to ||
                          "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-500">
                        {record.email_sent_to || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">
                        {formatAmount(record.amount)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">
                        {formatDateTime(record.email_sent_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">
                        {formatDateTime(record.paid_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">
                        {formatDate(record.expires_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {record.stripe_payment_link_url ? (
                        <CopyButton url={record.stripe_payment_link_url} />
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {record.status === "pending" ? (
                        <div className="flex items-center gap-1.5">
                          {/* Edit */}
                          <button
                            onClick={() => openEditModal(record)}
                            className="p-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                            title="Edit payment"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Send Reminder / Resend */}
                          <button
                            onClick={() => handleSendReminder(record.id)}
                            disabled={
                              (rowStates[record.id] || "idle") === "loading"
                            }
                            className="p-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              record.reminder_sent_at
                                ? "Remind Again"
                                : "Send Reminder"
                            }
                          >
                            {(rowStates[record.id] || "idle") === "loading" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Cancel */}
                          <button
                            onClick={() => handleCancelPayment(record.id)}
                            disabled={
                              (cancelStates[record.id] || "idle") === "loading"
                            }
                            className="p-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Cancel payment"
                          >
                            {(cancelStates[record.id] || "idle") ===
                            "loading" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Inline status messages */}
                          {(rowStates[record.id] || "idle") === "success" && (
                            <span className="text-xs text-green-600 font-medium ml-1">
                              ✓ Sent
                            </span>
                          )}
                          {(rowStates[record.id] || "idle") === "error" && (
                            <span className="text-xs text-red-600 font-medium ml-1">
                              Failed
                            </span>
                          )}
                          {(cancelStates[record.id] || "idle") ===
                            "success" && (
                            <span className="text-xs text-green-600 font-medium ml-1">
                              ✓ Cancelled
                            </span>
                          )}
                          {(cancelStates[record.id] || "idle") === "error" && (
                            <span className="text-xs text-red-600 font-medium ml-1">
                              Cancel failed
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setEditingRecord(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                Edit Payment Request
              </h2>
              <button
                onClick={() => setEditingRecord(null)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (CAD)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Error */}
              {editError && (
                <p className="text-sm text-red-600">{editError}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {editSaving && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
