// VendorAssignModal — extracted from OrderWorkflowSection.tsx (R11 full split).
// The 3-mode (assign / offer / offer_multiple) modal that staff use to put a
// vendor on a step. Pricing modes per_unit / target, deadline + instructions,
// negotiation envelope, per-vendor rate overrides on offer_multiple (R13).
// Behavior preserved verbatim from the inlined version.

import { useState, useEffect, useMemo } from "react";
import { Loader2, X, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ADMIN_CURRENCIES } from "@/lib/currencies";

// Subset of OrderFinancials needed by the modal (mirrors the parent).
interface OrderFinancials {
  service_id: string | null;
  subtotal: number;
  pre_tax: number;
  tax: number;
  total: number;
}

interface VendorAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: {
    action: 'direct_assign' | 'offer_vendor' | 'offer_multiple';
    vendor_id?: string;
    vendors?: Array<{ vendor_id: string; vendor_rate?: number; vendor_total?: number }>;
    vendor_rate: number;
    vendor_rate_unit: string;
    vendor_total: number;
    vendor_currency: string;
    deadline: string | null;
    instructions: string | null;
    expires_in_hours: number | null;
    negotiation_allowed: boolean;
    max_rate: number | null;
    max_total: number | null;
    latest_deadline: string | null;
    auto_accept_within_limits: boolean;
  }) => void;
  mode: 'assign' | 'offer' | 'offer_multiple';
  vendor: any | null;
  vendors: any[] | null;
  stepId: string;
  stepName: string;
  stepNumber: number;
  serviceName: string | null;
  orderFinancials: OrderFinancials | null;
  totalVendorCost: number;
  minMarginPercent: number;
  // Customer-facing delivery deadline:
  //   * clientDeadlineAt — TIMESTAMPTZ (preferred), full instant
  //   * clientDeadlineDate — YYYY-MM-DD (legacy fallback)
  // Used to pre-fill the vendor deadline and to warn when a vendor
  // deadline lands at/after the client expects delivery.
  clientDeadlineAt: string | null;
  clientDeadlineDate: string | null;
  orderId: string;
}

export default function VendorAssignModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
  vendor,
  vendors,
  stepId,
  stepName,
  stepNumber,
  serviceName,
  orderFinancials,
  totalVendorCost,
  minMarginPercent,
  clientDeadlineAt,
  clientDeadlineDate,
  orderId,
}: VendorAssignModalProps) {
  // Use the vendor's own preferred rate currency as the starting default.
  // Falls back to CAD when the modal opens with no specific vendor (e.g.
  // offer_multiple) or when the vendor has no preference recorded.
  const initialCurrency = (vendor?.preferred_rate_currency as string | undefined) || "CAD";
  const [pricingMode, setPricingMode] = useState<"per_unit" | "target">("per_unit");
  const [targetTotal, setTargetTotal] = useState<string>("");
  const [vendorRate, setVendorRate] = useState<string>("");
  const [vendorRateUnit, setVendorRateUnit] = useState("per_word");
  const [units, setUnits] = useState<string>("1");
  // R13 — per-vendor rate override for offer_multiple. Empty string means
  // "use the parent rate". Server already accepts v.vendor_rate per row.
  const [perVendorRates, setPerVendorRates] = useState<Record<string, string>>({});
  const [vendorCurrency, setVendorCurrency] = useState(initialCurrency);
  const [deadline, setDeadline] = useState("");
  const [instructions, setInstructions] = useState("");
  const [expiresInHours, setExpiresInHours] = useState<string>("24");
  const [suggestedRate, setSuggestedRate] = useState<{ rate: number; calculation_unit: string; currency: string; valid_until?: string; is_expired?: boolean } | null>(null);
  const [allVendorRates, setAllVendorRates] = useState<any[]>([]);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [lookingUpRate, setLookingUpRate] = useState(false);
  const [negotiationAllowed, setNegotiationAllowed] = useState(false);
  const [maxRate, setMaxRate] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [latestDeadline, setLatestDeadline] = useState('');
  const [autoAccept, setAutoAccept] = useState(true);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setPricingMode("per_unit");
      setTargetTotal("");
      setVendorRate("");
      setVendorRateUnit("per_word");
      setUnits("1");
      // Re-read the vendor's preferred currency in case the modal is being
      // re-opened for a different vendor since the last mount.
      setVendorCurrency((vendor?.preferred_rate_currency as string | undefined) || "CAD");
      setDeadline("");
      setInstructions("");
      setExpiresInHours("24");
      setSuggestedRate(null);
      setAllVendorRates([]);
      setShowRatesModal(false);
      setNegotiationAllowed(false);
      setMaxRate('');
      setMaxTotal('');
      setLatestDeadline('');
      setAutoAccept(true);
    }
  }, [isOpen]);

  // Lookup rate for single vendor mode
  useEffect(() => {
    if (isOpen && vendor && mode !== "offer_multiple") {
      const lookupRate = async () => {
        setLookingUpRate(true);
        try {
          const { data } = await supabase.functions.invoke("update-workflow-step", {
            body: { step_id: stepId, action: "lookup_vendor_rate", vendor_id: vendor.id },
          });
          if (data?.suggested_rate) {
            setSuggestedRate(data.suggested_rate);
            setVendorRate(String(data.suggested_rate.rate));
            setVendorRateUnit(data.suggested_rate.calculation_unit);
            setVendorCurrency(data.suggested_rate.currency);
          }
          if (data?.all_rates) {
            setAllVendorRates(data.all_rates);
          }
        } catch (err) {
          console.error("Rate lookup failed:", err);
        }
        setLookingUpRate(false);
      };
      lookupRate();
    }
  }, [isOpen, vendor, mode, stepId]);

  // Pre-fill rate from vendor's rate_for_service if available and no suggested rate
  useEffect(() => {
    if (isOpen && vendor && vendor.rate_for_service && !suggestedRate && !vendorRate) {
      setVendorRate(String(vendor.rate_for_service.rate));
      setVendorCurrency(vendor.rate_for_service.currency || "CAD");
    }
  }, [isOpen, vendor, suggestedRate]);

  // Auto-load approved AI instructions for this order
  useEffect(() => {
    if (!isOpen || !orderId || instructions) return;
    const loadInstructions = async () => {
      try {
        const { data } = await supabase
          .from("order_ai_instructions")
          .select("instructions_text")
          .eq("order_id", orderId)
          .eq("is_current", true)
          .eq("is_approved", true)
          .maybeSingle();
        if (data?.instructions_text) {
          setInstructions(data.instructions_text);
        }
      } catch (err) {
        console.error("Failed to load AI instructions:", err);
      }
    };
    loadInstructions();
  }, [isOpen, orderId]);

  // Auto-set units to 1 for flat rate
  useEffect(() => {
    if (vendorRateUnit === 'flat') {
      setUnits("1");
    }
  }, [vendorRateUnit]);

  // Resolve the client deadline as a single Date instant. Prefers the
  // TIMESTAMPTZ value when present; falls back to the DATE column
  // anchored at 17:00 America/Edmonton (Cethos's HQ tz) when only that
  // is set on the order.
  const clientDeadlineInstant = useMemo((): Date | null => {
    if (clientDeadlineAt) {
      const d = new Date(clientDeadlineAt);
      return isNaN(d.getTime()) ? null : d;
    }
    if (clientDeadlineDate) {
      // YYYY-MM-DD + "T17:00:00-06:00" (close enough — MDT). The Date
      // constructor handles DST through the IANA tz internally if we
      // build it differently, but for prefill purposes a fixed offset
      // suffices.
      const d = new Date(clientDeadlineDate + "T17:00:00-06:00");
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }, [clientDeadlineAt, clientDeadlineDate]);

  // Pre-fill vendor deadline based on the client's expected delivery
  // instant. When the modal opens for the first time on a step and the
  // staff hasn't typed anything yet, default the deadline to one day
  // before the client expects delivery, preserving the same time of
  // day. Staff can adjust freely; this is just the starting point that
  // keeps a buffer for QA + certification + delivery between the
  // vendor handing off and the customer receiving.
  useEffect(() => {
    if (!isOpen) return;
    if (deadline) return; // don't overwrite a value the user already typed
    if (!clientDeadlineInstant) return;
    try {
      const d = new Date(clientDeadlineInstant.getTime());
      d.setDate(d.getDate() - 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      const value =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDeadline(value);
    } catch { /* ignore */ }
  }, [isOpen, clientDeadlineInstant]);

  // Vendor deadline vs client deadline — warn when the vendor's deadline
  // lands on or after the moment the customer is expecting delivery.
  const deadlineAfterClient =
    !!deadline &&
    !!clientDeadlineInstant &&
    new Date(deadline).getTime() >= clientDeadlineInstant.getTime();

  // Auto-calculate total
  const calculatedTotal = useMemo(() => {
    const r = parseFloat(vendorRate) || 0;
    const u = parseFloat(units) || 0;
    return (r * u).toFixed(2);
  }, [vendorRate, units]);

  // Dynamic unit label
  const unitLabel = useMemo(() => {
    switch (vendorRateUnit) {
      case 'per_word': return 'Word Count *';
      case 'per_page': return 'Page Count *';
      case 'per_hour': return 'Hours *';
      case 'flat': return 'Units *';
      default: return 'Units *';
    }
  }, [vendorRateUnit]);

  // Display name for rate units
  const unitDisplayName = (unit: string) => {
    const map: Record<string, string> = {
      per_word: 'per word',
      per_page: 'per page',
      per_hour: 'per hour',
      flat: 'flat rate',
    };
    return map[unit] || unit;
  };

  const margin =
    orderFinancials && orderFinancials.subtotal > 0 && parseFloat(calculatedTotal) > 0
      ? ((orderFinancials.subtotal - parseFloat(calculatedTotal)) / orderFinancials.subtotal) * 100
      : null;

  const marginColor =
    margin === null ? "gray" : margin >= 50 ? "green" : margin >= minMarginPercent ? "yellow" : "red";

  // Deadline is required for all assign/offer flows.
  // For offer flows, the offer expiry must land before the deadline so
  // vendors can't accept after their delivery window has already started.
  const deadlineDate = deadline ? new Date(deadline) : null;
  const expiryDate =
    mode !== "assign" && expiresInHours !== "0"
      ? new Date(Date.now() + parseInt(expiresInHours) * 3600_000)
      : null;
  const expiryBeforeDeadline =
    !expiryDate || !deadlineDate || expiryDate.getTime() < deadlineDate.getTime();

  // Target mode is deliberately deferred — the offer can be sent with no
  // total, and no vendor_payables row is created until pricing is settled.
  // Per-unit mode still requires rate + units.
  const canSubmit =
    (pricingMode === "target"
      ? true
      : vendorRate !== "" && parseFloat(vendorRate) > 0 &&
        vendorRateUnit && units !== "" && parseFloat(units) > 0) &&
    !!deadline && expiryBeforeDeadline;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const isOffer = mode !== "assign";
    const isTarget = pricingMode === "target";
    const targetTotalNum = targetTotal !== "" ? parseFloat(targetTotal) : null;
    const baseParams = {
      pricing_mode: pricingMode,
      // Target mode keeps rate/total nullable so the server can skip the
      // vendor_payables insert. rate_unit defaults to 'flat' for rendering.
      vendor_rate: isTarget ? (targetTotalNum ?? null) : parseFloat(vendorRate),
      vendor_rate_unit: isTarget ? "flat" : vendorRateUnit,
      vendor_total: isTarget ? (targetTotalNum ?? null) : parseFloat(calculatedTotal),
      vendor_currency: vendorCurrency,
      // Serialize datetime-local as a tz-aware ISO string. The raw input
      // value "YYYY-MM-DDTHH:mm" has no timezone, so the server's
      // `new Date(...)` would parse it as UTC while the client's
      // expiryBeforeDeadline check parses it as local time. Sending an
      // ISO string keeps both sides on the same instant.
      deadline: deadline ? new Date(deadline).toISOString() : null,
      instructions: instructions || null,
      expires_in_hours: isOffer && expiresInHours !== "0" ? parseInt(expiresInHours) : null,
      // v6: Negotiation policy
      negotiation_allowed: isOffer ? negotiationAllowed : false,
      max_rate: isOffer && negotiationAllowed && maxRate ? parseFloat(maxRate) : null,
      max_total: isOffer && negotiationAllowed && maxTotal ? parseFloat(maxTotal) : null,
      latest_deadline: isOffer && negotiationAllowed && latestDeadline ? new Date(latestDeadline).toISOString() : null,
      auto_accept_within_limits: isOffer && negotiationAllowed ? autoAccept : true,
    };

    if (mode === "assign" && vendor) {
      onSubmit({ ...baseParams, action: "direct_assign", vendor_id: vendor.id });
    } else if (mode === "offer" && vendor) {
      onSubmit({ ...baseParams, action: "offer_vendor", vendor_id: vendor.id });
    } else if (mode === "offer_multiple" && vendors) {
      const parsedUnits = Number(units) || 1;
      onSubmit({
        ...baseParams,
        action: "offer_multiple",
        vendors: vendors.map((v) => {
          const raw = perVendorRates[v.id];
          const per = raw && raw.trim() ? Number(raw) : NaN;
          // Empty / non-numeric falls back to the parent rate (server reads
          // v.vendor_rate ?? vendor_rate).
          return Number.isFinite(per) && per > 0
            ? {
                vendor_id: v.id,
                vendor_rate: per,
                vendor_total: Math.round(per * parsedUnits * 100) / 100,
              }
            : { vendor_id: v.id };
        }),
      });
    }
  };

  const headerText =
    mode === "assign"
      ? `Assign Vendor — Step ${stepNumber}: ${stepName}`
      : mode === "offer"
        ? `Offer to Vendor — Step ${stepNumber}: ${stepName}`
        : `Offer to ${vendors?.length || 0} Vendors — Step ${stepNumber}: ${stepName}`;

  const submitLabel =
    mode === "assign"
      ? "Assign"
      : mode === "offer"
        ? "Send Offer"
        : `Send Offers (${vendors?.length || 0})`;

  const submitColor =
    mode === "assign" ? "bg-blue-600 hover:bg-blue-700" : "bg-teal-600 hover:bg-teal-700";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">{headerText}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Vendor display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor{mode === "offer_multiple" ? "s" : ""}</label>
            {mode === "offer_multiple" && vendors ? (
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-1.5 px-2 text-gray-500 font-medium">Vendor</th>
                      <th className="text-right py-1.5 px-2 text-gray-500 font-medium">
                        Rate ({vendorCurrency})
                        <div className="text-[10px] text-gray-400 font-normal">blank = use parent</div>
                      </th>
                      <th className="text-right py-1.5 px-2 text-gray-500 font-medium">Total ({vendorCurrency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((v) => {
                      const raw = perVendorRates[v.id] ?? "";
                      const parentRate = Number(vendorRate) || 0;
                      const u = Number(units) || 1;
                      const effective = raw.trim() && Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : parentRate;
                      const total = effective * u;
                      return (
                        <tr key={v.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 px-2">
                            <span className="inline-flex items-center gap-1">
                              {v.full_name}
                              {(v as any).business_name && (
                                <span className="text-[10px] text-gray-500 italic">({(v as any).business_name})</span>
                              )}
                              {v.rating != null && (
                                <span className="flex items-center gap-0.5 text-gray-400">
                                  <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                                  {v.rating}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-1 px-2">
                            <input
                              type="number"
                              step="0.0001"
                              value={raw}
                              onChange={(e) => setPerVendorRates((p) => ({ ...p, [v.id]: e.target.value }))}
                              placeholder={parentRate ? String(parentRate) : ""}
                              className="w-24 text-right border border-gray-200 rounded px-2 py-0.5 text-xs tabular-nums"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-700">
                            {total > 0 ? total.toFixed(2) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : vendor ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                    {vendor.full_name}
                    {(vendor as any).business_name && (
                      <span className="text-xs text-indigo-600 italic font-normal">({(vendor as any).business_name})</span>
                    )}
                    {vendor.rating != null && (
                      <span className="flex items-center gap-0.5 ml-1">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        {vendor.rating}
                      </span>
                    )}
                  </span>
                  {lookingUpRate && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Looking up rate...
                    </span>
                  )}
                </div>
                {/* Vendor rate with currency and validity */}
                {suggestedRate && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">
                      Profile rate: <span className="font-medium text-gray-900">${suggestedRate.rate}/{unitDisplayName(suggestedRate.calculation_unit)}</span>
                      {" "}<span className="text-xs text-gray-500">({suggestedRate.currency})</span>
                    </span>
                    {suggestedRate.is_expired && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Expired</span>
                    )}
                    {suggestedRate.valid_until && !suggestedRate.is_expired && (
                      <span className="text-xs text-gray-400">valid until {new Date(suggestedRate.valid_until).toLocaleDateString()}</span>
                    )}
                    {allVendorRates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowRatesModal(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        View all rates
                      </button>
                    )}
                  </div>
                )}
                {!suggestedRate && !lookingUpRate && vendor.rate_for_service && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">
                      Profile rate: <span className="font-medium text-gray-900">${vendor.rate_for_service.rate}/{vendor.rate_for_service.unit}</span>
                      {" "}<span className="text-xs text-gray-500">({vendor.rate_for_service.currency || "CAD"})</span>
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Service info */}
          <div className="bg-gray-50 rounded px-3 py-2 text-sm text-gray-600">
            Service: {serviceName || "N/A"}
          </div>

          {/* Rate section */}
          <div className="space-y-3">
            {/* Pricing mode toggle — switch between per-unit and flat target */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pricing</label>
              <div className="inline-flex border border-gray-300 rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPricingMode("per_unit")}
                  className={`px-3 py-1.5 text-xs ${
                    pricingMode === "per_unit"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Rate × Units
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode("target")}
                  className={`px-3 py-1.5 text-xs border-l border-gray-300 ${
                    pricingMode === "target"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                  title="Defer pricing — assign the vendor without a payable; settle the amount later"
                >
                  Target (no payable)
                </button>
              </div>
              {pricingMode === "target" && (
                <p className="text-xs text-gray-500 mt-1">
                  Target mode skips the payable. Leave the total blank to settle pricing later, or enter an indicative amount.
                </p>
              )}
            </div>

            {pricingMode === "target" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Indicative total (optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetTotal}
                    onChange={(e) => setTargetTotal(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Leave blank if not yet known"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                  <select
                    value={vendorCurrency}
                    onChange={(e) => setVendorCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ADMIN_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                  {vendor?.preferred_rate_currency &&
                    vendor.preferred_rate_currency !== vendorCurrency && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        Vendor prefers {vendor.preferred_rate_currency}
                      </p>
                    )}
                </div>
              </div>
            ) : (
              <>
                {/* Row 1: Rate, Rate Unit, Currency */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Rate *</label>
                    <input
                      type="number"
                      step="0.001"
                      value={vendorRate}
                      onChange={(e) => setVendorRate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Rate Unit *</label>
                    <select
                      value={vendorRateUnit}
                      onChange={(e) => setVendorRateUnit(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="per_word">Per Word</option>
                      <option value="per_page">Per Page</option>
                      <option value="per_hour">Per Hour</option>
                      <option value="flat">Flat</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                    <select
                      value={vendorCurrency}
                      onChange={(e) => setVendorCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {ADMIN_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.code}</option>
                      ))}
                    </select>
                    {vendor?.preferred_rate_currency &&
                      vendor.preferred_rate_currency !== vendorCurrency && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Vendor prefers {vendor.preferred_rate_currency}
                        </p>
                      )}
                  </div>
                </div>
                {suggestedRate && (
                  <p className="text-xs text-gray-400">
                    Vendor&apos;s rate: ${suggestedRate.rate} {unitDisplayName(suggestedRate.calculation_unit)} ({suggestedRate.currency})
                    {suggestedRate.is_expired && <span className="ml-1 text-red-500 font-medium">· Expired</span>}
                  </p>
                )}
                {/* Row 2: Units, Total */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{unitLabel}</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      disabled={vendorRateUnit === 'flat'}
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${vendorRateUnit === 'flat' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-700">
                      {vendorCurrency} ${calculatedTotal}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Margin indicator */}
          {parseFloat(calculatedTotal) > 0 && orderFinancials && orderFinancials.subtotal > 0 ? (
            <div className="border rounded p-3 text-sm">
              <div className="text-gray-600">Customer subtotal: ${orderFinancials.subtotal.toFixed(2)}</div>
              <div className="text-gray-600">This step cost: ${calculatedTotal}</div>
              <div className="flex items-center gap-1">
                <span
                  className={
                    marginColor === "green"
                      ? "text-green-600"
                      : marginColor === "yellow"
                        ? "text-yellow-600"
                        : "text-red-600"
                  }
                >
                  ●
                </span>
                <span className="text-gray-700">Step margin: {margin !== null ? `${margin.toFixed(1)}%` : "N/A"}</span>
              </div>
              {margin !== null && margin < minMarginPercent && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2 rounded text-sm mt-2">
                  Warning: Margin below minimum threshold ({minMarginPercent}%). Proceed with caution.
                </div>
              )}
            </div>
          ) : parseFloat(calculatedTotal) > 0 ? (
            <p className="text-xs text-gray-400">Margin unavailable — order has no pricing data.</p>
          ) : null}

          {/* Offer expiry (offer modes only) */}
          {mode !== "assign" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Offer expires in</label>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="0">No expiry</option>
                <option value="4">4 hours</option>
                <option value="8">8 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
              </select>
            </div>
          )}

          {/* Deadline — required */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Deadline <span className="text-red-500">*</span>{" "}
              <span className="font-normal text-gray-400">({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
            </label>
            {clientDeadlineInstant && (
              <p className="mb-1 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                📦 Customer expects delivery by{" "}
                <strong>
                  {clientDeadlineInstant.toLocaleString("en-CA", {
                    month: "short", day: "numeric", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </strong>{" "}
                <span className="text-blue-500">
                  ({Intl.DateTimeFormat().resolvedOptions().timeZone}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone !== "America/Edmonton" && (
                    <> · {clientDeadlineInstant.toLocaleString("en-CA", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      timeZone: "America/Edmonton",
                    })} Cethos</>
                  )})
                </span>
                . Vendor deadline pre-filled to one day earlier; adjust for QA / certification / delivery buffer.
              </p>
            )}
            <input
              type="datetime-local"
              value={deadline}
              required
              onChange={(e) => setDeadline(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                !deadline ? "border-red-300" : deadlineAfterClient ? "border-amber-300" : "border-gray-200"
              }`}
            />
            {deadline && deadlineDate && !isNaN(deadlineDate.getTime()) && (
              <p className="mt-1 text-xs text-gray-500">
                = {deadlineDate.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                {" · "}
                <span title="What this looks like to a vendor in this timezone">
                  vendor in MDT sees{" "}
                  {deadlineDate.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Edmonton" })}
                </span>
              </p>
            )}
            {deadlineAfterClient && (
              <p className="mt-1 text-xs text-amber-700">
                ⚠️ This vendor deadline lands on or after the customer's expected delivery date. Leave buffer for QA, certification, and final delivery.
              </p>
            )}
            {!deadline && (
              <p className="mt-1 text-xs text-red-600">Deadline is required.</p>
            )}
            {deadline && expiryDate && !expiryBeforeDeadline && (
              <p className="mt-1 text-xs text-red-600">
                Offer expiry ({expiryDate.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })} {Intl.DateTimeFormat().resolvedOptions().timeZone})
                must be before the deadline. Pick a shorter expiry or a later deadline.
              </p>
            )}
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Instructions for vendor</label>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Special instructions, reference materials, glossary links..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Negotiation config (offer modes only) */}
          {(mode === 'offer' || mode === 'offer_multiple') && (
            <div className="border-t pt-3 mt-3">
              {/* Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={negotiationAllowed}
                  onChange={(e) => setNegotiationAllowed(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Allow vendor to negotiate</span>
              </label>

              {/* Bounds (only when enabled) */}
              {negotiationAllowed && (
                <div className="mt-3 ml-6 space-y-3 p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="text-xs text-gray-500">
                    Set maximum acceptable terms. Counters within these bounds will be auto-accepted.
                    Counters exceeding any limit will be queued for your review.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Max Rate */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Max acceptable rate
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={maxRate}
                        onChange={(e) => setMaxRate(e.target.value)}
                        placeholder={vendorRate ? `Current: ${vendorRate}` : '0.00'}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-gray-400 mt-0.5">
                        {unitDisplayName(vendorRateUnit)}
                      </span>
                    </div>

                    {/* Max Total */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Max acceptable total
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={maxTotal}
                        onChange={(e) => setMaxTotal(e.target.value)}
                        placeholder={calculatedTotal ? `Current: ${calculatedTotal}` : '0.00'}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-gray-400 mt-0.5">{vendorCurrency}</span>
                    </div>
                  </div>

                  {/* Latest Deadline */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Latest acceptable deadline
                    </label>
                    <input
                      type="datetime-local"
                      value={latestDeadline}
                      onChange={(e) => setLatestDeadline(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>

                  {/* Auto-accept toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAccept}
                      onChange={(e) => setAutoAccept(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">
                      Auto-accept counters within limits
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">
                    {autoAccept
                      ? 'Counters within bounds will be accepted automatically — no PM action needed.'
                      : 'All counters will be queued for your review, even if within bounds.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
              canSubmit ? submitColor : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            {submitLabel}
          </button>
        </div>
      </div>

      {/* Vendor Rates Modal */}
      {showRatesModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center" onClick={() => setShowRatesModal(false)}>
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-base font-semibold text-gray-900">
                {vendor?.full_name} — All Rates
              </h3>
              <button onClick={() => setShowRatesModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {allVendorRates.length === 0 ? (
                <p className="text-sm text-gray-500">No rates configured for this vendor.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500 uppercase">
                      <th className="pb-2 pr-2">Service</th>
                      <th className="pb-2 pr-2">Rate</th>
                      <th className="pb-2 pr-2">Currency</th>
                      <th className="pb-2 pr-2">Valid Until</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allVendorRates.map((r: any) => {
                      const isExpired = r.valid_until && new Date(r.valid_until) < new Date();
                      return (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 pr-2 text-gray-900">{r.services?.name || "—"}</td>
                          <td className="py-2 pr-2 font-medium text-gray-900">
                            ${r.rate}/{unitDisplayName(r.calculation_unit)}
                          </td>
                          <td className="py-2 pr-2 text-gray-600">{r.currency}</td>
                          <td className="py-2 pr-2 text-gray-600">
                            {r.valid_until ? new Date(r.valid_until).toLocaleDateString() : "—"}
                          </td>
                          <td className="py-2">
                            {!r.is_active ? (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Inactive</span>
                            ) : isExpired ? (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">Expired</span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Active</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
