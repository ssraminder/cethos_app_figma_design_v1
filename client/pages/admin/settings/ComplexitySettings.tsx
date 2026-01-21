import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface ComplexitySettings {
  complexity_easy: number;
  complexity_medium: number;
  complexity_hard: number;
  base_rate: number; // For display purposes
}

export default function ComplexitySettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<ComplexitySettings>({
    complexity_easy: 1.0,
    complexity_medium: 1.15,
    complexity_hard: 1.25,
    base_rate: 65.0,
  });
  const [originalValues, setOriginalValues] = useState<ComplexitySettings>({
    complexity_easy: 1.0,
    complexity_medium: 1.15,
    complexity_hard: 1.25,
    base_rate: 65.0,
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
        "complexity_easy",
        "complexity_medium",
        "complexity_hard",
        "base_rate",
      ];

      const { data, error: fetchError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", keys);

      if (fetchError) throw fetchError;

      const settings = data.reduce((acc, setting) => {
        acc[setting.setting_key] = parseFloat(setting.setting_value);
        return acc;
      }, {} as Record<string, number>);

      const loadedValues = {
        complexity_easy: settings.complexity_easy || 1.0,
        complexity_medium: settings.complexity_medium || 1.15,
        complexity_hard: settings.complexity_hard || 1.25,
        base_rate: settings.base_rate || 65.0,
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
        { key: "complexity_easy", value: values.complexity_easy },
        { key: "complexity_medium", value: values.complexity_medium },
        { key: "complexity_hard", value: values.complexity_hard },
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
      toast.success("Complexity multipliers saved successfully");
    } catch (err) {
      console.error("Error saving settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
      toast.error("Failed to save complexity multipliers");
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
      title="Complexity Multipliers"
      description="Configure complexity level multipliers that affect pricing"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings" },
        { label: "Complexity" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      <SettingsCard
        title="Complexity Levels"
        description="Multipliers are applied to the base rate based on document difficulty assessed by AI or staff"
      >
        <div className="space-y-6">
          {/* Easy */}
          <div className="border-b border-gray-200 pb-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Easy</h4>
            <p className="text-sm text-gray-600 mb-3">
              Clear typed text, simple formatting, common vocabulary
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <SettingsInput
                  label=""
                  value={values.complexity_easy}
                  onChange={(val) =>
                    setValues({
                      ...values,
                      complexity_easy: parseFloat(val) || 1.0,
                    })
                  }
                  type="number"
                  suffix="×"
                  step={0.01}
                  min={1.0}
                />
              </div>
              <span className="text-sm text-gray-600">
                = ${(values.base_rate * values.complexity_easy).toFixed(2)} per
                page
              </span>
            </div>
          </div>

          {/* Medium */}
          <div className="border-b border-gray-200 pb-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">
              Medium
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              Some handwriting, tables, stamps, or technical terms
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <SettingsInput
                  label=""
                  value={values.complexity_medium}
                  onChange={(val) =>
                    setValues({
                      ...values,
                      complexity_medium: parseFloat(val) || 1.0,
                    })
                  }
                  type="number"
                  suffix="×"
                  step={0.01}
                  min={1.0}
                />
              </div>
              <span className="text-sm text-gray-600">
                = ${(values.base_rate * values.complexity_medium).toFixed(2)}{" "}
                per page
              </span>
            </div>
          </div>

          {/* Hard */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Hard</h4>
            <p className="text-sm text-gray-600 mb-3">
              Significant handwriting, poor quality, complex legal terms
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <SettingsInput
                  label=""
                  value={values.complexity_hard}
                  onChange={(val) =>
                    setValues({
                      ...values,
                      complexity_hard: parseFloat(val) || 1.0,
                    })
                  }
                  type="number"
                  suffix="×"
                  step={0.01}
                  min={1.0}
                />
              </div>
              <span className="text-sm text-gray-600">
                = ${(values.base_rate * values.complexity_hard).toFixed(2)} per
                page
              </span>
            </div>
          </div>
        </div>
      </SettingsCard>
    </AdminSettingsLayout>
  );
}
