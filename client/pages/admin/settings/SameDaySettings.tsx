import React, { useState, useEffect } from "react";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import SettingsTable from "@/components/admin/settings/SettingsTable";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface SameDaySettings {
  same_day_multiplier: number;
  same_day_cutoff_hour: number;
  same_day_cutoff_minute: number;
}

interface SameDayEligibility {
  id: string;
  source_language: string;
  target_language: string;
  document_type: string;
  intended_use: string;
  is_active: boolean;
}

interface Language {
  code: string;
  name: string;
}

interface DocumentType {
  code: string;
  name: string;
}

interface IntendedUse {
  code: string;
  name: string;
}

export default function SameDaySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<SameDaySettings>({
    same_day_multiplier: 2.0,
    same_day_cutoff_hour: 14,
    same_day_cutoff_minute: 0,
  });
  const [originalSettings, setOriginalSettings] = useState<SameDaySettings>({
    same_day_multiplier: 2.0,
    same_day_cutoff_hour: 14,
    same_day_cutoff_minute: 0,
  });

  // Eligibility rules
  const [rules, setRules] = useState<SameDayEligibility[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<SameDayEligibility | null>(
    null,
  );

  // Lookup data
  const [sourceLanguages, setSourceLanguages] = useState<Language[]>([]);
  const [targetLanguages, setTargetLanguages] = useState<Language[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);

  // Filters
  const [filterSource, setFilterSource] = useState("all");
  const [filterTarget, setFilterTarget] = useState("all");
  const [filterDocType, setFilterDocType] = useState("all");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "same_day_multiplier",
          "same_day_cutoff_hour",
          "same_day_cutoff_minute",
        ]);

      if (settingsError) throw settingsError;

      const loadedSettings = settingsData.reduce(
        (acc, s) => {
          acc[s.setting_key] = parseFloat(s.setting_value);
          return acc;
        },
        {} as Record<string, number>,
      );

      const settingsObj = {
        same_day_multiplier: loadedSettings.same_day_multiplier || 2.0,
        same_day_cutoff_hour: loadedSettings.same_day_cutoff_hour || 14,
        same_day_cutoff_minute: loadedSettings.same_day_cutoff_minute || 0,
      };

      setSettings(settingsObj);
      setOriginalSettings(settingsObj);

      // Fetch eligibility rules
      const { data: rulesData, error: rulesError } = await supabase
        .from("same_day_eligibility")
        .select("*")
        .order("source_language, target_language");

      if (rulesError) throw rulesError;
      setRules(rulesData || []);

      // Fetch lookup data
      const [languagesRes, docTypesRes, usesRes] = await Promise.all([
        supabase
          .from("languages")
          .select("code, name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("document_types")
          .select("code, name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("intended_uses")
          .select("code, name")
          .eq("is_active", true)
          .order("name"),
      ]);

      if (languagesRes.error) throw languagesRes.error;
      if (docTypesRes.error) throw docTypesRes.error;
      if (usesRes.error) throw usesRes.error;

      const langs = languagesRes.data || [];
      setSourceLanguages(langs.filter((l) => l.code !== "en")); // Assume English is target
      setTargetLanguages(langs);
      setDocumentTypes(docTypesRes.data || []);
      setIntendedUses(usesRes.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        {
          key: "same_day_multiplier",
          value: String(settings.same_day_multiplier),
        },
        {
          key: "same_day_cutoff_hour",
          value: String(settings.same_day_cutoff_hour),
        },
        {
          key: "same_day_cutoff_minute",
          value: String(settings.same_day_cutoff_minute),
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

      setOriginalSettings(settings);
      toast.success("Same-day settings saved successfully");
    } catch (err) {
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = () => {
    setEditingRule(null);
    setShowModal(true);
  };

  const handleEditRule = (rule: SameDayEligibility) => {
    setEditingRule(rule);
    setShowModal(true);
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this eligibility rule?"))
      return;

    try {
      const { error: deleteError } = await supabase
        .from("same_day_eligibility")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast.success("Eligibility rule deleted successfully");
      fetchData();
    } catch (err) {
      console.error("Error deleting rule:", err);
      toast.error("Failed to delete eligibility rule");
    }
  };

  const handleSaveRule = async (formData: Partial<SameDayEligibility>) => {
    try {
      // Check for duplicate
      const { data: existing } = await supabase
        .from("same_day_eligibility")
        .select("id")
        .eq("source_language", formData.source_language)
        .eq("target_language", formData.target_language)
        .eq("document_type", formData.document_type)
        .eq("intended_use", formData.intended_use)
        .neq("id", editingRule?.id || "");

      if (existing && existing.length > 0) {
        toast.error("This combination already exists");
        throw new Error("Duplicate rule");
      }

      if (editingRule?.id) {
        // Update
        const { error: updateError } = await supabase
          .from("same_day_eligibility")
          .update({
            source_language: formData.source_language,
            target_language: formData.target_language,
            document_type: formData.document_type,
            intended_use: formData.intended_use,
            is_active: formData.is_active,
          })
          .eq("id", editingRule.id);

        if (updateError) throw updateError;
        toast.success("Eligibility rule updated successfully");
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from("same_day_eligibility")
          .insert({
            source_language: formData.source_language,
            target_language: formData.target_language,
            document_type: formData.document_type,
            intended_use: formData.intended_use,
            is_active: formData.is_active ?? true,
          });

        if (insertError) throw insertError;
        toast.success("Eligibility rule added successfully");
      }

      setShowModal(false);
      setEditingRule(null);
      fetchData();
    } catch (err) {
      console.error("Error saving rule:", err);
      if (err instanceof Error && err.message !== "Duplicate rule") {
        toast.error("Failed to save eligibility rule");
      }
      throw err;
    }
  };

  const getLanguageName = (code: string) => {
    const lang = [...sourceLanguages, ...targetLanguages].find(
      (l) => l.code === code,
    );
    return lang?.name || code;
  };

  const getDocTypeName = (code: string) => {
    const docType = documentTypes.find((d) => d.code === code);
    return docType?.name || code;
  };

  const getIntendedUseName = (code: string) => {
    const use = intendedUses.find((u) => u.code === code);
    return use?.name || code;
  };

  const filteredRules = rules.filter((rule) => {
    if (filterSource !== "all" && rule.source_language !== filterSource)
      return false;
    if (filterTarget !== "all" && rule.target_language !== filterTarget)
      return false;
    if (filterDocType !== "all" && rule.document_type !== filterDocType)
      return false;
    return true;
  });

  const columns = [
    {
      key: "source_language",
      label: "Source",
      render: (rule: SameDayEligibility) =>
        getLanguageName(rule.source_language),
    },
    {
      key: "target_language",
      label: "Target",
      render: (rule: SameDayEligibility) =>
        getLanguageName(rule.target_language),
    },
    {
      key: "document_type",
      label: "Document Type",
      render: (rule: SameDayEligibility) => getDocTypeName(rule.document_type),
    },
    {
      key: "intended_use",
      label: "Intended Use",
      render: (rule: SameDayEligibility) =>
        getIntendedUseName(rule.intended_use),
    },
    {
      key: "is_active",
      label: "Active",
      render: (rule: SameDayEligibility) => (
        <span className={rule.is_active ? "text-green-600" : "text-gray-400"}>
          {rule.is_active ? "✓" : "—"}
        </span>
      ),
    },
  ];

  const modalFields = [
    {
      name: "source_language",
      label: "Source Language",
      type: "select" as const,
      required: true,
      options: sourceLanguages.map((l) => ({ value: l.code, label: l.name })),
    },
    {
      name: "target_language",
      label: "Target Language",
      type: "select" as const,
      required: true,
      options: targetLanguages.map((l) => ({ value: l.code, label: l.name })),
    },
    {
      name: "document_type",
      label: "Document Type",
      type: "select" as const,
      required: true,
      options: documentTypes.map((d) => ({ value: d.code, label: d.name })),
    },
    {
      name: "intended_use",
      label: "Intended Use",
      type: "select" as const,
      required: true,
      options: intendedUses.map((u) => ({ value: u.code, label: u.name })),
    },
    {
      name: "is_active",
      label: "Active",
      type: "checkbox" as const,
      required: false,
    },
  ];

  const settingsChanged =
    JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const actions = (
    <>
      {settingsChanged && (
        <button
          onClick={() => setSettings(originalSettings)}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm"
        >
          Cancel
        </button>
      )}
      <button
        onClick={handleSaveSettings}
        disabled={saving || !settingsChanged}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </>
  );

  return (
    <AdminSettingsLayout
      title="Same-Day Delivery Settings"
      description="Configure same-day delivery pricing and eligibility rules"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Same-Day Settings" },
      ]}
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Pricing Settings */}
        <SettingsCard title="Same-Day Pricing" description="">
          <div className="grid grid-cols-2 gap-6">
            <SettingsInput
              label="Same-Day Fee Multiplier"
              value={settings.same_day_multiplier}
              onChange={(val) =>
                setSettings({
                  ...settings,
                  same_day_multiplier: parseFloat(val) || 0,
                })
              }
              type="number"
              suffix="x"
              step={0.1}
              min={1}
              helperText={`+${((settings.same_day_multiplier - 1) * 100).toFixed(0)}% of translation subtotal`}
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cutoff Time (MST)
              </label>
              <div className="flex gap-2 items-center">
                <select
                  value={settings.same_day_cutoff_hour}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      same_day_cutoff_hour: parseInt(e.target.value),
                    })
                  }
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                    <option key={hour} value={hour}>
                      {hour.toString().padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <span>:</span>
                <select
                  value={settings.same_day_cutoff_minute}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      same_day_cutoff_minute: parseInt(e.target.value),
                    })
                  }
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="0">00</option>
                  <option value="15">15</option>
                  <option value="30">30</option>
                  <option value="45">45</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Order by{" "}
                {settings.same_day_cutoff_hour.toString().padStart(2, "0")}:
                {settings.same_day_cutoff_minute.toString().padStart(2, "0")}{" "}
                MST
              </p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 mt-4">
            ℹ️ Same-day is only available Mon-Fri when eligible
          </div>
        </SettingsCard>

        {/* Eligibility Matrix */}
        <SettingsCard title="Eligibility Matrix" description="">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex-1">
                Same-day is only available when ALL 4 criteria match
              </div>
              <button
                onClick={handleAddRule}
                className="ml-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Rule
              </button>
            </div>

            <div className="flex gap-3">
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Sources</option>
                {sourceLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>

              <select
                value={filterTarget}
                onChange={(e) => setFilterTarget(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Targets</option>
                {targetLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>

              <select
                value={filterDocType}
                onChange={(e) => setFilterDocType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                {documentTypes.map((docType) => (
                  <option key={docType.code} value={docType.code}>
                    {docType.name}
                  </option>
                ))}
              </select>
            </div>

            <SettingsTable
              columns={columns}
              data={filteredRules}
              onEdit={handleEditRule}
              onDelete={handleDeleteRule}
              emptyMessage="No eligibility rules configured. Click 'Add Rule' to create one."
              getRowKey={(rule) => rule.id}
            />

            <div className="text-sm text-gray-600">
              Showing {filteredRules.length} rules
            </div>
          </div>
        </SettingsCard>
      </div>

      {showModal && (
        <SettingsModal
          title={editingRule ? "Edit Eligibility Rule" : "Add Eligibility Rule"}
          fields={modalFields}
          initialData={
            editingRule || {
              source_language: "",
              target_language: "",
              document_type: "",
              intended_use: "",
              is_active: true,
            }
          }
          onSave={handleSaveRule}
          onClose={() => {
            setShowModal(false);
            setEditingRule(null);
          }}
        />
      )}
    </AdminSettingsLayout>
  );
}
