// Phase B-3 of #2.5. Focused CAT-receivable creation modal. The existing
// EditableReceivablesBreakdown inline form keeps handling flat / per-unit
// lines; this modal adds the CAT-tier path that didn't exist on the
// receivable side before (only existed for vendor payables).
//
// Math mirrors ManagePayableModal / manage-receivables.create_receivable:
//   line_subtotal = SUM(word_count × tier_percentage × base_rate)
//   total = subtotal + (subtotal × tax_rate)
//
// Server validates the math; UI shows it live so staff can preview before
// saving.

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, X, AlertTriangle } from "lucide-react";

interface CatLineDraft {
  match_tier: string;
  tier_label: string;
  word_count: number;
  tier_percentage: number;
}

interface ManageReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  currency: string;
  defaultTaxRate: number;
  staffId: string | null;
  onSaved: () => void;
}

// Default tier ladder roughly matching common CAT tools' segment buckets.
const DEFAULT_TIERS: CatLineDraft[] = [
  { match_tier: "new",           tier_label: "No match",         word_count: 0, tier_percentage: 1.0 },
  { match_tier: "fuzzy_75_84",   tier_label: "75-84% fuzzy",     word_count: 0, tier_percentage: 0.65 },
  { match_tier: "fuzzy_85_94",   tier_label: "85-94% fuzzy",     word_count: 0, tier_percentage: 0.5 },
  { match_tier: "fuzzy_95_99",   tier_label: "95-99% fuzzy",     word_count: 0, tier_percentage: 0.3 },
  { match_tier: "repetitions",   tier_label: "Repetitions",      word_count: 0, tier_percentage: 0.25 },
  { match_tier: "context_match", tier_label: "Context/100%",     word_count: 0, tier_percentage: 0.15 },
];

export default function ManageReceivableModal({
  isOpen,
  onClose,
  orderId,
  currency,
  defaultTaxRate,
  staffId,
  onSaved,
}: ManageReceivableModalProps) {
  const [baseRate, setBaseRate] = useState<string>("");
  const [description, setDescription] = useState<string>("CAT analysis breakdown");
  const [taxRate, setTaxRate] = useState<number>(defaultTaxRate);
  const [lines, setLines] = useState<CatLineDraft[]>(DEFAULT_TIERS);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const base = Number(baseRate) || 0;
  const subtotal = lines.reduce((acc, l) => {
    const w = Number(l.word_count) || 0;
    return acc + w * (Number(l.tier_percentage) || 0) * base;
  }, 0);
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  const totalWords = lines.reduce((acc, l) => acc + (Number(l.word_count) || 0), 0);

  const canSave =
    base > 0 &&
    subtotal > 0 &&
    totalWords > 0 &&
    description.trim().length > 0 &&
    !saving;

  const updateLine = (idx: number, patch: Partial<CatLineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const cat_lines = lines
        .filter((l) => (Number(l.word_count) || 0) > 0)
        .map((l) => ({
          match_tier: l.match_tier,
          tier_label: l.tier_label || null,
          word_count: Number(l.word_count),
          tier_percentage: Number(l.tier_percentage),
        }));
      const { data, error } = await supabase.functions.invoke("manage-receivables", {
        body: {
          action: "create_receivable",
          order_id: orderId,
          mode: "cat",
          base_rate: base,
          cat_lines,
          currency,
          tax_rate: taxRate,
          description,
          staff_id: staffId,
        },
      });
      if (error) throw new Error(error.message || "Save failed");
      const r = data as any;
      if (!r?.success) throw new Error(r?.error || "Save failed");
      toast.success(`Receivable created (${currency} ${(r.total ?? 0).toFixed(2)})`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Add receivable — CAT analysis breakdown</h3>
            <p className="text-xs text-gray-500 mt-0.5">Tier rows roll up into a single receivable line; the breakdown is preserved for audit.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Base per-word rate ({currency})</label>
              <input
                type="number"
                step="0.0001"
                value={baseRate}
                onChange={(e) => setBaseRate(e.target.value)}
                placeholder="e.g. 0.15"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
              />
              {!baseRate && (
                <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Fill in the base rate to enable Save.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tax rate (0..1)</label>
              <input
                type="number"
                step="0.0001"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Description (line label)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Tier</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Words</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">% of base</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Line subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const ls = (Number(l.word_count) || 0) * (Number(l.tier_percentage) || 0) * base;
                  return (
                    <tr key={l.match_tier} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={l.tier_label}
                          onChange={(e) => updateLine(idx, { tier_label: e.target.value })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="1"
                          value={l.word_count}
                          onChange={(e) => updateLine(idx, { word_count: Number(e.target.value) || 0 })}
                          className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-xs tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={l.tier_percentage}
                          onChange={(e) => updateLine(idx, { tier_percentage: Number(e.target.value) || 0 })}
                          className="w-20 text-right border border-gray-200 rounded px-2 py-1 text-xs tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-700">
                        {currency} {ls.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200 font-medium">
                  <td className="py-2 px-3 text-xs text-gray-700">Total ({totalWords.toLocaleString()} words)</td>
                  <td></td>
                  <td className="py-2 px-3 text-right text-xs text-gray-700">Subtotal</td>
                  <td className="py-2 px-3 text-right tabular-nums">{currency} {subtotal.toFixed(2)}</td>
                </tr>
                {taxRate > 0 && (
                  <tr className="bg-gray-50">
                    <td colSpan={2}></td>
                    <td className="py-1 px-3 text-right text-xs text-gray-500">Tax ({(taxRate * 100).toFixed(2)}%)</td>
                    <td className="py-1 px-3 text-right tabular-nums text-gray-600">{currency} {taxAmount.toFixed(2)}</td>
                  </tr>
                )}
                <tr className="bg-teal-50 border-t border-teal-200 font-semibold">
                  <td colSpan={2}></td>
                  <td className="py-2 px-3 text-right text-xs text-teal-900">Total</td>
                  <td className="py-2 px-3 text-right tabular-nums text-teal-900">{currency} {total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            Server validates the same math before insert; the CAT lines are stored in receivable_cat_lines for audit.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-3 py-1.5 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? "Saving…" : "Save CAT receivable"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
