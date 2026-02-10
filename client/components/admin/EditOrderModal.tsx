import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  Edit2,
  FileText,
  DollarSign,
  Zap,
  Truck,
  AlertTriangle,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface OrderDocument {
  id: string;
  original_filename: string;
  detected_language: string;
  detected_document_type: string;
  ocr_word_count: number;
  ocr_page_count: number;
  assessed_complexity: string;
  billable_pages: number;
}

interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  quote_id: string;
  subtotal: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  is_rush: boolean;
  delivery_option: string;
  estimated_delivery_date: string;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface EditOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  staffId: string;
  staffRole: string;
  onSuccess: (newTotal: number, balanceChange: number) => void;
}

export default function EditOrderModal({
  isOpen,
  onClose,
  order,
  staffId,
  onSuccess,
}: EditOrderModalProps) {
  // Documents state (read-only context from OCR pipeline)
  const [documents, setDocuments] = useState<OrderDocument[]>([]);

  // Order options state
  const [isRush, setIsRush] = useState(order.is_rush);
  const [deliveryOptionCode, setDeliveryOptionCode] = useState(order.delivery_option);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);

  // Edit reason (required)
  const [editReason, setEditReason] = useState("");

  // Calculated totals — start from current order values
  const [calculatedTotals, setCalculatedTotals] = useState({
    subtotal: order.subtotal || 0,
    certificationTotal: order.certification_total || 0,
    rushFee: order.rush_fee || 0,
    deliveryFee: order.delivery_fee || 0,
    taxAmount: order.tax_amount || 0,
    total: order.total_amount || 0,
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDocuments, setShowDocuments] = useState(true);

  // Load data on mount
  useEffect(() => {
    if (isOpen) {
      loadDocuments();
      loadDeliveryOptions();
      // Reset form state
      setIsRush(order.is_rush);
      setDeliveryOptionCode(order.delivery_option);
      setEditReason("");
    }
  }, [isOpen, order.id]);

  // Recalculate totals when order options change
  useEffect(() => {
    recalculateTotals();
  }, [isRush, deliveryOptionCode, deliveryOptions]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      // Step 1: Get batch IDs for this quote
      const { data: batches } = await supabase
        .from("ocr_batches")
        .select("id")
        .eq("quote_id", order.quote_id);

      if (batches && batches.length > 0) {
        const batchIds = batches.map((b: any) => b.id);

        // Step 2: Get analysis results for those batches (read-only context)
        const { data, error } = await supabase
          .from("ocr_ai_analysis")
          .select(`
            id,
            original_filename,
            detected_language,
            detected_document_type,
            ocr_word_count,
            ocr_page_count,
            assessed_complexity,
            billable_pages
          `)
          .in("batch_id", batchIds)
          .order("created_at");

        if (!error) {
          setDocuments(data || []);
        }
      }
    } catch (err: unknown) {
      console.error("Error loading documents:", err);
      // Non-fatal — documents are display-only
    } finally {
      setLoading(false);
    }
  };

  const loadDeliveryOptions = async () => {
    try {
      const { data, error } = await supabase
        .from("delivery_options")
        .select("id, code, name, price")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      setDeliveryOptions(data || []);
    } catch (err) {
      console.error("Error loading delivery options:", err);
    }
  };

  const recalculateTotals = () => {
    // Subtotal comes from the order (quote pricing) — not recalculated from docs
    const subtotal = order.subtotal || 0;

    // Rush fee: 30% of subtotal
    const rushFee = isRush ? subtotal * 0.30 : 0;

    // Delivery fee from selected option
    const selectedDelivery = deliveryOptions.find(d => d.code === deliveryOptionCode);
    const deliveryFee = selectedDelivery?.price ?? order.delivery_fee ?? 0;

    // Tax
    const taxableAmount = subtotal + rushFee + deliveryFee;
    const taxRate = order.tax_rate || 0;
    const taxAmount = taxableAmount * taxRate;

    // Total
    const total = taxableAmount + taxAmount;

    setCalculatedTotals({
      subtotal: Math.round(subtotal * 100) / 100,
      certificationTotal: Math.round((order.certification_total || 0) * 100) / 100,
      rushFee: Math.round(rushFee * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    });
  };

  const balanceChange = calculatedTotals.total - order.total_amount;
  const hasChanges = Math.abs(balanceChange) > 0.01 || isRush !== order.is_rush || deliveryOptionCode !== order.delivery_option;

  const isValid = () => {
    if (!editReason.trim()) return false;
    return hasChanges;
  };

  const handleSave = async () => {
    if (!isValid()) return;

    setSaving(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-order-totals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            order_id: order.id,
            documents: documents,
            is_rush: isRush,
            delivery_option: deliveryOptionCode,
            delivery_fee: calculatedTotals.deliveryFee,
            edit_reason: editReason.trim(),
            staff_id: staffId,
            calculated_totals: calculatedTotals,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update order");
      }

      toast.success("Order updated successfully");
      onSuccess(calculatedTotals.total, balanceChange);
      onClose();
    } catch (err: unknown) {
      console.error("Error saving order:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to save changes";
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-teal-600" />
              Edit Order {order.order_number}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Modify rush, delivery, and pricing options
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            </div>
          ) : (
            <>
              {/* Documents Section */}
              <div className="border rounded-lg">
                <button
                  onClick={() => setShowDocuments(!showDocuments)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <span className="font-medium">Documents</span>
                    <span className="text-sm text-gray-500">
                      ({documents.length})
                    </span>
                  </div>
                  {showDocuments ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {showDocuments && (
                  <div className="border-t divide-y">
                    {documents.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        No documents found
                      </div>
                    ) : (
                      documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-4 hover:bg-gray-50"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {doc.original_filename || "Untitled Document"}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                              <span>{doc.detected_document_type || "Unknown"}</span>
                              <span>Language: {doc.detected_language || "—"}</span>
                              <span>Words: {doc.ocr_word_count || 0}</span>
                              <span>Pages: {doc.ocr_page_count || 1}</span>
                              <span>Complexity: {doc.assessed_complexity || "easy"}</span>
                              {doc.billable_pages && (
                                <span>Billable: {Number(doc.billable_pages).toFixed(1)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Order Options */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-gray-500" />
                  Order Options
                </h3>

                {/* Rush Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-gray-900 flex items-center gap-2">
                      <Zap className={`w-4 h-4 ${isRush ? "text-amber-500" : "text-gray-400"}`} />
                      Rush Order
                    </p>
                    <p className="text-sm text-gray-500">
                      30% surcharge for faster delivery
                    </p>
                  </div>
                  <button
                    onClick={() => setIsRush(!isRush)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isRush ? "bg-amber-500" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isRush ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Delivery Option */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Method
                  </label>
                  <select
                    value={deliveryOptionCode}
                    onChange={(e) => setDeliveryOptionCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    {deliveryOptions.map((option) => (
                      <option key={option.id} value={option.code}>
                        {option.name} {option.price > 0 && `(+$${option.price.toFixed(2)})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price Summary */}
              <div className="border rounded-lg p-4">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  Price Summary
                </h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal (from quote):</span>
                    <span>${calculatedTotals.subtotal.toFixed(2)}</span>
                  </div>
                  {calculatedTotals.certificationTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Certification:</span>
                      <span>Included in subtotal</span>
                    </div>
                  )}
                  {isRush && (
                    <div className="flex justify-between text-amber-600">
                      <span>Rush Fee (30%):</span>
                      <span>+${calculatedTotals.rushFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Delivery:</span>
                    <span>${calculatedTotals.deliveryFee.toFixed(2)}</span>
                  </div>
                  {calculatedTotals.taxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        Tax ({((order.tax_rate || 0) * 100).toFixed(0)}%):
                      </span>
                      <span>+${calculatedTotals.taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-semibold text-base">
                    <span>NEW TOTAL:</span>
                    <span>${calculatedTotals.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Balance Change Warning */}
                {Math.abs(balanceChange) > 0.01 && (
                  <div
                    className={`mt-4 p-4 rounded-lg ${
                      balanceChange > 0
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-green-50 border border-green-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                          balanceChange > 0 ? "text-amber-600" : "text-green-600"
                        }`}
                      />
                      <div>
                        <p
                          className={`font-medium ${
                            balanceChange > 0 ? "text-amber-800" : "text-green-800"
                          }`}
                        >
                          Balance Change Detected
                        </p>
                        <div className="text-sm mt-2 space-y-1">
                          <p className={balanceChange > 0 ? "text-amber-700" : "text-green-700"}>
                            Original Total: ${order.total_amount.toFixed(2)}
                          </p>
                          <p className={balanceChange > 0 ? "text-amber-700" : "text-green-700"}>
                            New Total: ${calculatedTotals.total.toFixed(2)}
                          </p>
                          <p className={`font-medium ${balanceChange > 0 ? "text-amber-800" : "text-green-800"}`}>
                            Difference: {balanceChange > 0 ? "+" : ""}${balanceChange.toFixed(2)}{" "}
                            ({balanceChange > 0 ? "Customer owes more" : "Customer overpaid"})
                          </p>
                        </div>
                        <p className={`text-xs mt-2 ${balanceChange > 0 ? "text-amber-600" : "text-green-600"}`}>
                          After saving, the order balance will be updated accordingly.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Edit Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Edit Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Explain why this order is being edited..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will be recorded in the order history for audit purposes.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            Original: ${order.total_amount.toFixed(2)} | Paid: ${(order.amount_paid ?? 0).toFixed(2)} | Balance: ${(order.balance_due ?? 0).toFixed(2)}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid() || saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
