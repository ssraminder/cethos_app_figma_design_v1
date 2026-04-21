import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  FileText,
  Download,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ClipboardList,
  Mail,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { callPaymentApi, formatCurrency as fmtPayCurrency, formatDate as fmtPayDate } from "@/lib/payment-api";
import RecordPaymentModal from "./RecordPaymentModal";
import SendInvoiceEmailModal from "./SendInvoiceEmailModal";

interface InvoiceData {
  id: string;
  invoice_number: string;
  order_id: string | null;
  status: string;
  type: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  pdf_storage_path: string | null;
  invoicing_branch_id: string | null;
  po_number: string | null;
  currency: string | null;
  voided_at: string | null;
}

interface BranchInfo {
  id: string;
  legal_name: string;
  code: string;
}

interface LineInfo {
  order_count: number;
  custom_count: number;
}

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  sent: "bg-indigo-100 text-indigo-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-400",
  draft: "bg-gray-100 text-gray-600",
};

function fmtDate(val: string | null): string {
  if (!val) return "—";
  try {
    return format(new Date(val), "MMMM d, yyyy");
  } catch {
    return val;
  }
}

function fmtCurrency(val: number, currency = "CAD"): string {
  return val.toLocaleString("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

interface OrderInvoiceCardProps {
  orderId: string;
  customerId: string;
  staffId: string;
}

export default function OrderInvoiceCard({ orderId, customerId, staffId }: OrderInvoiceCardProps) {
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [lineInfo, setLineInfo] = useState<LineInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; missing?: string[] } | null>(null);

  const fetchInvoice = useCallback(async () => {
    // Check direct link (single-order invoice)
    const { data: directInvoice } = await supabase
      .from("customer_invoices")
      .select("id, invoice_number, order_id, status, type, invoice_date, due_date, total_amount, amount_paid, balance_due, pdf_storage_path, invoicing_branch_id, po_number, currency, voided_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Also check multi-order invoices via line items
    let multiInvoice: InvoiceData | null = null;
    if (!directInvoice) {
      const { data: line } = await supabase
        .from("customer_invoice_lines")
        .select("invoice_id")
        .eq("order_id", orderId)
        .limit(1)
        .maybeSingle();
      if (line) {
        const { data: inv } = await supabase
          .from("customer_invoices")
          .select("id, invoice_number, order_id, status, type, invoice_date, due_date, total_amount, amount_paid, balance_due, pdf_storage_path, invoicing_branch_id, po_number, currency, voided_at")
          .eq("id", line.invoice_id)
          .single();
        multiInvoice = inv as InvoiceData | null;
      }
    }

    const found = (directInvoice || multiInvoice) as InvoiceData | null;
    setInvoice(found);

    // If multi-order invoice, fetch line info
    if (found && !found.order_id) {
      const { data: lines } = await supabase
        .from("customer_invoice_lines")
        .select("id, order_id, line_type")
        .eq("invoice_id", found.id);
      if (lines) {
        const orderIds = new Set(lines.filter((l) => l.order_id).map((l) => l.order_id));
        const customCount = lines.filter((l) => l.line_type === "custom").length;
        setLineInfo({ order_count: orderIds.size, custom_count: customCount });
      }
    } else {
      setLineInfo(null);
    }

    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetchInvoice();
    supabase
      .from("branches")
      .select("id, legal_name, code")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setBranches(data);
      });
    supabase
      .from("customers")
      .select("email")
      .eq("id", customerId)
      .single()
      .then(({ data }) => {
        if (data?.email) setCustomerEmail(data.email);
      });
  }, [fetchInvoice, customerId]);

  const branchName = invoice?.invoicing_branch_id
    ? branches.find((b) => b.id === invoice.invoicing_branch_id)?.legal_name || "—"
    : "—";

  const handleQuickInvoice = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: "create_invoice",
            order_ids: [orderId],
            as_draft: false,
            staff_id: staffId,
          }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        setError({
          message: result.error || "Failed to generate invoice",
          missing: result.missing,
        });
        return;
      }
      toast.success(`Invoice generated: ${result.invoice_number}`);
      await fetchInvoice();
    } catch (err: any) {
      setError({ message: err.message || "Network error generating invoice" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!invoice?.pdf_storage_path) return;
    setDownloading(true);
    try {
      const { data, error: storageError } = await supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.pdf_storage_path, 3600);
      if (storageError || !data?.signedUrl) {
        toast.error("Failed to get download URL");
        return;
      }
      window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!invoice) return;
    if (!window.confirm("Regenerate the invoice PDF? This will replace the existing PDF.")) return;
    setRegenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: "generate_pdf",
            invoice_id: invoice.id,
            regenerate: true,
          }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        toast.error(result.error || "Failed to regenerate PDF");
        return;
      }
      toast.success("Invoice PDF regenerated");
      await fetchInvoice();
    } catch {
      toast.error("Failed to regenerate PDF");
    } finally {
      setRegenerating(false);
    }
  };

  const handleIssue = async () => {
    if (!invoice) return;
    if (!window.confirm("Issue this invoice? It will be finalized and the PDF generated.")) return;
    setIssuing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "issue", invoice_id: invoice.id }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        toast.error(result.error || "Failed to issue invoice");
        return;
      }
      toast.success("Invoice issued successfully");
      await fetchInvoice();
    } catch {
      toast.error("Failed to issue invoice");
    } finally {
      setIssuing(false);
    }
  };

  const handleVoid = async () => {
    if (!invoice) return;
    if (!window.confirm("Void this invoice? This will reset associated orders to unbilled.")) return;
    setVoiding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "void", invoice_id: invoice.id }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        toast.error(result.error || "Failed to void invoice");
        return;
      }
      toast.success("Invoice voided");
      await fetchInvoice();
    } catch {
      toast.error("Failed to void invoice");
    } finally {
      setVoiding(false);
    }
  };

  const handleSendEmail = async (customMessage: string, emails: string[]) => {
    if (!invoice) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            invoice_id: invoice.id,
            custom_message: customMessage || undefined,
            recipient_emails: emails,
          }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        toast.error(result.error || "Failed to send invoice email");
        return;
      }
      toast.success(`Invoice emailed to ${result.sent_to || "customer"}`);
      setShowSendEmailModal(false);
      await fetchInvoice();
    } catch {
      toast.error("Failed to send invoice email");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading invoice…</span>
        </div>
      </div>
    );
  }

  const status = invoice?.status || "";
  const isVoid = status === "void";

  // Determine available actions by status
  const canDownload = invoice?.pdf_storage_path;
  const canIssue = status === "draft";
  const canVoid = ["draft", "issued", "sent"].includes(status);
  const canRegenerate = ["draft", "issued", "paid"].includes(status);
  const canSendEmail = ["issued", "sent"].includes(status) && invoice?.pdf_storage_path;

  // ── State 1: No invoice ──
  if (!invoice) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Invoice</h3>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p>{error.message}</p>
                {error.missing && (
                  <div className="mt-2 flex gap-3">
                    <Link
                      to={`/admin/customers/${customerId}`}
                      className="text-amber-900 underline hover:no-underline text-xs font-medium"
                    >
                      Edit Customer Profile →
                    </Link>
                    <Link
                      to="/admin/settings/branches"
                      className="text-amber-900 underline hover:no-underline text-xs font-medium"
                    >
                      Branch Settings →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-sm text-gray-500 mb-4">No invoice generated for this order.</p>

        <div className="flex items-center gap-3">
          <button
            onClick={handleQuickInvoice}
            disabled={generating}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Quick Invoice
              </>
            )}
          </button>

          <button
            onClick={() =>
              navigate(
                `/admin/invoices/create?customer_id=${customerId}&preselect=${orderId}`
              )
            }
            className="text-blue-600 text-sm hover:underline inline-flex items-center gap-1"
          >
            <ClipboardList className="w-4 h-4" />
            Add to Multi-Order Invoice →
          </button>
        </div>
      </div>
    );
  }

  // ── State 2: Invoice exists ──
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">Invoice</h3>
      </div>

      {/* Invoice header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</span>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
            STATUS_STYLES[status] || "bg-gray-100 text-gray-600"
          }`}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>

      {/* Invoice details */}
      <div className="text-sm text-gray-600 space-y-1 mb-4">
        <p>
          Date: {fmtDate(invoice.invoice_date)} · Due: {fmtDate(invoice.due_date)}
        </p>
        <p>
          Total: {fmtCurrency(invoice.total_amount, invoice.currency || "CAD")} ·{" "}
          Balance:{" "}
          <span
            className={
              invoice.balance_due > 0
                ? "text-red-600 font-bold"
                : "text-green-600 font-medium"
            }
          >
            {fmtCurrency(invoice.balance_due, invoice.currency || "CAD")}
            {invoice.balance_due === 0 && " — PAID"}
          </span>
        </p>
        <p>Branch: {branchName}</p>
        {invoice.po_number && <p>PO: {invoice.po_number}</p>}

        {/* Multi-order context */}
        {!invoice.order_id && lineInfo && (
          <p>
            Type: {invoice.type === "credit_note" ? "Credit Note" : "Invoice"} (
            {lineInfo.order_count} order{lineInfo.order_count !== 1 ? "s" : ""}
            {lineInfo.custom_count > 0
              ? ` + ${lineInfo.custom_count} custom line${lineInfo.custom_count !== 1 ? "s" : ""}`
              : ""}
            )
          </p>
        )}
      </div>

      {/* Voided notice */}
      {isVoid && invoice.voided_at && (
        <p className="text-sm text-gray-400 italic mb-3">
          Voided on {fmtDate(invoice.voided_at)}
        </p>
      )}

      {/* Invoice Payment Allocations */}
      {invoice && !isVoid && (
        <InvoicePaymentsSection
          invoiceId={invoice.id}
          balanceDue={invoice.balance_due}
          customerId={customerId}
          currency={invoice.currency || "CAD"}
        />
      )}

      {/* Email History */}
      {invoice && (
        <InvoiceEmailHistory invoiceId={invoice.id} />
      )}

      {/* Actions */}
      {!isVoid && (
        <div className="flex flex-wrap gap-2">
          {canDownload && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-md hover:bg-gray-200 inline-flex items-center gap-1.5"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Download PDF
            </button>
          )}

          {canRegenerate && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-md hover:bg-gray-200 inline-flex items-center gap-1.5"
            >
              {regenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Regenerate
            </button>
          )}

          {canIssue && (
            <button
              onClick={handleIssue}
              disabled={issuing}
              className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-md hover:bg-gray-200 inline-flex items-center gap-1.5"
            >
              {issuing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              )}
              Issue
            </button>
          )}

          {canSendEmail && (
            <button
              onClick={() => setShowSendEmailModal(true)}
              className="bg-indigo-50 text-indigo-700 text-sm px-3 py-1.5 rounded-md hover:bg-indigo-100 inline-flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              Send by Email
            </button>
          )}

          {canVoid && (
            <button
              onClick={handleVoid}
              disabled={voiding}
              className="text-red-600 hover:text-red-800 text-sm px-3 py-1.5 rounded-md hover:bg-red-50 inline-flex items-center gap-1.5"
            >
              {voiding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              Void
            </button>
          )}
        </div>
      )}

      {/* Send Invoice Email Modal */}
      {invoice && (
        <SendInvoiceEmailModal
          isOpen={showSendEmailModal}
          onClose={() => setShowSendEmailModal(false)}
          onSend={handleSendEmail}
          invoiceNumber={invoice.invoice_number}
          customerEmail={customerEmail || "No email on file"}
          isSending={sending}
        />
      )}

      {/* Generate new invoice after voiding */}
      {isVoid && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <p className="text-sm text-gray-600 mb-3">
            This invoice has been voided. You can generate a replacement invoice.
          </p>

          {error && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 mb-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p>{error.message}</p>
                  {error.missing && (
                    <div className="mt-2 flex gap-3">
                      <Link
                        to={`/admin/customers/${customerId}`}
                        className="text-amber-900 underline hover:no-underline text-xs font-medium"
                      >
                        Edit Customer Profile →
                      </Link>
                      <Link
                        to="/admin/settings/branches"
                        className="text-amber-900 underline hover:no-underline text-xs font-medium"
                      >
                        Branch Settings →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleQuickInvoice}
              disabled={generating}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate New Invoice
                </>
              )}
            </button>

            <button
              onClick={() =>
                navigate(
                  `/admin/invoices/create?customer_id=${customerId}&preselect=${orderId}`
                )
              }
              className="text-blue-600 text-sm hover:underline inline-flex items-center gap-1"
            >
              <ClipboardList className="w-4 h-4" />
              Add to Multi-Order Invoice →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Invoice Email History sub-section ──────────────────────────── */

interface EmailLogRow {
  id: string;
  sent_to: string;
  status: string;
  subject: string | null;
  custom_message: string | null;
  error_message: string | null;
  created_at: string;
}

function InvoiceEmailHistory({ invoiceId }: { invoiceId: string }) {
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("invoice_email_log")
          .select("id, sent_to, status, subject, custom_message, error_message, created_at")
          .eq("invoice_id", invoiceId)
          .order("created_at", { ascending: false });
        setLogs((data as EmailLogRow[]) || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [invoiceId]);

  if (loading || logs.length === 0) return null;

  const statusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
            <CheckCircle className="w-3 h-3" />
            Sent
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      case "bounced":
        return (
          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
            <AlertTriangle className="w-3 h-3" />
            Bounced
          </span>
        );
      default:
        return <span className="text-[10px] text-gray-500">{status}</span>;
    }
  };

  const formatLogDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="border-t border-gray-200 pt-3 mt-3 mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full mb-2"
      >
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide inline-flex items-center gap-1">
          <Send className="w-3 h-3" />
          Email History
          <span className="text-gray-400 font-normal normal-case ml-1">
            ({logs.length})
          </span>
        </p>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5">
          {logs.map((log) => (
            <div key={log.id} className="bg-gray-50 rounded-md px-3 py-2">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() =>
                  setExpandedRowId(expandedRowId === log.id ? null : log.id)
                }
              >
                <div className="flex items-center gap-2 min-w-0">
                  {statusBadge(log.status)}
                  <span className="text-xs text-gray-700 truncate">
                    {log.sent_to}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                  {formatLogDate(log.created_at)}
                </span>
              </div>

              {expandedRowId === log.id && (
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                  {log.subject && (
                    <p className="text-[11px] text-gray-500">
                      <span className="font-medium text-gray-600">Subject:</span>{" "}
                      {log.subject}
                    </p>
                  )}
                  {log.custom_message && (
                    <p className="text-[11px] text-gray-500">
                      <span className="font-medium text-gray-600">Message:</span>{" "}
                      {log.custom_message}
                    </p>
                  )}
                  {log.error_message && (
                    <p className="text-[11px] text-red-500">
                      <span className="font-medium text-red-600">Error:</span>{" "}
                      {log.error_message}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Invoice Payments sub-section ──────────────────────────────── */

interface PaymentAllocationRow {
  id: string;
  allocated_amount: number;
  created_at: string;
  payment: {
    id: string;
    payment_date: string;
    amount: number;
    payment_method_name: string | null;
    reference_number: string | null;
  };
}

function InvoicePaymentsSection({
  invoiceId,
  balanceDue,
  customerId,
  currency = "CAD",
}: {
  invoiceId: string;
  balanceDue: number;
  customerId: string;
  currency?: string;
}) {
  const [allocations, setAllocations] = useState<PaymentAllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("customer_payment_allocations")
          .select(
            "id, allocated_amount, created_at, payment:customer_payments(id, payment_date, amount, payment_method_name, reference_number)"
          )
          .eq("invoice_id", invoiceId)
          .order("created_at", { ascending: false });
        setAllocations((data as any) || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [invoiceId]);

  if (loading) return null;
  if (allocations.length === 0 && balanceDue <= 0) return null;

  return (
    <div className="border-t border-gray-200 pt-3 mt-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          <DollarSign className="w-3 h-3 inline mr-1" />
          Payments
        </p>
        {balanceDue > 0 && (
          <button
            onClick={() => setShowPayModal(true)}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            Record Payment
          </button>
        )}
      </div>

      {allocations.length > 0 && (
        <div className="space-y-1 mb-2">
          {allocations.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between text-xs text-gray-600"
            >
              <span>
                {a.payment?.payment_date
                  ? fmtPayDate(a.payment.payment_date)
                  : "—"}
              </span>
              <span>{a.payment?.payment_method_name || ""}</span>
              <span className="text-xs font-mono text-gray-400">
                {a.payment?.reference_number || ""}
              </span>
              <Link
                to={`/admin/payments/${a.payment?.id}`}
                className="font-medium text-gray-900 hover:text-teal-600"
              >
                {fmtPayCurrency(a.allocated_amount, currency)}
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs font-medium border-t border-gray-100 pt-1">
        <span className="text-gray-500">
          Total Paid:{" "}
          {fmtPayCurrency(
            allocations.reduce((s, a) => s + a.allocated_amount, 0),
            currency,
          )}
        </span>
        <span
          className={
            balanceDue > 0 ? "text-red-600" : "text-green-600"
          }
        >
          Balance: {fmtPayCurrency(balanceDue, currency)}
        </span>
      </div>

      {showPayModal && (
        <RecordPaymentModal
          isOpen={showPayModal}
          onClose={() => setShowPayModal(false)}
          onSuccess={() => {
            setShowPayModal(false);
            window.location.reload();
          }}
          customerId={customerId}
          preselectedInvoiceId={invoiceId}
        />
      )}
    </div>
  );
}
