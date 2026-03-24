import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Edit2,
  Power,
  PowerOff,
  DollarSign,
  RefreshCw,
  X,
} from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TabPropsWithServices, VendorRate } from "./types";
import { POPULAR_CURRENCIES } from "./constants";
import { getLanguageName } from "./data/languages";

interface RateFormData {
  service_id: string;
  language_pair_id: string;
  calculation_unit: string;
  rate: string;
  currency: string;
  minimum_charge: string;
}

const EMPTY_FORM: RateFormData = {
  service_id: "",
  language_pair_id: "",
  calculation_unit: "",
  rate: "",
  currency: "",
  minimum_charge: "",
};

export default function VendorRatesTab({
  vendorData,
  currencies,
  services,
  onRefresh,
}: TabPropsWithServices) {
  const { vendor, rates, languagePairs } = vendorData;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<VendorRate | null>(null);
  const [form, setForm] = useState<RateFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Group rates by service category
  const groupedRates = useMemo(() => {
    const groups: Record<string, VendorRate[]> = {};
    for (const rate of rates) {
      const cat = rate.service_category ?? "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(rate);
    }
    return groups;
  }, [rates]);

  const categoryOrder = [
    "translation",
    "review_qa",
    "interpretation",
    "multimedia",
    "technology",
    "other",
  ];
  const sortedCategories = Object.keys(groupedRates).sort(
    (a, b) =>
      (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) -
      (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b))
  );

  // Service options for dropdown
  const serviceOptions = useMemo(() => {
    const groups: Record<string, typeof services> = {};
    for (const svc of services) {
      const cat = svc.category ?? "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(svc);
    }
    return Object.entries(groups).flatMap(([cat, svcs]) =>
      svcs.map((s) => ({
        value: s.id,
        label: s.name,
        group: cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }))
    );
  }, [services]);

  // Calculation unit options from selected service
  const selectedService = services.find((s) => s.id === form.service_id);
  const unitOptions = (
    selectedService?.default_calculation_units ?? [
      "per_word",
      "per_page",
      "per_hour",
      "flat",
    ]
  ).map((u) => ({
    value: u,
    label: u.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  // Currency options
  const currencyOptions = [
    ...currencies
      .filter((c) => POPULAR_CURRENCIES.includes(c.code))
      .sort(
        (a, b) =>
          POPULAR_CURRENCIES.indexOf(a.code) -
          POPULAR_CURRENCIES.indexOf(b.code)
      )
      .map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,
        group: "Popular",
      })),
    ...currencies
      .filter((c) => !POPULAR_CURRENCIES.includes(c.code))
      .map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,
        group: "All Currencies",
      })),
  ];

  // Language pair options for the rate modal
  const languagePairOptions = useMemo(() => {
    const activePairs = languagePairs.filter((lp) => lp.is_active);
    return [
      { value: "", label: "All language pairs (default rate)", group: "" },
      ...activePairs.map((lp) => ({
        value: lp.id,
        label: `${getLanguageName(lp.source_language)} → ${getLanguageName(lp.target_language)}`,
        group: "",
      })),
    ];
  }, [languagePairs]);

  // Helper to get language pair display text for a rate
  const getLangPairLabel = (rate: VendorRate): string => {
    if (!rate.language_pair_id) return "All pairs";
    const lp = languagePairs.find((p) => p.id === rate.language_pair_id);
    if (!lp) return "All pairs";
    return `${lp.source_language} → ${lp.target_language}`;
  };

  const openAddModal = () => {
    setEditingRate(null);
    setForm({
      ...EMPTY_FORM,
      currency:
        vendor.preferred_rate_currency ?? vendor.rate_currency ?? "CAD",
    });
    setModalOpen(true);
  };

  const openEditModal = (rate: VendorRate) => {
    setEditingRate(rate);
    setForm({
      service_id: rate.service_id,
      language_pair_id: rate.language_pair_id ?? "",
      calculation_unit: rate.calculation_unit,
      rate: String(rate.rate),
      currency: rate.currency,
      minimum_charge: rate.minimum_charge != null ? String(rate.minimum_charge) : "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.service_id || !form.rate || !form.currency || !form.calculation_unit) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const body = editingRate
        ? {
            vendor_id: vendor.id,
            action: "update",
            rate_id: editingRate.id,
            language_pair_id: form.language_pair_id || null,
            rate: form.rate,
            currency: form.currency,
            calculation_unit: form.calculation_unit,
            minimum_charge: form.minimum_charge || null,
          }
        : {
            vendor_id: vendor.id,
            action: "add",
            service_id: form.service_id,
            language_pair_id: form.language_pair_id || null,
            calculation_unit: form.calculation_unit,
            rate: form.rate,
            currency: form.currency,
            minimum_charge: form.minimum_charge || null,
            added_by: "admin",
          };

      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-vendor-rates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      toast.success(editingRate ? "Rate updated" : "Rate added");
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rate");
    }
    setSaving(false);
  };

  const handleToggleActive = async (rate: VendorRate) => {
    setTogglingId(rate.id);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-vendor-rates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vendor_id: vendor.id,
            action: rate.is_active ? "deactivate" : "activate",
            rate_id: rate.id,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      toast.success(rate.is_active ? "Rate deactivated" : "Rate activated");
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update rate");
    }
    setTogglingId(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Vendor Rates ({rates.filter((r) => r.is_active).length} active /{" "}
          {rates.length} total)
        </h3>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Rate
        </button>
      </div>

      {sortedCategories.length > 0 ? (
        sortedCategories.map((category) => (
          <div
            key={category}
            className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 mb-4"
          >
            <h4 className="text-sm font-semibold text-gray-700 mb-3 capitalize">
              {category.replace(/_/g, " ")}
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({groupedRates[category].length})
              </span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-100">
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                      Service
                    </th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                      Language Pair
                    </th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                      Rate
                    </th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                      Unit
                    </th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                      Currency
                    </th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                      Min Charge
                    </th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-center">
                      Active
                    </th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {groupedRates[category].map((rate) => (
                    <tr
                      key={rate.id}
                      className={!rate.is_active ? "opacity-50" : ""}
                    >
                      <td className="py-2.5 text-gray-800">
                        {rate.service_name}
                      </td>
                      <td className="py-2.5 text-gray-600 text-xs">
                        {rate.language_pair_id ? (
                          <span className="font-mono">{getLangPairLabel(rate)}</span>
                        ) : (
                          <span className="text-gray-400 italic">All pairs</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-mono text-gray-800">
                        {rate.rate.toFixed(4)}
                      </td>
                      <td className="py-2.5 text-right text-gray-500 text-xs">
                        {rate.calculation_unit.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5 text-right text-gray-600">
                        {rate.currency}
                      </td>
                      <td className="py-2.5 text-right text-gray-500 font-mono">
                        {rate.minimum_charge != null
                          ? `$${rate.minimum_charge.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() => handleToggleActive(rate)}
                          disabled={togglingId === rate.id}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            rate.is_active ? "bg-teal-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              rate.is_active
                                ? "translate-x-4.5"
                                : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => openEditModal(rate)}
                          className="text-gray-400 hover:text-teal-600 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-10 text-center">
          <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No rates on file</p>
          <button
            onClick={openAddModal}
            className="mt-3 text-sm text-teal-600 hover:text-teal-700"
          >
            Add first rate
          </button>
        </div>
      )}

      {/* Add/Edit Rate Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRate ? "Edit Rate" : "Add Rate"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service *
              </label>
              <SearchableSelect
                options={serviceOptions}
                value={form.service_id}
                onChange={(v) =>
                  setForm((f) => ({ ...f, service_id: v, calculation_unit: "" }))
                }
                placeholder="Search services..."
                disabled={!!editingRate}
              />
            </div>

            {languagePairs.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Language Pair
                  <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <select
                  value={form.language_pair_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, language_pair_id: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">All language pairs (default rate)</option>
                  {languagePairs
                    .filter((lp) => lp.is_active)
                    .map((lp) => (
                      <option key={lp.id} value={lp.id}>
                        {getLanguageName(lp.source_language)} → {getLanguageName(lp.target_language)}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Leave empty for a default rate that applies to all language pairs.
                  Select a specific pair to set a rate override.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Calculation Unit *
              </label>
              <select
                value={form.calculation_unit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, calculation_unit: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select unit...</option>
                {unitOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rate *
              </label>
              <input
                type="number"
                step="0.0001"
                value={form.rate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rate: e.target.value }))
                }
                placeholder="0.0000"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency *
              </label>
              <SearchableSelect
                options={currencyOptions}
                value={form.currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                placeholder="Search currencies..."
                groupOrder={["Popular", "All Currencies"]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Charge
              </label>
              <input
                type="number"
                step="0.01"
                value={form.minimum_charge}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimum_charge: e.target.value }))
                }
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                {editingRate ? "Update" : "Add"} Rate
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
