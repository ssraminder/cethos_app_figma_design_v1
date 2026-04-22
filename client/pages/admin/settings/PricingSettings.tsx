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
  // Chat-screenshot rule (special pricing for documents detected as chat
  // screenshots; bypasses the words/225 × language formula)
  screenshot_pricing_enabled: boolean;
  screenshot_rate: number;
  screenshot_quote_minimum: number;
  screenshot_per_business_day: number;
  screenshot_standard_baseline_days: number;
  screenshot_rush_business_days: number;
}

const DEFAULTS: PricingSettings = {
  base_rate: 65.0,
  words_per_page: 225,
  min_billable_pages: 1.0,
  rounding_precision: 0.1,
  screenshot_pricing_enabled: true,
  screenshot_rate: 12.0,
  screenshot_quote_minimum: 120.0,
  screenshot_per_business_day: 5,
  screenshot_standard_baseline_days: 1,
  screenshot_rush_business_days: 1,
};

export default function PricingSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<PricingSettings>(DEFAULTS);
  const [originalValues, setOriginalValues] = useState<PricingSettings>(DEFAULTS);
  const { session, loading: authLoading } = useAdminAuthContext();

  const isDirty = JSON.stringify(values) !== JSON.stringify(originalValues);

  useEffect(() => {
    if (authLoading || !session) return;
    fetchSettings();
  }, [authLoading, session]);


  const fetchSettings = async () => {
    setLoading(true);
    try {
      const keys = [
        "base_rate",
        "words_per_page",
        "min_billable_pages",
        "rounding_precision",
        "screenshot_pricing_enabled",
        "screenshot_rate",
        "screenshot_quote_minimum",
        "screenshot_per_business_day",
        "screenshot_standard_baseline_days",
        "screenshot_rush_business_days",
      ];

      const { data, error: fetchError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", keys);

      if (fetchError) throw fetchError;

      const raw = new Map(
        (data || []).map((s) => [s.setting_key, s.setting_value]),
      );
      const num = (k: keyof PricingSettings, fallback: number) => {
        const v = raw.get(k as string);
        return v != null ? parseFloat(v) || fallback : fallback;
      };
      const bool = (k: keyof PricingSettings, fallback: boolean) => {
        const v = raw.get(k as string);
        return v != null ? v === "true" || v === "1" : fallback;
      };

      const loadedValues: PricingSettings = {
        base_rate: num("base_rate", DEFAULTS.base_rate),
        words_per_page: num("words_per_page", DEFAULTS.words_per_page),
        min_billable_pages: num("min_billable_pages", DEFAULTS.min_billable_pages),
        rounding_precision: num("rounding_precision", DEFAULTS.rounding_precision),
        screenshot_pricing_enabled: bool(
          "screenshot_pricing_enabled",
          DEFAULTS.screenshot_pricing_enabled,
        ),
        screenshot_rate: num("screenshot_rate", DEFAULTS.screenshot_rate),
        screenshot_quote_minimum: num(
          "screenshot_quote_minimum",
          DEFAULTS.screenshot_quote_minimum,
        ),
        screenshot_per_business_day: num(
          "screenshot_per_business_day",
          DEFAULTS.screenshot_per_business_day,
        ),
        screenshot_standard_baseline_days: num(
          "screenshot_standard_baseline_days",
          DEFAULTS.screenshot_standard_baseline_days,
        ),
        screenshot_rush_business_days: num(
          "screenshot_rush_business_days",
          DEFAULTS.screenshot_rush_business_days,
        ),
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
      const updates: Array<{ key: string; value: string }> = [
        { key: "base_rate", value: String(values.base_rate) },
        { key: "words_per_page", value: String(values.words_per_page) },
        { key: "min_billable_pages", value: String(values.min_billable_pages) },
        { key: "rounding_precision", value: String(values.rounding_precision) },
        {
          key: "screenshot_pricing_enabled",
          value: values.screenshot_pricing_enabled ? "true" : "false",
        },
        { key: "screenshot_rate", value: String(values.screenshot_rate) },
        {
          key: "screenshot_quote_minimum",
          value: String(values.screenshot_quote_minimum),
        },
        {
          key: "screenshot_per_business_day",
          value: String(values.screenshot_per_business_day),
        },
        {
          key: "screenshot_standard_baseline_days",
          value: String(values.screenshot_standard_baseline_days),
        },
        {
          key: "screenshot_rush_business_days",
          value: String(values.screenshot_rush_business_days),
        },
      ];

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from("app_settings")
          .update({
            setting_value: update.value,
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

  if (authLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

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
        { label: "Admin", href: "/admin/dashboard" },
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

        {/* Chat-Screenshot Rule Card */}
        <SettingsCard
          title="Chat Screenshots"
          description="Special pricing and turnaround for documents detected as chat screenshots. Bypasses the standard words-per-page formula."
        >
          <div className="space-y-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={values.screenshot_pricing_enabled}
                onChange={(e) =>
                  setValues({
                    ...values,
                    screenshot_pricing_enabled: e.target.checked,
                  })
                }
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">
                  Enable chat-screenshot rule
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  When off, chat screenshots fall back to the standard
                  words-per-page formula above.
                </p>
              </div>
            </label>

            <div
              className={`grid grid-cols-2 gap-6 transition-opacity ${
                values.screenshot_pricing_enabled ? "" : "opacity-40 pointer-events-none"
              }`}
            >
              <SettingsInput
                label="Rate per Screenshot"
                value={values.screenshot_rate}
                onChange={(val) =>
                  setValues({
                    ...values,
                    screenshot_rate: parseFloat(val) || 0,
                  })
                }
                type="number"
                suffix="$"
                step={0.5}
                min={0}
                helperText="Charged per screenshot (= per page)"
                required
              />

              <SettingsInput
                label="Quote Minimum"
                value={values.screenshot_quote_minimum}
                onChange={(val) =>
                  setValues({
                    ...values,
                    screenshot_quote_minimum: parseFloat(val) || 0,
                  })
                }
                type="number"
                suffix="$"
                step={1}
                min={0}
                helperText="Floor across all chat-screenshot lines in a quote"
                required
              />

              <SettingsInput
                label="Screenshots per Business Day"
                value={values.screenshot_per_business_day}
                onChange={(val) =>
                  setValues({
                    ...values,
                    screenshot_per_business_day: parseInt(val) || 1,
                  })
                }
                type="number"
                step={1}
                min={1}
                helperText="Standard turnaround = ceil(count / this) + baseline"
                required
              />

              <SettingsInput
                label="Standard Baseline Days"
                value={values.screenshot_standard_baseline_days}
                onChange={(val) =>
                  setValues({
                    ...values,
                    screenshot_standard_baseline_days: parseInt(val) || 0,
                  })
                }
                type="number"
                step={1}
                min={0}
                helperText="Added on top of the per-batch days"
                required
              />

              <SettingsInput
                label="Rush Business Days"
                value={values.screenshot_rush_business_days}
                onChange={(val) =>
                  setValues({
                    ...values,
                    screenshot_rush_business_days: parseInt(val) || 0,
                  })
                }
                type="number"
                step={1}
                min={0}
                helperText="Total business days when rush is selected. Same-day is disabled for chat screenshots."
                required
              />
            </div>

            {values.screenshot_pricing_enabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-1">
                <p className="font-medium text-amber-900">
                  Example: 20 chat screenshots
                </p>
                <ul className="text-amber-800 ml-4 space-y-0.5">
                  <li>
                    • Price: 20 × ${values.screenshot_rate.toFixed(2)} = $
                    {(20 * values.screenshot_rate).toFixed(2)}{" "}
                    (≥ ${values.screenshot_quote_minimum.toFixed(2)} min)
                  </li>
                  <li>
                    • Standard turnaround:{" "}
                    {Math.ceil(20 / Math.max(1, values.screenshot_per_business_day)) +
                      values.screenshot_standard_baseline_days}{" "}
                    business days
                  </li>
                  <li>
                    • Rush turnaround: {values.screenshot_rush_business_days}{" "}
                    business day
                    {values.screenshot_rush_business_days === 1 ? "" : "s"}
                  </li>
                </ul>
              </div>
            )}
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
