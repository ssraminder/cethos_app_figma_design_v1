import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface TurnaroundSettings {
  turnaround_base_days: number;
  turnaround_pages_per_day: number;
  rush_multiplier: number;
  rush_cutoff_hour: number;
  rush_cutoff_minute: number;
}

export default function TurnaroundSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<TurnaroundSettings>({
    turnaround_base_days: 2,
    turnaround_pages_per_day: 2,
    rush_multiplier: 1.3,
    rush_cutoff_hour: 16,
    rush_cutoff_minute: 30,
  });
  const [originalValues, setOriginalValues] =
    useState<TurnaroundSettings>(values);

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
        "turnaround_base_days",
        "turnaround_pages_per_day",
        "rush_multiplier",
        "rush_cutoff_hour",
        "rush_cutoff_minute",
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
        turnaround_base_days: settings.turnaround_base_days || 2,
        turnaround_pages_per_day: settings.turnaround_pages_per_day || 2,
        rush_multiplier: settings.rush_multiplier || 1.3,
        rush_cutoff_hour: settings.rush_cutoff_hour || 16,
        rush_cutoff_minute: settings.rush_cutoff_minute || 30,
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
      const updates = Object.entries(values).map(([key, value]) => ({
        key,
        value,
      }));

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
      toast.success("Turnaround settings saved successfully");
    } catch (err) {
      console.error("Error saving settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
      toast.error("Failed to save turnaround settings");
    } finally {
      setSaving(false);
    }
  };

  const calculateExample = (pages: number) => {
    const days =
      values.turnaround_base_days +
      Math.floor((pages - 1) / values.turnaround_pages_per_day);
    return days;
  };

  const formatCutoffTime = () => {
    const hour12 = values.rush_cutoff_hour % 12 || 12;
    const ampm = values.rush_cutoff_hour >= 12 ? "PM" : "AM";
    return `${hour12}:${String(values.rush_cutoff_minute).padStart(2, "0")} ${ampm} MST`;
  };

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
      title="Turnaround & Rush Settings"
      description="Configure turnaround time calculation and rush delivery options"
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Settings" },
        { label: "Turnaround" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Standard Turnaround */}
        <SettingsCard title="Standard Turnaround">
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-700 font-mono">
                Formula: Base Days + floor((pages - 1) / Pages per Day)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <SettingsInput
                label="Base Days"
                value={values.turnaround_base_days}
                onChange={(val) =>
                  setValues({
                    ...values,
                    turnaround_base_days: parseInt(val) || 1,
                  })
                }
                type="number"
                suffix="days"
                min={1}
                helperText="Minimum turnaround days"
                required
              />

              <SettingsInput
                label="Pages per Extra Day"
                value={values.turnaround_pages_per_day}
                onChange={(val) =>
                  setValues({
                    ...values,
                    turnaround_pages_per_day: parseInt(val) || 1,
                  })
                }
                type="number"
                min={1}
                helperText="Add 1 day per X pages"
                required
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Example: {calculateExample(5)} pages ={" "}
              {values.turnaround_base_days} + floor((5-1)/
              {values.turnaround_pages_per_day}) = {calculateExample(5)} days
            </div>
          </div>
        </SettingsCard>

        {/* Rush Delivery */}
        <SettingsCard
          title="Rush Delivery"
          description="Rush = Standard - 1 business day"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <SettingsInput
                  label="Rush Fee Multiplier"
                  value={values.rush_multiplier}
                  onChange={(val) =>
                    setValues({
                      ...values,
                      rush_multiplier: parseFloat(val) || 1.0,
                    })
                  }
                  type="number"
                  suffix="×"
                  step={0.01}
                  min={1.0}
                  helperText="+30% of translation subtotal"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cutoff Time (MST) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={values.rush_cutoff_hour}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        rush_cutoff_hour: parseInt(e.target.value),
                      })
                    }
                    className="w-20 rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-500 py-2">:</span>
                  <select
                    value={values.rush_cutoff_minute}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        rush_cutoff_minute: parseInt(e.target.value),
                      })
                    }
                    className="w-20 rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="0">00</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Order by {formatCutoffTime()}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
              <span>ℹ️</span>
              <span>
                Orders placed after cutoff start the next business day
              </span>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available Days
              </label>
              <div className="flex gap-3">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day) => (
                    <label
                      key={day}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        defaultChecked={!["Sat", "Sun"].includes(day)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{day}</span>
                    </label>
                  ),
                )}
              </div>
            </div>
          </div>
        </SettingsCard>
      </div>
    </AdminSettingsLayout>
  );
}
