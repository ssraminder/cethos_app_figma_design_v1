import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface TrackingSettings {
  tracking_enabled: boolean;
  google_analytics_id: string;
  google_tag_manager_id: string;
  custom_head_scripts: Array<{
    id: string;
    src?: string;
    inline?: string;
  }>;
}

const TRACKING_KEYS = [
  "tracking_enabled",
  "google_analytics_id",
  "google_tag_manager_id",
  "custom_head_scripts",
] as const;

const DEFAULT_SETTINGS: TrackingSettings = {
  tracking_enabled: false,
  google_analytics_id: "",
  google_tag_manager_id: "",
  custom_head_scripts: [],
};

export function useTrackingSettings() {
  const [settings, setSettings] = useState<TrackingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSettings() {
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("setting_key, setting_value, setting_type")
          .in("setting_key", [...TRACKING_KEYS]);

        if (error || !data) {
          if (!cancelled) setLoading(false);
          return;
        }

        const parsed: TrackingSettings = { ...DEFAULT_SETTINGS };

        for (const row of data) {
          switch (row.setting_key) {
            case "tracking_enabled":
              parsed.tracking_enabled =
                row.setting_value === "true" || row.setting_value === "1";
              break;
            case "google_analytics_id":
              parsed.google_analytics_id = row.setting_value || "";
              break;
            case "google_tag_manager_id":
              parsed.google_tag_manager_id = row.setting_value || "";
              break;
            case "custom_head_scripts":
              try {
                parsed.custom_head_scripts = JSON.parse(
                  row.setting_value || "[]",
                );
              } catch {
                parsed.custom_head_scripts = [];
              }
              break;
          }
        }

        if (!cancelled) setSettings(parsed);
      } catch (err) {
        console.error("Failed to fetch tracking settings:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading };
}
