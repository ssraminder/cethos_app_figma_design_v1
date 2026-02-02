import React, { useState, useEffect } from "react";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { useBranding } from "../../context/BrandingContext";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import {
  Brain,
  Plus,
  Search,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  BookOpen,
  Zap,
  X,
} from "lucide-react";

// Types
interface KnowledgeBaseEntry {
  id: string;
  entry_type: "override" | "context";
  category: string;
  source_language: string | null;
  target_language: string | null;
  document_type: string | null;
  title: string;
  knowledge_text: string;
  override_field: string | null;
  override_value: string | null;
  override_confidence: number | null;
  priority: number;
  is_active: boolean;
  source: string;
  times_matched: number;
  times_applied: number;
  last_matched_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Language {
  code: string;
  name: string;
}

interface DocumentType {
  code: string;
  name: string;
}

// Constants
const CATEGORIES = [
  { value: "complexity", label: "Complexity", color: "#FEF3C7", textColor: "#92400E" },
  { value: "document_type", label: "Document Type", color: "#DBEAFE", textColor: "#1E40AF" },
  { value: "language", label: "Language", color: "#D1FAE5", textColor: "#065F46" },
  { value: "certification", label: "Certification", color: "#FCE7F3", textColor: "#9D174D" },
  { value: "general", label: "General", color: "#F3F4F6", textColor: "#374151" },
];

const ENTRY_TYPES = [
  { value: "override", label: "Override", icon: Zap, description: "Hard rule that bypasses AI" },
  { value: "context", label: "Context", icon: BookOpen, description: "Hint injected into AI prompt" },
];

const OVERRIDE_FIELDS = [
  { value: "complexity", label: "Complexity" },
  { value: "document_type", label: "Document Type" },
  { value: "language", label: "Language" },
];

const COMPLEXITY_VALUES = [
  { value: "easy", label: "Easy (1.0x)" },
  { value: "medium", label: "Medium (1.15x)" },
  { value: "high", label: "High (1.25x)" },
];

// Stats Cards Component
function StatsCards({ entries }: { entries: KnowledgeBaseEntry[] }) {
  const stats = {
    total: entries.length,
    overrides: entries.filter((e) => e.entry_type === "override").length,
    context: entries.filter((e) => e.entry_type === "context").length,
    totalApplied: entries.reduce((sum, e) => sum + e.times_applied, 0),
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Total Entries</p>
        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Override Rules</p>
        <p className="text-2xl font-bold text-amber-600">{stats.overrides}</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Context Hints</p>
        <p className="text-2xl font-bold text-blue-600">{stats.context}</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Times Applied</p>
        <p className="text-2xl font-bold text-green-600">{stats.totalApplied.toLocaleString()}</p>
      </div>
    </div>
  );
}

// Entry Row Component
function EntryRow({
  entry,
  languages,
  onEdit,
  onToggle,
  onDelete,
}: {
  entry: KnowledgeBaseEntry;
  languages: Language[];
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const category = CATEGORIES.find((c) => c.value === entry.category);
  const sourceLang = languages.find((l) => l.code === entry.source_language);

  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 ${!entry.is_active ? "opacity-50" : ""}`}
    >
      {/* Title & Knowledge */}
      <td className="py-3 px-4">
        <div className="font-medium text-gray-900">{entry.title}</div>
        <div
          className="text-sm text-gray-500 truncate max-w-xs"
          title={entry.knowledge_text}
        >
          {entry.knowledge_text.length > 60
            ? entry.knowledge_text.substring(0, 60) + "..."
            : entry.knowledge_text}
        </div>
      </td>

      {/* Type */}
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            entry.entry_type === "override"
              ? "bg-amber-100 text-amber-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {entry.entry_type === "override" ? (
            <Zap className="w-3 h-3" />
          ) : (
            <BookOpen className="w-3 h-3" />
          )}
          {entry.entry_type}
        </span>
      </td>

      {/* Category */}
      <td className="py-3 px-4">
        <span
          className="px-2 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: category?.color, color: category?.textColor }}
        >
          {category?.label}
        </span>
      </td>

      {/* Conditions */}
      <td className="py-3 px-4 text-sm">
        <div className="space-y-1">
          <div>
            <span className="text-gray-400">Lang:</span>{" "}
            <span className="text-gray-700">{sourceLang?.name || "Any"}</span>
          </div>
          <div>
            <span className="text-gray-400">Doc:</span>{" "}
            <span className="text-gray-700">{entry.document_type || "Any"}</span>
          </div>
          {entry.entry_type === "override" && (
            <div className="text-amber-600 font-medium">
              → {entry.override_field}: {entry.override_value}
            </div>
          )}
        </div>
      </td>

      {/* Priority */}
      <td className="py-3 px-4 text-center">
        <span
          className={`font-medium ${
            entry.priority >= 90
              ? "text-red-600"
              : entry.priority >= 50
                ? "text-gray-900"
                : "text-gray-400"
          }`}
        >
          {entry.priority}
        </span>
      </td>

      {/* Usage */}
      <td className="py-3 px-4 text-sm text-gray-500 text-center">
        <div title="Matched / Applied">
          {entry.times_matched} / {entry.times_applied}
        </div>
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="p-1 text-gray-400 hover:text-gray-600"
            title={entry.is_active ? "Deactivate" : "Activate"}
          >
            {entry.is_active ? (
              <ToggleRight className="w-5 h-5 text-green-500" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-blue-600"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Entry Modal Component
interface EntryModalProps {
  entry: KnowledgeBaseEntry | null;
  languages: Language[];
  documentTypes: DocumentType[];
  onSave: (data: Partial<KnowledgeBaseEntry>) => void;
  onClose: () => void;
}

function EntryModal({ entry, languages, documentTypes, onSave, onClose }: EntryModalProps) {
  const [formData, setFormData] = useState({
    entry_type: entry?.entry_type || "context",
    category: entry?.category || "complexity",
    source_language: entry?.source_language || "",
    target_language: entry?.target_language || "",
    document_type: entry?.document_type || "",
    title: entry?.title || "",
    knowledge_text: entry?.knowledge_text || "",
    override_field: entry?.override_field || "complexity",
    override_value: entry?.override_value || "",
    override_confidence: entry?.override_confidence || 0.99,
    priority: entry?.priority || 50,
    is_active: entry?.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.knowledge_text.trim()) {
      toast.error("Knowledge text is required");
      return;
    }
    if (formData.entry_type === "override" && !formData.override_value) {
      toast.error("Override value is required for override entries");
      return;
    }

    // Prepare data - convert empty strings to null
    const saveData = {
      ...formData,
      source_language: formData.source_language || null,
      target_language: formData.target_language || null,
      document_type: formData.document_type || null,
      override_field: formData.entry_type === "override" ? formData.override_field : null,
      override_value: formData.entry_type === "override" ? formData.override_value : null,
      override_confidence:
        formData.entry_type === "override" ? formData.override_confidence : null,
    };

    onSave(saveData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {entry ? "Edit Knowledge Entry" : "Add Knowledge Entry"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Entry Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Entry Type *</label>
            <div className="grid grid-cols-2 gap-4">
              {ENTRY_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, entry_type: type.value as "override" | "context" })
                  }
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    formData.entry_type === type.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <type.icon className="w-5 h-5" />
                    <span className="font-medium">{type.label}</span>
                  </div>
                  <p className="text-sm text-gray-500">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Conditions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Language
              </label>
              <select
                value={formData.source_language}
                onChange={(e) => setFormData({ ...formData, source_language: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Language
              </label>
              <select
                value={formData.target_language}
                onChange={(e) => setFormData({ ...formData, target_language: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select
                value={formData.document_type}
                onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any</option>
                {documentTypes.map((dt) => (
                  <option key={dt.code} value={dt.code}>
                    {dt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Afghan License - Medium Complexity"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Knowledge Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Knowledge Text *
            </label>
            <textarea
              value={formData.knowledge_text}
              onChange={(e) => setFormData({ ...formData, knowledge_text: e.target.value })}
              placeholder="Describe the rule or context hint..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.entry_type === "override"
                ? "Explain why this override exists (shown in reasoning)"
                : "This text will be injected into the AI prompt as context"}
            </p>
          </div>

          {/* Override Settings (only for override type) */}
          {formData.entry_type === "override" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
              <h3 className="font-medium text-amber-800">Override Settings</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Field to Override *
                  </label>
                  <select
                    value={formData.override_field}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        override_field: e.target.value,
                        override_value: "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {OVERRIDE_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Override Value *
                  </label>
                  {formData.override_field === "complexity" ? (
                    <select
                      value={formData.override_value}
                      onChange={(e) => setFormData({ ...formData, override_value: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select...</option>
                      {COMPLEXITY_VALUES.map((cv) => (
                        <option key={cv.value} value={cv.value}>
                          {cv.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formData.override_value}
                      onChange={(e) => setFormData({ ...formData, override_value: e.target.value })}
                      placeholder="Value to set"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confidence: {formData.override_confidence}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.01"
                  value={formData.override_confidence}
                  onChange={(e) =>
                    setFormData({ ...formData, override_confidence: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority: {formData.priority}{" "}
              {formData.priority >= 90 ? "(High)" : formData.priority >= 50 ? "(Normal)" : "(Low)"}
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Higher priority overrides are applied first. Use 90+ for critical rules.
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formData.is_active ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.is_active ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">
              {formData.is_active ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Actions */}
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
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              {entry ? "Save Changes" : "Create Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete Confirmation Modal
function DeleteConfirmModal({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: KnowledgeBaseEntry;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Entry</h3>
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete "{entry.title}"? This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Component
export default function AIKnowledgeBase() {
  // State
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [allEntries, setAllEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [filters, setFilters] = useState({
    category: "all",
    entryType: "all",
    status: "all",
    search: "",
  });
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeBaseEntry | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<KnowledgeBaseEntry | null>(null);

  const { session, loading: authLoading } = useAdminAuthContext();
  const { primaryColor } = useBranding();

  // Fetch data on mount
  useEffect(() => {
    if (authLoading || !session) return;
    fetchEntries();
    fetchLanguages();
    fetchDocumentTypes();
  }, [authLoading, session]);

  // Apply filters when entries or filters change
  useEffect(() => {
    applyFilters();
  }, [allEntries, filters]);

  async function fetchEntries() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("*")
        .order("priority", { ascending: false });

      if (error) throw error;
      setAllEntries(data || []);
    } catch (err) {
      toast.error("Failed to load knowledge base entries");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...allEntries];

    if (filters.category !== "all") {
      filtered = filtered.filter((e) => e.category === filters.category);
    }
    if (filters.entryType !== "all") {
      filtered = filtered.filter((e) => e.entry_type === filters.entryType);
    }
    if (filters.status === "active") {
      filtered = filtered.filter((e) => e.is_active);
    } else if (filters.status === "inactive") {
      filtered = filtered.filter((e) => !e.is_active);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(searchLower) ||
          e.knowledge_text.toLowerCase().includes(searchLower)
      );
    }

    setEntries(filtered);
  }

  async function fetchLanguages() {
    const { data } = await supabase
      .from("languages")
      .select("code, name")
      .eq("is_active", true)
      .order("name");
    setLanguages(data || []);
  }

  async function fetchDocumentTypes() {
    const { data } = await supabase
      .from("document_types")
      .select("code, name")
      .eq("is_active", true)
      .order("name");
    setDocumentTypes(data || []);
  }

  async function saveEntry(formData: Partial<KnowledgeBaseEntry>) {
    try {
      const now = new Date().toISOString();

      if (editingEntry) {
        // Update
        const { error } = await supabase
          .from("ai_knowledge_base")
          .update({
            ...formData,
            updated_at: now,
          })
          .eq("id", editingEntry.id);

        if (error) throw error;
        toast.success("Entry updated successfully");
      } else {
        // Create
        const { error } = await supabase.from("ai_knowledge_base").insert({
          ...formData,
          source: "manual",
          times_matched: 0,
          times_applied: 0,
          created_by: session?.staffId,
          created_at: now,
          updated_at: now,
        });

        if (error) throw error;
        toast.success("Entry created successfully");
      }

      setShowModal(false);
      setEditingEntry(null);
      fetchEntries();
    } catch (err) {
      toast.error("Failed to save entry");
      console.error(err);
    }
  }

  async function toggleActive(entry: KnowledgeBaseEntry) {
    try {
      const { error } = await supabase
        .from("ai_knowledge_base")
        .update({
          is_active: !entry.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id);

      if (error) throw error;
      toast.success(`Entry ${entry.is_active ? "deactivated" : "activated"}`);
      fetchEntries();
    } catch (err) {
      toast.error("Failed to update entry");
    }
  }

  async function deleteEntry(id: string) {
    try {
      const { error } = await supabase.from("ai_knowledge_base").delete().eq("id", id);

      if (error) throw error;
      toast.success("Entry deleted");
      setDeleteConfirmEntry(null);
      fetchEntries();
    } catch (err) {
      toast.error("Failed to delete entry");
    }
  }

  if (authLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Brain className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">AI Knowledge Base</h1>
              <p className="text-sm text-gray-500">
                Manage rules and context for AI document analysis
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingEntry(null);
              setShowModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus className="w-5 h-5" />
            Add Entry
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-7xl mx-auto">
        {/* Stats Cards */}
        <StatsCards entries={allEntries} />

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            <select
              value={filters.entryType}
              onChange={(e) => setFilters({ ...filters, entryType: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="override">Override</option>
              <option value="context">Context</option>
            </select>

            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <div className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  placeholder="Search entries..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading entries...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Brain className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No entries found</h3>
            <p className="text-gray-500 mb-4">
              {filters.search || filters.category !== "all" || filters.entryType !== "all"
                ? "Try adjusting your filters"
                : "Get started by adding your first knowledge entry"}
            </p>
            {!filters.search && filters.category === "all" && filters.entryType === "all" && (
              <button
                onClick={() => {
                  setEditingEntry(null);
                  setShowModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                <Plus className="w-5 h-5" />
                Add Entry
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4">
                      Title
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4">
                      Type
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4">
                      Category
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4">
                      Conditions
                    </th>
                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4">
                      Priority
                    </th>
                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4">
                      Usage
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      languages={languages}
                      onEdit={() => {
                        setEditingEntry(entry);
                        setShowModal(true);
                      }}
                      onToggle={() => toggleActive(entry)}
                      onDelete={() => setDeleteConfirmEntry(entry)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Entry Modal */}
      {showModal && (
        <EntryModal
          entry={editingEntry}
          languages={languages}
          documentTypes={documentTypes}
          onSave={saveEntry}
          onClose={() => {
            setShowModal(false);
            setEditingEntry(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmEntry && (
        <DeleteConfirmModal
          entry={deleteConfirmEntry}
          onConfirm={() => deleteEntry(deleteConfirmEntry.id)}
          onCancel={() => setDeleteConfirmEntry(null)}
        />
      )}
    </div>
  );
}
