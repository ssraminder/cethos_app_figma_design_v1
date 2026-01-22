import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface AIPrompt {
  id: string;
  prompt_key: string;
  prompt_name: string;
  prompt_text: string;
  llm_provider: string;
  llm_model: string;
  temperature: number;
  max_tokens: number;
  description: string | null;
  is_active: boolean;
}

const PROVIDERS = {
  anthropic: {
    name: "Anthropic",
    models: [
      "claude-opus-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250514",
    ],
  },
  openai: {
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  google: {
    name: "Google",
    models: ["gemini-pro", "gemini-pro-vision"],
  },
};

const PROMPT_ICONS: Record<string, string> = {
  document_classification: "📄",
  complexity_assessment: "🔍",
  language_detection: "🌐",
};

export default function AIPromptsSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<AIPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session, loading: authLoading } = useAdminAuthContext();

  useEffect(() => {
    if (authLoading || !session) return;
    fetchPrompts();
  }, [authLoading, session]);


  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("ai_prompts")
        .select("*")
        .order("prompt_key");

      if (fetchError) throw fetchError;
      setPrompts(data || []);
    } catch (err) {
      console.error("Error fetching prompts:", err);
      setError(err instanceof Error ? err.message : "Failed to load prompts");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (prompt: AIPrompt) => {
    setEditingPrompt(prompt);
    setShowModal(true);
  };

  return (
    <AdminSettingsLayout
      title="AI Prompts Configuration"
      description="Configure the prompts used for document analysis"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "AI Prompts" },
      ]}
      loading={loading}
      error={error}
    >
      <div className="space-y-4">
        {prompts.map((prompt) => (
          <SettingsCard key={prompt.id} title="" description="">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4 flex-1">
                <div className="text-4xl">
                  {PROMPT_ICONS[prompt.prompt_key] || "🤖"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {prompt.prompt_name}
                    </h3>
                    {prompt.is_active ? (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        ✅ Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                        ⏸️ Inactive
                      </span>
                    )}
                  </div>
                  {prompt.description && (
                    <p className="text-sm text-gray-600 mb-3">
                      {prompt.description}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Provider:</span>{" "}
                      <span className="font-medium text-gray-900">
                        {PROVIDERS[
                          prompt.llm_provider as keyof typeof PROVIDERS
                        ]?.name || prompt.llm_provider}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Model:</span>{" "}
                      <span className="font-medium text-gray-900">
                        {prompt.llm_model}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Temperature:</span>{" "}
                      <span className="font-medium text-gray-900">
                        {prompt.temperature}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Max Tokens:</span>{" "}
                      <span className="font-medium text-gray-900">
                        {prompt.max_tokens}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleEdit(prompt)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium whitespace-nowrap"
              >
                Edit
              </button>
            </div>
          </SettingsCard>
        ))}

        {prompts.length === 0 && !loading && (
          <SettingsCard title="" description="">
            <div className="text-center py-8 text-gray-500">
              No AI prompts configured.
            </div>
          </SettingsCard>
        )}
      </div>

      {/* Edit Modal */}
      {showModal && editingPrompt && (
        <AIPromptModal
          prompt={editingPrompt}
          onClose={() => {
            setShowModal(false);
            setEditingPrompt(null);
          }}
          onSave={() => {
            setShowModal(false);
            setEditingPrompt(null);
            fetchPrompts();
          }}
        />
      )}
    </AdminSettingsLayout>
  );
}

interface AIPromptModalProps {
  prompt: AIPrompt;
  onClose: () => void;
  onSave: () => void;
}

function AIPromptModal({ prompt, onClose, onSave }: AIPromptModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<AIPrompt>>(prompt);

  const selectedProvider =
    PROVIDERS[formData.llm_provider as keyof typeof PROVIDERS];
  const availableModels = selectedProvider?.models || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { error: updateError } = await supabase
        .from("ai_prompts")
        .update(formData)
        .eq("id", prompt.id);

      if (updateError) throw updateError;
      toast.success("AI prompt updated successfully");
      onSave();
    } catch (err) {
      console.error("Error saving prompt:", err);
      toast.error("Failed to save AI prompt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Edit AI Prompt: {prompt.prompt_name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.prompt_name}
              onChange={(e) =>
                setFormData({ ...formData, prompt_name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provider *
              </label>
              <select
                value={formData.llm_provider}
                onChange={(e) => {
                  const provider = e.target.value;
                  const models =
                    PROVIDERS[provider as keyof typeof PROVIDERS]?.models || [];
                  setFormData({
                    ...formData,
                    llm_provider: provider,
                    llm_model: models[0] || "",
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {Object.entries(PROVIDERS).map(([key, provider]) => (
                  <option key={key} value={key}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model *
              </label>
              <select
                value={formData.llm_model}
                onChange={(e) =>
                  setFormData({ ...formData, llm_model: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature *
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0.0 = deterministic</span>
                  <span className="font-medium text-gray-900">
                    {formData.temperature?.toFixed(1)}
                  </span>
                  <span>1.0 = creative</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Tokens *
              </label>
              <input
                type="number"
                value={formData.max_tokens}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_tokens: parseInt(e.target.value) || 0,
                  })
                }
                min={1}
                step={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prompt Text *
            </label>
            <textarea
              value={formData.prompt_text}
              onChange={(e) =>
                setFormData({ ...formData, prompt_text: e.target.value })
              }
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Available variables: {"{ocr_text}"}, {"{document_type}"},{" "}
              {"{word_count}"}
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
