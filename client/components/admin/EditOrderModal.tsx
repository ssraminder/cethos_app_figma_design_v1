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
import EditDocumentModal from "./EditDocumentModal";

interface OrderDocument {
  id: string;
  original_filename: string;
  detected_document_type: string;
  detected_language: string;
  target_language: string;
  word_count: number;
  page_count: number;
  billable_pages: number;
  assessed_complexity: string;
  complexity_multiplier: number;
  line_total: number;
  certification_type_id: string;
  certification_price: number;
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
  // Documents state
  const [documents, setDocuments] = useState<OrderDocument[]>([]);
  const [editingDocument, setEditingDocument] = useState<OrderDocument | null>(null);

  // Order options state
  const [isRush, setIsRush] = useState(order.is_rush);
  const [deliveryOptionCode, setDeliveryOptionCode] = useState(order.delivery_option);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);

  // Edit reason (required)
  const [editReason, setEditReason] = useState("");

  // Calculated totals
  const [calculatedTotals, setCalculatedTotals] = useState({
    translationSubtotal: 0,
    certificationTotal: 0,
    subtotal: 0,
    rushFee: 0,
    deliveryFee: order.delivery_fee,
    taxAmount: 0,
    total: 0,
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

  // Recalculate totals when documents or options change
  useEffect(() => {
    recalculateTotals();
  }, [documents, isRush, deliveryOptionCode, deliveryOptions]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      // ai_analysis_results is the source of truth for document-level pricing
      const { data, error } = await supabase
        .from("ai_analysis_results")
        .select(`
          id,
          detected_language,
          detected_document_type,
          word_count,
          page_count,
          billable_pages,
          assessed_complexity,
          complexity_multiplier,
          line_total,
          certification_type_id,
          certification_price,
          manual_filename,
          is_staff_created,
          quote_file:quote_files!ai_analysis_results_quote_file_id_fkey(
            original_filename
          )
        `)
        .eq("quote_id", order.quote_id)
        .is("deleted_at", null)
        .order("created_at");

      if (error) throw error;

      // Map to the OrderDocument interface
      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        original_filename: row.quote_file?.original_filename || row.manual_filename || "Manual Entry",
        detected_document_type: row.detected_document_type || "Unknown",
        detected_language: row.detected_language || "—",
        target_language: "EN",
        word_count: row.word_count || 0,
        page_count: row.page_count || 1,
        billable_pages: row.billable_pages || 0,
        assessed_complexity: row.assessed_complexity || "easy",
        complexity_multiplier: row.complexity_multiplier || 1.0,
        line_total: row.line_total || 0,
        certification_type_id: row.certification_type_id || null,
        certification_price: row.certification_price || 0,
      }));

      setDocuments(mapped);
    } catch (err: unknown) {
      console.error("Error loading documents:", err);
      toast.error("Failed to load order documents");
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
    // line_total in ai_analysis_results = billable_pages × base_rate (translation only)
    const translationSubtotal = documents.reduce((sum, doc) => {
      return sum + (doc.line_total || 0);
    }, 0);

    // Sum certification costs
    const certificationTotal = documents.reduce(
      (sum, doc) => sum + (doc.certification_price || 0),
      0
    );

    const subtotal = translationSubtotal + certificationTotal;

    // Calculate rush fee (30% of subtotal)
    const rushFee = isRush ? subtotal * 0.30 : 0;

    // Get delivery fee
    const selectedDelivery = deliveryOptions.find(d => d.code === deliveryOptionCode);
    const deliveryFee = selectedDelivery?.price ?? order.delivery_fee;

    // Calculate tax
    const taxableAmount = subtotal + rushFee + deliveryFee;
    const taxRate = order.tax_rate || 0;
    const taxAmount = taxableAmount * taxRate;

    // Total
    const total = taxableAmount + taxAmount;

    setCalculatedTotals({
      translationSubtotal: Math.round(translationSubtotal * 100) / 100,
      certificationTotal: Math.round(certificationTotal * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      rushFee: Math.round(rushFee * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    });
  };

  const handleDocumentUpdate = (updatedDoc: OrderDocument) => {
    setDocuments(docs =>
      docs.map(d => (d.id === updatedDoc.id ? updatedDoc : d))
    );
    setEditingDocument(null);
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
              Modify documents, pricing, and delivery options
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
                          className="p-4 hover:bg-gray-50 flex justify-between items-start"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {doc.original_filename}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                              {doc.detected_document_type} • {doc.detected_language} → {doc.target_language || "EN"}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                              <span>Words: {doc.word_count}</span>
                              <span>Pages: {doc.page_count}</span>
                              <span>Billable: {doc.billable_pages?.toFixed(1) || "—"}</span>
                              <span>
                                Complexity: {doc.assessed_complexity || "easy"} ({doc.complexity_multiplier || 1.0}x)
                              </span>
                            </div>
                            <div className="flex gap-4 text-sm mt-2">
                              <span>
                                Translation:{" "}
                                <span className="font-medium">
                                  ${(doc.line_total || 0).toFixed(2)}
                                </span>
                              </span>
                              <span>
                                Certification:{" "}
                                <span className="font-medium">
                                  ${(doc.certification_price || 0).toFixed(2)}
                                </span>
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => setEditingDocument(doc)}
                            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg flex-shrink-0 ml-2"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
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
                    <span className="text-gray-600">Translation Subtotal:</span>
                    <span>${calculatedTotals.translationSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Certification Total:</span>
                    <span>${calculatedTotals.certificationTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Subtotal:</span>
                    <span>${calculatedTotals.subtotal.toFixed(2)}</span>
                  </div>
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
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax ({((order.tax_rate || 0) * 100).toFixed(0)}%):</span>
                    <span>+${calculatedTotals.taxAmount.toFixed(2)}</span>
                  </div>
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

        {/* Edit Document Modal */}
        {editingDocument && (
          <EditDocumentModal
            isOpen={!!editingDocument}
            onClose={() => setEditingDocument(null)}
            document={editingDocument}
            onSave={handleDocumentUpdate}
          />
        )}
      </div>
    </div>
  );
}
