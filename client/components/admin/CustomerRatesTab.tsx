// ============================================================================
// CustomerRatesTab — CRUD for per-customer rate cards + display of matching
// global defaults. Used on the CustomerDetail "Rates" tab.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  Globe,
  User,
  DollarSign,
  Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

interface RateCard {
  id: string;
  customer_id: string | null;
  service_id: string;
  source_language_id: string;
  target_language_id: string;
  domain: string | null;
  unit_of_measure: string;
  rate_per_unit: number;
  currency: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  service_name?: string;
  source_language_name?: string;
  target_language_name?: string;
}

interface ServiceRow {
  id: string;
  name: string;
  code: string;
  category: string;
}

interface LanguageRow {
  id: string;
  name: string;
  code: string;
}

interface Props {
  customerId: string;
  customerName: string;
}

const UNIT_LABELS: Record<string, string> = {
  per_word: "Per word",
  per_page: "Per page",
  per_hour: "Per hour",
  per_minute: "Per minute",
  flat: "Flat fee",
};

const UNITS = ["per_word", "per_page", "per_hour", "per_minute", "flat"];

// ── Component ──────────────────────────────────────────────────────────────

export default function CustomerRatesTab({ customerId, customerName }: Props) {
  const [loading, setLoading] = useState(true);
  const [customerRates, setCustomerRates] = useState<RateCard[]>([]);
  const [globalRates, setGlobalRates] = useState<RateCard[]>([]);

  // Reference data
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [languages, setLanguages] = useState<LanguageRow[]>([]);

  // Add/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formServiceId, setFormServiceId] = useState("");
  const [formSourceLangId, setFormSourceLangId] = useState("");
  const [formTargetLangId, setFormTargetLangId] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formUnit, setFormUnit] = useState("per_word");
  const [formRate, setFormRate] = useState("");
  const [formCurrency, setFormCurrency] = useState("CAD");
  const [formNotes, setFormNotes] = useState("");

  // Filter
  const [filter, setFilter] = useState("");

  // ── Data loading ──

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load reference data + rate cards in parallel
      const [svcRes, langRes, custRatesRes, globalRatesRes] = await Promise.all([
        supabase
          .from("services")
          .select("id, name, code, category")
          .eq("is_active", true)
          .order("category")
          .order("sort_order"),
        supabase
          .from("languages")
          .select("id, name, code")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("client_rate_cards")
          .select("*")
          .eq("customer_id", customerId)
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("client_rate_cards")
          .select("*")
          .is("customer_id", null)
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
      ]);

      setServices(svcRes.data ?? []);
      setLanguages(langRes.data ?? []);

      const svcMap = new Map((svcRes.data ?? []).map((s) => [s.id, s.name]));
      const langMap = new Map((langRes.data ?? []).map((l) => [l.id, l.name]));

      const enrich = (rows: RateCard[]) =>
        rows.map((r) => ({
          ...r,
          service_name: svcMap.get(r.service_id) ?? "Unknown",
          source_language_name: langMap.get(r.source_language_id) ?? "Unknown",
          target_language_name: langMap.get(r.target_language_id) ?? "Unknown",
        }));

      setCustomerRates(enrich(custRatesRes.data ?? []));
      setGlobalRates(enrich(globalRatesRes.data ?? []));
    } catch (err) {
      console.error("Failed to load rate cards:", err);
      toast.error("Failed to load rate cards");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Form helpers ──

  const resetForm = () => {
    setFormServiceId("");
    setFormSourceLangId("");
    setFormTargetLangId("");
    setFormDomain("");
    setFormUnit("per_word");
    setFormRate("");
    setFormCurrency("CAD");
    setFormNotes("");
    setEditingId(null);
    setShowForm(false);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (r: RateCard) => {
    setFormServiceId(r.service_id);
    setFormSourceLangId(r.source_language_id);
    setFormTargetLangId(r.target_language_id);
    setFormDomain(r.domain ?? "");
    setFormUnit(r.unit_of_measure);
    setFormRate(String(r.rate_per_unit));
    setFormCurrency(r.currency);
    setFormNotes(r.notes ?? "");
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formServiceId || !formSourceLangId || !formTargetLangId) {
      toast.error("Service, source language, and target language are required");
      return;
    }
    const rate = parseFloat(formRate);
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error("Please enter a valid rate");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: customerId,
        service_id: formServiceId,
        source_language_id: formSourceLangId,
        target_language_id: formTargetLangId,
        domain: formDomain.trim() || null,
        unit_of_measure: formUnit,
        rate_per_unit: rate,
        currency: formCurrency,
        notes: formNotes.trim() || null,
        is_active: true,
      };

      if (editingId) {
        const { error } = await supabase
          .from("client_rate_cards")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Rate card updated");
      } else {
        const { error } = await supabase
          .from("client_rate_cards")
          .insert(payload);
        if (error) {
          if (error.code === "23505") {
            toast.error("A rate card with this combination already exists");
          } else {
            throw error;
          }
          setSaving(false);
          return;
        }
        toast.success("Rate card added");
      }

      resetForm();
      await loadData();
    } catch (err: any) {
      console.error("Save rate card error:", err);
      toast.error(err.message || "Failed to save rate card");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this rate card?")) return;
    try {
      const { error } = await supabase
        .from("client_rate_cards")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      toast.success("Rate card removed");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove rate card");
    }
  };

  // ── Filtered lists ──

  const filterFn = useCallback(
    (r: RateCard) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        (r.service_name ?? "").toLowerCase().includes(q) ||
        (r.source_language_name ?? "").toLowerCase().includes(q) ||
        (r.target_language_name ?? "").toLowerCase().includes(q) ||
        (r.domain ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      );
    },
    [filter],
  );

  const filteredCustomer = useMemo(
    () => customerRates.filter(filterFn),
    [customerRates, filterFn],
  );
  const filteredGlobal = useMemo(
    () => globalRates.filter(filterFn),
    [globalRates, filterFn],
  );

  // ── Source languages (is_source_available) and target languages ──
  const sourceLangs = useMemo(
    () => languages.filter((l: any) => l.is_source_available !== false),
    [languages],
  );
  const targetLangs = useMemo(
    () => languages.filter((l: any) => l.is_target_available !== false),
    [languages],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading rate cards...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">
            Rate Cards for {customerName}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Per-customer rates override global defaults when creating orders.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Rate
        </button>
      </div>

      {/* Search */}
      {(customerRates.length > 0 || globalRates.length > 0) && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by service, language, domain..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-teal-800">
            {editingId ? "Edit Rate Card" : "New Rate Card"}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Service */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Service *
              </label>
              <select
                value={formServiceId}
                onChange={(e) => setFormServiceId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select service...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Source Language */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Source Language *
              </label>
              <select
                value={formSourceLangId}
                onChange={(e) => setFormSourceLangId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select language...</option>
                {sourceLangs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Language */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Target Language *
              </label>
              <select
                value={formTargetLangId}
                onChange={(e) => setFormTargetLangId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select language...</option>
                {targetLangs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Domain */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Domain
              </label>
              <input
                type="text"
                value={formDomain}
                onChange={(e) => setFormDomain(e.target.value)}
                placeholder="e.g. Legal, Medical (optional)"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Unit of Measure *
              </label>
              <select
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>

            {/* Rate */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Rate per Unit *
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value)}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  placeholder="0.0000"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Notes</label>
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {editingId ? "Update" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Customer-specific rates */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <User className="w-4 h-4 text-teal-600" />
          Customer Rates
          <span className="text-xs font-normal text-gray-400 ml-1">
            ({filteredCustomer.length})
          </span>
        </h4>
        {filteredCustomer.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
            No customer-specific rates yet. Click "Add Rate" to create one.
          </p>
        ) : (
          <RateTable
            rates={filteredCustomer}
            onEdit={openEdit}
            onDelete={handleDelete}
            editable
          />
        )}
      </div>

      {/* Global defaults */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-blue-500" />
          Global Default Rates
          <span className="text-xs font-normal text-gray-400 ml-1">
            ({filteredGlobal.length})
          </span>
        </h4>
        {filteredGlobal.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
            No global default rates configured.
          </p>
        ) : (
          <RateTable rates={filteredGlobal} />
        )}
      </div>
    </div>
  );
}

// ── Rate table sub-component ────────────────────────────────────────────────

function RateTable({
  rates,
  onEdit,
  onDelete,
  editable = false,
}: {
  rates: RateCard[];
  onEdit?: (r: RateCard) => void;
  onDelete?: (id: string) => void;
  editable?: boolean;
}) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Service
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Source
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Target
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Domain
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Unit
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Rate
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Notes
            </th>
            {editable && (
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rates.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">
                {r.service_name}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                {r.source_language_name}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                {r.target_language_name}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                {r.domain || (
                  <span className="text-gray-300 italic">Any</span>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                {UNIT_LABELS[r.unit_of_measure] ?? r.unit_of_measure}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-gray-800">
                {r.currency} ${Number(r.rate_per_unit).toFixed(4)}
              </td>
              <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">
                {r.notes || "—"}
              </td>
              {editable && (
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit?.(r)}
                      className="p-1 text-gray-400 hover:text-teal-600 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete?.(r.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
