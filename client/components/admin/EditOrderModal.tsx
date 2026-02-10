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
  surcharge_type: string;
  surcharge_value: number;
  surcharge_total: number;
  discount_type: string;
  discount_value: number;
  discount_total: number;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface OrderCertification {
  id: string;           // UUID (existing) or temp ID (new)
  certification_type_id: string;
  type_name: string;    // display name
  quantity: number;
  unit_price: number;
  line_total: number;
  isNew?: boolean;      // true if added in this session
  isDeleted?: boolean;  // true if marked for removal
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

  // Certification state
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);
  const [certifications, setCertifications] = useState<OrderCertification[]>([]);

  // Surcharge state
  const [surchargeType, setSurchargeType] = useState<'flat' | 'percent'>(
    (order.surcharge_type as 'flat' | 'percent') || 'flat'
  );
  const [surchargeValue, setSurchargeValue] = useState<number>(order.surcharge_value || 0);

  // Discount state
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>(
    (order.discount_type as 'flat' | 'percent') || 'flat'
  );
  const [discountValue, setDiscountValue] = useState<number>(order.discount_value || 0);

  // Edit reason (required)
  const [editReason, setEditReason] = useState("");

  // Calculated totals — start from current order values
  const [calculatedTotals, setCalculatedTotals] = useState({
    subtotal: order.subtotal || 0,
    certificationTotal: order.certification_total || 0,
    surchargeTotal: order.surcharge_total || 0,
    discountTotal: order.discount_total || 0,
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
      loadCertificationTypes();
      loadOrderCertifications();
      // Reset form state
      setIsRush(order.is_rush);
      setDeliveryOptionCode(order.delivery_option);
      setSurchargeType((order.surcharge_type as 'flat' | 'percent') || 'flat');
      setSurchargeValue(order.surcharge_value || 0);
      setDiscountType((order.discount_type as 'flat' | 'percent') || 'flat');
      setDiscountValue(order.discount_value || 0);
      setEditReason("");
    }
  }, [isOpen, order.id]);

  // Recalculate totals when order options change
  useEffect(() => {
    recalculateTotals();
  }, [isRush, deliveryOptionCode, deliveryOptions, certifications, surchargeType, surchargeValue, discountType, discountValue]);

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

  const loadCertificationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("certification_types")
        .select("id, code, name, price")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      setCertificationTypes(data || []);
    } catch (err) {
      console.error("Error loading certification types:", err);
    }
  };

  const loadOrderCertifications = async () => {
    try {
      const { data, error } = await supabase
        .from("order_certifications")
        .select(`
          id,
          certification_type_id,
          quantity,
          unit_price,
          line_total,
          cert_type:certification_types(name)
        `)
        .eq("order_id", order.id)
        .order("created_at");

      if (error) throw error;

      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        certification_type_id: row.certification_type_id,
        type_name: row.cert_type?.name || "Unknown",
        quantity: row.quantity,
        unit_price: Number(row.unit_price),
        line_total: Number(row.line_total),
        isNew: false,
        isDeleted: false,
      }));

      setCertifications(mapped);
    } catch (err) {
      console.error("Error loading order certifications:", err);
    }
  };

  const handleAddCertification = () => {
    if (certificationTypes.length === 0) return;
    const defaultType = certificationTypes[0];
    const newCert: OrderCertification = {
      id: crypto.randomUUID(),
      certification_type_id: defaultType.id,
      type_name: defaultType.name,
      quantity: 1,
      unit_price: defaultType.price,
      line_total: defaultType.price,
      isNew: true,
      isDeleted: false,
    };
    setCertifications(prev => [...prev, newCert]);
  };

  const handleCertTypeChange = (certId: string, typeId: string) => {
    const selectedType = certificationTypes.find(t => t.id === typeId);
    if (!selectedType) return;
    setCertifications(prev =>
      prev.map(c => {
        if (c.id !== certId) return c;
        const newLineTotal = c.quantity * selectedType.price;
        return {
          ...c,
          certification_type_id: typeId,
          type_name: selectedType.name,
          unit_price: selectedType.price,
          line_total: Math.round(newLineTotal * 100) / 100,
        };
      })
    );
  };

  const handleCertQtyChange = (certId: string, qty: number) => {
    const safeQty = Math.max(1, Math.floor(qty));
    setCertifications(prev =>
      prev.map(c => {
        if (c.id !== certId) return c;
        return {
          ...c,
          quantity: safeQty,
          line_total: Math.round(safeQty * c.unit_price * 100) / 100,
        };
      })
    );
  };

  const handleCertPriceOverride = (certId: string, price: number) => {
    const safePrice = Math.max(0, price);
    setCertifications(prev =>
      prev.map(c => {
        if (c.id !== certId) return c;
        return {
          ...c,
          unit_price: safePrice,
          line_total: Math.round(c.quantity * safePrice * 100) / 100,
        };
      })
    );
  };

  const handleRemoveCertification = (certId: string) => {
    setCertifications(prev =>
      prev.map(c => {
        if (c.id !== certId) return c;
        if (c.isNew) return null; // Remove entirely if never saved
        return { ...c, isDeleted: true }; // Mark for deletion if exists in DB
      }).filter(Boolean) as OrderCertification[]
    );
  };

  const recalculateTotals = () => {
    const subtotal = order.subtotal || 0;

    // Certifications
    const certTotal = certifications
      .filter(c => !c.isDeleted)
      .reduce((sum, c) => sum + c.line_total, 0);

    // Surcharge — percent is based on subtotal
    const surchargeAmount = surchargeType === 'percent'
      ? subtotal * (surchargeValue / 100)
      : surchargeValue;

    // Discount — percent is based on subtotal
    const discountAmount = discountType === 'percent'
      ? subtotal * (discountValue / 100)
      : discountValue;

    // Rush fee: 30% of subtotal
    const rushFee = isRush ? subtotal * 0.30 : 0;

    // Delivery fee
    const selectedDelivery = deliveryOptions.find(d => d.code === deliveryOptionCode);
    const deliveryFee = selectedDelivery?.price ?? order.delivery_fee ?? 0;

    // Pre-tax total
    const preTax = subtotal + certTotal + surchargeAmount - discountAmount + rushFee + deliveryFee;

    // Tax
    const taxRate = order.tax_rate || 0;
    const taxAmount = preTax * taxRate;

    // Total
    const total = preTax + taxAmount;

    setCalculatedTotals({
      subtotal: Math.round(subtotal * 100) / 100,
      certificationTotal: Math.round(certTotal * 100) / 100,
      surchargeTotal: Math.round(surchargeAmount * 100) / 100,
      discountTotal: Math.round(discountAmount * 100) / 100,
      rushFee: Math.round(rushFee * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    });
  };

  const balanceChange = calculatedTotals.total - order.total_amount;
  const certsChanged = certifications.some(c => c.isNew || c.isDeleted) ||
    Math.abs(calculatedTotals.certificationTotal - (order.certification_total || 0)) > 0.01;

  const surchargeChanged =
    surchargeType !== ((order.surcharge_type as string) || 'flat') ||
    surchargeValue !== (order.surcharge_value || 0);

  const discountChanged =
    discountType !== ((order.discount_type as string) || 'flat') ||
    discountValue !== (order.discount_value || 0);

  const hasChanges =
    Math.abs(balanceChange) > 0.01 ||
    isRush !== order.is_rush ||
    deliveryOptionCode !== order.delivery_option ||
    certsChanged ||
    surchargeChanged ||
    discountChanged;

  const isValid = () => {
    if (!editReason.trim()) return false;
    return hasChanges;
  };

  const handleSave = async () => {
    if (!isValid()) return;

    setSaving(true);
    try {
      // 1. Delete removed certifications
      const toDelete = certifications.filter(c => c.isDeleted && !c.isNew);
      for (const cert of toDelete) {
        await supabase
          .from("order_certifications")
          .delete()
          .eq("id", cert.id);
      }

      // 2. Insert new certifications
      const toInsert = certifications.filter(c => c.isNew && !c.isDeleted);
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("order_certifications")
          .insert(
            toInsert.map(c => ({
              order_id: order.id,
              certification_type_id: c.certification_type_id,
              quantity: c.quantity,
              unit_price: c.unit_price,
              line_total: c.line_total,
            }))
          );
        if (insertError) throw insertError;
      }

      // 3. Update existing certifications that changed
      const toUpdate = certifications.filter(c => !c.isNew && !c.isDeleted);
      for (const cert of toUpdate) {
        await supabase
          .from("order_certifications")
          .update({
            certification_type_id: cert.certification_type_id,
            quantity: cert.quantity,
            unit_price: cert.unit_price,
            line_total: cert.line_total,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cert.id);
      }

      // 4. Log adjustments for audit
      if (surchargeChanged && surchargeValue > 0) {
        await supabase.from("order_adjustments").insert({
          order_id: order.id,
          adjustment_type: "surcharge",
          amount: calculatedTotals.surchargeTotal,
          original_total: order.total_amount,
          new_total: calculatedTotals.total,
          reason: editReason.trim(),
          handling_method: surchargeType,
          created_by_staff_id: staffId,
        });
      }

      if (discountChanged && discountValue > 0) {
        await supabase.from("order_adjustments").insert({
          order_id: order.id,
          adjustment_type: "discount",
          amount: -calculatedTotals.discountTotal,
          original_total: order.total_amount,
          new_total: calculatedTotals.total,
          reason: editReason.trim(),
          handling_method: discountType,
          created_by_staff_id: staffId,
        });
      }

      // 5. Update the order totals
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
            is_rush: isRush,
            delivery_option: deliveryOptionCode,
            delivery_fee: calculatedTotals.deliveryFee,
            certification_total: calculatedTotals.certificationTotal,
            surcharge_type: surchargeType,
            surcharge_value: surchargeValue,
            surcharge_total: calculatedTotals.surchargeTotal,
            discount_type: discountType,
            discount_value: discountValue,
            discount_total: calculatedTotals.discountTotal,
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

              {/* Certifications Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-500" />
                    Certifications
                  </h3>
                  <button
                    onClick={handleAddCertification}
                    className="text-sm px-3 py-1 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors"
                  >
                    + Add Certification
                  </button>
                </div>

                {certifications.filter(c => !c.isDeleted).length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">
                    No certifications added
                  </p>
                ) : (
                  <div className="space-y-3">
                    {certifications
                      .filter(c => !c.isDeleted)
                      .map((cert) => (
                        <div
                          key={cert.id}
                          className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg"
                        >
                          {/* Type Dropdown */}
                          <div className="flex-1 min-w-0">
                            <select
                              value={cert.certification_type_id}
                              onChange={(e) => handleCertTypeChange(cert.id, e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            >
                              {certificationTypes.map((type) => (
                                <option key={type.id} value={type.id}>
                                  {type.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div className="w-20">
                            <label className="text-xs text-gray-500 block mb-0.5">Qty</label>
                            <input
                              type="number"
                              min={1}
                              value={cert.quantity}
                              onChange={(e) =>
                                handleCertQtyChange(cert.id, parseInt(e.target.value) || 1)
                              }
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            />
                          </div>

                          {/* Unit Price (overridable) */}
                          <div className="w-24">
                            <label className="text-xs text-gray-500 block mb-0.5">Price</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={cert.unit_price}
                                onChange={(e) =>
                                  handleCertPriceOverride(cert.id, parseFloat(e.target.value) || 0)
                                }
                                className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded-md text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              />
                            </div>
                          </div>

                          {/* Line Total (read-only) */}
                          <div className="w-24 text-right">
                            <label className="text-xs text-gray-500 block mb-0.5">Total</label>
                            <p className="text-sm font-medium py-1.5">
                              ${cert.line_total.toFixed(2)}
                            </p>
                          </div>

                          {/* Remove Button */}
                          <button
                            onClick={() => handleRemoveCertification(cert.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg mt-4"
                            title="Remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                    {/* Certification Subtotal */}
                    <div className="flex justify-end pt-2 border-t">
                      <span className="text-sm text-gray-600 mr-4">Certification Total:</span>
                      <span className="text-sm font-semibold">
                        ${calculatedTotals.certificationTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Adjustments */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  Price Adjustments
                </h3>

                {/* Surcharge */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Surcharge</label>
                  <div className="flex items-center gap-3">
                    {/* Type Toggle */}
                    <div className="flex rounded-md border border-gray-300 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setSurchargeType('flat')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          surchargeType === 'flat'
                            ? 'bg-teal-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        $
                      </button>
                      <button
                        type="button"
                        onClick={() => setSurchargeType('percent')}
                        className={`px-3 py-1.5 text-sm font-medium border-l transition-colors ${
                          surchargeType === 'percent'
                            ? 'bg-teal-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        %
                      </button>
                    </div>

                    {/* Value Input */}
                    <div className="relative flex-1">
                      {surchargeType === 'flat' && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      )}
                      <input
                        type="number"
                        min={0}
                        step={surchargeType === 'percent' ? '1' : '0.01'}
                        value={surchargeValue || ''}
                        onChange={(e) => setSurchargeValue(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className={`w-full py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                          surchargeType === 'flat' ? 'pl-7 pr-3' : 'pl-3 pr-7'
                        }`}
                      />
                      {surchargeType === 'percent' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                      )}
                    </div>

                    {/* Calculated Amount */}
                    {surchargeValue > 0 && (
                      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        = +${calculatedTotals.surchargeTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Discount */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Discount</label>
                  <div className="flex items-center gap-3">
                    {/* Type Toggle */}
                    <div className="flex rounded-md border border-gray-300 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDiscountType('flat')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          discountType === 'flat'
                            ? 'bg-teal-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        $
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType('percent')}
                        className={`px-3 py-1.5 text-sm font-medium border-l transition-colors ${
                          discountType === 'percent'
                            ? 'bg-teal-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        %
                      </button>
                    </div>

                    {/* Value Input */}
                    <div className="relative flex-1">
                      {discountType === 'flat' && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      )}
                      <input
                        type="number"
                        min={0}
                        step={discountType === 'percent' ? '1' : '0.01'}
                        value={discountValue || ''}
                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className={`w-full py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                          discountType === 'flat' ? 'pl-7 pr-3' : 'pl-3 pr-7'
                        }`}
                      />
                      {discountType === 'percent' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                      )}
                    </div>

                    {/* Calculated Amount */}
                    {discountValue > 0 && (
                      <span className="text-sm font-medium text-green-700 whitespace-nowrap">
                        = -${calculatedTotals.discountTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
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
                      <span className="text-gray-600">Certifications:</span>
                      <span>${calculatedTotals.certificationTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {calculatedTotals.surchargeTotal > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>
                        Surcharge ({surchargeType === 'percent' ? `${surchargeValue}%` : 'flat'}):
                      </span>
                      <span>+${calculatedTotals.surchargeTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {calculatedTotals.discountTotal > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>
                        Discount ({discountType === 'percent' ? `${discountValue}%` : 'flat'}):
                      </span>
                      <span>-${calculatedTotals.discountTotal.toFixed(2)}</span>
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
