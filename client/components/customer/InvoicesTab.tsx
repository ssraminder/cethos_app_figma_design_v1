import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import PaymentModal from "./PaymentModal";

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  pdf_storage_path: string | null;
  order?: {
    order_number: string;
  };
}

interface InvoicesTabProps {
  customerId: string;
}

export default function InvoicesTab({ customerId }: InvoicesTabProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [expandedView, setExpandedView] = useState(true);

  // Account summary
  const totalDue = invoices.reduce((sum, inv) =>
    inv.status !== 'paid' && inv.status !== 'void' ? sum + inv.balance_due : sum, 0
  );
  const currentDue = invoices.reduce((sum, inv) => {
    if (inv.status === 'paid' || inv.status === 'void') return sum;
    const daysUntilDue = differenceInDays(new Date(inv.due_date), new Date());
    return daysUntilDue >= 0 ? sum + inv.balance_due : sum;
  }, 0);
  const overdueDue = totalDue - currentDue;

  useEffect(() => {
    fetchInvoices();
  }, [customerId]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customer_invoices")
        .select(`
          *,
          order:orders(order_number)
        `)
        .eq("customer_id", customerId)
        .not("status", "in", '("void","cancelled")')
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (err: any) {
      console.error("Error fetching invoices:", err);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const handleSelectAll = () => {
    const unpaidInvoices = invoices.filter(inv => inv.balance_due > 0);
    if (selectedInvoices.size === unpaidInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(unpaidInvoices.map(inv => inv.id)));
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    if (!invoice.pdf_storage_path) {
      toast.error("Invoice PDF not available");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from("invoices")
        .download(invoice.pdf_storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error("Failed to download invoice");
    }
  };

  const selectedTotal = invoices
    .filter(inv => selectedInvoices.has(inv.id))
    .reduce((sum, inv) => sum + inv.balance_due, 0);

  const getStatusBadge = (invoice: Invoice) => {
    const daysUntilDue = differenceInDays(new Date(invoice.due_date), new Date());

    if (invoice.status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" />
          Paid
        </span>
      );
    }

    if (daysUntilDue < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <AlertTriangle className="w-3 h-3" />
          Overdue ({Math.abs(daysUntilDue)} days)
        </span>
      );
    }

    if (daysUntilDue <= 7) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" />
          Due in {daysUntilDue} days
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Clock className="w-3 h-3" />
        Due {format(new Date(invoice.due_date), "MMM d")}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Summary */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Due</p>
            <p className="text-2xl font-bold text-gray-900">${totalDue.toFixed(2)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-600">Current</p>
            <p className="text-2xl font-bold text-green-700">${currentDue.toFixed(2)}</p>
          </div>
          <div className={`rounded-lg p-4 ${overdueDue > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
            <p className={`text-sm ${overdueDue > 0 ? 'text-red-600' : 'text-gray-500'}`}>Overdue</p>
            <p className={`text-2xl font-bold ${overdueDue > 0 ? 'text-red-700' : 'text-gray-400'}`}>
              ${overdueDue.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              Invoices ({invoices.length})
            </h2>
            <button
              onClick={() => setExpandedView(!expandedView)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              {expandedView ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>

          {selectedInvoices.size > 0 && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Pay Selected (${selectedTotal.toFixed(2)})
            </button>
          )}
        </div>

        {expandedView && (
          <>
            {/* Select All */}
            {invoices.some(inv => inv.balance_due > 0) && (
              <div className="px-4 py-2 bg-gray-50 border-b">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedInvoices.size === invoices.filter(inv => inv.balance_due > 0).length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  Select all unpaid invoices
                </label>
              </div>
            )}

            {invoices.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No invoices yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      selectedInvoices.has(invoice.id) ? 'bg-teal-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      {invoice.balance_due > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedInvoices.has(invoice.id)}
                          onChange={() => handleSelectInvoice(invoice.id)}
                          className="mt-1 w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                      )}

                      {/* Invoice Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-medium text-gray-900">
                            {invoice.invoice_number}
                          </span>
                          {getStatusBadge(invoice)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Order: {invoice.order?.order_number} •
                          Issued: {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          ${invoice.total_amount.toFixed(2)}
                        </p>
                        {invoice.balance_due > 0 && invoice.balance_due !== invoice.total_amount && (
                          <p className="text-sm text-amber-600">
                            Due: ${invoice.balance_due.toFixed(2)}
                          </p>
                        )}
                      </div>

                      {/* Download Button */}
                      <button
                        onClick={() => handleDownloadInvoice(invoice)}
                        disabled={!invoice.pdf_storage_path}
                        className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download Invoice"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoices(new Set());
          }}
          customerId={customerId}
          invoices={invoices.filter(inv => selectedInvoices.has(inv.id))}
          totalAmount={selectedTotal}
          onSuccess={() => {
            fetchInvoices();
            setSelectedInvoices(new Set());
          }}
        />
      )}
    </div>
  );
}
