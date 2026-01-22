import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface PricingSettings {
  base_rate: number;
  words_per_page: number;
  min_billable_pages: number;
  rounding_precision: number;
}

export default function PricingSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<PricingSettings>({
    base_rate: 65.0,
    words_per_page: 225,
    min_billable_pages: 1.0,
    rounding_precision: 0.1,
  });
  const [originalValues, setOriginalValues] = useState<PricingSettings>({
    base_rate: 65.0,
    words_per_page: 225,
    min_billable_pages: 1.0,
    rounding_precision: 0.1,
  });

  const isDirty = JSON.stringify(values) !== JSON.stringify(originalValues);

  useEffect(() => {
    checkAuth();
    fetchSettings();
  }, []);

  const checkAuth = () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) {
      navigate("/admin/login");
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const keys = [
        "base_rate",
        "words_per_page",
        "min_billable_pages",
        "rounding_precision",
      ];

      const { data, error: fetchError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", keys);

      if (fetchError) throw fetchError;

      const settings = data.reduce(
        (acc, setting) => {
          acc[setting.setting_key] = parseFloat(setting.setting_value);
          return acc;
        },
        {} as Record<string, number>,
      );

      const loadedValues = {
        base_rate: settings.base_rate || 65.0,
        words_per_page: settings.words_per_page || 225,
        min_billable_pages: settings.min_billable_pages || 1.0,
        rounding_precision: settings.rounding_precision || 0.1,
      };

      setValues(loadedValues);
      setOriginalValues(loadedValues);
    } catch (err) {
      console.error("Error fetching settings:", err);
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const updates = [
        { key: "base_rate", value: values.base_rate },
        { key: "words_per_page", value: values.words_per_page },
        { key: "min_billable_pages", value: values.min_billable_pages },
        { key: "rounding_precision", value: values.rounding_precision },
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

      setOriginalValues(values);
      toast.success("Pricing settings saved successfully");
    } catch (err) {
      console.error("Error saving settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
      toast.error("Failed to save pricing settings");
    } finally {
      setSaving(false);
    }
  };

  const calculateExample = () => {
    const words = 450;
    const rawPages = words / values.words_per_page;
    const roundedPages =
      Math.ceil(rawPages / values.rounding_precision) *
      values.rounding_precision;
    const billablePages = Math.max(roundedPages, values.min_billable_pages);
    const cost = billablePages * values.base_rate;

    return {
      words,
      rawPages: rawPages.toFixed(2),
      billablePages: billablePages.toFixed(2),
      cost: cost.toFixed(2),
    };
  };

  const example = calculateExample();

  const actions = (
    <>
      {isDirty && (
        <button
          onClick={() => setValues(originalValues)}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm"
        >
          Cancel
        </button>
      )}
      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </>
  );

  return (
    <AdminSettingsLayout
      title="Pricing Settings"
      description="Configure base pricing parameters for quote calculations"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings" },
        { label: "Pricing" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Base Pricing Card */}
        <SettingsCard
          title="Base Pricing"
          description="Core pricing parameters"
        >
          <div className="grid grid-cols-2 gap-6">
            <SettingsInput
              label="Base Rate per Billable Page"
              value={values.base_rate}
              onChange={(val) =>
                setValues({ ...values, base_rate: parseFloat(val) || 0 })
              }
              type="number"
              suffix="$"
              step={0.01}
              min={0}
              helperText="Price charged per billable page"
              required
            />

            <SettingsInput
              label="Words per Page"
              value={values.words_per_page}
              onChange={(val) =>
                setValues({ ...values, words_per_page: parseInt(val) || 0 })
              }
              type="number"
              min={1}
              helperText="Words that equal 1 page"
              required
            />

            <SettingsInput
              label="Minimum Billable Pages"
              value={values.min_billable_pages}
              onChange={(val) =>
                setValues({
                  ...values,
                  min_billable_pages: parseFloat(val) || 0,
                })
              }
              type="number"
              step={0.1}
              min={0}
              helperText="Minimum pages per document"
              required
            />

            <SettingsInput
              label="Rounding Precision"
              value={values.rounding_precision}
              onChange={(val) =>
                setValues({ ...values, rounding_precision: parseFloat(val) })
              }
              type="select"
              options={[
                { value: "0.01", label: "0.01 (nearest cent)" },
                { value: "0.05", label: "0.05" },
                { value: "0.10", label: "0.10" },
                { value: "0.25", label: "0.25 (quarter page)" },
                { value: "0.50", label: "0.50 (half page)" },
                { value: "1.00", label: "1.00 (full page)" },
              ]}
              helperText="Round up to nearest"
              required
            />
          </div>
        </SettingsCard>

        {/* Example Calculation Card */}
        <SettingsCard
          title="Example Calculation"
          description="Live preview of pricing logic"
        >
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
            <p className="font-medium text-blue-900">
              A document with {example.words} words:
            </p>
            <ul className="space-y-1 text-blue-800 ml-4">
              <li>
                • Raw pages: {example.words} ÷ {values.words_per_page} ={" "}
                {example.rawPages} pages
              </li>
              <li>
                • Billable pages: {example.billablePages} (after rounding)
              </li>
              <li>
                • Translation cost: {example.billablePages} × $
                {values.base_rate.toFixed(2)} = ${example.cost}
              </li>
            </ul>
          </div>
        </SettingsCard>
      </div>
    </AdminSettingsLayout>
  );
}
