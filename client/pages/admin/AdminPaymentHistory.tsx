import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import {
  RefreshCw,
  ChevronLeft,
  Receipt,
  Copy,
  Check,
  Bell,
  Loader2,
  Pencil,
  X,
  Trash2,
  Search,
} from "lucide-react";
import { format, subDays } from "date-fns";

interface PaymentRequest {
  id: string;
  amount: number;
  status: string;
  stripe_payment_link_url: string | null;
  email_sent_to: string | null;
  email_sent_at: string | null;
  reminder_sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  customers: {
    full_name: string | null;
    email: string | null;
  } | null;
}

type FilterTab = "all" | "pending" | "paid" | "cancelled";

type RowActionState = "idle" | "reminding" | "cancelling" | "copying";
type RowFeedback = { type: "success" | "error"; message: string } | null;

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getDefaultFromDate(): string {
  return format(subDays(new Date(), 7), "yyyy-MM-dd");
}

function getDefaultToDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

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

/** Icon-only action button with tooltip */
function ActionIconButton({
  onClick,
  disabled,
  title,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className ?? "hover:bg-gray-100 text-gray-500"}`}
    >
      {children}
    </button>
  );
}

export default function AdminPaymentHistory() {
  const { session, loading: authLoading } = useAdminAuthContext();
  const currentStaffId = session?.staffId ?? null;

  const [records, setRecords] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // Date range filters
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(getDefaultToDate);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Per-row action state
  const [rowActionStates, setRowActionStates] = useState<
    Record<string, RowActionState>
  >({});
  const [rowFeedback, setRowFeedback] = useState<
    Record<string, RowFeedback>
  >({});

  // Reminder counts
  const [rowReminderCounts, setRowReminderCounts] = useState<
    Record<string, number>
  >({});

  // Dismissed rows
  const [dismissedRows, setDismissedRows] = useState<Set<string>>(new Set());

  // Inline cancel confirmation state
  const [cancelConfirmRow, setCancelConfirmRow] = useState<string | null>(null);

  // Copy feedback per row
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  // Edit & Resend modal state
  const [editingRecord, setEditingRecord] = useState<PaymentRequest | null>(
    null,
  );
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const setRowState = (id: string, state: RowActionState) =>
    setRowActionStates((prev) => ({ ...prev, [id]: state }));

  const showFeedback = (id: string, feedback: RowFeedback, ms = 3000) => {
    setRowFeedback((prev) => ({ ...prev, [id]: feedback }));
    setTimeout(() => setRowFeedback((prev) => ({ ...prev, [id]: null })), ms);
  };

  const fetchPaymentRequests = useCallback(
    async (from: string, to: string) => {
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
        created_at,
        customers (
          full_name,
          email
        )
      `,
        )
        .eq("reason", "deposit")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(200);

      if (fetchError) {
        setError("Failed to load payment links. Please try again.");
        setRecords([]);
      } else {
        setRecords((data as PaymentRequest[]) || []);
      }

      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (session) {
      fetchPaymentRequests(fromDate, toDate);
    }
  }, [session, fromDate, toDate, fetchPaymentRequests]);

  // Client-side filtering: tab + search + dismissed
  const displayRows = useMemo(() => {
    let rows = records;

    // Tab filter
    if (activeTab !== "all") {
      rows = rows.filter((r) => r.status === activeTab);
    }

    // Search filter (client-side on name and email)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter((r) => {
        const name = r.customers?.full_name?.toLowerCase() ?? "";
        const email = (r.email_sent_to ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    // Dismissed rows filter
    rows = rows.filter((r) => !dismissedRows.has(r.id));

    return rows;
  }, [records, activeTab, searchQuery, dismissedRows]);

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

  const handleClearFilters = () => {
    setFromDate(getDefaultFromDate());
    setToDate(getDefaultToDate());
    setSearchQuery("");
  };

  // --- Copy URL ---
  const handleCopyUrl = async (row: PaymentRequest) => {
    if (!row.stripe_payment_link_url) return;

    try {
      await navigator.clipboard.writeText(row.stripe_payment_link_url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = row.stripe_payment_link_url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedRow(row.id);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  // --- Remind ---
  const handleSendReminder = async (row: PaymentRequest) => {
    if (!currentStaffId) {
      showFeedback(
        row.id,
        { type: "error", message: "Session error — please refresh the page" },
        5000,
      );
      return;
    }

    setRowState(row.id, "reminding");

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/send-deposit-reminder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            payment_request_id: row.id,
            staff_id: currentStaffId,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to send reminder");
      }

      // Update reminder_sent_at in local state
      setRecords((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, reminder_sent_at: data.reminder_sent_at }
            : r,
        ),
      );
      // Increment reminder count
      setRowReminderCounts((prev) => ({
        ...prev,
        [row.id]: (prev[row.id] ?? 0) + 1,
      }));
      showFeedback(row.id, { type: "success", message: "Reminder sent" }, 3000);
    } catch (err: any) {
      showFeedback(
        row.id,
        { type: "error", message: err.message || "Failed — try again" },
        5000,
      );
    } finally {
      setRowState(row.id, "idle");
    }
  };

  // --- Edit & Resend ---
  const openEditModal = (record: PaymentRequest) => {
    setEditingRecord(record);
    setEditAmount(String(record.amount));
    setEditNotes("");
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingRecord(null);
    setEditAmount("");
    setEditNotes("");
    setEditError(null);
  };

  const handleEditConfirm = async () => {
    if (!editingRecord) return;

    if (!currentStaffId) {
      showFeedback(
        editingRecord.id,
        { type: "error", message: "Session error — please refresh the page" },
        5000,
      );
      closeEditModal();
      return;
    }

    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditError("Amount must be greater than 0.");
      return;
    }

    setRowState(editingRecord.id, "cancelling");

    try {
      // Step 1: Cancel the old payment_request row
      const { error: cancelError } = await supabase
        .from("payment_requests")
        .update({ status: "cancelled" })
        .eq("id", editingRecord.id);

      if (cancelError) throw new Error("Failed to cancel existing link");

      // Step 2: Create new payment link
      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-deposit-payment-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            email: editingRecord.email_sent_to,
            amount: parsedAmount,
            notes: editNotes,
            staff_id: currentStaffId,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create new payment link");
      }

      showFeedback(
        editingRecord.id,
        { type: "success", message: "New link sent" },
        3000,
      );
      closeEditModal();

      // Refresh the list
      fetchPaymentRequests(fromDate, toDate);
    } catch (err: any) {
      showFeedback(
        editingRecord.id,
        { type: "error", message: err.message || "Failed — try again" },
        5000,
      );
    } finally {
      setRowState(editingRecord.id, "idle");
    }
  };

  // --- Cancel ---
  const handleCancelPayment = async (row: PaymentRequest) => {
    if (!currentStaffId) {
      showFeedback(
        row.id,
        { type: "error", message: "Session error — please refresh the page" },
        5000,
      );
      return;
    }

    setRowState(row.id, "cancelling");

    try {
      const { error } = await supabase
        .from("payment_requests")
        .update({ status: "cancelled" })
        .eq("id", row.id);

      if (error) throw new Error("Failed to cancel payment link");

      // Update status in local state immediately
      setRecords((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, status: "cancelled" } : r,
        ),
      );
      showFeedback(row.id, { type: "success", message: "Link cancelled" }, 3000);
    } catch (err: any) {
      showFeedback(
        row.id,
        { type: "error", message: err.message || "Failed — try again" },
        5000,
      );
    } finally {
      setRowState(row.id, "idle");
      setCancelConfirmRow(null);
    }
  };

  // --- Dismiss ---
  const handleDismiss = (rowId: string) => {
    setDismissedRows((prev) => new Set(prev).add(rowId));
  };

  // --- Render action icons per row ---
  const renderActions = (record: PaymentRequest) => {
    const rowState = rowActionStates[record.id] || "idle";
    const feedback = rowFeedback[record.id];
    const isRowBusy = rowState !== "idle";
    const isCopied = copiedRow === record.id;
    const reminderCount = rowReminderCounts[record.id] ?? 0;
    const hasUrl = !!record.stripe_payment_link_url;

    // Copy URL icon (shared across statuses)
    const copyIcon = (
      <ActionIconButton
        onClick={() => handleCopyUrl(record)}
        disabled={isRowBusy || !hasUrl}
        title="Copy Payment URL"
        className={
          !hasUrl
            ? "text-gray-300 cursor-not-allowed"
            : "hover:bg-gray-100 text-gray-500"
        }
      >
        {isCopied ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </ActionIconButton>
    );

    if (record.status === "pending") {
      // Inline cancel confirmation
      if (cancelConfirmRow === record.id) {
        return (
          <div className="flex items-center gap-1" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            <span className="text-xs text-gray-600 mr-1">Sure?</span>
            <ActionIconButton
              onClick={() => handleCancelPayment(record)}
              disabled={isRowBusy}
              title="Confirm Cancel"
              className="hover:bg-green-100 text-green-600"
            >
              {rowState === "cancelling" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </ActionIconButton>
            <ActionIconButton
              onClick={() => setCancelConfirmRow(null)}
              disabled={isRowBusy}
              title="Dismiss"
              className="hover:bg-gray-100 text-gray-500"
            >
              <X className="w-4 h-4" />
            </ActionIconButton>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {/* Bell — Remind */}
            <ActionIconButton
              onClick={() => handleSendReminder(record)}
              disabled={isRowBusy}
              title="Send Reminder"
              className="hover:bg-gray-100 text-gray-500"
            >
              {rowState === "reminding" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <div className="relative">
                  <Bell className="w-4 h-4" />
                  {record.reminder_sent_at && reminderCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-white"
                      style={{
                        width: 14,
                        height: 14,
                        fontSize: 9,
                        backgroundColor: "#0891b2",
                        lineHeight: 1,
                      }}
                    >
                      {reminderCount}
                    </span>
                  )}
                </div>
              )}
            </ActionIconButton>

            {/* Pencil — Edit & Resend */}
            <ActionIconButton
              onClick={() => openEditModal(record)}
              disabled={isRowBusy}
              title="Edit & Resend"
              className="hover:bg-gray-100 text-gray-500"
            >
              <Pencil className="w-4 h-4" />
            </ActionIconButton>

            {/* Trash — Cancel */}
            <ActionIconButton
              onClick={() => setCancelConfirmRow(record.id)}
              disabled={isRowBusy}
              title="Cancel Link"
              className="hover:bg-gray-100 text-gray-500"
            >
              <Trash2 className="w-4 h-4" />
            </ActionIconButton>

            {/* Copy — Copy URL */}
            {copyIcon}
          </div>

          {/* Row feedback message */}
          {feedback && (
            <span
              className={`text-xs font-medium ${
                feedback.type === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {feedback.message}
            </span>
          )}
        </div>
      );
    }

    if (record.status === "paid") {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {copyIcon}
          </div>
          {feedback && (
            <span
              className={`text-xs font-medium ${
                feedback.type === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {feedback.message}
            </span>
          )}
        </div>
      );
    }

    if (record.status === "cancelled") {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {copyIcon}
            {/* X — Dismiss */}
            <ActionIconButton
              onClick={() => handleDismiss(record.id)}
              disabled={isRowBusy}
              title="Dismiss"
              className="hover:bg-gray-100 text-gray-400"
            >
              <X className="w-4 h-4" />
            </ActionIconButton>
          </div>
          {feedback && (
            <span
              className={`text-xs font-medium ${
                feedback.type === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {feedback.message}
            </span>
          )}
        </div>
      );
    }

    // Fallback for any other status (e.g. expired)
    return <span className="text-sm text-gray-400">—</span>;
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
          onClick={() => fetchPaymentRequests(fromDate, toDate)}
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
      <div className="flex gap-2 mb-4">
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

      {/* Filters Bar */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        {/* From date */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {/* To date */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            &nbsp;
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Clear filters */}
        <button
          onClick={handleClearFilters}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors pb-2"
        >
          Clear filters
        </button>
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                    <p className="text-gray-500 mt-2">Loading...</p>
                  </td>
                </tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
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
                displayRows.map((record) => (
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
                      <p
                        className="text-sm text-gray-500"
                        style={{
                          maxWidth: 160,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={record.email_sent_to || undefined}
                      >
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
                    <td className="px-4 py-3">{renderActions(record)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit & Resend Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeEditModal}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                Edit & Resend Payment Link
              </h2>
              <button
                onClick={closeEditModal}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer
                </label>
                <p className="text-sm text-gray-900 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  {editingRecord.customers?.full_name ||
                    editingRecord.email_sent_to ||
                    "—"}
                </p>
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <p className="text-sm text-gray-900 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  {editingRecord.email_sent_to || "—"}
                </p>
              </div>

              {/* Amount (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (CAD)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Notes (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
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
                onClick={closeEditModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditConfirm}
                disabled={
                  (rowActionStates[editingRecord.id] || "idle") !== "idle"
                }
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {(rowActionStates[editingRecord.id] || "idle") !== "idle" && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Confirm & Resend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
