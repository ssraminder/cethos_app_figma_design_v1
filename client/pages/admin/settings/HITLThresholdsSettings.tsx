import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface HITLThresholds {
  hitl_ocr_confidence_threshold: number;
  hitl_language_confidence_threshold: number;
  hitl_classification_confidence_threshold: number;
  hitl_complexity_confidence_threshold: number;
  hitl_high_value_threshold: number;
  hitl_high_page_count_threshold: number;
  hitl_always_rush: boolean;
  hitl_always_same_day: boolean;
  hitl_sla_hours: number;
  hitl_rush_sla_hours: number;
}

export default function HITLThresholdsSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<HITLThresholds>({
    hitl_ocr_confidence_threshold: 0.8,
    hitl_language_confidence_threshold: 0.9,
    hitl_classification_confidence_threshold: 0.85,
    hitl_complexity_confidence_threshold: 0.8,
    hitl_high_value_threshold: 500,
    hitl_high_page_count_threshold: 20,
    hitl_always_rush: true,
    hitl_always_same_day: true,
    hitl_sla_hours: 4,
    hitl_rush_sla_hours: 2,
  });
  const [originalValues, setOriginalValues] = useState<HITLThresholds>({
    hitl_ocr_confidence_threshold: 0.8,
    hitl_language_confidence_threshold: 0.9,
    hitl_classification_confidence_threshold: 0.85,
    hitl_complexity_confidence_threshold: 0.8,
    hitl_high_value_threshold: 500,
    hitl_high_page_count_threshold: 20,
    hitl_always_rush: true,
    hitl_always_same_day: true,
    hitl_sla_hours: 4,
    hitl_rush_sla_hours: 2,
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
        "hitl_ocr_confidence_threshold",
        "hitl_language_confidence_threshold",
        "hitl_classification_confidence_threshold",
        "hitl_complexity_confidence_threshold",
        "hitl_high_value_threshold",
        "hitl_high_page_count_threshold",
        "hitl_always_rush",
        "hitl_always_same_day",
        "hitl_sla_hours",
        "hitl_rush_sla_hours",
      ];

      const { data, error: fetchError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", keys);

      if (fetchError) throw fetchError;

      const settings = data.reduce(
        (acc, setting) => {
          if (
            setting.setting_key === "hitl_always_rush" ||
            setting.setting_key === "hitl_always_same_day"
          ) {
            acc[setting.setting_key] = setting.setting_value === "true";
          } else {
            acc[setting.setting_key] = parseFloat(setting.setting_value);
          }
          return acc;
        },
        {} as Record<string, any>,
      );

      const loadedValues = {
        hitl_ocr_confidence_threshold:
          settings.hitl_ocr_confidence_threshold || 0.8,
        hitl_language_confidence_threshold:
          settings.hitl_language_confidence_threshold || 0.9,
        hitl_classification_confidence_threshold:
          settings.hitl_classification_confidence_threshold || 0.85,
        hitl_complexity_confidence_threshold:
          settings.hitl_complexity_confidence_threshold || 0.8,
        hitl_high_value_threshold: settings.hitl_high_value_threshold || 500,
        hitl_high_page_count_threshold:
          settings.hitl_high_page_count_threshold || 20,
        hitl_always_rush: settings.hitl_always_rush ?? true,
        hitl_always_same_day: settings.hitl_always_same_day ?? true,
        hitl_sla_hours: settings.hitl_sla_hours || 4,
        hitl_rush_sla_hours: settings.hitl_rush_sla_hours || 2,
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
    // Validation
    if (values.hitl_sla_hours <= 0 || values.hitl_rush_sla_hours <= 0) {
      toast.error("SLA hours must be greater than 0");
      return;
    }

    if (values.hitl_high_value_threshold < 0) {
      toast.error("High value threshold must be non-negative");
      return;
    }

    if (values.hitl_high_page_count_threshold < 1) {
      toast.error("High page count threshold must be at least 1");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updates = [
        {
          key: "hitl_ocr_confidence_threshold",
          value: String(values.hitl_ocr_confidence_threshold),
        },
        {
          key: "hitl_language_confidence_threshold",
          value: String(values.hitl_language_confidence_threshold),
        },
        {
          key: "hitl_classification_confidence_threshold",
          value: String(values.hitl_classification_confidence_threshold),
        },
        {
          key: "hitl_complexity_confidence_threshold",
          value: String(values.hitl_complexity_confidence_threshold),
        },
        {
          key: "hitl_high_value_threshold",
          value: String(values.hitl_high_value_threshold),
        },
        {
          key: "hitl_high_page_count_threshold",
          value: String(values.hitl_high_page_count_threshold),
        },
        { key: "hitl_always_rush", value: String(values.hitl_always_rush) },
        {
          key: "hitl_always_same_day",
          value: String(values.hitl_always_same_day),
        },
        { key: "hitl_sla_hours", value: String(values.hitl_sla_hours) },
        {
          key: "hitl_rush_sla_hours",
          value: String(values.hitl_rush_sla_hours),
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
      toast.success("HITL threshold settings saved successfully");
    } catch (err) {
      console.error("Error saving settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
      toast.error("Failed to save HITL threshold settings");
    } finally {
      setSaving(false);
    }
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
      title="HITL Thresholds"
      description="Configure confidence thresholds that trigger human review"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "HITL Thresholds" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          Human-in-the-Loop review is triggered when AI confidence falls below
          these thresholds or when certain conditions are met.
        </div>

        {/* Confidence Thresholds Card */}
        <SettingsCard title="Confidence Thresholds" description="">
          <div className="space-y-6">
            {/* OCR Confidence */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                OCR Confidence
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={values.hitl_ocr_confidence_threshold}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      hitl_ocr_confidence_threshold: parseFloat(e.target.value),
                    })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Trigger HITL if OCR confidence &lt;{" "}
                    {(values.hitl_ocr_confidence_threshold * 100).toFixed(0)}%
                  </span>
                  <span className="font-medium text-gray-900">
                    {(values.hitl_ocr_confidence_threshold * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Language Detection Confidence */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language Detection Confidence
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={values.hitl_language_confidence_threshold}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      hitl_language_confidence_threshold: parseFloat(
                        e.target.value,
                      ),
                    })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Trigger HITL if language confidence &lt;{" "}
                    {(values.hitl_language_confidence_threshold * 100).toFixed(
                      0,
                    )}
                    %
                  </span>
                  <span className="font-medium text-gray-900">
                    {(values.hitl_language_confidence_threshold * 100).toFixed(
                      0,
                    )}
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Document Classification Confidence */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Classification Confidence
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={values.hitl_classification_confidence_threshold}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      hitl_classification_confidence_threshold: parseFloat(
                        e.target.value,
                      ),
                    })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Trigger HITL if classification confidence &lt;{" "}
                    {(
                      values.hitl_classification_confidence_threshold * 100
                    ).toFixed(0)}
                    %
                  </span>
                  <span className="font-medium text-gray-900">
                    {(
                      values.hitl_classification_confidence_threshold * 100
                    ).toFixed(0)}
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Complexity Assessment Confidence */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Complexity Assessment Confidence
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={values.hitl_complexity_confidence_threshold}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      hitl_complexity_confidence_threshold: parseFloat(
                        e.target.value,
                      ),
                    })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Trigger HITL if complexity confidence &lt;{" "}
                    {(
                      values.hitl_complexity_confidence_threshold * 100
                    ).toFixed(0)}
                    %
                  </span>
                  <span className="font-medium text-gray-900">
                    {(
                      values.hitl_complexity_confidence_threshold * 100
                    ).toFixed(0)}
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* Additional Triggers Card */}
        <SettingsCard title="Additional Triggers" description="">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <SettingsInput
                label="High Value Threshold"
                value={values.hitl_high_value_threshold}
                onChange={(val) =>
                  setValues({
                    ...values,
                    hitl_high_value_threshold: parseFloat(val) || 0,
                  })
                }
                type="number"
                prefix="$"
                min={0}
                step={1}
                helperText="Require HITL review for quotes above this amount"
                required
              />

              <SettingsInput
                label="High Page Count Threshold"
                value={values.hitl_high_page_count_threshold}
                onChange={(val) =>
                  setValues({
                    ...values,
                    hitl_high_page_count_threshold: parseInt(val) || 0,
                  })
                }
                type="number"
                suffix="pages"
                min={1}
                step={1}
                helperText="Require HITL review for documents with more pages"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.hitl_always_rush}
                  onChange={(e) =>
                    setValues({ ...values, hitl_always_rush: e.target.checked })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Always require HITL for rush orders
                </span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.hitl_always_same_day}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      hitl_always_same_day: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Always require HITL for same-day orders
                </span>
              </label>
            </div>
          </div>
        </SettingsCard>

        {/* SLA Settings Card */}
        <SettingsCard
          title="SLA Settings"
          description="Time to complete HITL reviews"
        >
          <div className="grid grid-cols-2 gap-6">
            <SettingsInput
              label="Standard HITL SLA"
              value={values.hitl_sla_hours}
              onChange={(val) =>
                setValues({ ...values, hitl_sla_hours: parseFloat(val) || 0 })
              }
              type="number"
              suffix="hours"
              min={0.5}
              step={0.5}
              helperText="Time to complete review"
              required
            />

            <SettingsInput
              label="Rush HITL SLA"
              value={values.hitl_rush_sla_hours}
              onChange={(val) =>
                setValues({
                  ...values,
                  hitl_rush_sla_hours: parseFloat(val) || 0,
                })
              }
              type="number"
              suffix="hours"
              min={0.5}
              step={0.5}
              helperText="Faster SLA for rush orders"
              required
            />
          </div>
        </SettingsCard>
      </div>
    </AdminSettingsLayout>
  );
}
