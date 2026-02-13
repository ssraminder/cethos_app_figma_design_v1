import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface TrackingFormValues {
  tracking_enabled: boolean;
  google_analytics_id: string;
  google_tag_manager_id: string;
  custom_head_scripts: string; // Raw JSON string for editing
}

const TRACKING_KEYS = [
  "tracking_enabled",
  "google_analytics_id",
  "google_tag_manager_id",
  "custom_head_scripts",
];

const DEFAULT_VALUES: TrackingFormValues = {
  tracking_enabled: false,
  google_analytics_id: "",
  google_tag_manager_id: "",
  custom_head_scripts: "[]",
};

export default function TrackingSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<TrackingFormValues>(DEFAULT_VALUES);
  const [originalValues, setOriginalValues] =
    useState<TrackingFormValues>(DEFAULT_VALUES);

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
      const { data, error: fetchError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", TRACKING_KEYS);

      if (fetchError) throw fetchError;

      const settings = (data || []).reduce(
        (acc, row) => {
          acc[row.setting_key] = row.setting_value;
          return acc;
        },
        {} as Record<string, string>,
      );

      const loadedValues: TrackingFormValues = {
        tracking_enabled:
          settings.tracking_enabled === "true" ||
          settings.tracking_enabled === "1",
        google_analytics_id: settings.google_analytics_id || "",
        google_tag_manager_id: settings.google_tag_manager_id || "",
        custom_head_scripts: settings.custom_head_scripts || "[]",
      };

      setValues(loadedValues);
      setOriginalValues(loadedValues);
    } catch (err) {
      console.error("Error fetching tracking settings:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load settings",
      );
    } finally {
      setLoading(false);
    }
  };

  const validate = (): string | null => {
    const gaId = values.google_analytics_id.trim();
    if (gaId && !/^G-[A-Z0-9]+$/i.test(gaId)) {
      return "Google Analytics ID must match format G-XXXXXXXXXX";
    }

    const gtmId = values.google_tag_manager_id.trim();
    if (gtmId && !/^GTM-[A-Z0-9]+$/i.test(gtmId)) {
      return "Google Tag Manager ID must match format GTM-XXXXXXX";
    }

    try {
      const parsed = JSON.parse(values.custom_head_scripts);
      if (!Array.isArray(parsed)) {
        return "Custom scripts must be a JSON array";
      }
    } catch {
      return "Custom scripts must be valid JSON";
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updates = [
        {
          key: "tracking_enabled",
          value: values.tracking_enabled ? "true" : "false",
        },
        {
          key: "google_analytics_id",
          value: values.google_analytics_id.trim(),
        },
        {
          key: "google_tag_manager_id",
          value: values.google_tag_manager_id.trim(),
        },
        { key: "custom_head_scripts", value: values.custom_head_scripts },
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
      toast.success(
        "Tracking settings saved. Refresh the site to apply changes.",
      );
    } catch (err) {
      console.error("Error saving tracking settings:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save settings",
      );
      toast.error("Failed to save tracking settings");
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
      title="Tracking & Analytics"
      description="Configure Google Analytics, Tag Manager, and custom tracking scripts"
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Tracking" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      {/* Master Switch */}
      <SettingsCard
        title="Tracking Status"
        description="Master switch for all tracking and analytics scripts"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Enable Tracking
            </p>
            <p className="text-sm text-gray-600">
              When disabled, no tracking scripts will be loaded on the site
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values.tracking_enabled}
            onClick={() =>
              setValues({
                ...values,
                tracking_enabled: !values.tracking_enabled,
              })
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              values.tracking_enabled ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                values.tracking_enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </SettingsCard>

      {/* Google Analytics */}
      <div className="mt-6">
        <SettingsCard
          title="Google Analytics 4"
          description="Track page views, user behavior, and conversions with GA4"
        >
          <div className="space-y-4">
            <SettingsInput
              label="Measurement ID"
              value={values.google_analytics_id}
              onChange={(val) =>
                setValues({ ...values, google_analytics_id: val })
              }
              placeholder="G-XXXXXXXXXX"
              helperText="Find this in Google Analytics > Admin > Data Streams > Web"
            />
            {values.google_analytics_id && (
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`w-2 h-2 rounded-full ${
                    values.tracking_enabled && values.google_analytics_id
                      ? "bg-green-500"
                      : "bg-gray-300"
                  }`}
                />
                <span className="text-gray-600">
                  {values.tracking_enabled
                    ? "GA4 will be active after save & refresh"
                    : "Enable tracking above to activate GA4"}
                </span>
              </div>
            )}
          </div>
        </SettingsCard>
      </div>

      {/* Google Tag Manager */}
      <div className="mt-6">
        <SettingsCard
          title="Google Tag Manager"
          description="Manage all marketing and analytics tags from a single container"
        >
          <div className="space-y-4">
            <SettingsInput
              label="Container ID"
              value={values.google_tag_manager_id}
              onChange={(val) =>
                setValues({ ...values, google_tag_manager_id: val })
              }
              placeholder="GTM-XXXXXXX"
              helperText="Find this in GTM > Admin > Container Settings"
            />
            {values.google_tag_manager_id && values.google_analytics_id && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-sm text-amber-800">
                  Both GA4 and GTM are configured. If GA4 is also managed
                  inside your GTM container, you may get duplicate page views.
                  Consider removing the GA4 ID here and managing it entirely
                  through GTM.
                </p>
              </div>
            )}
          </div>
        </SettingsCard>
      </div>

      {/* Custom Scripts */}
      <div className="mt-6">
        <SettingsCard
          title="Custom Head Scripts"
          description="Advanced: inject custom script tags into the page head (e.g., Facebook Pixel, Hotjar)"
        >
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Scripts JSON
            </label>
            <textarea
              value={values.custom_head_scripts}
              onChange={(e) =>
                setValues({ ...values, custom_head_scripts: e.target.value })
              }
              rows={6}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder='[{"id":"fb-pixel","inline":"!function(f,b)..."}]'
            />
            <p className="text-xs text-gray-500">
              JSON array. Each object needs an <code>id</code> and either{" "}
              <code>src</code> (external URL) or <code>inline</code> (raw JS).
              Example:{" "}
              <code>
                {'[{"id":"hotjar","src":"https://static.hotjar.com/..."}]'}
              </code>
            </p>
          </div>
        </SettingsCard>
      </div>
    </AdminSettingsLayout>
  );
}
