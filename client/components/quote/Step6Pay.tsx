import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle } from "lucide-react";
import StartOverLink from "@/components/StartOverLink";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/pricing";

// ── Types ───────────────────────────────────────────────────────────────────

interface DocumentDetail {
  detected_document_type: string;
  billable_pages: number;
  base_rate: number;
  line_total: number;
  certification_price: number;
  certification_name: string | null;
  certification_code: string | null;
}

interface AddressData {
  full_name?: string;
  street_address?: string;
  city?: string;
  province?: string;
  province_name?: string;
  postal_code?: string;
  country?: string;
  same_as_billing?: boolean;
}

interface PricingTotals {
  translation_total: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  subtotal: number;
  tax_rate: number;
  tax_name: string;
  tax_amount: number;
  total: number;
}

interface RecapData {
  // Translation details
  sourceLanguageName: string;
  targetLanguageName: string;
  intendedUseName: string;
  countryOfIssue: string;
  // Turnaround & Delivery
  turnaroundName: string;
  turnaroundDays: number;
  promisedDeliveryDate: string | null;
  digitalDeliveryNames: string[];
  physicalDeliveryName: string | null;
  physicalDeliveryIsPickup: boolean;
  // Addresses
  billingAddress: AddressData | null;
  shippingAddress: AddressData | null;
  // Contact
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  // Pricing
  pricing: PricingTotals;
  // Tax display
  taxName: string;
  taxRatePercent: string;
  taxRegionName: string;
  // Documents
  documents: DocumentDetail[];
  // Meta
  entryPoint: string | null;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Step6Pay() {
  const { state, goToPreviousStep } = useQuote();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState<string>("");
  const [recap, setRecap] = useState<RecapData | null>(null);

  // ── Data Loading ────────────────────────────────────────────────────────

  useEffect(() => {
    loadRecapData();
  }, [state.quoteId]);

  const loadRecapData = async () => {
    if (!state.quoteId) {
      setError("Quote ID not found. Please go back and try again.");
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch main quote data with all relations
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          *,
          source_language:languages!quotes_source_language_id_fkey(name),
          target_language:languages!quotes_target_language_id_fkey(name),
          intended_use:intended_uses!quotes_intended_use_id_fkey(name),
          customer:customers!quotes_customer_id_fkey(full_name, email, phone),
          turnaround_option:turnaround_options!quotes_turnaround_option_id_fkey(name, code, estimated_days),
          physical_delivery:delivery_options!quotes_physical_delivery_option_id_fkey(name, price, code, delivery_type)
        `,
        )
        .eq("id", state.quoteId)
        .single();

      if (quoteError) throw quoteError;
      if (!quoteData) throw new Error("Quote not found");

      // 2. Fetch document analysis results
      const { data: docsData, error: docsError } = await supabase
        .from("ai_analysis_results")
        .select(
          `
          detected_document_type,
          billable_pages,
          base_rate,
          line_total,
          certification_price,
          certification_types(name, code)
        `,
        )
        .eq("quote_id", state.quoteId)
        .order("created_at");

      if (docsError) throw docsError;

      // 3. Fetch digital delivery option names if we have IDs
      let digitalNames: string[] = ["Portal"];
      if (
        quoteData.digital_delivery_options &&
        Array.isArray(quoteData.digital_delivery_options) &&
        quoteData.digital_delivery_options.length > 0
      ) {
        const { data: digitalOpts } = await supabase
          .from("delivery_options")
          .select("name, code")
          .in("id", quoteData.digital_delivery_options);

        if (digitalOpts && digitalOpts.length > 0) {
          digitalNames = digitalOpts.map((o: any) => {
            if (o.code === "online_portal") return "Portal";
            if (o.code === "email") return "Email";
            return o.name;
          });
        }
      }

      // 4. Get tax info from calculated_totals or tax_rate_id
      let taxName = "GST";
      let taxRatePercent = "5";
      let taxRegionName = "";

      if (quoteData.tax_rate_id) {
        const { data: taxData } = await supabase
          .from("tax_rates")
          .select("tax_name, rate, region_name")
          .eq("id", quoteData.tax_rate_id)
          .single();

        if (taxData) {
          taxName = taxData.tax_name;
          taxRatePercent = (Number(taxData.rate) * 100).toFixed(
            Number(taxData.rate) * 100 % 1 === 0 ? 0 : 2,
          );
          taxRegionName = taxData.region_name || "";
        }
      }

      // Parse pricing from calculated_totals
      const calcTotals = quoteData.calculated_totals as PricingTotals | null;
      const pricing: PricingTotals = calcTotals || {
        translation_total: 0,
        certification_total: 0,
        rush_fee: 0,
        delivery_fee: 0,
        subtotal: 0,
        tax_rate: quoteData.tax_rate || 0.05,
        tax_name: taxName,
        tax_amount: quoteData.tax_amount || 0,
        total: quoteData.total || 0,
      };

      // If calculated_totals has tax_name, prefer that
      if (calcTotals?.tax_name) {
        taxName = calcTotals.tax_name;
      }
      if (calcTotals?.tax_rate) {
        taxRatePercent = (calcTotals.tax_rate * 100).toFixed(
          calcTotals.tax_rate * 100 % 1 === 0 ? 0 : 2,
        );
      }

      // Parse documents
      const documents: DocumentDetail[] = (docsData || []).map((d: any) => ({
        detected_document_type: d.detected_document_type || "Document",
        billable_pages: Number(d.billable_pages) || 0,
        base_rate: Number(d.base_rate) || 0,
        line_total: parseFloat(d.line_total) || 0,
        certification_price: parseFloat(d.certification_price) || 0,
        certification_name: d.certification_types?.name || null,
        certification_code: d.certification_types?.code || null,
      }));

      // Determine physical delivery display
      const physDel = quoteData.physical_delivery as any;
      const physicalDeliveryName = physDel?.name || null;
      const physicalDeliveryIsPickup =
        physDel?.code === "pickup" || physDel?.delivery_type === "pickup";

      // Get billing address from quote JSONB
      const billingAddr = quoteData.billing_address as AddressData | null;

      // Get shipping address (only relevant if physical delivery requires it)
      const shippingAddr = quoteData.shipping_address as AddressData | null;

      // Determine if we should show shipping section
      // Show only when physical delivery was selected and it's not "none" or "pickup"
      const showShipping =
        physDel && physDel.code !== "pickup" && physDel.requires_address;

      // Format province name for billing address display
      const billingProvinceName =
        billingAddr?.province_name || billingAddr?.province || "";

      setRecap({
        sourceLanguageName: (quoteData.source_language as any)?.name || "—",
        targetLanguageName: (quoteData.target_language as any)?.name || "—",
        intendedUseName: (quoteData.intended_use as any)?.name || "—",
        countryOfIssue: quoteData.country_of_issue || "—",
        turnaroundName: (quoteData.turnaround_option as any)?.name || "Standard",
        turnaroundDays:
          (quoteData.turnaround_option as any)?.estimated_days || 6,
        promisedDeliveryDate: quoteData.promised_delivery_date || null,
        digitalDeliveryNames: digitalNames,
        physicalDeliveryName: physicalDeliveryName,
        physicalDeliveryIsPickup: physicalDeliveryIsPickup,
        billingAddress: billingAddr
          ? { ...billingAddr, province_name: billingProvinceName }
          : null,
        shippingAddress: showShipping ? shippingAddr : null,
        customerName: (quoteData.customer as any)?.full_name || state.fullName || "—",
        customerEmail: (quoteData.customer as any)?.email || state.email || "—",
        customerPhone: (quoteData.customer as any)?.phone || state.phone || "—",
        pricing,
        taxName,
        taxRatePercent,
        taxRegionName,
        documents,
        entryPoint: quoteData.entry_point || null,
      });
    } catch (err: any) {
      console.error("Error loading recap data:", err);
      setError("Failed to load order details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePayNow = async () => {
    if (isSubmitting || !state.quoteId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (!recap?.pricing || recap.pricing.total <= 0) {
        throw new Error(
          "Invalid order total. Please go back and review your quote.",
        );
      }

      // Update quote status to checkout_started
      await supabase
        .from("quotes")
        .update({ status: "checkout_started", updated_at: new Date().toISOString() })
        .eq("id", state.quoteId);

      // Create Stripe Checkout Session via edge function
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: { quoteId: state.quoteId },
        },
      );

      if (fnError) {
        console.error("Edge function error:", fnError);
        throw new Error(fnError.message || "Failed to create checkout session");
      }

      if (!data?.success || !data?.checkoutUrl) {
        throw new Error(data?.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "An error occurred. Please try again.");
      toast.error(err.message || "Failed to process payment");
      setIsSubmitting(false);
    }
  };

  const handleSaveAndEmail = async () => {
    if (isSubmitting || !state.quoteId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (!recap) throw new Error("Quote data not available.");

      // Fetch customer details for email
      const { data: quote } = await supabase
        .from("quotes")
        .select(
          `
          quote_number,
          customers (
            email,
            full_name
          )
        `,
        )
        .eq("id", state.quoteId)
        .single();

      const customerEmail = quote?.customers?.email;
      const customerName = quote?.customers?.full_name || "Customer";
      const quoteNumber = quote?.quote_number;

      if (!customerEmail) {
        throw new Error("Customer email not found.");
      }

      // 1. Update quote status
      await supabase
        .from("quotes")
        .update({
          status: "pending_payment",
          saved_at: new Date().toISOString(),
        })
        .eq("id", state.quoteId);

      // 2. Send email with payment link
      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + 30);

      await supabase.functions.invoke("send-email", {
        body: {
          templateId: 17,
          to: customerEmail,
          subject: `Your Quote is Ready - ${quoteNumber}`,
          params: {
            QUOTE_NUMBER: quoteNumber,
            CUSTOMER_NAME: customerName,
            TOTAL: recap.pricing.total.toFixed(2),
            PAYMENT_LINK: `${window.location.origin}/quote?step=6&quote_id=${state.quoteId}`,
            VALID_UNTIL: validUntilDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
          },
        },
      });

      // 3. Show inline confirmation
      setSentToEmail(customerEmail);
      setEmailSent(true);
      setIsSubmitting(false);
    } catch (err: any) {
      console.error("Save and email error:", err);
      setError(err.message || "Failed to save quote. Please try again.");
      toast.error(err.message || "Failed to save quote");
      setIsSubmitting(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatDocType = (type: string): string => {
    return type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatDeliveryDate = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // ── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
          <p className="text-sm text-gray-500">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!recap) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error || "Failed to load order details."}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-6">
          <StartOverLink />
          <button
            onClick={goToPreviousStep}
            className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
          >
            &larr; Back
          </button>
        </div>
      </div>
    );
  }

  const { pricing, documents } = recap;
  const docCount = documents.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 pb-8 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-cethos-navy mb-2">
          Review &amp; Pay
        </h2>
        <p className="text-cethos-gray">
          Review your complete order before completing payment.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ─── RECAP CARD ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Section: Documents & Certifications */}
        <div
          className="px-5 py-2.5 border-b border-gray-100"
          style={{ background: "rgb(249 250 251)" }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400">
            Documents &amp; Certifications
          </span>
        </div>
        <div>
          {documents.map((doc, idx) => (
            <div key={idx}>
              {/* Document row */}
              <div className="flex justify-between px-5 py-2 text-[13px] border-b border-gray-50">
                <span className="text-gray-800 font-medium">
                  {formatDocType(doc.detected_document_type)}
                </span>
                <span className="text-gray-600">
                  {doc.billable_pages} pg &middot; {formatCurrency(doc.line_total)}
                </span>
              </div>
              {/* Certification sub-row */}
              {doc.certification_name && doc.certification_price > 0 && (
                <div className="flex justify-between px-5 py-2 text-[13px] border-b border-gray-50">
                  <span className="text-gray-500 pl-4">
                    + {doc.certification_name}
                  </span>
                  <span className="text-gray-500">
                    {formatCurrency(doc.certification_price)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-b border-gray-200" />

        {/* Section: Translation Details */}
        <div
          className="px-5 py-2.5 border-b border-gray-100"
          style={{ background: "rgb(249 250 251)" }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400">
            Translation Details
          </span>
        </div>
        <div>
          <RecapRow label="Languages" value={`${recap.sourceLanguageName} → ${recap.targetLanguageName}`} />
          <RecapRow label="Intended Use" value={recap.intendedUseName} />
          <RecapRow label="Country of Issue" value={recap.countryOfIssue} />
        </div>

        {/* Divider */}
        <div className="border-b border-gray-200" />

        {/* Section: Turnaround & Delivery */}
        <div
          className="px-5 py-2.5 border-b border-gray-100"
          style={{ background: "rgb(249 250 251)" }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400">
            Turnaround &amp; Delivery
          </span>
        </div>
        <div>
          <RecapRow
            label="Speed"
            value={`${recap.turnaroundName} (${recap.turnaroundDays} business days)`}
          />
          <RecapRow
            label="Est. Delivery"
            value={formatDeliveryDate(recap.promisedDeliveryDate)}
          />
          <RecapRow
            label="Digital"
            value={recap.digitalDeliveryNames.map((n) => `${n} \u2713`).join("  ")}
          />
          <RecapRow
            label="Physical"
            value={recap.physicalDeliveryName || "None"}
          />
        </div>

        {/* Divider */}
        <div className="border-b border-gray-200" />

        {/* Section: Billing Address */}
        <div
          className="px-5 py-2.5 border-b border-gray-100"
          style={{ background: "rgb(249 250 251)" }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400">
            Billing Address
          </span>
        </div>
        {recap.billingAddress ? (
          <div className="px-5 py-2.5 text-[13px] text-gray-700 leading-relaxed">
            <p>{recap.billingAddress.full_name}</p>
            <p>{recap.billingAddress.street_address}</p>
            <p>
              {recap.billingAddress.city}
              {recap.billingAddress.province_name
                ? `, ${recap.billingAddress.province_name}`
                : recap.billingAddress.province
                  ? `, ${recap.billingAddress.province}`
                  : ""}{" "}
              {recap.billingAddress.postal_code}
            </p>
            <p>{recap.billingAddress.country || "Canada"}</p>
          </div>
        ) : (
          <div className="px-5 py-2.5 text-[13px] text-gray-400">
            No billing address on file
          </div>
        )}

        {/* Section: Shipping Address (conditional) */}
        {recap.shippingAddress && (
          <>
            <div className="border-b border-gray-200" />
            <div
              className="px-5 py-2.5 border-b border-gray-100"
              style={{ background: "rgb(249 250 251)" }}
            >
              <span className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400">
                Shipping Address
              </span>
            </div>
            {recap.shippingAddress.same_as_billing ? (
              <div className="px-5 py-2.5 text-[13px] text-gray-700">
                Same as billing
              </div>
            ) : (
              <div className="px-5 py-2.5 text-[13px] text-gray-700 leading-relaxed">
                <p>{recap.shippingAddress.full_name}</p>
                <p>{recap.shippingAddress.street_address}</p>
                <p>
                  {recap.shippingAddress.city}
                  {recap.shippingAddress.province_name
                    ? `, ${recap.shippingAddress.province_name}`
                    : recap.shippingAddress.province
                      ? `, ${recap.shippingAddress.province}`
                      : ""}{" "}
                  {recap.shippingAddress.postal_code}
                </p>
                <p>{recap.shippingAddress.country || "Canada"}</p>
              </div>
            )}
          </>
        )}

        {/* Divider */}
        <div className="border-b border-gray-200" />

        {/* Section: Contact */}
        <div
          className="px-5 py-2.5 border-b border-gray-100"
          style={{ background: "rgb(249 250 251)" }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400">
            Contact
          </span>
        </div>
        <div>
          <RecapRow label="Name" value={recap.customerName} />
          <RecapRow label="Email" value={recap.customerEmail} />
          <RecapRow label="Phone" value={recap.customerPhone} />
        </div>
      </div>

      {/* ─── FINAL TOTALS CARD ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[1px] text-gray-400 mb-4">
          Final Totals
        </h3>

        <div className="space-y-2.5">
          {/* Translation */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              Translation ({docCount} doc{docCount !== 1 ? "s" : ""})
            </span>
            <span className="font-mono font-medium text-gray-900">
              {formatCurrency(pricing.translation_total)}
            </span>
          </div>

          {/* Certifications */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Certifications</span>
            <span
              className={`font-mono font-medium ${pricing.certification_total > 0 ? "text-gray-900" : "text-gray-400"}`}
            >
              {formatCurrency(pricing.certification_total)}
            </span>
          </div>

          {/* Rush Fee */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Rush Fee</span>
            <span
              className={`font-mono font-medium ${pricing.rush_fee > 0 ? "text-amber-700" : "text-gray-400"}`}
            >
              {formatCurrency(pricing.rush_fee)}
            </span>
          </div>

          {/* Delivery */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Delivery</span>
            <span
              className={`font-mono font-medium ${pricing.delivery_fee > 0 ? "text-gray-900" : "text-gray-400"}`}
            >
              {formatCurrency(pricing.delivery_fee)}
            </span>
          </div>

          {/* Subtotal divider */}
          <div className="border-t border-gray-200 pt-2.5 flex justify-between text-sm">
            <span className="text-gray-700 font-medium">Subtotal</span>
            <span className="font-mono font-semibold text-gray-900">
              {formatCurrency(
                pricing.subtotal + pricing.rush_fee + pricing.delivery_fee,
              )}
            </span>
          </div>

          {/* Tax */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              {recap.taxName} ({recap.taxRatePercent}%
              {recap.taxRegionName ? ` — ${recap.taxRegionName}` : ""})
            </span>
            <span className="font-mono font-medium text-gray-900">
              {formatCurrency(pricing.tax_amount)}
            </span>
          </div>

          {/* Total */}
          <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
            <span className="text-lg font-bold text-gray-900">Total</span>
            <span className="text-2xl font-bold font-mono text-gray-900">
              {formatCurrency(pricing.total)} CAD
            </span>
          </div>
        </div>
      </div>

      {/* ─── PAYMENT ACTIONS CARD ────────────────────────────────────────── */}
      {!emailSent ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          {/* Primary: Pay Now */}
          <div>
            <button
              type="button"
              onClick={handlePayNow}
              disabled={isSubmitting || pricing.total <= 0}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3.5 px-6 rounded-xl text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <span role="img" aria-label="credit card">
                    &#x1F4B3;
                  </span>
                  Pay {formatCurrency(pricing.total)} CAD &amp; Complete Order
                </>
              )}
            </button>
            <p className="text-[11px] text-gray-400 mt-2 text-center">
              Secure payment via Stripe &middot; Visa, Mastercard, Amex accepted
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* Secondary: Save & Email Payment Link */}
          <div>
            <button
              type="button"
              onClick={handleSaveAndEmail}
              disabled={isSubmitting}
              className="bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-400 font-semibold py-2.5 px-5 rounded-xl text-xs flex items-center justify-center gap-2 mx-auto transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <span role="img" aria-label="email">
                    &#x1F4E7;
                  </span>
                  Save Quote &amp; Email Me a Payment Link
                </>
              )}
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center">
              Quote valid for 30 days.
            </p>
          </div>
        </div>
      ) : (
        /* Inline confirmation after email sent */
        <div className="bg-green-50 rounded-xl border border-green-200 p-6 text-center">
          <p className="text-green-800 font-semibold text-base">
            &#x2705; Quote saved!
          </p>
          <p className="text-green-700 text-sm mt-1">
            We&rsquo;ve sent a payment link to{" "}
            <span className="font-medium">{sentToEmail}</span>.
          </p>
          <p className="text-green-600 text-xs mt-2">
            Quote valid for 30 days.
          </p>
        </div>
      )}

      {/* ─── NAVIGATION ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <StartOverLink />
        <button
          onClick={goToPreviousStep}
          disabled={isSubmitting}
          className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          &larr; Back
        </button>
      </div>
    </div>
  );
}

// ── RecapRow Sub-component ─────────────────────────────────────────────────

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-5 py-2 text-[13px] border-b border-gray-50">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 text-right">{value}</span>
    </div>
  );
}
