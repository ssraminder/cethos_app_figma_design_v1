import React, { useState, useEffect } from "react";
import { Globe, ChevronDown, ChevronUp, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface EditableTranslationDetailsData {
  quote_id: string;
  source_language_id: string;
  source_language_name: string;
  source_language_code: string;
  target_language_id: string;
  target_language_name: string;
  target_language_code: string;
  intended_use_id: string;
  intended_use_name: string;
  country_of_issue: string;
  service_province?: string;
  special_instructions?: string;
}

interface EditableTranslationDetailsPanelProps {
  translationData: EditableTranslationDetailsData | null;
  loading?: boolean;
  onUpdate?: () => void;
}

interface Language {
  id: string;
  code: string;
  name: string;
}

interface IntendedUse {
  id: string;
  code: string;
  name: string;
}

export default function EditableTranslationDetailsPanel({
  translationData,
  loading = false,
  onUpdate,
}: EditableTranslationDetailsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit state
  const [sourceLanguageId, setSourceLanguageId] = useState("");
  const [targetLanguageId, setTargetLanguageId] = useState("");
  const [intendedUseId, setIntendedUseId] = useState("");
  const [countryOfIssue, setCountryOfIssue] = useState("");
  const [serviceProvince, setServiceProvince] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Dropdown options
  const [languages, setLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    if (translationData) {
      resetForm();
    }
  }, [translationData]);

  const fetchOptions = async () => {
    try {
      const [languagesRes, usesRes] = await Promise.all([
        supabase.from("languages").select("id, code, name").eq("is_active", true).order("name"),
        supabase.from("intended_uses").select("id, code, name").eq("is_active", true).order("name"),
      ]);

      if (languagesRes.data) setLanguages(languagesRes.data);
      if (usesRes.data) setIntendedUses(usesRes.data);
    } catch (error) {
      console.error("Error fetching options:", error);
    }
  };

  const resetForm = () => {
    if (!translationData) return;
    setSourceLanguageId(translationData.source_language_id || "");
    setTargetLanguageId(translationData.target_language_id || "");
    setIntendedUseId(translationData.intended_use_id || "");
    setCountryOfIssue(translationData.country_of_issue || "");
    setServiceProvince(translationData.service_province || "");
    setSpecialInstructions(translationData.special_instructions || "");
  };

  const handleSave = async () => {
    if (!translationData?.quote_id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("quotes")
        .update({
          source_language_id: sourceLanguageId,
          target_language_id: targetLanguageId,
          intended_use_id: intendedUseId,
          country_of_issue: countryOfIssue,
          service_province: serviceProvince || null,
          special_instructions: specialInstructions || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", translationData.quote_id);

      if (error) throw error;

      alert("✅ Translation details updated successfully!");
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to update translation details:", error);
      alert("Failed to update translation details: " + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!translationData) {
    return null;
  }

  const selectedSourceLanguage = languages.find((l) => l.id === sourceLanguageId);
  const selectedTargetLanguage = languages.find((l) => l.id === targetLanguageId);
  const selectedIntendedUse = intendedUses.find((u) => u.id === intendedUseId);

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition-colors flex-1 -ml-2 p-2 rounded"
        >
          <Globe className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Translation Details
          </h3>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 ml-auto" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
          )}
        </button>
        {!isEditing && isExpanded && (
          <button
            onClick={() => setIsEditing(true)}
            className="ml-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Edit
          </button>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {!isEditing ? (
            // View Mode
            <>
              <div>
                <p className="text-xs text-gray-500 mb-1">Source Language</p>
                <p className="font-medium text-gray-900">
                  {translationData.source_language_name}{" "}
                  <span className="text-gray-500">({translationData.source_language_code})</span>
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Target Language</p>
                <p className="font-medium text-gray-900">
                  {translationData.target_language_name}{" "}
                  <span className="text-gray-500">({translationData.target_language_code})</span>
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Purpose</p>
                <p className="font-medium text-gray-900">{translationData.intended_use_name}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Country of Issue</p>
                <p className="font-medium text-gray-900">{translationData.country_of_issue}</p>
              </div>

              {translationData.service_province && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Service Province</p>
                  <p className="font-medium text-gray-900">{translationData.service_province}</p>
                </div>
              )}

              {translationData.special_instructions && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Special Instructions</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded border">
                    {translationData.special_instructions}
                  </p>
                </div>
              )}
            </>
          ) : (
            // Edit Mode
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Source Language *</label>
                <select
                  value={sourceLanguageId}
                  onChange={(e) => setSourceLanguageId(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select language...</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name} ({lang.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Target Language *</label>
                <select
                  value={targetLanguageId}
                  onChange={(e) => setTargetLanguageId(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select language...</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name} ({lang.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Purpose *</label>
                <select
                  value={intendedUseId}
                  onChange={(e) => setIntendedUseId(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select purpose...</option>
                  {intendedUses.map((use) => (
                    <option key={use.id} value={use.id}>
                      {use.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Country of Issue *</label>
                <input
                  type="text"
                  value={countryOfIssue}
                  onChange={(e) => setCountryOfIssue(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g., India, Canada, Mexico"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Service Province (Optional)</label>
                <input
                  type="text"
                  value={serviceProvince}
                  onChange={(e) => setServiceProvince(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g., Alberta, Ontario"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Special Instructions (Optional)</label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Any special instructions or notes..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !sourceLanguageId || !targetLanguageId || !intendedUseId || !countryOfIssue}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
