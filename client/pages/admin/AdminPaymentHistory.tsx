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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendReminder(record.id)}
                            disabled={
                              (rowStates[record.id] || "idle") === "loading"
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {(rowStates[record.id] || "idle") === "loading" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            {record.reminder_sent_at
                              ? "Remind Again"
                              : "Send Reminder"}
                          </button>
                          {(rowStates[record.id] || "idle") === "success" && (
                            <span className="text-xs text-green-600 font-medium">
                              ✓ Sent
                            </span>
                          )}
                          {(rowStates[record.id] || "idle") === "error" && (
                            <span className="text-xs text-red-600 font-medium">
                              Failed — try again
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
    </div>
  );
}
