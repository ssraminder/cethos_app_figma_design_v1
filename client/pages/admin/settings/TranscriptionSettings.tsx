import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Save, ToggleLeft, ToggleRight } from "lucide-react";

interface Setting {
  setting_key: string;
  setting_value: string;
  description: string | null;
}

const SETTING_KEYS = [
  "transcription_enabled",
  "transcription_free_tier_max_seconds",
  "transcription_free_tier_daily_limit",
  "transcription_price_per_minute",
  "transcription_human_review_price_standard",
  "transcription_human_review_price_rush",
  "transcription_ai_translation_price",
  "transcription_free_expiry_days",
  "transcription_paid_expiry_days",
  "transcription_primary_provider",
  "transcription_fallback_provider",
];

const LABELS: Record<string, { label: string; hint: string; type: "toggle" | "number" | "select" }> = {
  transcription_enabled:                    { label: "Service Enabled",             hint: "Master toggle for transcription service",                   type: "toggle" },
  transcription_free_tier_max_seconds:      { label: "Free Tier Max Duration (s)",  hint: "Maximum seconds per free transcription",                    type: "number" },
  transcription_free_tier_daily_limit:      { label: "Free Daily Limit",            hint: "Max free transcriptions per email per day",                 type: "number" },
  transcription_price_per_minute:           { label: "Price per Minute (CAD)",      hint: "Standard tier transcription rate",                          type: "number" },
  transcription_human_review_price_standard:{ label: "Human Review $/min (Std)",    hint: "Standard turnaround human review rate",                     type: "number" },
  transcription_human_review_price_rush:    { label: "Human Review $/min (Rush)",   hint: "Rush turnaround human review rate",                         type: "number" },
  transcription_ai_translation_price:       { label: "AI Translation $/min",        hint: "Instant AI translation add-on rate",                        type: "number" },
  transcription_free_expiry_days:           { label: "Free Tier Expiry (days)",     hint: "Days before free tier files auto-deleted",                  type: "number" },
  transcription_paid_expiry_days:           { label: "Paid Tier Expiry (days)",     hint: "Days before paid tier files auto-deleted",                  type: "number" },
  transcription_primary_provider:           { label: "Primary STT Provider",        hint: "Default speech-to-text provider",                           type: "select" },
  transcription_fallback_provider:          { label: "Fallback STT Provider",       hint: "Used when primary doesn't support the language",             type: "select" },
};

const PROVIDER_OPTIONS = [
  { value: "google", label: "Google STT v2 / Chirp 2 (100+ langs incl. Punjabi/Persian)" },
  { value: "elevenlabs", label: "ElevenLabs Scribe v2 (strong Indic/RTL, 90+ langs)" },
  { value: "deepgram", label: "Deepgram Nova-3 (36 langs only — no Punjabi/Persian)" },
  { value: "assemblyai", label: "AssemblyAI (50+ languages)" },
  { value: "openai", label: "OpenAI gpt-4o-transcribe (99+ languages)" },
];

export default function TranscriptionSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value, description")
      .in("setting_key", SETTING_KEYS);

    if (error) {
      toast.error("Failed to load settings");
      setLoading(false);
      return;
    }

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.setting_key] = row.setting_value;
    }
    setSettings(map);
    setLoading(false);
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
          .from("app_settings")
          .update({ setting_value: value })
          .eq("setting_key", key);

        if (error) {
          toast.error(`Failed to save ${key}: ${error.message}`);
          setSaving(false);
          return;
        }
      }
      toast.success("Transcription settings saved");
    } catch (e) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminSettingsLayout
      title="Transcription Settings"
      description="Configure AI transcription pricing, providers, and free tier limits"
      breadcrumbs={[
        { label: "Settings", href: "/admin/settings" },
        { label: "Transcription" },
      ]}
      loading={loading}
      actions={
        <button
          onClick={saveAll}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      }
    >
      <div className="space-y-6">
        {/* Service toggle */}
        <Section title="Service Status">
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Transcription Service</p>
              <p className="text-xs text-gray-500">Enable or disable the entire transcription feature</p>
            </div>
            <button
              onClick={() => updateSetting("transcription_enabled", settings.transcription_enabled === "true" ? "false" : "true")}
              className="flex items-center gap-2"
            >
              {settings.transcription_enabled === "true" ? (
                <ToggleRight className="w-10 h-10 text-teal-600" />
              ) : (
                <ToggleLeft className="w-10 h-10 text-gray-400" />
              )}
              <span className={`text-sm font-medium ${settings.transcription_enabled === "true" ? "text-teal-700" : "text-gray-500"}`}>
                {settings.transcription_enabled === "true" ? "Enabled" : "Disabled"}
              </span>
            </button>
          </div>
        </Section>

        {/* Free tier */}
        <Section title="Free Tier">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberField
              label={LABELS.transcription_free_tier_max_seconds.label}
              hint={LABELS.transcription_free_tier_max_seconds.hint}
              value={settings.transcription_free_tier_max_seconds ?? "60"}
              onChange={(v) => updateSetting("transcription_free_tier_max_seconds", v)}
              suffix="seconds"
            />
            <NumberField
              label={LABELS.transcription_free_tier_daily_limit.label}
              hint={LABELS.transcription_free_tier_daily_limit.hint}
              value={settings.transcription_free_tier_daily_limit ?? "5"}
              onChange={(v) => updateSetting("transcription_free_tier_daily_limit", v)}
              suffix="per day"
            />
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing (CAD)">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <NumberField
              label={LABELS.transcription_price_per_minute.label}
              hint={LABELS.transcription_price_per_minute.hint}
              value={settings.transcription_price_per_minute ?? "0.15"}
              onChange={(v) => updateSetting("transcription_price_per_minute", v)}
              prefix="$"
              step="0.01"
            />
            <NumberField
              label={LABELS.transcription_human_review_price_standard.label}
              hint={LABELS.transcription_human_review_price_standard.hint}
              value={settings.transcription_human_review_price_standard ?? "1.25"}
              onChange={(v) => updateSetting("transcription_human_review_price_standard", v)}
              prefix="$"
              step="0.01"
            />
            <NumberField
              label={LABELS.transcription_human_review_price_rush.label}
              hint={LABELS.transcription_human_review_price_rush.hint}
              value={settings.transcription_human_review_price_rush ?? "1.75"}
              onChange={(v) => updateSetting("transcription_human_review_price_rush", v)}
              prefix="$"
              step="0.01"
            />
            <NumberField
              label={LABELS.transcription_ai_translation_price.label}
              hint={LABELS.transcription_ai_translation_price.hint}
              value={settings.transcription_ai_translation_price ?? "0.25"}
              onChange={(v) => updateSetting("transcription_ai_translation_price", v)}
              prefix="$"
              step="0.01"
            />
          </div>
        </Section>

        {/* Expiry */}
        <Section title="Data Retention">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberField
              label={LABELS.transcription_free_expiry_days.label}
              hint={LABELS.transcription_free_expiry_days.hint}
              value={settings.transcription_free_expiry_days ?? "7"}
              onChange={(v) => updateSetting("transcription_free_expiry_days", v)}
              suffix="days"
            />
            <NumberField
              label={LABELS.transcription_paid_expiry_days.label}
              hint={LABELS.transcription_paid_expiry_days.hint}
              value={settings.transcription_paid_expiry_days ?? "30"}
              onChange={(v) => updateSetting("transcription_paid_expiry_days", v)}
              suffix="days"
            />
          </div>
        </Section>

        {/* Providers */}
        <Section title="STT Providers">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectField
              label={LABELS.transcription_primary_provider.label}
              hint={LABELS.transcription_primary_provider.hint}
              value={settings.transcription_primary_provider ?? "assemblyai"}
              onChange={(v) => updateSetting("transcription_primary_provider", v)}
              options={PROVIDER_OPTIONS}
            />
            <SelectField
              label={LABELS.transcription_fallback_provider.label}
              hint={LABELS.transcription_fallback_provider.hint}
              value={settings.transcription_fallback_provider ?? "openai"}
              onChange={(v) => updateSetting("transcription_fallback_provider", v)}
              options={PROVIDER_OPTIONS}
            />
          </div>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <strong>Provider routing:</strong> If the primary provider doesn't support the source language,
            the system automatically falls back to the fallback provider. AssemblyAI supports ~50 languages,
            OpenAI supports 99+, ElevenLabs supports 90+.
          </div>
        </Section>

        {/* Margin calculator */}
        <Section title="Margin Calculator">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">AssemblyAI cost</p>
                <p className="font-mono">$0.0025/min</p>
                <p className="text-green-600 font-medium mt-1">
                  {((parseFloat(settings.transcription_price_per_minute ?? "0.15") / 0.0025) * 100 - 100).toFixed(0)}% margin
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">OpenAI cost</p>
                <p className="font-mono">$0.006/min</p>
                <p className="text-green-600 font-medium mt-1">
                  {((parseFloat(settings.transcription_price_per_minute ?? "0.15") / 0.006) * 100 - 100).toFixed(0)}% margin
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">ElevenLabs cost</p>
                <p className="font-mono">$0.007/min</p>
                <p className="text-green-600 font-medium mt-1">
                  {((parseFloat(settings.transcription_price_per_minute ?? "0.15") / 0.007) * 100 - 100).toFixed(0)}% margin
                </p>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </AdminSettingsLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  step = "1",
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <label className="block text-sm font-medium text-gray-900 mb-1">{label}</label>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}

function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <label className="block text-sm font-medium text-gray-900 mb-1">{label}</label>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
