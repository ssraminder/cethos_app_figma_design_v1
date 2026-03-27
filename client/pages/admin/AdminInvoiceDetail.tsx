import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft:  { label: "Draft",  className: "bg-gray-100 text-gray-600" },
  issued: { label: "Issued", className: "bg-blue-100 text-blue-700" },
  sent:   { label: "Sent",   className: "bg-indigo-100 text-indigo-700" },
  paid:   { label: "Paid",   className: "bg-green-100 text-green-700" },
  void:   { label: "Void",   className: "bg-red-100 text-red-700" },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const AdminInvoiceDetail = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [ordersMap, setOrdersMap] = useState<Record<string, any>>({});
  const [customer, setCustomer] = useState<any>(null);
  const [branch, setBranch] = useState<any>(null);
  const [paymentMethodsMap, setPaymentMethodsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [confirmModal, setConfirmModal] = useState<"issue" | "void" | null>(null);

  // Editable descriptions state
  const [quoteGroupsMap, setQuoteGroupsMap] = useState<Record<string, any>>({});
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savedLineId, setSavedLineId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Send modal state
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendRecipients, setSendRecipients] = useState<string[]>([]);
  const [sendEmailInput, setSendEmailInput] = useState("");
  const [sendEmailError, setSendEmailError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const [invoiceResult, linesResult] = await Promise.all([
        supabase
          .from("customer_invoices")
          .select("*")
          .eq("id", invoiceId)
          .single(),
        supabase
          .from("customer_invoice_lines")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("sort_order"),
      ]);

      if (invoiceResult.error) {
        setError(invoiceResult.error.message);
        setLoading(false);
        return;
      }

      if (!invoiceResult.data) {
        setError("Invoice not found");
        setLoading(false);
        return;
      }

      const invoiceData = invoiceResult.data;
      const linesData = linesResult.data || [];

      const orderIds = linesData
        .filter((l: any) => l.line_type === "order" && l.order_id)
        .map((l: any) => l.order_id);

      const branchId = invoiceData.invoicing_branch_id || 2;

      const [ordersResult, customerResult, branchResult] = await Promise.all([
        orderIds.length > 0
          ? supabase
              .from("orders")
              .select("id, order_number, created_at, quote_id")
              .in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("customers")
          .select(
            "id, full_name, company_name, email, ar_contact_email, preferred_payment_method_id, backup_payment_method_id"
          )
          .eq("id", invoiceData.customer_id)
          .single(),
        supabase
          .from("branches")
          .select(
            "id, legal_name, tax_label, tax_number, address_line1, address_line2, city, province, postal_code, email, phone"
          )
          .eq("id", branchId)
          .single(),
      ]);

      const map: Record<string, any> = {};
      for (const order of ordersResult.data || []) {
        map[order.id] = order;
      }

      const customerData = customerResult.data || null;

      // Fetch payment method names
      const pmIds = [
        customerData?.preferred_payment_method_id,
        customerData?.backup_payment_method_id,
      ].filter(Boolean);

      let pmMap: Record<string, string> = {};
      if (pmIds.length > 0) {
        const pmResult = await supabase
          .from("payment_methods")
          .select("id, name")
          .in("id", pmIds);
        for (const pm of pmResult.data || []) {
          pmMap[pm.id] = pm.name;
        }
      }

      // Fetch quote document groups for suggested descriptions
      const quoteIds = (ordersResult.data || [])
        .map((o: any) => o.quote_id)
        .filter(Boolean);

      let qgMap: Record<string, any> = {};
      if (quoteIds.length > 0) {
        const qgResult = await supabase
          .from("quote_document_groups")
          .select("quote_id, document_type, detected_language_name, source_language, total_word_count")
          .in("quote_id", quoteIds)
          .order("group_number");
        for (const g of qgResult.data || []) {
          if (!qgMap[g.quote_id]) qgMap[g.quote_id] = g;
        }
      }

      setInvoice(invoiceData);
      setLines(linesData);
      setOrdersMap(map);
      setCustomer(customerData);
      setBranch(branchResult.data || null);
      setPaymentMethodsMap(pmMap);
      setQuoteGroupsMap(qgMap);
      setLoading(false);
    };

    fetchData();
  }, [invoiceId]);

  const reloadInvoice = async () => {
    if (!invoiceId) return;
    const { data } = await supabase
      .from("customer_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (data) setInvoice(data);
  };

  const handleDownloadPdf = async () => {
    if (!invoice.pdf_storage_path) return;
    setActionInFlight(true);
    try {
      const { data, error } = await supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.pdf_storage_path, 60);
      if (error || !data?.signedUrl) {
        toast.error(error?.message || "Failed to generate download link");
      } else {
        window.open(data.signedUrl, "_blank");
      }
    } finally {
      setActionInFlight(false);
    }
  };

  const handleRegeneratePdf = async () => {
    setActionInFlight(true);
    try {
      const token = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "generate_pdf", invoice_id: invoiceId, regenerate: true }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Failed to regenerate PDF");
      } else {
        toast.success("PDF regenerated successfully");
        await reloadInvoice();
      }
    } catch {
      toast.error("Network error regenerating PDF");
    } finally {
      setActionInFlight(false);
    }
  };

  const handleInvoiceAction = async (action: "issue" | "void") => {
    setConfirmModal(null);
    setActionInFlight(true);
    try {
      const token = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-customer-invoice`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action, invoice_id: invoiceId }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || `Failed to ${action} invoice`);
      } else {
        toast.success(action === "issue" ? "Invoice issued" : "Invoice voided");
        await reloadInvoice();
      }
    } catch {
      toast.error(`Network error — could not ${action} invoice`);
    } finally {
      setActionInFlight(false);
    }
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const openSendModal = () => {
    const defaultEmail = customer?.ar_contact_email || customer?.email || "";
    setSendRecipients(defaultEmail ? [defaultEmail] : []);
    setSendEmailInput("");
    setSendEmailError(null);
    setSendNote("");
    setSendError(null);
    setSendModalOpen(true);
  };

  const addEmailTag = (raw: string) => {
    const email = raw.trim().replace(/,$/, "").trim();
    if (!email) return;
    if (!isValidEmail(email)) {
      setSendEmailError("Invalid email address");
      return;
    }
    if (sendRecipients.includes(email)) {
      setSendEmailInput("");
      return;
    }
    setSendRecipients((prev) => [...prev, email]);
    setSendEmailInput("");
    setSendEmailError(null);
  };

  const handleSendKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmailTag(sendEmailInput);
    }
  };

  const handleSendInvoice = async () => {
    if (sendRecipients.length === 0) {
      setSendEmailError("Add at least one recipient");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const token = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-email`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invoice_id: invoiceId,
            recipient_emails: sendRecipients,
            ...(sendNote.trim() ? { staff_note: sendNote.trim() } : {}),
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(body.error || "Failed to send invoice");
      } else {
        setSendModalOpen(false);
        toast.success(`Invoice sent to ${body.sent_to || sendRecipients.join(", ")}`);
        await reloadInvoice();
      }
    } catch {
      setSendError("Network error — could not send invoice");
    } finally {
      setSending(false);
    }
  };

  const startEditing = (line: any) => {
    setEditingLineId(line.id);
    setEditingValue(line.description);
    setEditError(null);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setEditingLineId(null);
    setEditingValue("");
    setEditError(null);
  };

  const saveDescription = async (lineId: string, value: string) => {
    if (!value.trim()) {
      setEditError("Description cannot be empty");
      return;
    }
    const { error } = await supabase
      .from("customer_invoice_lines")
      .update({ description: value.trim() })
      .eq("id", lineId);
    if (error) {
      setEditError(error.message);
      return;
    }
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, description: value.trim() } : l))
    );
    setEditingLineId(null);
    setEditingValue("");
    setEditError(null);
    setSavedLineId(lineId);
    setTimeout(() => setSavedLineId(null), 2000);
  };

  const formatDocType = (dt: string) =>
    dt
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-medium text-red-800">
            {error === "Invoice not found" ? "Invoice not found" : "Error loading invoice"}
          </p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={() => navigate("/admin/invoices/customer")}
            className="mt-3 text-sm text-teal-600 hover:underline"
          >
            &larr; Back to Customer Invoices
          </button>
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[invoice.status] ?? { label: invoice.status, className: "bg-gray-100 text-gray-600" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
  const isOverdue = dueDate && parseFloat(invoice.balance_due) > 0 && dueDate < today;
  const dueDateClass = isOverdue ? "text-red-600" : "text-gray-500";

  return (
    <>
    <div className="p-6">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6">
        {/* Left: back link */}
        <Link
          to="/admin/invoices/customer"
          className="text-sm text-teal-600 hover:underline flex items-center gap-1"
        >
          &larr; Customer Invoices
        </Link>

        {/* Centre: invoice number */}
        <h1 className="text-lg font-bold text-gray-900 absolute left-1/2 -translate-x-1/2">
          Invoice #{invoice.invoice_number}
        </h1>

        {/* Right: badge + due date */}
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.className}`}>
            {badge.label}
          </span>
          {dueDate && (
            <span className={`text-sm ${dueDateClass}`}>
              Due: {formatDate(invoice.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left column: line items */}
        <div className="w-2/3 border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Invoice Lines</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line: any) => {
                const isCredit = line.line_type === "credit";
                const textClass = isCredit ? "text-red-600" : "text-gray-900";
                const order = ordersMap[line.order_id];
                const orderDate = order?.created_at
                  ? new Date(order.created_at).toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "";
                const amount = parseFloat(line.line_total ?? 0).toLocaleString("en-CA", {
                  style: "currency",
                  currency: "CAD",
                  currencyDisplay: "symbol",
                }).replace("CA$", "$");

                const isEditing = editingLineId === line.id;
                const isSaved = savedLineId === line.id;

                // Suggested text from quote groups
                const quoteGroup = order?.quote_id ? quoteGroupsMap[order.quote_id] : null;
                const suggested = quoteGroup
                  ? `${formatDocType(quoteGroup.document_type)} · ${quoteGroup.detected_language_name || quoteGroup.source_language || "Unknown"} → English · ${quoteGroup.total_word_count ?? 0} words`
                  : null;

                return (
                  <tr
                    key={line.id}
                    className="border-b border-gray-50 last:border-0 group"
                    onClick={() => {
                      if (!isEditing && editingLineId !== null) cancelEditing();
                    }}
                  >
                    <td className={`py-2 pr-4 ${textClass}`}>
                      {isEditing ? (
                        <div>
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingValue}
                            onChange={(e) => {
                              setEditingValue(e.target.value);
                              setEditError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveDescription(line.id, editingValue);
                              if (e.key === "Escape") cancelEditing();
                            }}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900"
                          />
                          {editError && (
                            <p className="text-xs text-red-600 mt-1">{editError}</p>
                          )}
                          {suggested && (
                            <p className="text-xs text-gray-400 mt-1">
                              Suggested: {suggested}{" "}
                              <button
                                onClick={() => setEditingValue(suggested)}
                                className="text-teal-600 hover:underline"
                              >
                                Use this →
                              </button>
                            </p>
                          )}
                          <div className="flex gap-2 mt-1.5">
                            <button
                              onClick={() => saveDescription(line.id, editingValue)}
                              className="text-green-600 hover:text-green-800 text-xs font-medium"
                            >
                              ✓ Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="text-gray-400 hover:text-gray-600 text-xs"
                            >
                              ✗ Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div
                            className="flex items-center gap-1.5 cursor-pointer"
                            onClick={() => startEditing(line)}
                          >
                            <span>{line.description}</span>
                            <span className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity text-xs">
                              ✏
                            </span>
                            {isSaved && (
                              <span className="text-xs text-green-600 font-medium">Saved ✓</span>
                            )}
                          </div>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {line.po_number && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                                PO: {line.po_number}
                              </span>
                            )}
                            {line.client_project_number && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                                Project #: {line.client_project_number}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{orderDate}</td>
                    <td className={`py-2 text-right font-mono whitespace-nowrap ${textClass}`}>
                      {amount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals block */}
          {(() => {
            const fmt = (n: number) =>
              n.toLocaleString("en-CA", {
                style: "currency",
                currency: "CAD",
                currencyDisplay: "symbol",
              }).replace("CA$", "$");

            const subtotal = lines.reduce(
              (sum: number, l: any) => sum + parseFloat(l.line_total ?? 0),
              0
            );
            const taxLabel = branch?.tax_label || "GST";
            const taxRate = invoice.tax_rate
              ? `${(parseFloat(invoice.tax_rate) * 100).toFixed(0)}%`
              : "";
            const taxAmount = parseFloat(invoice.tax_amount ?? 0);
            const total = parseFloat(invoice.total_amount ?? 0);
            const paid = parseFloat(invoice.amount_paid ?? 0);
            const balance = parseFloat(invoice.balance_due ?? 0);

            return (
              <div className="mt-4 flex flex-col items-end gap-1.5 text-sm">
                <div className="flex gap-8">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-mono w-24 text-right">{fmt(subtotal)}</span>
                </div>
                <div className="flex gap-8">
                  <span className="text-gray-500">
                    {taxLabel} {taxRate && `(${taxRate})`}
                  </span>
                  <span className="font-mono w-24 text-right">{fmt(taxAmount)}</span>
                </div>
                <hr className="w-48 border-gray-200 my-1" />
                <div className="flex gap-8 items-baseline">
                  <span className="font-semibold text-blue-900">Total</span>
                  <span className="font-mono w-24 text-right font-bold text-blue-900 text-base">
                    {fmt(total)}
                  </span>
                </div>
                {paid > 0 && (
                  <div className="flex gap-8">
                    <span className="text-gray-500">Paid</span>
                    <span className="font-mono w-24 text-right">{fmt(paid)}</span>
                  </div>
                )}
                <div className="flex gap-8 items-baseline">
                  <span className="font-semibold">Balance Due</span>
                  {balance > 0 ? (
                    <span className="font-mono w-24 text-right font-bold text-red-600">
                      {fmt(balance)}
                    </span>
                  ) : (
                    <span className="font-mono w-24 text-right font-bold text-green-600">
                      PAID ✓
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right column: actions */}
        <div className="w-1/3 space-y-4">
          {/* Actions card */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Actions</h2>
            <div className="flex flex-col gap-2">
              {/* Download PDF */}
              <div title={!invoice.pdf_storage_path ? "PDF not yet generated" : undefined}>
                <button
                  onClick={handleDownloadPdf}
                  disabled={!invoice.pdf_storage_path || actionInFlight}
                  className="w-full px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {actionInFlight ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "⬇"} Download PDF
                </button>
              </div>

              {/* Regenerate PDF */}
              <div>
                <button
                  onClick={handleRegeneratePdf}
                  disabled={invoice.status === "void" || actionInFlight}
                  className="w-full px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {actionInFlight ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "🔄"} Regenerate PDF
                </button>
              </div>

              {/* Issue Invoice — only when draft */}
              {invoice.status === "draft" && (
                <button
                  onClick={() => setConfirmModal("issue")}
                  disabled={actionInFlight}
                  className="w-full px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✅ Issue Invoice
                </button>
              )}

              {/* Void Invoice — hidden when void */}
              {invoice.status !== "void" && (
                <button
                  onClick={() => setConfirmModal("void")}
                  disabled={actionInFlight}
                  className="w-full px-3 py-2 text-sm rounded border border-red-400 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  🚫 Void Invoice
                </button>
              )}

              {/* Send Invoice */}
              <button
                onClick={openSendModal}
                disabled={
                  actionInFlight ||
                  invoice.status === "void" ||
                  invoice.status === "paid" ||
                  !invoice.pdf_storage_path
                }
                title={
                  invoice.status === "void" || invoice.status === "paid" || !invoice.pdf_storage_path
                    ? "Cannot send"
                    : undefined
                }
                className="w-full px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                📧 Send Invoice
              </button>
            </div>
          </div>

          {/* Invoice Info card */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Invoice Info</h2>
            <dl className="space-y-2 text-sm">
              {[
                ["Branch", branch?.legal_name || "—"],
                ["Tax #", branch ? `${branch.tax_label || ""} ${branch.tax_number || ""}`.trim() || "—" : "—"],
                ["Invoice Date", invoice.invoice_date ? formatDate(invoice.invoice_date) : "—"],
                ["Due Date", invoice.due_date ? formatDate(invoice.due_date) : "—"],
                ["Currency", invoice.currency || "—"],
                ["Last Emailed", invoice.last_emailed_at ? formatDate(invoice.last_emailed_at) : "Never"],
                ["Emails Sent", invoice.email_sent_count ?? 0],
                ["PDF Generated", invoice.pdf_generated_at ? formatDate(invoice.pdf_generated_at) : "Not generated"],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">{label}</dt>
                  <dd className="text-gray-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Bill To card */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Bill To</h2>
            <div className="text-sm space-y-1">
              {customer?.company_name && (
                <p className="font-semibold text-gray-900">{customer.company_name}</p>
              )}
              <p className="text-gray-700">{customer?.full_name || "—"}</p>
              {customer?.email && (
                <p>
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-teal-600 hover:underline"
                  >
                    {customer.email}
                  </a>
                </p>
              )}
              <div className="pt-2 space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Preferred payment</span>
                  <span className="text-gray-900">
                    {customer?.preferred_payment_method_id
                      ? paymentMethodsMap[customer.preferred_payment_method_id] || "—"
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Backup payment</span>
                  <span className="text-gray-900">
                    {customer?.backup_payment_method_id
                      ? paymentMethodsMap[customer.backup_payment_method_id] || "—"
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Confirmation modals */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            {confirmModal === "issue" ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Issue Invoice?</h2>
                <p className="text-sm text-gray-600 mb-6">
                  This will mark the invoice as issued and generate the PDF. Linked orders will be
                  marked as invoiced.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmModal(null)}
                    className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleInvoiceAction("issue")}
                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Issue Invoice
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Void Invoice?</h2>
                <p className="text-sm text-gray-600 mb-6">
                  This cannot be undone. Linked orders will return to unbilled status.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmModal(null)}
                    className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleInvoiceAction("void")}
                    className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Void Invoice
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Send Invoice modal */}
      {sendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Send Invoice {invoice.invoice_number}
            </h2>

            {/* Error banner */}
            {sendError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                {sendError}
              </div>
            )}

            {/* To field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <div className="flex flex-wrap gap-1.5 border border-gray-300 rounded px-2 py-1.5 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 min-h-[40px]">
                {sendRecipients.map((email) => (
                  <span
                    key={email}
                    className="flex items-center gap-1 bg-teal-50 text-teal-800 text-xs px-2 py-0.5 rounded-full"
                  >
                    {email}
                    <button
                      onClick={() => setSendRecipients((prev) => prev.filter((e) => e !== email))}
                      className="text-teal-500 hover:text-teal-800 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={sendEmailInput}
                  onChange={(e) => {
                    setSendEmailInput(e.target.value);
                    setSendEmailError(null);
                  }}
                  onKeyDown={handleSendKeyDown}
                  onBlur={() => sendEmailInput.trim() && addEmailTag(sendEmailInput)}
                  placeholder={sendRecipients.length === 0 ? "Add email address..." : ""}
                  className="flex-1 min-w-[160px] text-sm outline-none bg-transparent"
                />
              </div>
              {sendEmailError && (
                <p className="mt-1 text-xs text-red-600">{sendEmailError}</p>
              )}
            </div>

            {/* Note field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={sendNote}
                onChange={(e) => setSendNote(e.target.value.slice(0, 500))}
                placeholder="Add a note to include in the email (optional)"
                rows={3}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              <p className="mt-1 text-xs text-gray-400 text-right">{sendNote.length}/500</p>
            </div>

            {/* Info block */}
            <div className="mb-6 bg-gray-50 rounded p-3 text-sm text-gray-600 space-y-1">
              <p>📎 The invoice PDF will be attached automatically.</p>
              <p>💳 A Stripe payment link will be generated and included.</p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSendModalOpen(false)}
                disabled={sending}
                className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvoice}
                disabled={sending || sendRecipients.length === 0}
                className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Send Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminInvoiceDetail;
