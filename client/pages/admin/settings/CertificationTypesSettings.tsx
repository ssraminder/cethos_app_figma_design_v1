import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsTable, { Column } from "@/components/admin/settings/SettingsTable";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface CertificationType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export default function CertificationTypesSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CertificationType[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CertificationType | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    price: 0,
    is_default: false,
    is_active: true,
  });

  useEffect(() => {
    checkAuth();
    fetchData();
  }, []);

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
        .from("certification_types")
        .select("*")
        .order("sort_order");

      if (error) throw error;
      setData(types || []);
    } catch (err) {
      console.error("Error fetching certification types:", err);
      toast.error("Failed to load certification types");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      price: 0,
      is_default: false,
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (item: CertificationType) => {
    setEditing(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || "",
      price: item.price,
      is_default: item.is_default,
      is_active: item.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error("Code and name are required");
      return;
    }

    if (formData.price < 0) {
      toast.error("Price cannot be negative");
      return;
    }

    setSaving(true);
    try {
      // If setting as default, unset other defaults first
      if (formData.is_default) {
        await supabase
          .from("certification_types")
          .update({ is_default: false })
          .neq("id", editing?.id || "");
      }

      if (editing) {
        // Update
        const { error } = await supabase
          .from("certification_types")
          .update({
            name: formData.name,
            description: formData.description || null,
            price: formData.price,
            is_default: formData.is_default,
            is_active: formData.is_active,
          })
          .eq("id", editing.id);

        if (error) throw error;
        toast.success("Certification type updated successfully");
      } else {
        // Create
        const { error } = await supabase
          .from("certification_types")
          .insert({
            code: formData.code,
            name: formData.name,
            description: formData.description || null,
            price: formData.price,
            is_default: formData.is_default,
            is_active: formData.is_active,
            sort_order: data.length,
          });

        if (error) throw error;
        toast.success("Certification type created successfully");
      }

      setShowModal(false);
      fetchData();
    } catch (err: any) {
      console.error("Error saving certification type:", err);
      toast.error(err.message || "Failed to save certification type");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CertificationType) => {
    if (item.is_default) {
      toast.error("Cannot delete the default certification type");
      return;
    }

    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("certification_types")
        .delete()
        .eq("id", item.id);

      if (error) throw error;
      toast.success("Certification type deleted successfully");
      fetchData();
    } catch (err: any) {
      console.error("Error deleting certification type:", err);
      toast.error(err.message || "Failed to delete certification type");
    }
  };

  const columns: Column<CertificationType>[] = [
    {
      key: "name",
      label: "Name",
      render: (item) => (
        <div className="font-medium text-gray-900">{item.name}</div>
      ),
    },
    {
      key: "price",
      label: "Price",
      render: (item) => (
        <span className="font-medium">
          {item.price === 0 ? "FREE" : `$${item.price.toFixed(2)}`}
        </span>
      ),
    },
    {
      key: "is_default",
      label: "Default",
      render: (item) =>
        item.is_default ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Default
          </span>
        ) : (
          <span className="text-gray-400">−</span>
        ),
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
      + Add Certification
    </button>
  );

  return (
    <AdminSettingsLayout
      title="Certification Types"
      description="Manage certification types with pricing"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings" },
        { label: "Certifications" },
      ]}
      actions={actions}
      loading={loading}
    >
      <SettingsCard
        title="Certification Types"
        description="Certifications are added to each document in a quote"
      >
        <SettingsTable
          columns={columns}
          data={data}
          onEdit={handleEdit}
          onDelete={handleDelete}
          getRowKey={(item) => item.id}
          emptyMessage="No certification types found"
        />

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          ℹ️ One certification must be marked as default (used when no specific
          certification is required).
        </div>
      </SettingsCard>

      {/* Add/Edit Modal */}
      <SettingsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit Certification Type" : "Add Certification Type"}
        onSave={handleSave}
        saving={saving}
        saveLabel={editing ? "Update Certification" : "Save Certification"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SettingsInput
              label="Code"
              value={formData.code}
              onChange={(val) => setFormData({ ...formData, code: val })}
              placeholder="notarization"
              helperText="Unique identifier (snake_case)"
              required
              disabled={!!editing}
            />

            <SettingsInput
              label="Name"
              value={formData.name}
              onChange={(val) => setFormData({ ...formData, name: val })}
              placeholder="Notarization"
              required
            />
          </div>

          <SettingsInput
            label="Price"
            value={formData.price}
            onChange={(val) =>
              setFormData({ ...formData, price: parseFloat(val) || 0 })
            }
            type="number"
            step={0.01}
            min={0}
            suffix="$"
            helperText="Set to 0 for free certifications"
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

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={formData.is_default}
                onChange={(e) =>
                  setFormData({ ...formData, is_default: e.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="is_default"
                className="text-sm font-medium text-gray-700"
              >
                Set as default certification
              </label>
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
        </div>
      </SettingsModal>
    </AdminSettingsLayout>
  );
}
