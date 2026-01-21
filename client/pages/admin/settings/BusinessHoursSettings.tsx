import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface BusinessHoursSettings {
  business_hours_start: number;
  business_hours_end: number;
  business_timezone: string;
  business_working_days: number[];
}

const COMMON_TIMEZONES = [
  { value: "America/Edmonton", label: "America/Edmonton (MST/MDT)" },
  { value: "America/Toronto", label: "America/Toronto (EST/EDT)" },
  { value: "America/Vancouver", label: "America/Vancouver (PST/PDT)" },
  { value: "America/Winnipeg", label: "America/Winnipeg (CST/CDT)" },
  { value: "America/Halifax", label: "America/Halifax (AST/ADT)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "America/Denver", label: "America/Denver (MST/MDT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEDT/AEST)" },
];

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatTime(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

function getCurrentTime(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
    return formatter.format(now);
  } catch (err) {
    return "Invalid timezone";
  }
}

export default function BusinessHoursSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<BusinessHoursSettings>({
    business_hours_start: 9,
    business_hours_end: 17,
    business_timezone: "America/Edmonton",
    business_working_days: [1, 2, 3, 4, 5],
  });
  const [originalValues, setOriginalValues] = useState<BusinessHoursSettings>({
    business_hours_start: 9,
    business_hours_end: 17,
    business_timezone: "America/Edmonton",
    business_working_days: [1, 2, 3, 4, 5],
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
        "business_hours_start",
        "business_hours_end",
        "business_timezone",
        "business_working_days",
      ];

      const { data, error: fetchError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", keys);

      if (fetchError) throw fetchError;

      const settings = data.reduce(
        (acc, setting) => {
          if (setting.setting_key === "business_working_days") {
            acc[setting.setting_key] = JSON.parse(setting.setting_value);
          } else if (
            setting.setting_key === "business_hours_start" ||
            setting.setting_key === "business_hours_end"
          ) {
            acc[setting.setting_key] = parseInt(setting.setting_value);
          } else {
            acc[setting.setting_key] = setting.setting_value;
          }
          return acc;
        },
        {} as Record<string, any>,
      );

      const loadedValues = {
        business_hours_start: settings.business_hours_start || 9,
        business_hours_end: settings.business_hours_end || 17,
        business_timezone: settings.business_timezone || "America/Edmonton",
        business_working_days: settings.business_working_days || [
          1, 2, 3, 4, 5,
        ],
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
    if (values.business_hours_end <= values.business_hours_start) {
      toast.error("End time must be after start time");
      return;
    }

    if (values.business_working_days.length === 0) {
      toast.error("At least one working day must be selected");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updates = [
        {
          key: "business_hours_start",
          value: String(values.business_hours_start),
        },
        { key: "business_hours_end", value: String(values.business_hours_end) },
        { key: "business_timezone", value: values.business_timezone },
        {
          key: "business_working_days",
          value: JSON.stringify(values.business_working_days),
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
      toast.success("Business hours settings saved successfully");
    } catch (err) {
      console.error("Error saving settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
      toast.error("Failed to save business hours settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    if (values.business_working_days.includes(day)) {
      setValues({
        ...values,
        business_working_days: values.business_working_days.filter(
          (d) => d !== day,
        ),
      });
    } else {
      setValues({
        ...values,
        business_working_days: [...values.business_working_days, day].sort(),
      });
    }
  };

  const calculateExamples = () => {
    const start = values.business_hours_start;
    const end = values.business_hours_end;
    const workingDays = values.business_working_days;

    // Get day names
    const dayNames = DAYS_OF_WEEK.filter((d) =>
      workingDays.includes(d.value),
    ).map((d) => d.label);
    const firstWorkDay = dayNames[0] || "Monday";
    const nextWorkDay = dayNames[1] || dayNames[0] || "Monday";

    return {
      inHours: `Order at ${formatTime(start + 6)} Friday → Work starts: Friday ${formatTime(start + 6)}`,
      afterHours: `Order at ${formatTime(end + 1)} Friday → Work starts: ${nextWorkDay} ${formatTime(start)}`,
      weekend: `Order at ${formatTime(10)} Saturday → Work starts: ${firstWorkDay} ${formatTime(start)}`,
    };
  };

  const examples = calculateExamples();
  const currentTime = getCurrentTime(values.business_timezone);

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
      title="Business Hours"
      description="Configure business hours and timezone for SLA calculations"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Business Hours" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Timezone Card */}
        <SettingsCard
          title="Timezone"
          description="Business hours are used for SLA calculations and cutoff times"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timezone
              </label>
              <select
                value={values.business_timezone}
                onChange={(e) =>
                  setValues({ ...values, business_timezone: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-sm text-gray-600">
              Current time: <span className="font-medium">{currentTime}</span>
            </div>
          </div>
        </SettingsCard>

        {/* Working Hours Card */}
        <SettingsCard title="Working Hours" description="">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Time
                </label>
                <select
                  value={values.business_hours_start}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      business_hours_start: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {HOURS.map((hour) => (
                    <option key={hour} value={hour}>
                      {formatTime(hour)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Time
                </label>
                <select
                  value={values.business_hours_end}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      business_hours_end: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {HOURS.map((hour) => (
                    <option key={hour} value={hour}>
                      {formatTime(hour)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Working Days
              </label>
              <div className="space-y-2">
                {DAYS_OF_WEEK.map((day) => (
                  <label key={day.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={values.business_working_days.includes(day.value)}
                      onChange={() => toggleDay(day.value)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{day.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* Example Calculations Card */}
        <SettingsCard
          title="Example Calculations"
          description="How business hours affect order processing"
        >
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
            <p className="text-blue-900">{examples.inHours}</p>
            <p className="text-blue-900">{examples.afterHours}</p>
            <p className="text-blue-900">{examples.weekend}</p>
          </div>
        </SettingsCard>
      </div>
    </AdminSettingsLayout>
  );
}
