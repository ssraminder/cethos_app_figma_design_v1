import { useState, useEffect, useMemo } from "react";
import {
  X,
  Upload,
  DollarSign,
  FileText,
  Sparkles,
  Check,
  AlertTriangle,
  CreditCard,
  Loader2,
  Trash2,
  RefreshCw,
  Building,
  User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";

interface BulkPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedCustomerId?: string | null;
  staffId: string;
  onSuccess: () => void;
}

interface Customer {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string;
  customer_type: string;
  credit_balance: number;
}

interface OutstandingInvoice {
  id: string;
  invoice_number: string;
  order_id: string;
  order_number: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  due_date: string;
  status: string;
  is_overdue: boolean;
}

interface Allocation {
  invoice_id: string;
  invoice_number: string;
  invoice_total: number;
  outstanding: number;
  allocated_amount: number;
  is_full_payment: boolean;
  is_ai_matched: boolean;
}

interface PaystubExtraction {
  amount: number | null;
  payment_date: string | null;
  reference_number: string | null;
  payment_method: string | null;
  payer_name: string | null;
  invoice_numbers: string[];
  confidence: number;
  notes: string | null;
}

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
}

export default function BulkPaymentModal({
  isOpen,
  onClose,
  preSelectedCustomerId,
  staffId,
  onSuccess,
}: BulkPaymentModalProps) {
  // Customer Selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    preSelectedCustomerId || null
  );
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  // Outstanding Invoices
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);

  // Payment Details
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);

  // Paystub Upload
  const [uploadedPaystub, setUploadedPaystub] = useState<File | null>(null);
  const [isAnalyzingPaystub, setIsAnalyzingPaystub] = useState(false);
  const [paystubExtraction, setPaystubExtraction] = useState<PaystubExtraction | null>(null);

  // Allocations
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [isRunningAiAllocation, setIsRunningAiAllocation] = useState(false);

  // Difference Handling
  const [differenceHandling, setDifferenceHandling] = useState<string>("");
  const [discountReason, setDiscountReason] = useState<string>("");
  const [surchargeReason, setSurchargeReason] = useState<string>("");
  const [surchargeInvoiceId, setSurchargeInvoiceId] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<string>("original");
  const [stripeRequestExpiry, setStripeRequestExpiry] = useState<number>(7);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculations
  const parsedAmount = parseFloat(paymentAmount) || 0;

  const totalOutstanding = useMemo(
    () => outstandingInvoices.reduce((sum, inv) => sum + inv.balance_due, 0),
    [outstandingInvoices]
  );

  const totalAllocated = useMemo(
    () => allocations.reduce((sum, a) => sum + a.allocated_amount, 0),
    [allocations]
  );

  const difference = useMemo(
    () => parsedAmount - totalAllocated,
    [parsedAmount, totalAllocated]
  );
  const isOverpayment = difference > 0.01;
  const isUnderpayment = difference < -0.01;
  const isExactPayment = Math.abs(difference) <= 0.01;

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    if (isOpen) {
      loadPaymentMethods();
      if (!preSelectedCustomerId) {
        loadCustomersWithOutstanding();
      }
    }
  }, [isOpen, preSelectedCustomerId]);

  useEffect(() => {
    if (preSelectedCustomerId) {
      setSelectedCustomerId(preSelectedCustomerId);
    }
  }, [preSelectedCustomerId]);

  useEffect(() => {
    if (selectedCustomerId) {
      loadCustomerDetails();
      loadOutstandingInvoices();
    } else {
      setSelectedCustomer(null);
      setOutstandingInvoices([]);
      setAllocations([]);
    }
  }, [selectedCustomerId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setSelectedCustomerId(preSelectedCustomerId || null);
    setSelectedCustomer(null);
    setOutstandingInvoices([]);
    setPaymentAmount("");
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setPaymentMethodId("");
    setReferenceNumber("");
    setNotes("");
    setUploadedPaystub(null);
    setPaystubExtraction(null);
    setAllocations([]);
    setDifferenceHandling("");
    setDiscountReason("");
    setSurchargeReason("");
    setSurchargeInvoiceId("");
    setRefundMethod("original");
    setStripeRequestExpiry(7);
  };

  // ============================================
  // DATA LOADING
  // ============================================

  const loadPaymentMethods = async () => {
    setIsLoadingMethods(true);
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, code, name")
        .eq("is_active", true)
        .neq("code", "stripe")
        .neq("code", "account")
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error("Error loading payment methods:", error);
      toast.error("Failed to load payment methods");
    } finally {
      setIsLoadingMethods(false);
    }
  };

  const loadCustomersWithOutstanding = async () => {
    setIsLoadingCustomers(true);
    try {
      // Get customers with outstanding invoices
      const { data, error } = await supabase
        .from("customers")
        .select(
          `
          id, full_name, company_name, email, customer_type, credit_balance,
          customer_invoices!inner(balance_due)
        `
        )
        .gt("customer_invoices.balance_due", 0);

      if (error) throw error;

      // Deduplicate and format
      const customerMap = new Map<string, Customer>();
      (data || []).forEach((c: any) => {
        if (!customerMap.has(c.id)) {
          customerMap.set(c.id, {
            id: c.id,
            full_name: c.full_name,
            company_name: c.company_name,
            email: c.email,
            customer_type: c.customer_type,
            credit_balance: c.credit_balance || 0,
          });
        }
      });

      setCustomers(Array.from(customerMap.values()));
    } catch (error) {
      console.error("Error loading customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const loadCustomerDetails = async () => {
    if (!selectedCustomerId) return;

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, company_name, email, customer_type, credit_balance")
        .eq("id", selectedCustomerId)
        .single();

      if (error) throw error;
      setSelectedCustomer(data);
    } catch (error) {
      console.error("Error loading customer details:", error);
    }
  };

  const loadOutstandingInvoices = async () => {
    if (!selectedCustomerId) return;

    setIsLoadingInvoices(true);
    try {
      const { data, error } = await supabase
        .from("customer_invoices")
        .select(
          `
          id,
          invoice_number,
          order_id,
          total_amount,
          amount_paid,
          balance_due,
          due_date,
          status,
          orders!inner(order_number)
        `
        )
        .eq("customer_id", selectedCustomerId)
        .gt("balance_due", 0)
        .order("due_date", { ascending: true });

      if (error) throw error;

      const invoices: OutstandingInvoice[] = (data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        order_id: inv.order_id,
        order_number: inv.orders?.order_number || "",
        total_amount: inv.total_amount,
        amount_paid: inv.amount_paid || 0,
        balance_due: inv.balance_due,
        due_date: inv.due_date,
        status: inv.status,
        is_overdue: new Date(inv.due_date) < new Date(),
      }));
      setOutstandingInvoices(invoices);
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast.error("Failed to load outstanding invoices");
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  // ============================================
  // PAYSTUB UPLOAD & AI EXTRACTION
  // ============================================

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePaystubUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setUploadedPaystub(file);
    setIsAnalyzingPaystub(true);

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-paystub`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type,
            customerId: selectedCustomerId,
            outstandingInvoices: outstandingInvoices.map((inv) => ({
              id: inv.id,
              invoice_number: inv.invoice_number,
              amount: inv.total_amount,
              outstanding: inv.balance_due,
              due_date: inv.due_date,
            })),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to analyze paystub");
      }

      if (result.extracted) {
        setPaystubExtraction(result.extracted);
        applyPaystubExtraction(result.extracted);
        toast.success("Paystub analyzed successfully");
      }
    } catch (error) {
      console.error("Paystub analysis error:", error);
      toast.error("Failed to analyze paystub. Please enter details manually.");
    } finally {
      setIsAnalyzingPaystub(false);
    }
  };

  const applyPaystubExtraction = (extraction: PaystubExtraction) => {
    if (extraction.amount) setPaymentAmount(extraction.amount.toString());
    if (extraction.payment_date) setPaymentDate(extraction.payment_date);
    if (extraction.reference_number) setReferenceNumber(extraction.reference_number);

    // Find and select payment method
    if (extraction.payment_method) {
      const method = paymentMethods.find(
        (m) =>
          m.code?.toLowerCase().includes(extraction.payment_method?.toLowerCase() || "") ||
          m.name?.toLowerCase().includes(extraction.payment_method?.toLowerCase() || "")
      );
      if (method) setPaymentMethodId(method.id);
    }

    // Auto-allocate to matched invoices
    if (extraction.invoice_numbers?.length > 0 && extraction.amount) {
      const matchedAllocations = autoAllocateToMatched(
        extraction.amount,
        extraction.invoice_numbers
      );
      setAllocations(matchedAllocations);
    }
  };

  const autoAllocateToMatched = (
    amount: number,
    invoiceNumbers: string[]
  ): Allocation[] => {
    const matchedInvoices = outstandingInvoices.filter((inv) =>
      invoiceNumbers.some(
        (num) =>
          inv.invoice_number.toLowerCase().includes(num.toLowerCase()) ||
          num.toLowerCase().includes(inv.invoice_number.toLowerCase())
      )
    );

    let remaining = amount;
    const result: Allocation[] = [];

    for (const inv of matchedInvoices) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, inv.balance_due);
      result.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_total: inv.total_amount,
        outstanding: inv.balance_due,
        allocated_amount: alloc,
        is_full_payment: alloc >= inv.balance_due - 0.01,
        is_ai_matched: true,
      });
      remaining -= alloc;
    }

    return result;
  };

  const removePaystub = () => {
    setUploadedPaystub(null);
    setPaystubExtraction(null);
  };

  // ============================================
  // ALLOCATION METHODS
  // ============================================

  const handleAutoAllocateFIFO = () => {
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Enter payment amount first");
      return;
    }

    // Sort by due date (oldest first)
    const sorted = [...outstandingInvoices].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );

    let remaining = parsedAmount;
    const newAllocations: Allocation[] = [];

    for (const inv of sorted) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, inv.balance_due);
      newAllocations.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_total: inv.total_amount,
        outstanding: inv.balance_due,
        allocated_amount: alloc,
        is_full_payment: alloc >= inv.balance_due - 0.01,
        is_ai_matched: false,
      });
      remaining -= alloc;
    }

    setAllocations(newAllocations);
    toast.success("Allocated using oldest-first method");
  };

  const handleAiAllocate = async () => {
    if (!parsedAmount || !selectedCustomerId) {
      toast.error("Select customer and enter amount first");
      return;
    }

    setIsRunningAiAllocation(true);
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
            customer_id: selectedCustomerId,
            amount: parsedAmount,
            reference_number: referenceNumber,
            customer_memo: notes,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "AI allocation failed");
      }

      if (result.allocations) {
        const aiAllocations: Allocation[] = result.allocations.map((a: any) => {
          const inv = outstandingInvoices.find((i) => i.id === a.invoice_id);
          return {
            invoice_id: a.invoice_id,
            invoice_number: a.invoice_number,
            invoice_total: inv?.total_amount || 0,
            outstanding: inv?.balance_due || 0,
            allocated_amount: a.allocated_amount,
            is_full_payment: a.allocated_amount >= (inv?.balance_due || 0) - 0.01,
            is_ai_matched: true,
          };
        });
        setAllocations(aiAllocations);

        toast.success(
          `AI allocated with ${(result.confidence * 100).toFixed(0)}% confidence`
        );
      }
    } catch (error) {
      console.error("AI allocation error:", error);
      toast.error("AI allocation failed. Try manual or FIFO.");
    } finally {
      setIsRunningAiAllocation(false);
    }
  };

  const handleAllocationChange = (invoiceId: string, amount: number) => {
    const invoice = outstandingInvoices.find((i) => i.id === invoiceId);
    if (!invoice) return;

    // Ensure amount doesn't exceed outstanding
    const validAmount = Math.min(Math.max(0, amount), invoice.balance_due);

    setAllocations((prev) => {
      const existing = prev.find((a) => a.invoice_id === invoiceId);
      if (existing) {
        if (validAmount === 0) {
          return prev.filter((a) => a.invoice_id !== invoiceId);
        }
        return prev.map((a) =>
          a.invoice_id === invoiceId
            ? {
                ...a,
                allocated_amount: validAmount,
                is_full_payment: validAmount >= invoice.balance_due - 0.01,
              }
            : a
        );
      } else if (validAmount > 0) {
        return [
          ...prev,
          {
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            invoice_total: invoice.total_amount,
            outstanding: invoice.balance_due,
            allocated_amount: validAmount,
            is_full_payment: validAmount >= invoice.balance_due - 0.01,
            is_ai_matched: false,
          },
        ];
      }
      return prev;
    });
  };

  const handleCheckboxToggle = (invoiceId: string, checked: boolean) => {
    const invoice = outstandingInvoices.find((i) => i.id === invoiceId);
    if (!invoice) return;

    if (checked) {
      const remaining = parsedAmount - totalAllocated;
      handleAllocationChange(invoiceId, Math.min(remaining, invoice.balance_due));
    } else {
      handleAllocationChange(invoiceId, 0);
    }
  };

  const clearAllocations = () => {
    setAllocations([]);
  };

  // ============================================
  // VALIDATION
  // ============================================

  const isValid = () => {
    if (!selectedCustomerId) return false;
    if (!parsedAmount || parsedAmount <= 0) return false;
    if (!paymentMethodId) return false;
    if (allocations.length === 0) return false;

    // Validate difference handling
    if (isOverpayment && !differenceHandling) return false;
    if (isUnderpayment && !differenceHandling) return false;

    // Validate specific handling requirements
    if (differenceHandling === "discount" && !discountReason.trim()) return false;
    if (differenceHandling === "surcharge" && !surchargeInvoiceId) return false;

    return true;
  };

  // ============================================
  // SUBMISSION
  // ============================================

  const handleSubmit = async () => {
    if (!isValid()) {
      if (!selectedCustomerId) toast.error("Select a customer");
      else if (!parsedAmount || parsedAmount <= 0) toast.error("Enter payment amount");
      else if (!paymentMethodId) toast.error("Select payment method");
      else if (allocations.length === 0)
        toast.error("Allocate payment to at least one invoice");
      else if (isOverpayment && !differenceHandling)
        toast.error("Select how to handle overpayment");
      else if (isUnderpayment && !differenceHandling)
        toast.error("Select how to handle underpayment");
      else if (differenceHandling === "discount" && !discountReason.trim())
        toast.error("Enter discount reason");
      else if (differenceHandling === "surcharge" && !surchargeInvoiceId)
        toast.error("Select invoice for surcharge");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-bulk-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customer_id: selectedCustomerId,
            amount: parsedAmount,
            payment_method_id: paymentMethodId,
            payment_date: paymentDate,
            reference_number: referenceNumber.trim() || null,
            notes: notes.trim() || null,
            allocations: allocations.map((a) => ({
              invoice_id: a.invoice_id,
              allocated_amount: a.allocated_amount,
              is_ai_matched: a.is_ai_matched,
            })),
            difference_handling: differenceHandling || null,
            difference_amount: Math.abs(difference),
            // Overpayment specific
            surcharge_invoice_id: surchargeInvoiceId || null,
            surcharge_reason: surchargeReason.trim() || null,
            refund_method: refundMethod,
            // Underpayment specific
            discount_reason: discountReason.trim() || null,
            stripe_request_expiry_days: stripeRequestExpiry,
            // AI data
            ai_extracted: !!paystubExtraction,
            ai_confidence: paystubExtraction?.confidence || null,
            paystub_filename: uploadedPaystub?.name || null,
            // Staff
            staff_id: staffId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to record payment");
      }

      toast.success("Payment recorded successfully");

      // Handle Stripe link if generated
      if (result.stripe_payment_link) {
        navigator.clipboard.writeText(result.stripe_payment_link);
        toast.success("Stripe payment link copied to clipboard");
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error("Submit error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to record payment";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Receive Bulk Payment</h2>
              <p className="text-sm text-gray-500">
                Allocate payment across multiple invoices
              </p>
            </div>
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
          {/* ============================================ */}
          {/* SECTION 1: PAYSTUB UPLOAD (Optional) */}
          {/* ============================================ */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6">
            <div className="text-center">
              {!uploadedPaystub ? (
                <>
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-6 h-6 text-purple-600" />
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">
                    Upload Paystub / Remittance Advice (Optional)
                  </h4>
                  <p className="text-sm text-gray-500 mb-3">
                    AI will extract payment details and match invoices automatically
                  </p>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                    <Sparkles className="w-4 h-4" />
                    Choose File
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handlePaystubUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-400 mt-2">PDF, PNG, JPG - Max 10MB</p>
                </>
              ) : isAnalyzingPaystub ? (
                <div className="py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
                  <p className="font-medium text-gray-700">Analyzing document...</p>
                  <p className="text-sm text-gray-500">Extracting payment details</p>
                </div>
              ) : (
                <div className="text-left">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-purple-500" />
                      <div>
                        <p className="font-medium text-gray-900">{uploadedPaystub.name}</p>
                        <p className="text-sm text-gray-500">
                          {(uploadedPaystub.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={removePaystub}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* AI Extraction Results */}
                  {paystubExtraction && (
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <span className="font-medium text-purple-800">AI Extracted</span>
                        <span className="ml-auto text-sm text-purple-600">
                          {(paystubExtraction.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-purple-600">Amount:</span>
                          <span className="ml-2 font-medium">
                            {paystubExtraction.amount
                              ? `$${paystubExtraction.amount.toFixed(2)}`
                              : "Not found"}
                          </span>
                        </div>
                        <div>
                          <span className="text-purple-600">Date:</span>
                          <span className="ml-2 font-medium">
                            {paystubExtraction.payment_date || "Not found"}
                          </span>
                        </div>
                        <div>
                          <span className="text-purple-600">Reference:</span>
                          <span className="ml-2 font-medium">
                            {paystubExtraction.reference_number || "Not found"}
                          </span>
                        </div>
                        <div>
                          <span className="text-purple-600">Invoices:</span>
                          <span className="ml-2 font-medium">
                            {paystubExtraction.invoice_numbers?.join(", ") || "None found"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          {!uploadedPaystub && (
            <div className="flex items-center gap-4">
              <div className="flex-1 border-t border-gray-200"></div>
              <span className="text-sm text-gray-400">OR ENTER MANUALLY</span>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>
          )}

          {/* ============================================ */}
          {/* SECTION 2: CUSTOMER SELECTION */}
          {/* ============================================ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer <span className="text-red-500">*</span>
            </label>
            {preSelectedCustomerId && selectedCustomer ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                  {selectedCustomer.customer_type === "business" ? (
                    <Building className="w-5 h-5 text-teal-600" />
                  ) : (
                    <User className="w-5 h-5 text-teal-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedCustomer.full_name}
                    {selectedCustomer.company_name &&
                      ` (${selectedCustomer.company_name})`}
                  </p>
                  <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm text-gray-500">Outstanding</p>
                  <p className="font-semibold text-red-600">
                    ${totalOutstanding.toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <select
                value={selectedCustomerId || ""}
                onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                disabled={isLoadingCustomers}
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.company_name ? ` (${c.company_name})` : ""} - {c.email}
                  </option>
                ))}
              </select>
            )}

            {/* Credit Balance Notice */}
            {selectedCustomer && selectedCustomer.credit_balance > 0 && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">
                  Customer has ${selectedCustomer.credit_balance.toFixed(2)} credit
                  available
                </span>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/* SECTION 3: PAYMENT DETAILS */}
          {/* ============================================ */}
          {selectedCustomerId && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Received <span className="text-red-500">*</span>
                  {paystubExtraction?.amount && (
                    <span className="ml-2 text-xs text-purple-600">AI filled</span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className={`w-full pl-8 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                      paystubExtraction?.amount
                        ? "border-purple-300 bg-purple-50"
                        : "border-gray-300"
                    }`}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                {isLoadingMethods ? (
                  <div className="flex items-center gap-2 text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <select
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Select method...</option>
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference / Check #
                  {paystubExtraction?.reference_number && (
                    <span className="ml-2 text-xs text-purple-600">AI filled</span>
                  )}
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                    paystubExtraction?.reference_number
                      ? "border-purple-300 bg-purple-50"
                      : "border-gray-300"
                  }`}
                  placeholder="Optional"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                  rows={2}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* SECTION 4: INVOICE ALLOCATION */}
          {/* ============================================ */}
          {selectedCustomerId && outstandingInvoices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Allocate to Invoices</h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAiAllocate}
                    disabled={isRunningAiAllocation || !parsedAmount}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isRunningAiAllocation ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    AI Allocate
                  </button>
                  <button
                    onClick={handleAutoAllocateFIFO}
                    disabled={!parsedAmount}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Auto (FIFO)
                  </button>
                  <button
                    onClick={clearAllocations}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Invoice List */}
              {isLoadingInvoices ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Invoice
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Due Date
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Outstanding
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Allocate
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {outstandingInvoices.map((invoice) => {
                        const allocation = allocations.find(
                          (a) => a.invoice_id === invoice.id
                        );
                        const allocatedAmount = allocation?.allocated_amount || 0;

                        return (
                          <tr
                            key={invoice.id}
                            className={`${
                              allocation?.is_ai_matched ? "bg-purple-50" : ""
                            } ${invoice.is_overdue ? "bg-red-50" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={allocatedAmount > 0}
                                  onChange={(e) =>
                                    handleCheckboxToggle(invoice.id, e.target.checked)
                                  }
                                  className="w-4 h-4 text-teal-600 rounded"
                                />
                                <div>
                                  <span className="font-medium text-gray-900">
                                    {invoice.invoice_number}
                                  </span>
                                  {allocation?.is_ai_matched && (
                                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                                      AI Matched
                                    </span>
                                  )}
                                  <div className="text-xs text-gray-500">
                                    {invoice.order_number}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={
                                  invoice.is_overdue
                                    ? "text-red-600 font-medium"
                                    : "text-gray-600"
                                }
                              >
                                {format(new Date(invoice.due_date), "MMM d, yyyy")}
                              </span>
                              {invoice.is_overdue && (
                                <span className="ml-1 text-xs text-red-500">Overdue</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              ${invoice.balance_due.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                  $
                                </span>
                                <input
                                  type="number"
                                  value={allocatedAmount || ""}
                                  onChange={(e) =>
                                    handleAllocationChange(
                                      invoice.id,
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-28 pl-7 pr-3 py-1.5 text-right border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                  step="0.01"
                                  max={invoice.balance_due}
                                  placeholder="0.00"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {allocatedAmount >= invoice.balance_due - 0.01 ? (
                                <span className="text-xs text-green-600 font-medium">
                                  Full
                                </span>
                              ) : allocatedAmount > 0 ? (
                                <span className="text-xs text-amber-600">Partial</span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Allocation Summary */}
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Payment Amount:</span>
                    <span className="ml-2 font-medium">${parsedAmount.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Allocated:</span>
                    <span className="ml-2 font-medium">${totalAllocated.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Difference:</span>
                    <span
                      className={`ml-2 font-medium ${
                        isOverpayment
                          ? "text-green-600"
                          : isUnderpayment
                          ? "text-red-600"
                          : "text-gray-900"
                      }`}
                    >
                      {isOverpayment ? "+" : ""}
                      {difference.toFixed(2)}
                      {isOverpayment && " (overpayment)"}
                      {isUnderpayment && " (shortfall)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No invoices message */}
          {selectedCustomerId && !isLoadingInvoices && outstandingInvoices.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No outstanding invoices found for this customer
            </div>
          )}

          {/* ============================================ */}
          {/* SECTION 5: OVERPAYMENT HANDLING */}
          {/* ============================================ */}
          {isOverpayment && allocations.length > 0 && (
            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <h4 className="font-medium text-green-800 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Handle Overpayment: ${difference.toFixed(2)}
              </h4>

              <div className="space-y-3">
                {/* Credit on Account */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-green-400">
                  <input
                    type="radio"
                    name="overpayment"
                    value="credit"
                    checked={differenceHandling === "credit"}
                    onChange={(e) => setDifferenceHandling(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Credit on Account</p>
                    <p className="text-sm text-gray-500">
                      Store ${difference.toFixed(2)} as credit for future invoices
                    </p>
                  </div>
                </label>

                {/* Apply as Surcharge */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-green-400">
                  <input
                    type="radio"
                    name="overpayment"
                    value="surcharge"
                    checked={differenceHandling === "surcharge"}
                    onChange={(e) => setDifferenceHandling(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Apply as Surcharge</p>
                    <p className="text-sm text-gray-500 mb-2">
                      Add ${difference.toFixed(2)} as surcharge to an invoice
                    </p>
                    {differenceHandling === "surcharge" && (
                      <div className="space-y-2">
                        <select
                          value={surchargeInvoiceId}
                          onChange={(e) => setSurchargeInvoiceId(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border rounded-lg"
                        >
                          <option value="">Select invoice...</option>
                          {outstandingInvoices.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.invoice_number}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={surchargeReason}
                          onChange={(e) => setSurchargeReason(e.target.value)}
                          placeholder="Reason (e.g., Advance payment)"
                          className="w-full px-3 py-1.5 text-sm border rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                </label>

                {/* Refund */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-green-400">
                  <input
                    type="radio"
                    name="overpayment"
                    value="refund"
                    checked={differenceHandling === "refund"}
                    onChange={(e) => setDifferenceHandling(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Refund Customer</p>
                    <p className="text-sm text-gray-500 mb-2">
                      Refund ${difference.toFixed(2)} to customer
                    </p>
                    {differenceHandling === "refund" && (
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="refund_method"
                            value="original"
                            checked={refundMethod === "original"}
                            onChange={(e) => setRefundMethod(e.target.value)}
                          />
                          <span className="text-sm">Via Stripe (original method)</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="refund_method"
                            value="manual"
                            checked={refundMethod === "manual"}
                            onChange={(e) => setRefundMethod(e.target.value)}
                          />
                          <span className="text-sm">Manual refund</span>
                        </label>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* SECTION 6: UNDERPAYMENT HANDLING */}
          {/* ============================================ */}
          {isUnderpayment && allocations.length > 0 && (
            <div className="border border-red-200 rounded-lg p-4 bg-red-50">
              <h4 className="font-medium text-red-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Handle Shortfall: ${Math.abs(difference).toFixed(2)}
              </h4>

              <div className="space-y-3">
                {/* Partial Payments */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-red-400">
                  <input
                    type="radio"
                    name="underpayment"
                    value="partial"
                    checked={differenceHandling === "partial"}
                    onChange={(e) => setDifferenceHandling(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Apply as Partial Payments</p>
                    <p className="text-sm text-gray-500">
                      Record payments as allocated, leave $
                      {Math.abs(difference).toFixed(2)} as outstanding balance
                    </p>
                  </div>
                </label>

                {/* Apply Discount */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-red-400">
                  <input
                    type="radio"
                    name="underpayment"
                    value="discount"
                    checked={differenceHandling === "discount"}
                    onChange={(e) => setDifferenceHandling(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Apply Discount</p>
                    <p className="text-sm text-gray-500 mb-2">
                      Write off ${Math.abs(difference).toFixed(2)} as a discount
                    </p>
                    {differenceHandling === "discount" && (
                      <input
                        type="text"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder="Reason (e.g., Settlement discount, Goodwill)"
                        className="w-full px-3 py-1.5 text-sm border rounded-lg"
                        required
                      />
                    )}
                  </div>
                </label>

                {/* Request via Stripe */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-red-400">
                  <input
                    type="radio"
                    name="underpayment"
                    value="stripe_request"
                    checked={differenceHandling === "stripe_request"}
                    onChange={(e) => setDifferenceHandling(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      Request Remaining via Stripe
                    </p>
                    <p className="text-sm text-gray-500 mb-2">
                      Generate Stripe payment link for ${Math.abs(difference).toFixed(2)}{" "}
                      and email to customer
                    </p>
                    {differenceHandling === "stripe_request" && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">Link expires in:</span>
                        <select
                          value={stripeRequestExpiry}
                          onChange={(e) =>
                            setStripeRequestExpiry(parseInt(e.target.value))
                          }
                          className="px-3 py-1.5 text-sm border rounded-lg"
                        >
                          <option value={3}>3 days</option>
                          <option value={7}>7 days</option>
                          <option value={14}>14 days</option>
                          <option value={30}>30 days</option>
                        </select>
                      </div>
                    )}
                  </div>
                </label>

                {/* Adjust Allocation */}
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-red-400">
                  <input
                    type="radio"
                    name="underpayment"
                    value="adjust"
                    checked={differenceHandling === "adjust"}
                    onChange={(e) => setDifferenceHandling(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Adjust Allocation</p>
                    <p className="text-sm text-gray-500">
                      Go back and reduce allocations to match payment amount
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {selectedCustomer && (
              <span>
                {outstandingInvoices.length} invoice
                {outstandingInvoices.length !== 1 ? "s" : ""} - $
                {totalOutstanding.toFixed(2)} outstanding
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid() || isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Record Payment
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
