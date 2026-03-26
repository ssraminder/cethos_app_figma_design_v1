import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { FileText, Download, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface InvoiceData {
  id: string;
  invoice_number: string;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  pdf_storage_path: string | null;
  invoicing_branch_id: string | null;
  currency: string | null;
}

interface BranchInfo {
  id: string;
  legal_name: string;
  code: string;
}

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  sent: "bg-indigo-100 text-indigo-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500",
  draft: "bg-gray-100 text-gray-600",
  partial: "bg-amber-100 text-amber-700",
  cancelled: "bg-gray-100 text-gray-500",
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
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<{ message: string; missing?: string[] } | null>(null);

  const fetchInvoice = useCallback(async () => {
    const { data } = await supabase
      .from("customer_invoices")
      .select("id, invoice_number, status, invoice_date, due_date, total_amount, amount_paid, balance_due, pdf_storage_path, invoicing_branch_id, currency")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInvoice(data);
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
  }, [fetchInvoice]);

  const branchName = invoice?.invoicing_branch_id
    ? branches.find((b) => b.id === invoice.invoicing_branch_id)?.legal_name || "—"
    : "—";

  const handleGenerate = async (regenerate = false) => {
    if (regenerate) {
      if (!window.confirm("Regenerate the invoice PDF? This will replace the existing PDF.")) return;
    }
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
            order_id: orderId,
            staff_id: staffId,
            regenerate,
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
      toast.success(
        regenerate
          ? `Invoice PDF regenerated: ${result.invoice_number}`
          : `Invoice generated: ${result.invoice_number}`
      );
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

  const hasInvoiceWithPdf = invoice && invoice.pdf_storage_path;

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
              {error.missing?.includes("invoicing_branch") && (
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

      {!hasInvoiceWithPdf ? (
        <div>
          {invoice && !invoice.pdf_storage_path && (
            <div className="mb-3 text-sm text-gray-600">
              <span className="font-medium">{invoice.invoice_number}</span> — No PDF generated yet.
            </div>
          )}
          {!invoice && (
            <p className="text-sm text-gray-500 mb-3">No invoice generated yet.</p>
          )}
          <button
            onClick={() => handleGenerate(!!invoice)}
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
                Generate Invoice
              </>
            )}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</span>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[invoice.status] || "bg-gray-100 text-gray-600"}`}
            >
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </span>
          </div>

          <div className="text-sm text-gray-600 space-y-1 mb-3">
            <p>
              Date: {fmtDate(invoice.invoice_date)} · Due: {fmtDate(invoice.due_date)}
            </p>
            <p>
              Total: {fmtCurrency(invoice.total_amount, invoice.currency || "CAD")} ·{" "}
              Paid: {fmtCurrency(invoice.amount_paid, invoice.currency || "CAD")} ·{" "}
              Balance:{" "}
              <span className={invoice.balance_due > 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
                {fmtCurrency(invoice.balance_due, invoice.currency || "CAD")}
                {invoice.balance_due === 0 && " — PAID"}
              </span>
            </p>
            <p>Branch: {branchName}</p>
          </div>

          <div className="flex gap-2">
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
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-md hover:bg-gray-200 inline-flex items-center gap-1.5"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
