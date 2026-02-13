import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsTable, {
  Column,
} from "@/components/admin/settings/SettingsTable";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface DocumentType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  typical_complexity: "easy" | "medium" | "hard";
  is_active: boolean;
  sort_order: number;
}

const complexityBadges = {
  easy: { label: "Easy", color: "bg-green-100 text-green-800", icon: "🟢" },
  medium: {
    label: "Medium",
    color: "bg-yellow-100 text-yellow-800",
    icon: "🟡",
  },
  hard: { label: "Hard", color: "bg-red-100 text-red-800", icon: "🔴" },
};

export default function DocumentTypesSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DocumentType[]>([]);
  const [filteredData, setFilteredData] = useState<DocumentType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [complexityFilter, setComplexityFilter] = useState<string>("all");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    typical_complexity: "medium" as "easy" | "medium" | "hard",
    is_active: true,
  });

  useEffect(() => {
    checkAuth();
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [data, searchTerm, complexityFilter]);

  const checkAuth = () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) {
      navigate("/admin/login");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: types, error } = await supabase
        .from("document_types")
        .select("*")
        .order("sort_order");

      if (error) throw error;
      setData(types || []);
    } catch (err) {
      console.error("Error fetching document types:", err);
      toast.error("Failed to load document types");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...data];

    if (searchTerm) {
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.code.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    if (complexityFilter !== "all") {
      filtered = filtered.filter(
        (item) => item.typical_complexity === complexityFilter,
      );
    }

    setFilteredData(filtered);
  };

  const handleAdd = () => {
    setEditing(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      typical_complexity: "medium",
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (item: DocumentType) => {
    setEditing(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || "",
      typical_complexity: item.typical_complexity,
      is_active: item.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error("Code and name are required");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        // Update
        const { error } = await supabase
          .from("document_types")
          .update({
            name: formData.name,
            description: formData.description || null,
            typical_complexity: formData.typical_complexity,
            is_active: formData.is_active,
          })
          .eq("id", editing.id);

        if (error) throw error;
        toast.success("Document type updated successfully");
      } else {
        // Create
        const { error } = await supabase.from("document_types").insert({
          code: formData.code,
          name: formData.name,
          description: formData.description || null,
          typical_complexity: formData.typical_complexity,
          is_active: formData.is_active,
          sort_order: data.length,
        });

        if (error) throw error;
        toast.success("Document type created successfully");
      }

      setShowModal(false);
      fetchData();
    } catch (err: any) {
      console.error("Error saving document type:", err);
      toast.error(err.message || "Failed to save document type");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: DocumentType) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("document_types")
        .delete()
        .eq("id", item.id);

      if (error) throw error;
      toast.success("Document type deleted successfully");
      fetchData();
    } catch (err: any) {
      console.error("Error deleting document type:", err);
      toast.error(err.message || "Failed to delete document type");
    }
  };

  const columns: Column<DocumentType>[] = [
    {
      key: "name",
      label: "Name",
      render: (item) => (
        <div className="font-medium text-gray-900">{item.name}</div>
      ),
    },
    {
      key: "typical_complexity",
      label: "Typical Complexity",
      render: (item) => {
        const badge = complexityBadges[item.typical_complexity];
        return (
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${badge.color}`}
          >
            <span>{badge.icon}</span>
            {badge.label}
          </span>
        );
      },
    },
    {
      key: "is_active",
      label: "Active",
      render: (item) =>
        item.is_active ? (
          <span className="text-green-600">✓</span>
        ) : (
          <span className="text-gray-400">−</span>
        ),
    },
  ];

  const actions = (
    <button
      onClick={handleAdd}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
    >
      + Add Document Type
    </button>
  );

  return (
    <AdminSettingsLayout
      title="Document Types"
      description="Manage document categories with typical complexity assignments"
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Settings" },
        { label: "Document Types" },
      ]}
      actions={actions}
      loading={loading}
    >
      <SettingsCard
        title="Document Types"
        description="Document types are used for classification and help determine typical complexity for pricing"
      >
        {/* Filters */}
        <div className="mb-4 flex gap-4">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={complexityFilter}
            onChange={(e) => setComplexityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Complexities</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        {/* Table */}
        <SettingsTable
          columns={columns}
          data={filteredData}
          onEdit={handleEdit}
          onDelete={handleDelete}
          getRowKey={(item) => item.id}
          emptyMessage="No document types found"
        />

        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredData.length} of {data.length} document types
        </div>
      </SettingsCard>

      {/* Add/Edit Modal */}
      <SettingsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit Document Type" : "Add Document Type"}
        onSave={handleSave}
        saving={saving}
        saveLabel={editing ? "Update Document Type" : "Save Document Type"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SettingsInput
              label="Code"
              value={formData.code}
              onChange={(val) => setFormData({ ...formData, code: val })}
              placeholder="birth_certificate"
              helperText="Unique identifier (snake_case)"
              required
              disabled={!!editing}
            />

            <SettingsInput
              label="Name"
              value={formData.name}
              onChange={(val) => setFormData({ ...formData, name: val })}
              placeholder="Birth Certificate"
              required
            />
          </div>

          <SettingsInput
            label="Typical Complexity"
            value={formData.typical_complexity}
            onChange={(val) =>
              setFormData({
                ...formData,
                typical_complexity: val as "easy" | "medium" | "hard",
              })
            }
            type="select"
            options={[
              { value: "easy", label: "Easy" },
              { value: "medium", label: "Medium" },
              { value: "hard", label: "Hard" },
            ]}
            helperText="Default complexity when AI cannot determine"
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Optional description"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="is_active"
              className="text-sm font-medium text-gray-700"
            >
              Active
            </label>
          </div>
        </div>
      </SettingsModal>
    </AdminSettingsLayout>
  );
}
