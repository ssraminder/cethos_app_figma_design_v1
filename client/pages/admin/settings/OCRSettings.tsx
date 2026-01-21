import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface OCRSettings {
  id: string;
  provider: string;
  is_active: boolean;
  config: {
    project_id?: string;
    processor_id?: string;
    location?: string;
    region?: string;
    endpoint?: string;
    model_id?: string;
  };
  fallback_provider: string | null;
}

const OCR_PROVIDERS = [
  {
    value: "google_document_ai",
    label: "Google Document AI",
    description: "Best for structured documents, forms, tables",
    configFields: ["project_id", "processor_id", "location"],
  },
  {
    value: "aws_textract",
    label: "AWS Textract",
    description: "Good general-purpose OCR",
    configFields: ["region"],
  },
  {
    value: "azure_form_recognizer",
    label: "Azure Form Recognizer",
    description: "Strong for handwriting recognition",
    configFields: ["endpoint", "model_id"],
  },
  {
    value: "mistral",
    label: "Mistral",
    description: "Combined OCR and LLM",
    configFields: [],
  },
];

const FALLBACK_PROVIDERS = [
  { value: "claude_vision", label: "Claude Vision (Anthropic)" },
  { value: "gpt4_vision", label: "GPT-4 Vision (OpenAI)" },
  { value: "gemini_vision", label: "Gemini Vision (Google)" },
];

const GOOGLE_LOCATIONS = [
  { value: "us", label: "United States" },
  { value: "eu", label: "Europe" },
  { value: "asia", label: "Asia" },
];

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
];

export default function OCRSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<OCRSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("google_document_ai");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [fallbackProvider, setFallbackProvider] = useState<string | null>(null);

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
        .from("ocr_settings")
        .select("*")
        .eq("is_active", true)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError;

      if (data) {
        setActiveProvider(data);
        setSelectedProvider(data.provider);
        setConfig(data.config || {});
        setFallbackProvider(data.fallback_provider);
      }
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
      // Deactivate all existing providers
      await supabase.from("ocr_settings").update({ is_active: false }).neq("id", "");

      // Check if provider already exists
      const { data: existing } = await supabase
        .from("ocr_settings")
        .select("id")
        .eq("provider", selectedProvider)
        .single();

      const settingsData = {
        provider: selectedProvider,
        is_active: true,
        config: config,
        fallback_provider: fallbackProvider,
      };

      if (existing) {
        // Update existing
        const { error: updateError } = await supabase
          .from("ocr_settings")
          .update(settingsData)
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from("ocr_settings")
          .insert(settingsData);

        if (insertError) throw insertError;
      }

      toast.success("OCR settings saved successfully");
      fetchSettings();
    } catch (err) {
      console.error("Error saving settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
      toast.error("Failed to save OCR settings");
    } finally {
      setSaving(false);
    }
  };

  const renderConfigFields = () => {
    const provider = OCR_PROVIDERS.find((p) => p.value === selectedProvider);
    if (!provider || provider.configFields.length === 0) {
      return (
        <div className="text-sm text-gray-500 italic">
          No additional configuration required
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {provider.configFields.map((field) => {
          if (field === "location" && selectedProvider === "google_document_ai") {
            return (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <select
                  value={config.location || "us"}
                  onChange={(e) => setConfig({ ...config, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {GOOGLE_LOCATIONS.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (field === "region" && selectedProvider === "aws_textract") {
            return (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  AWS Region
                </label>
                <select
                  value={config.region || "us-east-1"}
                  onChange={(e) => setConfig({ ...config, region: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {AWS_REGIONS.map((region) => (
                    <option key={region.value} value={region.value}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field
                  .split("_")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(" ")}
              </label>
              <input
                type="text"
                value={config[field] || ""}
                onChange={(e) => setConfig({ ...config, [field]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={
                  field === "project_id"
                    ? "cethos-automation"
                    : field === "processor_id"
                      ? "d6b4b832ed57ef43"
                      : ""
                }
              />
            </div>
          );
        })}
      </div>
    );
  };

  const isDirty =
    !activeProvider ||
    selectedProvider !== activeProvider.provider ||
    JSON.stringify(config) !== JSON.stringify(activeProvider.config) ||
    fallbackProvider !== activeProvider.fallback_provider;

  const actions = (
    <>
      {isDirty && (
        <button
          onClick={() => {
            if (activeProvider) {
              setSelectedProvider(activeProvider.provider);
              setConfig(activeProvider.config || {});
              setFallbackProvider(activeProvider.fallback_provider);
            }
          }}
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
      title="OCR Settings"
      description="Configure the OCR provider used for document text extraction"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "OCR Settings" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Primary OCR Provider */}
        <SettingsCard title="Primary OCR Provider" description="">
          <div className="space-y-4">
            {OCR_PROVIDERS.map((provider) => (
              <label
                key={provider.value}
                className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedProvider === provider.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="ocr_provider"
                  value={provider.value}
                  checked={selectedProvider === provider.value}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    setConfig({});
                  }}
                  className="mt-1 text-blue-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {provider.label}
                    </span>
                    {activeProvider?.provider === provider.value && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                        ← Currently Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {provider.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </SettingsCard>

        {/* Provider Configuration */}
        <SettingsCard
          title={`${OCR_PROVIDERS.find((p) => p.value === selectedProvider)?.label} Configuration`}
          description=""
        >
          {renderConfigFields()}
        </SettingsCard>

        {/* Fallback Provider */}
        <SettingsCard
          title="Fallback Provider"
          description="Used when primary provider fails"
        >
          <div>
            <select
              value={fallbackProvider || ""}
              onChange={(e) =>
                setFallbackProvider(e.target.value || null)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {FALLBACK_PROVIDERS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>
        </SettingsCard>
      </div>
    </AdminSettingsLayout>
  );
}
