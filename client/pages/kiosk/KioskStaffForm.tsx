// Staff-side quote entry for the kiosk. Captures languages, tax region,
// turnaround, documents (with label/pages/complexity/certification), and files.
// Auto-calculates pricing. Simpler than the admin FastQuoteCreate — no
// discounts, overrides, multi-file-per-doc, intended-use, delivery etc.
// All of those can be added incrementally.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Upload, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface Language {
  id: string;
  name: string;
  native_name: string;
  multiplier: number;
  is_source_available: boolean;
  is_target_available: boolean;
}
interface CertificationType {
  id: string;
  name: string;
  price: number;
}
interface TurnaroundOption {
  id: string;
  code: string;
  name: string;
  fee_type: string;
  fee_value: number;
}
interface TaxRate {
  id: string;
  region_code: string;
  region_name: string;
  tax_name: string;
  rate: number;
}
interface KioskDoc {
  id: string;
  label: string;
  pageCount: number;
  complexity: "easy" | "medium" | "hard";
  certificationTypeId: string;
  perPageRateOverride: string; // blank = auto
  files: File[];
}

export interface StaffQuoteData {
  sourceLanguageId: string;
  targetLanguageId: string;
  taxRateId: string;
  turnaroundOptionId: string;
  specialInstructions: string;
  promisedDeliveryDate: string | null; // YYYY-MM-DD
  documents: Array<{
    label: string;
    pageCount: number;
    complexity: "easy" | "medium" | "hard";
    complexityMultiplier: number;
    billablePages: number;
    certificationTypeId: string | null;
    certificationPrice: number;
    perPageRate: number;
    translationCost: number;
    lineTotal: number;
    files: File[];
  }>;
  discount: {
    enabled: boolean;
    type: "percentage" | "fixed";
    value: number;
    reason: string;
    amount: number;
  };
  surcharge: {
    enabled: boolean;
    type: "percentage" | "fixed";
    value: number;
    reason: string;
    amount: number;
  };
  pricing: {
    translationSubtotal: number;
    certificationTotal: number;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    rushFee: number;
    isRush: boolean;
    discountAmount: number;
    surchargeAmount: number;
  };
}

const COMPLEXITY_MULT = { easy: 1.0, medium: 1.15, hard: 1.25 } as const;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function KioskStaffForm({
  onSubmit,
  onCancel,
  deviceName,
}: {
  onSubmit: (data: StaffQuoteData) => void;
  onCancel: () => void;
  deviceName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [languages, setLanguages] = useState<Language[]>([]);
  const [certTypes, setCertTypes] = useState<CertificationType[]>([]);
  const [turnarounds, setTurnarounds] = useState<TurnaroundOption[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [baseRate, setBaseRate] = useState(65);
  const [wordsPerPage] = useState(225);

  const [sourceLanguageId, setSourceLanguageId] = useState("");
  const [targetLanguageId, setTargetLanguageId] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [turnaroundOptionId, setTurnaroundOptionId] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [docs, setDocs] = useState<KioskDoc[]>([
    {
      id: newId(),
      label: "",
      pageCount: 1,
      complexity: "easy",
      certificationTypeId: "",
      perPageRateOverride: "",
      files: [],
    },
  ]);

  // Quote-level discount
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  // Quote-level surcharge
  const [surchargeEnabled, setSurchargeEnabled] = useState(false);
  const [surchargeType, setSurchargeType] = useState<"percentage" | "fixed">("percentage");
  const [surchargeValue, setSurchargeValue] = useState("");
  const [surchargeReason, setSurchargeReason] = useState("");

  // Promised delivery date (optional — staff override)
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [langRes, certRes, turnRes, taxRes, settingsRes] =
          await Promise.all([
            supabase
              .from("languages")
              .select(
                "id,name,native_name,multiplier,is_source_available,is_target_available",
              )
              .eq("is_active", true)
              .order("sort_order"),
            supabase
              .from("certification_types")
              .select("id,name,price")
              .eq("is_active", true)
              .order("sort_order"),
            supabase
              .from("turnaround_options")
              .select("id,code,name,fee_type,fee_value")
              .eq("is_active", true)
              .order("sort_order"),
            supabase
              .from("tax_rates")
              .select("id,region_code,region_name,tax_name,rate")
              .eq("is_active", true)
              .order("region_name"),
            supabase
              .from("app_settings")
              .select("key,value")
              .in("key", ["base_rate"]),
          ]);
        if (langRes.error) throw new Error("Failed to load languages");
        setLanguages(langRes.data || []);
        setCertTypes(certRes.data || []);
        setTurnarounds(turnRes.data || []);
        setTaxRates(taxRes.data || []);
        for (const s of settingsRes.data || []) {
          if (s.key === "base_rate") setBaseRate(parseFloat(s.value) || 65);
        }
        // Defaults
        const ab = (taxRes.data || []).find((t) => t.region_code === "AB");
        if (ab) setTaxRateId(ab.id);
        const std = (turnRes.data || []).find(
          (t) => t.code === "standard" || /standard/i.test(t.name),
        );
        if (std) setTurnaroundOptionId(std.id);
      } catch (e) {
        setLoadError(
          e instanceof Error ? e.message : "Failed to load form data",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const targetLang = languages.find((l) => l.id === targetLanguageId);
  const perPageRate = useMemo(() => {
    const mult = targetLang?.multiplier ?? 1;
    return Math.ceil((baseRate * mult) / 2.5) * 2.5;
  }, [baseRate, targetLang]);

  const selectedTurnaround = turnarounds.find(
    (t) => t.id === turnaroundOptionId,
  );
  const selectedTax = taxRates.find((t) => t.id === taxRateId);

  const priced = useMemo(() => {
    return docs.map((d) => {
      const compMult = COMPLEXITY_MULT[d.complexity];
      const billable = Math.ceil(d.pageCount * compMult * 10) / 10;
      const cert = certTypes.find((c) => c.id === d.certificationTypeId);
      const certPrice = cert?.price || 0;
      const overrideRate = parseFloat(d.perPageRateOverride);
      const effectiveRate =
        !isNaN(overrideRate) && overrideRate > 0 ? overrideRate : perPageRate;
      const translation = billable * effectiveRate;
      return {
        ...d,
        complexityMultiplier: compMult,
        billablePages: billable,
        perPageRate: effectiveRate,
        autoPerPageRate: perPageRate,
        certificationPrice: certPrice,
        translationCost: translation,
        lineTotal: translation + certPrice,
      };
    });
  }, [docs, perPageRate, certTypes]);

  const totals = useMemo(() => {
    const translationSubtotal = priced.reduce(
      (s, d) => s + d.translationCost,
      0,
    );
    const certificationTotal = priced.reduce(
      (s, d) => s + d.certificationPrice,
      0,
    );
    const subtotalBefore = translationSubtotal + certificationTotal;
    let rushFee = 0;
    const isRush =
      !!selectedTurnaround &&
      selectedTurnaround.code !== "standard" &&
      selectedTurnaround.fee_value > 0;
    if (isRush && selectedTurnaround) {
      rushFee =
        selectedTurnaround.fee_type === "percentage"
          ? subtotalBefore * (selectedTurnaround.fee_value / 100)
          : selectedTurnaround.fee_value;
    }

    // Quote-level discount (applied to translation+cert subtotal, not rush/tax)
    let discountAmount = 0;
    if (discountEnabled) {
      const dv = parseFloat(discountValue);
      if (!isNaN(dv) && dv > 0) {
        discountAmount =
          discountType === "percentage"
            ? subtotalBefore * (dv / 100)
            : dv;
        if (discountAmount > subtotalBefore) discountAmount = subtotalBefore;
      }
    }

    // Quote-level surcharge (applied to the same base as discount)
    let surchargeAmount = 0;
    if (surchargeEnabled) {
      const sv = parseFloat(surchargeValue);
      if (!isNaN(sv) && sv > 0) {
        surchargeAmount =
          surchargeType === "percentage"
            ? subtotalBefore * (sv / 100)
            : sv;
      }
    }

    const subtotal =
      subtotalBefore + rushFee - discountAmount + surchargeAmount;
    const taxRate = selectedTax?.rate || 0;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;
    return {
      translationSubtotal,
      certificationTotal,
      subtotal,
      taxRate,
      taxAmount,
      total,
      rushFee,
      isRush,
      discountAmount,
      surchargeAmount,
    };
  }, [priced, selectedTurnaround, selectedTax, discountEnabled, discountType, discountValue, surchargeEnabled, surchargeType, surchargeValue]);

  const addDoc = () =>
    setDocs((prev) => [
      ...prev,
      {
        id: newId(),
        label: "",
        pageCount: 1,
        complexity: "easy",
        certificationTypeId: prev[prev.length - 1]?.certificationTypeId || "",
        perPageRateOverride: "",
        files: [],
      },
    ]);
  const removeDoc = (id: string) =>
    setDocs((prev) => (prev.length > 1 ? prev.filter((d) => d.id !== id) : prev));
  const updateDoc = (id: string, patch: Partial<KioskDoc>) =>
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const addFiles = (docId: string, fl: FileList) => {
    const accepted: File[] = [];
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i];
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`"${f.name}" exceeds 25MB limit`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length)
      updateDoc(docId, {
        files: [
          ...(docs.find((d) => d.id === docId)?.files || []),
          ...accepted,
        ],
      });
  };

  const submit = () => {
    if (!sourceLanguageId || !targetLanguageId) {
      toast.error("Pick source and target languages");
      return;
    }
    if (sourceLanguageId === targetLanguageId) {
      toast.error("Source and target must differ");
      return;
    }
    if (!taxRateId) {
      toast.error("Pick a tax region");
      return;
    }
    for (const d of docs) {
      if (!d.label.trim()) {
        toast.error("Each document needs a label");
        return;
      }
    }
    if (discountEnabled) {
      const dv = parseFloat(discountValue);
      if (isNaN(dv) || dv <= 0) {
        toast.error("Enter a discount amount, or uncheck Discount");
        return;
      }
      if (!discountReason.trim()) {
        toast.error("Discount reason is required");
        return;
      }
    }
    if (surchargeEnabled) {
      const sv = parseFloat(surchargeValue);
      if (isNaN(sv) || sv <= 0) {
        toast.error("Enter a surcharge amount, or uncheck Surcharge");
        return;
      }
      if (!surchargeReason.trim()) {
        toast.error("Surcharge reason is required");
        return;
      }
    }
    onSubmit({
      sourceLanguageId,
      targetLanguageId,
      taxRateId,
      turnaroundOptionId,
      specialInstructions: specialInstructions.trim(),
      promisedDeliveryDate: promisedDeliveryDate || null,
      documents: priced.map((d) => ({
        label: d.label.trim(),
        pageCount: d.pageCount,
        complexity: d.complexity,
        complexityMultiplier: d.complexityMultiplier,
        billablePages: d.billablePages,
        certificationTypeId: d.certificationTypeId || null,
        certificationPrice: d.certificationPrice,
        perPageRate: d.perPageRate,
        translationCost: d.translationCost,
        lineTotal: d.lineTotal,
        files: d.files,
      })),
      discount: {
        enabled: discountEnabled,
        type: discountType,
        value: discountEnabled ? parseFloat(discountValue) || 0 : 0,
        reason: discountEnabled ? discountReason.trim() : "",
        amount: totals.discountAmount,
      },
      surcharge: {
        enabled: surchargeEnabled,
        type: surchargeType,
        value: surchargeEnabled ? parseFloat(surchargeValue) || 0 : 0,
        reason: surchargeEnabled ? surchargeReason.trim() : "",
        amount: totals.surchargeAmount,
      },
      pricing: totals,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-md text-center">
          <p className="text-red-800 font-semibold mb-3">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Kiosk · {deviceName}
          </p>
          <h1 className="text-lg font-bold">Step 1: Quote details (staff)</h1>
        </div>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-800 text-sm underline"
        >
          Cancel
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Languages + tax + turnaround */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Translation</h2>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Source language"
                value={sourceLanguageId}
                onChange={setSourceLanguageId}
                options={languages
                  .filter((l) => l.is_source_available)
                  .map((l) => ({ value: l.id, label: l.name }))}
              />
              <Select
                label="Target language"
                value={targetLanguageId}
                onChange={setTargetLanguageId}
                options={languages
                  .filter(
                    (l) => l.is_target_available && l.id !== sourceLanguageId,
                  )
                  .map((l) => ({ value: l.id, label: l.name }))}
              />
              <Select
                label="Tax region"
                value={taxRateId}
                onChange={setTaxRateId}
                options={taxRates.map((t) => ({
                  value: t.id,
                  label: `${t.region_name} (${(t.rate * 100).toFixed(1)}%)`,
                }))}
              />
              <Select
                label="Turnaround"
                value={turnaroundOptionId}
                onChange={setTurnaroundOptionId}
                options={turnarounds.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
            </div>
            <div className="mt-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Special instructions (optional)
              </label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </section>

          {/* Documents */}
          <section className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Documents ({docs.length})</h2>
              <button
                onClick={addDoc}
                className="text-sm text-teal-600 hover:text-teal-800 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add document
              </button>
            </div>
            <div className="space-y-3">
              {docs.map((d, idx) => {
                const p = priced[idx];
                return (
                  <div
                    key={d.id}
                    className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        value={d.label}
                        onChange={(e) =>
                          updateDoc(d.id, { label: e.target.value })
                        }
                        placeholder="e.g. Birth certificate"
                        className="flex-1 px-3 py-2 border rounded bg-white text-sm focus:ring-2 focus:ring-teal-500"
                      />
                      {docs.length > 1 && (
                        <button
                          onClick={() => removeDoc(d.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <NumInput
                        label="Pages"
                        value={d.pageCount}
                        onChange={(v) =>
                          updateDoc(d.id, { pageCount: Math.max(1, v) })
                        }
                      />
                      <Select
                        label="Complexity"
                        value={d.complexity}
                        onChange={(v) =>
                          updateDoc(d.id, {
                            complexity: v as "easy" | "medium" | "hard",
                          })
                        }
                        options={[
                          { value: "easy", label: "Easy" },
                          { value: "medium", label: "Medium" },
                          { value: "hard", label: "Hard" },
                        ]}
                        small
                      />
                      <Select
                        label="Certification"
                        value={d.certificationTypeId}
                        onChange={(v) =>
                          updateDoc(d.id, { certificationTypeId: v })
                        }
                        options={[
                          { value: "", label: "None" },
                          ...certTypes.map((c) => ({
                            value: c.id,
                            label: c.name,
                          })),
                        ]}
                        small
                      />
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Per-page rate ($){" "}
                        <span className="font-normal text-gray-400 normal-case">
                          — auto: ${perPageRate.toFixed(2)}
                        </span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={d.perPageRateOverride}
                        onChange={(e) =>
                          updateDoc(d.id, {
                            perPageRateOverride: e.target.value,
                          })
                        }
                        placeholder={`Leave blank for auto (${perPageRate.toFixed(2)})`}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-xs bg-white border border-dashed border-gray-300 rounded px-3 py-2 cursor-pointer hover:border-teal-500">
                        <Upload className="w-4 h-4" />
                        <span>Add files</span>
                        <input
                          type="file"
                          className="hidden"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,.tiff"
                          onChange={(e) =>
                            e.target.files && addFiles(d.id, e.target.files)
                          }
                        />
                      </label>
                      {d.files.map((f, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-xs bg-white border rounded px-2 py-1"
                        >
                          <FileText className="w-3 h-3" />
                          {f.name.length > 18
                            ? f.name.slice(0, 16) + "…"
                            : f.name}
                          <button
                            onClick={() =>
                              updateDoc(d.id, {
                                files: d.files.filter((_, j) => j !== i),
                              })
                            }
                            className="ml-0.5 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    {p && p.lineTotal > 0 && (
                      <div className="mt-2 text-right text-xs text-gray-500">
                        {p.billablePages.toFixed(1)} pg ×{" "}
                        ${p.perPageRate.toFixed(2)} ={" "}
                        <span className="font-semibold text-gray-900">
                          ${p.lineTotal.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Discount */}
          <section className="bg-white rounded-xl border p-5">
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={discountEnabled}
                onChange={(e) => setDiscountEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="font-semibold">Apply discount</span>
            </label>
            {discountEnabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Type"
                    value={discountType}
                    onChange={(v) =>
                      setDiscountType(v as "percentage" | "fixed")
                    }
                    options={[
                      { value: "percentage", label: "Percentage (%)" },
                      { value: "fixed", label: "Fixed amount ($)" },
                    ]}
                  />
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      {discountType === "percentage"
                        ? "Percent (%)"
                        : "Amount ($)"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={discountType === "percentage" ? "0.1" : "0.01"}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={
                        discountType === "percentage" ? "e.g. 10" : "e.g. 25.00"
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Reason
                  </label>
                  <input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="e.g. Returning customer"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Surcharge */}
          <section className="bg-white rounded-xl border p-5">
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={surchargeEnabled}
                onChange={(e) => setSurchargeEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="font-semibold">Apply surcharge</span>
            </label>
            {surchargeEnabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Type"
                    value={surchargeType}
                    onChange={(v) =>
                      setSurchargeType(v as "percentage" | "fixed")
                    }
                    options={[
                      { value: "percentage", label: "Percentage (%)" },
                      { value: "fixed", label: "Fixed amount ($)" },
                    ]}
                  />
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      {surchargeType === "percentage"
                        ? "Percent (%)"
                        : "Amount ($)"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={surchargeType === "percentage" ? "0.1" : "0.01"}
                      value={surchargeValue}
                      onChange={(e) => setSurchargeValue(e.target.value)}
                      placeholder={
                        surchargeType === "percentage" ? "e.g. 10" : "e.g. 25.00"
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Reason
                  </label>
                  <input
                    value={surchargeReason}
                    onChange={(e) => setSurchargeReason(e.target.value)}
                    placeholder="e.g. Hardcopy notarization"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Promised delivery date */}
          <section className="bg-white rounded-xl border p-5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Promised delivery date (optional)
            </label>
            <input
              type="date"
              value={promisedDeliveryDate}
              onChange={(e) => setPromisedDeliveryDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to use the default based on turnaround.
            </p>
          </section>
        </div>

        {/* ── Right column — totals & continue ─────────────── */}
        <aside className="space-y-4">
          <div className="bg-white rounded-xl border p-5 sticky top-4">
            <h2 className="font-semibold mb-3">Summary</h2>
            <dl className="space-y-1.5 text-sm">
              <Row
                label="Translation"
                value={totals.translationSubtotal}
              />
              <Row
                label="Certification"
                value={totals.certificationTotal}
              />
              {totals.isRush && (
                <Row label="Rush fee" value={totals.rushFee} />
              )}
              {totals.discountAmount > 0 && (
                <Row
                  label="Discount"
                  value={-totals.discountAmount}
                  highlight="text-green-700"
                />
              )}
              {totals.surchargeAmount > 0 && (
                <Row
                  label="Surcharge"
                  value={totals.surchargeAmount}
                  highlight="text-amber-700"
                />
              )}
              <Row label="Subtotal" value={totals.subtotal} />
              <Row
                label={`Tax (${(totals.taxRate * 100).toFixed(1)}%)`}
                value={totals.taxAmount}
              />
              <hr className="my-2" />
              <Row label="Total" value={totals.total} bold />
            </dl>
            <button
              onClick={submit}
              className="mt-5 w-full bg-teal-600 text-white py-3 rounded-lg text-base font-semibold hover:bg-teal-700"
            >
              Continue → hand to customer
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── tiny shared UI helpers ────────────────────────────────────────────────

function Select({
  label,
  value,
  onChange,
  options,
  small,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  small?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg focus:ring-2 focus:ring-teal-500 ${
          small ? "px-2 py-1.5 text-sm" : "px-3 py-2"
        }`}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 1)}
        className="w-full px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
      />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: string;
}) {
  const cls = bold
    ? "text-base font-bold text-gray-900"
    : highlight || "text-gray-600";
  return (
    <div className={`flex justify-between ${cls}`}>
      <dt>{label}</dt>
      <dd>
        {value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}
      </dd>
    </div>
  );
}
