// KioskShell — finite state machine that drives a kiosk quote flow.
//
// A paired device is the only credential required. Quotes are attributed to
// the device's default_staff_id (set when the device was paired).
//
//   idle
//    └► staff_form  (quote details — KioskStaffForm)
//        └► handoff_to_customer (splash)
//            └► customer_form (contact fields only)
//                └► handoff_to_staff (splash)
//                    └► review (summary + "Send quote to customer")
//                        └► done
//                            └► idle

import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  Tablet,
  User,
  ArrowRight,
  CheckCircle2,
  Mail,
  RotateCcw,
} from "lucide-react";
import {
  clearDeviceCreds,
  getDeviceCreds,
  kioskPost,
  kioskUploadFile,
} from "./KioskApi";
import KioskStaffForm, { StaffQuoteData } from "./KioskStaffForm";
import CustomerSearch, { CustomerHit } from "@/components/shared/CustomerSearch";

type State =
  | "idle"
  | "staff_form"
  | "handoff_to_customer"
  | "customer_form"
  | "handoff_to_staff"
  | "review"
  | "emailing"
  | "done";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

interface CustomerDraft {
  existingCustomerId: string | null;
  fullName: string;
  email: string;
  phone: string;
  customerType: "individual" | "business";
  companyName: string;
}

const EMPTY_CUSTOMER: CustomerDraft = {
  existingCustomerId: null,
  fullName: "",
  email: "",
  phone: "",
  customerType: "individual",
  companyName: "",
};

export default function KioskShell() {
  const navigate = useNavigate();
  const creds = getDeviceCreds();

  // Lock tablet to portrait orientation (ignored on desktop browsers).
  useEffect(() => {
    const so = (screen as unknown as { orientation?: { lock?: (t: string) => Promise<void> } }).orientation;
    so?.lock?.("portrait").catch(() => {
      // Not all browsers allow this outside fullscreen; safe to ignore.
    });
  }, []);

  // If not paired, send to the pairing screen
  if (!creds) return <Navigate to="/kiosk/pair" replace />;

  const [state, setState] = useState<State>("idle");
  const [staffData, setStaffData] = useState<StaffQuoteData | null>(null);
  const [customer, setCustomer] = useState<CustomerDraft>(EMPTY_CUSTOMER);
  const [createdQuote, setCreatedQuote] = useState<{
    quoteId: string;
    quoteNumber: string;
  } | null>(null);

  // ─── Idle timeout ──────────────────────────────────────────────────
  const idleTimer = useRef<number | null>(null);
  const resetIdleTimer = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (state !== "idle" && state !== "done") {
      idleTimer.current = window.setTimeout(() => {
        toast("Session timed out", { description: "Returning to start." });
        resetToIdle();
      }, IDLE_TIMEOUT_MS);
    }
  };
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const resetToIdle = () => {
    setStaffData(null);
    setCustomer(EMPTY_CUSTOMER);
    setCreatedQuote(null);
    setState("idle");
  };

  const unpair = () => {
    if (!confirm("Unpair this tablet? You'll need a new pairing code to use it.")) return;
    clearDeviceCreds();
    navigate("/kiosk/pair");
  };

  // ─── Transitions ────────────────────────────────────────────────────
  const onStaffFormDone = (data: StaffQuoteData) => {
    setStaffData(data);
    setState("handoff_to_customer");
  };

  const startCustomerStep = () => {
    setState("customer_form");
  };

  const onCustomerSubmit = async () => {
    if (!customer.fullName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!customer.email.trim() && !customer.phone.trim()) {
      toast.error("Please enter email or phone");
      return;
    }
    if (!staffData) {
      toast.error("Session lost; starting over");
      resetToIdle();
      return;
    }

    try {
      // Submit quote
      const resp = await kioskPost<{
        success: true;
        quoteId: string;
        quoteNumber: string;
      }>(
        "create-fast-quote-kiosk",
        {
          customer: {
            existingCustomerId: customer.existingCustomerId,
            fullName: customer.fullName.trim(),
            email: customer.email.trim().toLowerCase() || null,
            phone: customer.phone.trim() || null,
            customerType: customer.customerType,
            companyName:
              customer.customerType === "business"
                ? customer.companyName.trim()
                : null,
          },
          quote: {
            sourceLanguageId: staffData.sourceLanguageId,
            targetLanguageId: staffData.targetLanguageId,
            taxRateId: staffData.taxRateId,
            turnaroundOptionId: staffData.turnaroundOptionId || null,
            specialInstructions: staffData.specialInstructions || null,
            isRush: staffData.pricing.isRush,
            rushFee: staffData.pricing.rushFee,
          },
          documents: staffData.documents.map((d) => ({
            label: d.label,
            pageCount: d.pageCount,
            complexity: d.complexity,
            complexityMultiplier: d.complexityMultiplier,
            billablePages: d.billablePages,
            certificationTypeId: d.certificationTypeId,
            certificationPrice: d.certificationPrice,
            perPageRate: d.perPageRate,
            translationCost: d.translationCost,
            lineTotal: d.lineTotal,
          })),
          pricing: {
            translationSubtotal: staffData.pricing.translationSubtotal,
            certificationTotal: staffData.pricing.certificationTotal,
            subtotal: staffData.pricing.subtotal,
            taxRate: staffData.pricing.taxRate,
            taxAmount: staffData.pricing.taxAmount,
            total: staffData.pricing.total,
            discountType: staffData.discount.enabled
              ? staffData.discount.type
              : null,
            discountValue: staffData.discount.value,
            discountAmount: staffData.discount.amount,
            discountReason: staffData.discount.reason,
          },
        },
      );

      // Upload each document's files
      for (const doc of staffData.documents) {
        for (const file of doc.files || []) {
          try {
            await kioskUploadFile("upload-kiosk-quote-file", file, {
              quoteId: resp.quoteId,
            });
          } catch (err) {
            console.warn("File upload failed:", err);
            // non-blocking
          }
        }
      }

      setCreatedQuote({
        quoteId: resp.quoteId,
        quoteNumber: resp.quoteNumber,
      });
      setState("handoff_to_staff");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    }
  };

  const sendQuoteEmail = async () => {
    if (!createdQuote) return;
    setState("emailing");
    try {
      const data = await kioskPost<{ success: true; sent_to: string }>(
        "kiosk-send-quote-email",
        { quoteId: createdQuote.quoteId },
      );
      toast.success(`Quote sent to ${data.sent_to}`);
      setState("done");
      setTimeout(resetToIdle, 10_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
      setState("review");
    }
  };

  // ─── Render per state ───────────────────────────────────────────────

  if (state === "idle") {
    return (
      <KioskFrame deviceName={creds.device_name}>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="inline-flex w-20 h-20 bg-teal-100 rounded-2xl items-center justify-center mb-6">
              <Tablet className="w-10 h-10 text-teal-700" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Ready for a new quote
            </h1>
            <p className="text-gray-500 mb-8">
              Tap to start a walk-in translation quote.
            </p>
            <button
              onClick={() => setState("staff_form")}
              className="bg-teal-600 text-white text-xl font-semibold px-10 py-5 rounded-2xl hover:bg-teal-700 inline-flex items-center gap-3"
            >
              Start new quote <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>
        <footer className="p-4 text-center text-xs text-gray-400">
          <button onClick={unpair} className="hover:text-gray-600 underline">
            Unpair this tablet
          </button>
        </footer>
      </KioskFrame>
    );
  }

  if (state === "handoff_to_staff") {
    return (
      <KioskFrame deviceName={creds.device_name}>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="inline-flex w-20 h-20 bg-teal-100 rounded-2xl items-center justify-center mb-6">
              <User className="w-10 h-10 text-teal-700" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              Please hand the tablet back to staff
            </h1>
            <p className="text-gray-500 mb-8">
              Thanks! Staff will finish your quote and send it to your email.
            </p>
            <button
              onClick={() => setState("review")}
              className="bg-teal-600 text-white text-xl font-semibold px-10 py-5 rounded-2xl hover:bg-teal-700 inline-flex items-center gap-3"
            >
              Continue <ArrowRight className="w-6 h-6" />
            </button>
            <div className="mt-8">
              <button
                onClick={resetToIdle}
                className="text-sm text-gray-400 hover:text-gray-700 underline"
              >
                Cancel and start over
              </button>
            </div>
          </div>
        </div>
      </KioskFrame>
    );
  }

  if (state === "staff_form") {
    return (
      <KioskStaffForm
        deviceName={creds.device_name}
        onSubmit={onStaffFormDone}
        onCancel={resetToIdle}
      />
    );
  }

  if (state === "handoff_to_customer") {
    const pickExisting = (c: CustomerHit) => {
      setCustomer({
        existingCustomerId: c.id,
        fullName: c.full_name || "",
        email: c.email || "",
        phone: c.phone || "",
        customerType: c.customer_type || "individual",
        companyName: c.company_name || "",
      });
    };
    return (
      <KioskFrame deviceName={creds.device_name}>
        <div className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-md text-center mt-6">
            <div className="inline-flex w-16 h-16 bg-blue-100 rounded-2xl items-center justify-center mb-4">
              <User className="w-8 h-8 text-blue-700" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Pass the tablet to the customer
            </h1>
            <p className="text-gray-500 mb-5 text-sm">
              Existing customer? Look them up below first (optional). Otherwise
              tap "I'm ready" and the customer will enter their own info.
            </p>

            <div className="bg-white rounded-xl border p-4 mb-5 text-left">
              <CustomerSearch
                onSelect={pickExisting}
                onClear={() => setCustomer(EMPTY_CUSTOMER)}
                pickedLabel={
                  customer.existingCustomerId
                    ? `${customer.fullName}${customer.email ? ` · ${customer.email}` : ""}`
                    : undefined
                }
              />
            </div>

            <button
              onClick={startCustomerStep}
              className="w-full bg-blue-600 text-white text-xl font-semibold px-10 py-4 rounded-2xl hover:bg-blue-700 inline-flex items-center justify-center gap-3"
            >
              I'm ready <ArrowRight className="w-6 h-6" />
            </button>
            <div className="mt-6">
              <button
                onClick={resetToIdle}
                className="text-sm text-gray-400 hover:text-gray-700 underline"
              >
                Cancel and start over
              </button>
            </div>
          </div>
        </div>
      </KioskFrame>
    );
  }

  if (state === "customer_form") {
    return (
      <KioskFrame deviceName="" hideDevice>
        <div className="flex-1 flex items-start sm:items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Your contact details
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              We'll email your quote and updates here.
            </p>
            <div className="space-y-4">
              <Field
                label="Full name"
                value={customer.fullName}
                onChange={(v) => setCustomer((c) => ({ ...c, fullName: v }))}
                placeholder="Your full name"
              />
              <Field
                label="Email"
                type="email"
                value={customer.email}
                onChange={(v) => setCustomer((c) => ({ ...c, email: v }))}
                placeholder="you@example.com"
              />
              <Field
                label="Phone"
                type="tel"
                value={customer.phone}
                onChange={(v) => setCustomer((c) => ({ ...c, phone: v }))}
                placeholder="+1 403 555 0123"
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Customer type
                </label>
                <div className="flex gap-2">
                  {(["individual", "business"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setCustomer((c) => ({ ...c, customerType: t }))
                      }
                      className={`flex-1 py-3 rounded-lg border-2 font-medium capitalize ${
                        customer.customerType === t
                          ? "border-teal-500 bg-teal-50 text-teal-700"
                          : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {customer.customerType === "business" && (
                <Field
                  label="Company name"
                  value={customer.companyName}
                  onChange={(v) =>
                    setCustomer((c) => ({ ...c, companyName: v }))
                  }
                  placeholder="Acme Inc."
                />
              )}
            </div>
            <button
              onClick={onCustomerSubmit}
              className="mt-8 w-full bg-teal-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-teal-700"
            >
              Continue
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-4">
              Staff will take over after this step. No payment is taken now.
            </p>
          </div>
        </div>
      </KioskFrame>
    );
  }

  if (state === "review" || state === "emailing") {
    return (
      <KioskFrame deviceName={creds.device_name}>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
            <h1 className="text-xl font-bold mb-4">Review &amp; send</h1>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm space-y-1">
              <p>
                <span className="text-gray-500">Quote:</span>{" "}
                <strong>{createdQuote?.quoteNumber}</strong>
              </p>
              <p>
                <span className="text-gray-500">Customer:</span>{" "}
                <strong>{customer.fullName}</strong>
              </p>
              <p>
                <span className="text-gray-500">Email:</span>{" "}
                <strong>{customer.email || "—"}</strong>
              </p>
              <p>
                <span className="text-gray-500">Total:</span>{" "}
                <strong>
                  ${staffData?.pricing.total.toFixed(2) || "—"}
                </strong>
              </p>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Tap below to email the quote to the customer. They can pay online
              via the secure link in the email.
            </p>
            <button
              onClick={sendQuoteEmail}
              disabled={state === "emailing" || !customer.email}
              className="w-full bg-teal-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-teal-700 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {state === "emailing" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mail className="w-5 h-5" />
              )}
              Email quote to customer
            </button>
            {!customer.email && (
              <p className="text-xs text-amber-700 text-center mt-3">
                No email on file — collect one from the customer and try again.
              </p>
            )}
            <button
              onClick={resetToIdle}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-800 underline"
            >
              Skip &amp; start over
            </button>
          </div>
        </div>
      </KioskFrame>
    );
  }

  if (state === "done") {
    return (
      <KioskFrame deviceName={creds.device_name}>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="inline-flex w-20 h-20 bg-green-100 rounded-2xl items-center justify-center mb-6">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Thank you!</h1>
            <p className="text-gray-500 mb-2">
              Quote <strong>{createdQuote?.quoteNumber}</strong> has been sent
              to {customer.email}.
            </p>
            <p className="text-sm text-gray-400">
              Returning to the start screen…
            </p>
            <button
              onClick={resetToIdle}
              className="mt-8 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-200 inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Start another
            </button>
          </div>
        </div>
      </KioskFrame>
    );
  }

  return null;
}

// ─── UI helpers ────────────────────────────────────────────────────────────

function KioskFrame({
  deviceName,
  hideDevice,
  children,
}: {
  deviceName: string;
  hideDevice?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex flex-col select-none">
      {!hideDevice && deviceName && (
        <div className="bg-white border-b px-6 py-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Cethos Kiosk · {deviceName}
          </p>
        </div>
      )}
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        autoComplete="off"
      />
    </div>
  );
}

