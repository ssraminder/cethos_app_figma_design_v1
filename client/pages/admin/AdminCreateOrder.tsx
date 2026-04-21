// AdminCreateOrder.tsx
//
// Non-certified project entry point: Quote OR Direct Order modes.
// Certified translations continue through FastQuoteCreate.
//
// Quote mode         → calls create-fast-quote (pay-link flow)
// Direct Order mode  → calls admin-create-order (AR customers only, invoice on delivery)

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { toast } from "sonner";
import SearchableSelect from "@/components/ui/SearchableSelect";
import CustomerSearch, { CustomerHit } from "@/components/shared/CustomerSearch";
import { ArrowLeft, Plus, Trash2, Loader2, AlertCircle, Briefcase, Zap } from "lucide-react";

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

type Mode = "quote" | "direct_order";
type CalcUnit = "per_page" | "per_word" | "per_hour" | "per_minute" | "flat";

interface ServiceRow {
  id: string;
  code: string;
  name: string;
  category: string;
  default_calculation_units: string[];
  customer_facing: boolean;
  is_active: boolean;
  sort_order: number;
}

interface LanguageRow {
  id: string;
  name: string;
  code: string;
  is_source_available: boolean;
  is_target_available: boolean;
}

interface ARCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  customer_type: string | null;
  is_ar_customer: boolean;
  payment_terms: string | null;
  currency: string | null;
}

interface LineItem {
  id: string;
  description: string;
  calculationUnit: CalcUnit;
  unitQuantity: string;
  baseRate: string;
}

const UNIT_LABELS: Record<CalcUnit, string> = {
  per_page: "Per page",
  per_word: "Per word",
  per_hour: "Per hour",
  per_minute: "Per minute",
  flat: "Flat fee",
};

const nextId = () => `li-${Math.random().toString(36).slice(2, 10)}`;

const newLine = (unit: CalcUnit = "per_word"): LineItem => ({
  id: nextId(),
  description: "",
  calculationUnit: unit,
  unitQuantity: "",
  baseRate: "",
});

const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// ═════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function AdminCreateOrder() {
  const navigate = useNavigate();
  const { session } = useAdminAuthContext();

  const [mode, setMode] = useState<Mode>("quote");

  // ── Reference data ──
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // ── Form state ──
  const [customer, setCustomer] = useState<ARCustomer | null>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [sourceLanguageId, setSourceLanguageId] = useState<string>("");
  const [targetLanguageId, setTargetLanguageId] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()]);

  const [rushFee, setRushFee] = useState<string>("");
  const [deliveryFee, setDeliveryFee] = useState<string>("");
  const [taxRate, setTaxRate] = useState<string>("0.05");
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  // ── Load reference data once ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [svcRes, langRes] = await Promise.all([
        supabase
          .from("services")
          .select(
            "id, code, name, category, default_calculation_units, customer_facing, is_active, sort_order",
          )
          .eq("is_active", true)
          .order("category")
          .order("sort_order"),
        supabase
          .from("languages")
          .select("id, name, code, is_source_available, is_target_available")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (cancelled) return;
      setServices((svcRes.data as ServiceRow[]) ?? []);
      setLanguages((langRes.data as LanguageRow[]) ?? []);
      setLoadingRefs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived ──
  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) || null,
    [serviceId, services],
  );

  const allowedUnits: CalcUnit[] = useMemo(() => {
    const defaults = (selectedService?.default_calculation_units ?? [
      "per_page",
      "per_word",
      "per_hour",
      "per_minute",
      "flat",
    ]) as string[];
    // Always allow flat as an override
    const set = new Set<CalcUnit>([...defaults as CalcUnit[], "flat"]);
    return Array.from(set);
  }, [selectedService]);

  const totals = useMemo(() => {
    const lineTotals = lineItems.map((li) => {
      const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
      const rate = num(li.baseRate);
      return Math.round(qty * rate * 100) / 100;
    });
    const subtotal = Math.round(lineTotals.reduce((a, b) => a + b, 0) * 100) / 100;
    const rush = num(rushFee);
    const delivery = num(deliveryFee);
    const rate = num(taxRate);
    const preTax = subtotal + rush + delivery;
    const tax = Math.round(preTax * rate * 100) / 100;
    const total = Math.round((preTax + tax) * 100) / 100;
    return { lineTotals, subtotal, rush, delivery, rate, tax, total };
  }, [lineItems, rushFee, deliveryFee, taxRate]);

  // ── Customer selection ──
  const handleCustomerSelect = async (hit: CustomerHit) => {
    // Fetch full AR fields
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, full_name, email, company_name, customer_type, is_ar_customer, payment_terms, currency",
      )
      .eq("id", hit.id)
      .maybeSingle();
    if (error || !data) {
      toast.error("Failed to load customer");
      return;
    }
    setCustomer(data as ARCustomer);
  };

  const customerLabel = customer
    ? customer.company_name || customer.full_name || customer.email || customer.id
    : undefined;

  const canDirectOrder = !!customer?.is_ar_customer;

  // Force mode=quote if customer ineligible
  useEffect(() => {
    if (mode === "direct_order" && customer && !customer.is_ar_customer) {
      setMode("quote");
      toast.info("Customer is not AR-approved — switched to Quote mode.");
    }
  }, [customer, mode]);

  // ── Line-item handlers ──
  const addLine = () =>
    setLineItems((prev) => [...prev, newLine(allowedUnits[0] ?? "per_word")]);
  const removeLine = (id: string) =>
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setLineItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // When service changes, snap any out-of-range units onto the first allowed unit
  useEffect(() => {
    if (!selectedService) return;
    setLineItems((prev) =>
      prev.map((l) =>
        allowedUnits.includes(l.calculationUnit)
          ? l
          : { ...l, calculationUnit: allowedUnits[0] ?? "per_word" },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  // ── Validation ──
  const validate = (): string | null => {
    if (!customer) return "Pick a customer";
    if (!serviceId) return "Pick a service";
    if (!sourceLanguageId) return "Pick a source language";
    if (!targetLanguageId) return "Pick a target language";
    if (mode === "direct_order" && !customer.is_ar_customer) {
      return "Direct orders require an AR-approved customer";
    }
    for (const li of lineItems) {
      if (!li.description.trim()) return "Every line item needs a description";
      const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
      if (qty <= 0) return "Every line item needs a positive quantity";
      if (num(li.baseRate) <= 0) return "Every line item needs a positive rate";
    }
    return null;
  };

  // ── Submit ──
  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!session?.staffId) {
      toast.error("You must be logged in");
      return;
    }

    setSubmitting(true);
    try {
      const documents = lineItems.map((li) => {
        const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
        const rate = num(li.baseRate);
        return {
          label: li.description.trim(),
          calculationUnit: li.calculationUnit,
          unitQuantity: qty,
          baseRate: rate,
          lineTotal: Math.round(qty * rate * 100) / 100,
        };
      });

      const pricing = {
        subtotal: totals.subtotal,
        certificationTotal: 0,
        rushFee: totals.rush,
        deliveryFee: totals.delivery,
        taxRate: totals.rate,
        taxAmount: totals.tax,
        total: totals.total,
      };

      if (mode === "quote") {
        // create-fast-quote body
        const body = {
          staffId: session.staffId,
          customer: {
            existingCustomerId: customer!.id,
            fullName: customer!.full_name || customer!.company_name || "",
            email: customer!.email,
            customerType: customer!.customer_type,
            companyName: customer!.company_name,
          },
          quote: {
            serviceId,
            sourceLanguageId,
            targetLanguageId,
            specialInstructions: specialInstructions.trim() || null,
            taxRate: totals.rate,
            rushFee: totals.rush,
            deliveryFee: totals.delivery,
            isRush: totals.rush > 0,
            promisedDeliveryDate: promisedDeliveryDate || null,
            entryPoint: "admin_non_certified",
            manualQuoteNotes: specialInstructions.trim() || null,
          },
          documents,
          pricing,
        };
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-fast-quote`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(body),
          },
        );
        const data = await res.json();
        if (!data?.success) {
          throw new Error(data?.error || "Quote creation failed");
        }
        toast.success(`Quote ${data.quoteNumber} created`);
        navigate(`/admin/quotes/${data.quoteId}`);
        return;
      }

      // Direct order mode
      const body = {
        staffId: session.staffId,
        customer: { existingCustomerId: customer!.id },
        order: {
          serviceId,
          sourceLanguageId,
          targetLanguageId,
          specialInstructions: specialInstructions.trim() || null,
          promisedDeliveryDate: promisedDeliveryDate || null,
          isRush: totals.rush > 0,
          notes: specialInstructions.trim() || null,
        },
        documents,
        pricing,
      };
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Direct order creation failed");
      }
      toast.success(`Order ${data.orderNumber} created`);
      navigate(`/admin/orders/${data.orderId}`);
    } catch (e: any) {
      toast.error(e?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  // Group services for grouped picker
  const servicesByCategory = useMemo(() => {
    const map = new Map<string, ServiceRow[]>();
    for (const s of services) {
      const arr = map.get(s.category) || [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return Array.from(map.entries());
  }, [services]);

  const serviceOptions = useMemo(
    () =>
      servicesByCategory.flatMap(([cat, items]) =>
        items.map((s) => ({
          value: s.id,
          label: `${s.name}`,
          group: cat.replace(/_/g, " "),
        })),
      ),
    [servicesByCategory],
  );

  const sourceLangOptions = useMemo(
    () =>
      languages
        .filter((l) => l.is_source_available)
        .map((l) => ({ value: l.id, label: l.name })),
    [languages],
  );
  const targetLangOptions = useMemo(
    () =>
      languages
        .filter((l) => l.is_target_available)
        .map((l) => ({ value: l.id, label: l.name })),
    [languages],
  );

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/orders"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Orders
          </Link>
          <h1 className="text-2xl font-semibold">New project</h1>
        </div>
        <Link
          to="/admin/quotes/fast-create"
          className="text-sm text-teal-600 hover:underline"
        >
          Certified fast quote →
        </Link>
      </div>

      {/* Mode toggle */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("quote")}
            className={`flex-1 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition ${
              mode === "quote"
                ? "border-teal-500 bg-teal-50 text-teal-900"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <Zap className="w-4 h-4" />
            <div className="text-left">
              <div>Quote</div>
              <div className="text-xs font-normal text-gray-500">
                Customer pays via link, then becomes an order
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canDirectOrder) {
                toast.info(
                  customer
                    ? "Customer must be AR-approved first"
                    : "Pick a customer first",
                );
                return;
              }
              setMode("direct_order");
            }}
            disabled={!canDirectOrder}
            className={`flex-1 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition ${
              mode === "direct_order"
                ? "border-teal-500 bg-teal-50 text-teal-900"
                : "border-gray-200 bg-white hover:border-gray-300"
            } ${!canDirectOrder ? "opacity-50 cursor-not-allowed" : ""}`}
            title={
              !canDirectOrder
                ? "Requires an AR-approved customer"
                : "Create an open order — invoice on delivery"
            }
          >
            <Briefcase className="w-4 h-4" />
            <div className="text-left">
              <div>Direct order</div>
              <div className="text-xs font-normal text-gray-500">
                Skip quote — invoice on delivery (AR customers)
              </div>
            </div>
          </button>
        </div>
      </div>

      {loadingRefs ? (
        <div className="flex items-center justify-center py-10 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Customer */}
          <section className="bg-white border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Customer</h2>
            {customer ? (
              <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2">
                <div className="text-sm">
                  <div className="font-medium">{customerLabel}</div>
                  <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                    <span>{customer.customer_type || "individual"}</span>
                    {customer.is_ar_customer && (
                      <span className="text-teal-700 font-medium">
                        AR · {customer.payment_terms || "net_30"}
                      </span>
                    )}
                    {!customer.is_ar_customer && mode === "direct_order" && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> not AR-approved
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomer(null)}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  Change
                </button>
              </div>
            ) : (
              <CustomerSearch
                onSelect={handleCustomerSelect}
                placeholder="Search existing customer…"
              />
            )}
          </section>

          {/* Service + languages */}
          <section className="bg-white border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Service</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="block text-xs text-gray-600 mb-1">
                  Service type
                </label>
                <SearchableSelect
                  options={serviceOptions as any}
                  value={serviceId}
                  onChange={setServiceId}
                  placeholder="Pick a service…"
                />
                {selectedService && (
                  <p className="text-xs text-gray-500 mt-1">
                    Default units:{" "}
                    {(selectedService.default_calculation_units || []).map((u) =>
                      UNIT_LABELS[u as CalcUnit] || u,
                    ).join(" · ") || "—"}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Source language
                </label>
                <SearchableSelect
                  options={sourceLangOptions as any}
                  value={sourceLanguageId}
                  onChange={setSourceLanguageId}
                  placeholder="Source…"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Target language
                </label>
                <SearchableSelect
                  options={targetLangOptions as any}
                  value={targetLanguageId}
                  onChange={setTargetLanguageId}
                  placeholder="Target…"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Promised delivery
                </label>
                <input
                  type="date"
                  value={promisedDeliveryDate}
                  onChange={(e) => setPromisedDeliveryDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </section>

          {/* Line items */}
          <section className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Line items</h2>
              <button
                type="button"
                onClick={addLine}
                className="text-sm flex items-center gap-1 text-teal-600 hover:text-teal-700"
              >
                <Plus className="w-4 h-4" /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => {
                const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
                const lineTotal = Math.round(qty * num(li.baseRate) * 100) / 100;
                return (
                  <div
                    key={li.id}
                    className="grid grid-cols-12 gap-2 items-start rounded-md border border-gray-200 p-3"
                  >
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={li.description}
                        onChange={(e) =>
                          updateLine(li.id, { description: e.target.value })
                        }
                        placeholder={`Line ${idx + 1}`}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Unit
                      </label>
                      <select
                        value={li.calculationUnit}
                        onChange={(e) =>
                          updateLine(li.id, {
                            calculationUnit: e.target.value as CalcUnit,
                            unitQuantity:
                              e.target.value === "flat" ? "1" : li.unitQuantity,
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {allowedUnits.map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={li.calculationUnit === "flat"}
                        value={li.calculationUnit === "flat" ? "1" : li.unitQuantity}
                        onChange={(e) =>
                          updateLine(li.id, { unitQuantity: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Rate
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={li.baseRate}
                        onChange={(e) =>
                          updateLine(li.id, { baseRate: e.target.value })
                        }
                        placeholder="0.00"
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="col-span-8 md:col-span-1 flex flex-col justify-end">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Total
                      </label>
                      <div className="text-sm font-medium py-1.5">
                        ${lineTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="col-span-4 md:col-span-1 flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(li.id)}
                        disabled={lineItems.length <= 1}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Extras + totals */}
          <section className="bg-white border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Totals</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Rush fee
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={rushFee}
                  onChange={(e) => setRushFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Delivery fee
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Tax rate (decimal)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="0.05"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="border-t pt-3 grid grid-cols-2 gap-y-1 text-sm">
              <div className="text-gray-600">Subtotal</div>
              <div className="text-right">${totals.subtotal.toFixed(2)}</div>
              {totals.rush > 0 && (
                <>
                  <div className="text-gray-600">Rush fee</div>
                  <div className="text-right">${totals.rush.toFixed(2)}</div>
                </>
              )}
              {totals.delivery > 0 && (
                <>
                  <div className="text-gray-600">Delivery fee</div>
                  <div className="text-right">${totals.delivery.toFixed(2)}</div>
                </>
              )}
              <div className="text-gray-600">Tax ({(totals.rate * 100).toFixed(2)}%)</div>
              <div className="text-right">${totals.tax.toFixed(2)}</div>
              <div className="font-semibold">Total</div>
              <div className="text-right font-semibold">
                ${totals.total.toFixed(2)}{" "}
                {customer?.currency || "CAD"}
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="bg-white border rounded-lg p-4 space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              Special instructions / internal notes
            </label>
            <textarea
              rows={3}
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Anything the team or vendor should know…"
            />
          </section>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pb-10">
            <Link
              to="/admin/orders"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "quote" ? "Create quote" : "Create direct order"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
