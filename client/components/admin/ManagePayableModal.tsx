import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, X, Sparkles } from "lucide-react";

// Modes the modal supports. Each maps to vendor_payables.rate_unit on the
// server (cat → per_word at the parent level, with a child-table breakdown).
type Mode = "flat" | "per_word" | "per_hour" | "per_page" | "cat";

const MODE_LABELS: Record<Mode, string> = {
  flat: "Flat",
  per_word: "Per word",
  per_hour: "Per hour",
  per_page: "Per page",
  cat: "CAT analysis",
};

const MODE_HELP: Record<Mode, string> = {
  flat: "Single fixed amount for this step. No quantity × rate breakdown.",
  per_word: "Rate × source word count.",
  per_hour: "Rate × billable hours.",
  per_page: "Rate × billable pages.",
  cat: "Paste a Trados / SDL / memoQ / XTM / Plunet / XTRF analysis. Word counts per tier are extracted automatically; the vendor's CAT grid converts those into a payable.",
};

interface ExistingPayable {
  id: string;
  rate: number;
  rate_unit: string;
  units: number;
  subtotal: number;
  total: number;
  currency: string;
  status: string;
}

interface CatLine {
  match_tier: string;
  tier_label: string;
  word_count: number;
  tier_percentage: number;
  base_rate: number;
  line_subtotal: number;
}

interface ParseResponse {
  success: boolean;
  lines?: CatLine[];
  total_words?: number;
  subtotal?: number;
  currency?: string;
  grid_source?: "vendor" | "global";
  extraction_source?: "claude" | "regex_fallback";
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  workflowStepId: string;
  stepNumber: number;
  stepName: string;
  vendorId: string | null;
  vendorName: string | null;
  existingPayable: ExistingPayable | null;
  onSaved: () => Promise<void> | void;
}

function fmt(n: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export default function ManagePayableModal({
  open,
  onClose,
  workflowStepId,
  stepNumber,
  stepName,
  vendorId,
  vendorName,
  existingPayable,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<Mode>("per_word");
  const [rate, setRate] = useState<string>("");
  const [units, setUnits] = useState<string>("");
  const [flatAmount, setFlatAmount] = useState<string>("");
  const [taxRatePct, setTaxRatePct] = useState<string>("0");
  const [currency, setCurrency] = useState<string>("CAD");
  const [description, setDescription] = useState<string>("");

  // CAT-specific state
  const [catBaseRate, setCatBaseRate] = useState<string>("");
  const [catPasteText, setCatPasteText] = useState<string>("");
  const [catLines, setCatLines] = useState<CatLine[]>([]);
  const [catGridSource, setCatGridSource] = useState<"vendor" | "global" | null>(null);
  const [catExtractionSource, setCatExtractionSource] = useState<"claude" | "regex_fallback" | null>(null);
  const [parsing, setParsing] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset every time the modal opens. Pre-fill from existing payable when
    // present so staff can see what's already there.
    if (existingPayable) {
      const unitMap: Record<string, Mode> = {
        flat: "flat",
        per_word: "per_word",
        per_hour: "per_hour",
        per_page: "per_page",
      };
      setMode(unitMap[existingPayable.rate_unit] ?? "flat");
      setRate(String(existingPayable.rate ?? ""));
      setUnits(String(existingPayable.units ?? ""));
      setFlatAmount(existingPayable.rate_unit === "flat" ? String(existingPayable.total ?? "") : "");
      setCurrency(existingPayable.currency || "CAD");
    } else {
      setMode("per_word");
      setRate("");
      setUnits("");
      setFlatAmount("");
      setCurrency("CAD");
    }
    setTaxRatePct("0");
    setDescription("");
    setCatBaseRate("");
    setCatPasteText("");
    setCatLines([]);
    setCatGridSource(null);
    setCatExtractionSource(null);
  }, [open, existingPayable]);

  const subtotal = useMemo<number>(() => {
    if (mode === "flat") return Number(flatAmount) || 0;
    if (mode === "cat") {
      return catLines.reduce((s, l) => s + (Number(l.line_subtotal) || 0), 0);
    }
    return (Number(rate) || 0) * (Number(units) || 0);
  }, [mode, rate, units, flatAmount, catLines]);

  const taxRate = (Number(taxRatePct) || 0) / 100;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const handleParseCat = async () => {
    if (!catPasteText.trim()) {
      toast.error("Paste the CAT analysis first.");
      return;
    }
    const base = Number(catBaseRate);
    if (!Number.isFinite(base) || base <= 0) {
      toast.error("Enter a base per-word rate first.");
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke<ParseResponse>("parse-cat-analysis", {
        body: {
          pasted_text: catPasteText,
          base_rate: base,
          vendor_id: vendorId,
          currency,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Parser failed");
      setCatLines(data.lines || []);
      setCatGridSource(data.grid_source || null);
      setCatExtractionSource(data.extraction_source || null);
      toast.success(`Parsed ${data.total_words ?? 0} words → ${fmt(data.subtotal ?? 0, data.currency || currency)}`);
    } catch (e: any) {
      toast.error(e?.message || "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  // Lets staff fix a count after parsing, e.g. when Claude grabbed the wrong
  // column. Live recomputes line_subtotal from words × tier_pct × base_rate.
  const updateCatLine = (idx: number, field: "word_count" | "tier_percentage", value: number) => {
    setCatLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, [field]: value };
        next.line_subtotal = Math.round(next.word_count * next.tier_percentage * next.base_rate * 10000) / 10000;
        return next;
      }),
    );
  };

  const canSave = useMemo(() => {
    if (saving) return false;
    if (mode === "flat") return Number(flatAmount) > 0;
    if (mode === "cat") return catLines.length > 0 && subtotal > 0;
    return Number(rate) > 0 && Number(units) > 0;
  }, [mode, flatAmount, catLines, subtotal, rate, units, saving]);

  const handleSave = async () => {
    if (!vendorId) {
      toast.error("Cannot create payable: step has no vendor assigned.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: "create_payable",
        workflow_step_id: workflowStepId,
        vendor_id: vendorId,
        mode,
        currency,
        tax_rate: taxRate,
        description: description || undefined,
      };
      if (mode === "flat") {
        payload.flat_amount = Number(flatAmount);
      } else if (mode === "cat") {
        payload.base_rate = Number(catBaseRate);
        payload.cat_lines = catLines.map((l) => ({
          match_tier: l.match_tier,
          tier_label: l.tier_label,
          word_count: l.word_count,
          tier_percentage: l.tier_percentage,
        }));
      } else {
        payload.rate = Number(rate);
        payload.units = Number(units);
      }

      const { data, error } = await supabase.functions.invoke<{ success: boolean; error?: string }>(
        "manage-vendor-payables",
        { body: payload },
      );
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Save failed");
      toast.success(existingPayable ? "Payable replaced" : "Payable created");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const body = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {existingPayable ? "Manage Payable" : "Add Payable"} — Step {stepNumber}: {stepName}
            </h2>
            <div className="text-xs text-gray-500 mt-0.5">
              {vendorName ? `Vendor: ${vendorName}` : "No vendor assigned"}
              {existingPayable && (
                <span className="ml-2">
                  · Current status: <span className="font-medium">{existingPayable.status}</span>
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" disabled={saving}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-6 pt-4">
          <div className="flex flex-wrap gap-1 border-b">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm font-medium -mb-px border-b-2 ${
                  mode === m
                    ? "border-teal-600 text-teal-700"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">{MODE_HELP[mode]}</p>
        </div>

        {/* Mode-specific inputs */}
        <div className="px-6 py-4 space-y-4">
          {mode === "flat" && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">Flat amount ({currency})</label>
              <input
                type="number"
                step="0.01"
                value={flatAmount}
                onChange={(e) => setFlatAmount(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
                placeholder="e.g. 150.00"
              />
            </div>
          )}

          {(mode === "per_word" || mode === "per_hour" || mode === "per_page") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Rate ({currency} {mode === "per_word" ? "/ word" : mode === "per_hour" ? "/ hour" : "/ page"})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  {mode === "per_word" ? "Words" : mode === "per_hour" ? "Hours" : "Pages"}
                </label>
                <input
                  type="number"
                  step={mode === "per_hour" ? "0.25" : "1"}
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          {mode === "cat" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Base per-word rate ({currency})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={catBaseRate}
                  onChange={(e) => setCatBaseRate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. 0.10"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Each tier is billed at this rate × the tier's percentage from the vendor's CAT grid.
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Paste analysis</label>
                <textarea
                  rows={6}
                  value={catPasteText}
                  onChange={(e) => setCatPasteText(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-teal-500"
                  placeholder={"Paste a Trados, SDL Studio, memoQ, XTM, Phrase, Plunet, or XTRF analysis here. The 'Words' column is what matters — segment / character columns are ignored."}
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[11px] text-gray-500">
                    AI extracts per-tier word counts. You can edit the table below before saving.
                  </p>
                  <button
                    type="button"
                    onClick={handleParseCat}
                    disabled={parsing || !catPasteText.trim() || !catBaseRate}
                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                  >
                    {parsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Parse
                  </button>
                </div>
              </div>

              {catLines.length > 0 && (
                <div className="border border-gray-200 rounded">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b text-xs text-gray-600">
                    <span>
                      Grid: <span className="font-medium">{catGridSource === "vendor" ? "vendor override" : "global default"}</span>
                      {catExtractionSource && (
                        <span className="ml-2 text-gray-500">
                          · extracted via {catExtractionSource === "claude" ? "AI" : "fallback regex"}
                        </span>
                      )}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-1.5">Tier</th>
                        <th className="text-right px-3 py-1.5">Words</th>
                        <th className="text-right px-3 py-1.5">Tier %</th>
                        <th className="text-right px-3 py-1.5">Effective rate</th>
                        <th className="text-right px-3 py-1.5">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catLines.map((l, idx) => (
                        <tr key={l.match_tier} className="border-t">
                          <td className="px-3 py-1.5">{l.tier_label}</td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              step="1"
                              value={l.word_count}
                              onChange={(e) => updateCatLine(idx, "word_count", Number(e.target.value) || 0)}
                              className="w-20 border border-gray-200 rounded px-1 py-0.5 text-xs text-right tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={Math.round(l.tier_percentage * 10000) / 100}
                              onChange={(e) => updateCatLine(idx, "tier_percentage", (Number(e.target.value) || 0) / 100)}
                              className="w-16 border border-gray-200 rounded px-1 py-0.5 text-xs text-right tabular-nums"
                            />
                            %
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                            {fmt(l.base_rate * l.tier_percentage, currency)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                            {fmt(l.line_subtotal, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr className="border-t font-medium">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {catLines.reduce((s, l) => s + l.word_count, 0)}
                        </td>
                        <td className="px-3 py-1.5"></td>
                        <td className="px-3 py-1.5"></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(subtotal, currency)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tax + currency (shared) */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500"
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tax %</label>
              <input
                type="number"
                step="0.01"
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="col-span-1 text-right pt-5">
              <div className="text-xs text-gray-500">
                Subtotal: <span className="tabular-nums">{fmt(subtotal, currency)}</span>
              </div>
              <div className="text-xs text-gray-500">
                Tax: <span className="tabular-nums">{fmt(taxAmount, currency)}</span>
              </div>
              <div className="text-sm font-semibold">
                Total: <span className="tabular-nums">{fmt(total, currency)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Step ${stepNumber}: ${stepName}`}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {existingPayable && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              A payable already exists on this step ({fmt(existingPayable.total, existingPayable.currency)},
              {" "}status <span className="font-medium">{existingPayable.status}</span>). Saving will cancel
              the existing payable and create a new one. Status transitions on the prior row are preserved
              for audit.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {existingPayable ? "Replace payable" : "Add payable"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
