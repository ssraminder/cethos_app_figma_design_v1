import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface TaxRate {
  id: string;
  region_type: "country" | "state" | "province";
  region_code: string;
  region_name: string;
  tax_name: string;
  rate: number;
  is_compound: boolean;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
}

interface DefaultTaxSettings {
  tax_rate_default: number;
  tax_name_default: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  CA: "🇨🇦",
  US: "🇺🇸",
  GB: "🇬🇧",
  AU: "🇦🇺",
  NZ: "🇳🇿",
};

export default function TaxRatesSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [filteredRates, setFilteredRates] = useState<TaxRate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default tax settings
  const [defaultSettings, setDefaultSettings] = useState<DefaultTaxSettings>({
    tax_rate_default: 0.05,
    tax_name_default: "GST",
  });
  const [originalDefaults, setOriginalDefaults] = useState<DefaultTaxSettings>({
    tax_rate_default: 0.05,
    tax_name_default: "GST",
  });
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchTaxRates();
    fetchDefaultSettings();
  }, []);

  useEffect(() => {
    filterRates();
  }, [taxRates, searchQuery, regionFilter]);

  const checkAuth = () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) {
      navigate("/admin/login");
    }
  };

  const fetchTaxRates = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("tax_rates")
        .select("*")
        .order("region_name")
        .order("tax_name");

      if (fetchError) throw fetchError;
      setTaxRates(data || []);
    } catch (err) {
      console.error("Error fetching tax rates:", err);
      setError(err instanceof Error ? err.message : "Failed to load tax rates");
    } finally {
      setLoading(false);
    }
  };

  const fetchDefaultSettings = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["tax_rate_default", "tax_name_default"]);

      if (fetchError) throw fetchError;

      const settings = data.reduce((acc, setting) => {
        if (setting.setting_key === "tax_rate_default") {
          acc.tax_rate_default = parseFloat(setting.setting_value);
        } else if (setting.setting_key === "tax_name_default") {
          acc.tax_name_default = setting.setting_value;
        }
        return acc;
      }, {} as DefaultTaxSettings);

      const loadedDefaults = {
        tax_rate_default: settings.tax_rate_default || 0.05,
        tax_name_default: settings.tax_name_default || "GST",
      };

      setDefaultSettings(loadedDefaults);
      setOriginalDefaults(loadedDefaults);
    } catch (err) {
      console.error("Error fetching default settings:", err);
    }
  };

  const filterRates = () => {
    let filtered = taxRates;

    if (regionFilter !== "all") {
      const country = regionFilter;
      filtered = filtered.filter((rate) =>
        rate.region_code.startsWith(country),
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (rate) =>
          rate.region_name.toLowerCase().includes(query) ||
          rate.tax_name.toLowerCase().includes(query) ||
          rate.region_code.toLowerCase().includes(query),
      );
    }

    setFilteredRates(filtered);
  };

  const groupByCountry = (rates: TaxRate[]) => {
    const grouped: Record<string, TaxRate[]> = {};

    rates.forEach((rate) => {
      const country = rate.region_code.split("-")[0];
      if (!grouped[country]) {
        grouped[country] = [];
      }
      grouped[country].push(rate);
    });

    return grouped;
  };

  const handleEdit = (rate: TaxRate) => {
    setEditingRate(rate);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingRate(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tax rate?")) return;

    try {
      const { error: deleteError } = await supabase
        .from("tax_rates")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast.success("Tax rate deleted successfully");
      fetchTaxRates();
    } catch (err) {
      console.error("Error deleting tax rate:", err);
      toast.error("Failed to delete tax rate");
    }
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      const updates = [
        { key: "tax_rate_default", value: defaultSettings.tax_rate_default },
        { key: "tax_name_default", value: defaultSettings.tax_name_default },
      ];

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from("app_settings")
          .update({
            setting_value: String(update.value),
            updated_at: new Date().toISOString(),
          })
          .eq("setting_key", update.key);

        if (updateError) throw updateError;
      }

      setOriginalDefaults(defaultSettings);
      toast.success("Default tax settings saved");
    } catch (err) {
      console.error("Error saving defaults:", err);
      toast.error("Failed to save default settings");
    } finally {
      setSavingDefaults(false);
    }
  };

  const groupedRates = groupByCountry(filteredRates);
  const countries = Object.keys(groupedRates).sort();
  const uniqueCountries = Array.from(
    new Set(taxRates.map((r) => r.region_code.split("-")[0])),
  ).sort();

  const defaultsChanged =
    JSON.stringify(defaultSettings) !== JSON.stringify(originalDefaults);

  return (
    <AdminSettingsLayout
      title="Tax Rates"
      description="Manage regional tax rates for different provinces/states/countries"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Tax Rates" },
      ]}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Filters and Add Button */}
        <SettingsCard
          title=""
          description="Tax rates are applied based on customer's billing address."
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-3 flex-1 w-full">
              <div className="flex-1">
                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Regions</option>
                  {uniqueCountries.map((country) => (
                    <option key={country} value={country}>
                      {COUNTRY_FLAGS[country] || ""} {country}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search regions or tax names..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium whitespace-nowrap"
            >
              + Add Tax Rate
            </button>
          </div>
        </SettingsCard>

        {/* Tax Rates by Country */}
        {countries.map((country) => (
          <SettingsCard
            key={country}
            title={`${COUNTRY_FLAGS[country] || ""} ${country === "CA" ? "CANADA" : country === "US" ? "UNITED STATES" : country}`}
            description=""
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Region
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tax Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Active
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedRates[country].map((rate) => (
                    <tr key={rate.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {rate.region_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {rate.tax_name}
                        {rate.is_compound && (
                          <span className="ml-2 text-xs text-gray-500">
                            (compound)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(rate.rate * 100).toFixed(3)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {rate.is_active ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(rate)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rate.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SettingsCard>
        ))}

        {filteredRates.length === 0 && !loading && (
          <SettingsCard title="" description="">
            <div className="text-center py-8 text-gray-500">
              No tax rates found. Click "Add Tax Rate" to create one.
            </div>
          </SettingsCard>
        )}

        {/* Default Tax Settings */}
        <SettingsCard
          title="Default Tax Settings"
          description="Used when customer location is unknown"
        >
          <div className="grid grid-cols-2 gap-6">
            <SettingsInput
              label="Default Tax Rate"
              value={defaultSettings.tax_rate_default * 100}
              onChange={(val) =>
                setDefaultSettings({
                  ...defaultSettings,
                  tax_rate_default: parseFloat(val) / 100 || 0,
                })
              }
              type="number"
              suffix="%"
              step={0.001}
              min={0}
              max={100}
              required
            />
            <SettingsInput
              label="Default Tax Name"
              value={defaultSettings.tax_name_default}
              onChange={(val) =>
                setDefaultSettings({
                  ...defaultSettings,
                  tax_name_default: val,
                })
              }
              type="text"
              placeholder="GST"
              required
            />
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={handleSaveDefaults}
              disabled={savingDefaults || !defaultsChanged}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
            >
              {savingDefaults ? "Saving..." : "Save Defaults"}
            </button>
          </div>
        </SettingsCard>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <TaxRateModal
          rate={editingRate}
          onClose={() => {
            setShowModal(false);
            setEditingRate(null);
          }}
          onSave={() => {
            setShowModal(false);
            setEditingRate(null);
            fetchTaxRates();
          }}
        />
      )}
    </AdminSettingsLayout>
  );
}

interface TaxRateModalProps {
  rate: TaxRate | null;
  onClose: () => void;
  onSave: () => void;
}

function TaxRateModal({ rate, onClose, onSave }: TaxRateModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<TaxRate>>(
    rate || {
      region_type: "province",
      region_code: "",
      region_name: "",
      tax_name: "",
      rate: 0.05,
      is_compound: false,
      is_active: true,
      effective_from: null,
      effective_to: null,
    },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (rate?.id) {
        // Update
        const { error: updateError } = await supabase
          .from("tax_rates")
          .update(formData)
          .eq("id", rate.id);

        if (updateError) throw updateError;
        toast.success("Tax rate updated successfully");
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from("tax_rates")
          .insert(formData);

        if (insertError) throw insertError;
        toast.success("Tax rate added successfully");
      }

      onSave();
    } catch (err) {
      console.error("Error saving tax rate:", err);
      toast.error("Failed to save tax rate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {rate ? "Edit Tax Rate" : "Add Tax Rate"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Region Type *
            </label>
            <select
              value={formData.region_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  region_type: e.target.value as
                    | "country"
                    | "state"
                    | "province",
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="province">Province</option>
              <option value="state">State</option>
              <option value="country">Country</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Region Code *
              </label>
              <input
                type="text"
                value={formData.region_code}
                onChange={(e) =>
                  setFormData({ ...formData, region_code: e.target.value })
                }
                placeholder="CA-MB"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                ISO format (e.g., CA-AB, US-CA)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Region Name *
              </label>
              <input
                type="text"
                value={formData.region_name}
                onChange={(e) =>
                  setFormData({ ...formData, region_name: e.target.value })
                }
                placeholder="Manitoba"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tax Name *
              </label>
              <input
                type="text"
                value={formData.tax_name}
                onChange={(e) =>
                  setFormData({ ...formData, tax_name: e.target.value })
                }
                placeholder="RST"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                e.g., GST, PST, HST, VAT
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tax Rate *
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={(formData.rate || 0) * 100}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rate: parseFloat(e.target.value) / 100 || 0,
                    })
                  }
                  step={0.001}
                  min={0}
                  max={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <span className="absolute right-3 top-2 text-gray-500">%</span>
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_compound}
                onChange={(e) =>
                  setFormData({ ...formData, is_compound: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                Compound tax (applied after other taxes)
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Effective Dates (optional)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <input
                  type="date"
                  value={formData.effective_from || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      effective_from: e.target.value || null,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">From</p>
              </div>
              <div>
                <input
                  type="date"
                  value={formData.effective_to || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      effective_to: e.target.value || null,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">To</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Leave blank for no date restrictions
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? "Saving..." : "Save Tax Rate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
