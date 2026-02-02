import { useState, useEffect } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Brain,
  Building2,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { toast } from "sonner";
import PaymentAllocationModal from "./PaymentAllocationModal";

interface QueueItem {
  id: string;
  payment_intent_id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  customer_memo: string | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  ai_allocations: any[] | null;
  status: string;
  created_at: string;
  customer?: {
    full_name: string;
    email: string;
    company_name?: string;
  };
  invoices?: Array<{
    id: string;
    invoice_number: string;
    balance_due: number;
    due_date: string;
  }>;
}

interface PaymentConfirmationQueueProps {
  staffId: string;
}

export default function PaymentConfirmationQueue({ staffId }: PaymentConfirmationQueueProps) {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [processingAI, setProcessingAI] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payment_confirmation_queue")
        .select(`
          *,
          customer:customers(full_name, email, company_name)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch outstanding invoices for each customer
      const itemsWithInvoices = await Promise.all(
        (data || []).map(async (item) => {
          const { data: invoices } = await supabase
            .from("customer_invoices")
            .select("id, invoice_number, balance_due, due_date")
            .eq("customer_id", item.customer_id)
            .gt("balance_due", 0)
            .order("due_date", { ascending: true });

          return { ...item, invoices: invoices || [] };
        })
      );

      setQueueItems(itemsWithInvoices);
    } catch (err: any) {
      console.error("Error fetching queue:", err);
      toast.error("Failed to load payment queue");
    } finally {
      setLoading(false);
    }
  };

  const runAIAllocation = async (item: QueueItem) => {
    setProcessingAI(item.id);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-allocate-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            queue_item_id: item.id,
            customer_id: item.customer_id,
            amount: item.amount,
            reference_number: item.reference_number,
            customer_memo: item.customer_memo,
          }),
        }
      );

      const result = await response.json();

      if (result.error) throw new Error(result.error);

      toast.success(`AI analysis complete: ${(result.confidence * 100).toFixed(0)}% confidence`);
      fetchQueue();
    } catch (err: any) {
      console.error("AI allocation error:", err);
      toast.error(err.message || "AI allocation failed");
    } finally {
      setProcessingAI(null);
    }
  };

  const confirmPayment = async (item: QueueItem, allocations: any[]) => {
    setConfirmingId(item.id);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-manual-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            queue_item_id: item.id,
            payment_intent_id: item.payment_intent_id,
            customer_id: item.customer_id,
            amount: item.amount,
            payment_method: item.payment_method,
            allocations,
            confirmed_by_staff_id: staffId,
          }),
        }
      );

      const result = await response.json();

      if (result.error) throw new Error(result.error);

      toast.success("Payment confirmed and invoices updated");
      fetchQueue();
      setSelectedItem(null);
    } catch (err: any) {
      console.error("Confirm error:", err);
      toast.error(err.message || "Failed to confirm payment");
    } finally {
      setConfirmingId(null);
    }
  };

  const quickConfirm = async (item: QueueItem) => {
    if (!item.ai_allocations || item.ai_allocations.length === 0) {
      toast.error("No AI allocations to confirm");
      return;
    }
    await confirmPayment(item, item.ai_allocations);
  };

  const rejectPayment = async (item: QueueItem) => {
    try {
      const { error } = await supabase
        .from("payment_confirmation_queue")
        .update({
          status: "rejected",
          processed_by_staff_id: staffId,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) throw error;

      toast.success("Payment rejected");
      fetchQueue();
    } catch (err: any) {
      console.error("Reject error:", err);
      toast.error(err.message || "Failed to reject payment");
    }
  };

  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return null;

    const percent = Math.round(confidence * 100);

    if (percent >= 90) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <Brain className="w-3 h-3" />
          {percent}% Match
        </span>
      );
    }

    if (percent >= 70) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Brain className="w-3 h-3" />
          {percent}% Likely
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" />
        {percent}% Uncertain
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          Pending Payment Confirmations ({queueItems.length})
        </h2>
        <button
          onClick={fetchQueue}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {queueItems.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
          <p className="text-gray-500">No pending payments to confirm</p>
        </div>
      ) : (
        <div className="space-y-4">
          {queueItems.map((item) => (
            <div key={item.id} className="bg-white rounded-lg border overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.payment_method === "e_transfer" ? (
                      <Building2 className="w-5 h-5 text-blue-600" />
                    ) : (
                      <FileText className="w-5 h-5 text-amber-600" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.customer?.full_name}
                        {item.customer?.company_name && (
                          <span className="text-gray-500 ml-2">
                            ({item.customer.company_name})
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.payment_method === "e_transfer" ? "E-Transfer" : "Cheque"} •
                        {format(new Date(item.created_at), " MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">
                      ${item.amount.toFixed(2)}
                    </p>
                    {item.ai_confidence !== null && getConfidenceBadge(item.ai_confidence)}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Reference</p>
                    <p className="font-medium">{item.reference_number || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Customer Memo</p>
                    <p className="font-medium">{item.customer_memo || "—"}</p>
                  </div>
                </div>

                {/* Outstanding Invoices */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 uppercase mb-2">Outstanding Invoices</p>
                  <div className="space-y-1">
                    {item.invoices?.slice(0, 3).map((inv) => (
                      <div key={inv.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{inv.invoice_number}</span>
                        <span className="font-medium">${inv.balance_due.toFixed(2)}</span>
                      </div>
                    ))}
                    {(item.invoices?.length || 0) > 3 && (
                      <p className="text-xs text-gray-400">
                        +{(item.invoices?.length || 0) - 3} more invoices
                      </p>
                    )}
                  </div>
                </div>

                {/* AI Reasoning */}
                {item.ai_reasoning && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600 uppercase mb-1">AI Analysis</p>
                    <p className="text-sm text-blue-800">{item.ai_reasoning}</p>
                    {item.ai_allocations && (
                      <div className="mt-2 text-sm">
                        <p className="font-medium text-blue-700">Suggested Allocation:</p>
                        {item.ai_allocations.map((alloc: any, idx: number) => (
                          <div key={idx} className="flex justify-between">
                            <span>{alloc.invoice_number}</span>
                            <span>${alloc.allocated_amount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t">
                  {item.ai_confidence === null ? (
                    <button
                      onClick={() => runAIAllocation(item)}
                      disabled={processingAI === item.id}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {processingAI === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Brain className="w-4 h-4" />
                      )}
                      Run AI Allocation
                    </button>
                  ) : item.ai_confidence >= 0.9 ? (
                    <button
                      onClick={() => quickConfirm(item)}
                      disabled={confirmingId === item.id}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {confirmingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Confirm AI Allocation
                    </button>
                  ) : null}

                  <button
                    onClick={() => setSelectedItem(item)}
                    className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Manual Allocation
                  </button>

                  <button
                    onClick={() => rejectPayment(item)}
                    className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Allocation Modal */}
      {selectedItem && (
        <PaymentAllocationModal
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          queueItem={selectedItem}
          onConfirm={(allocations) => confirmPayment(selectedItem, allocations)}
          isProcessing={confirmingId === selectedItem.id}
        />
      )}
    </div>
  );
}
