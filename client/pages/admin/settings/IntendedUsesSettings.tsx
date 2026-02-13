import React, { useState, useEffect } from "react";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsTable from "@/components/admin/settings/SettingsTable";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface CertificationType {
  id: string;
  name: string;
  price: number;
}

interface IntendedUse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_certification_type_id: string | null;
  is_active: boolean;
  sort_order: number;
  certification?: CertificationType;
}

export default function IntendedUsesSettings() {
  const [loading, setLoading] = useState(true);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<IntendedUse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch intended uses with certification join
      const { data: usesData, error: usesError } = await supabase
        .from("intended_uses")
        .select(
          `
          *,
          certification:certification_types(id, name, price)
        `,
        )
        .order("sort_order");

      if (usesError) throw usesError;

      // Fetch certification types for dropdown
      const { data: certsData, error: certsError } = await supabase
        .from("certification_types")
        .select("id, name, price")
        .eq("is_active", true)
        .order("sort_order");

      if (certsError) throw certsError;

      setIntendedUses(usesData || []);
      setCertificationTypes(certsData || []);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item: IntendedUse) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (item: IntendedUse) => {
    if (!confirm("Are you sure you want to delete this intended use?")) return;

    try {
      const { error: deleteError } = await supabase
        .from("intended_uses")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;

      toast.success("Intended use deleted successfully");
      fetchData();
    } catch (err) {
      console.error("Error deleting intended use:", err);
      toast.error("Failed to delete intended use");
    }
  };

  const handleSave = async (formData: Partial<IntendedUse>) => {
    try {
      if (editingItem?.id) {
        // Update
        const { error: updateError } = await supabase
          .from("intended_uses")
          .update({
            code: formData.code,
            name: formData.name,
            description: formData.description,
            default_certification_type_id:
              formData.default_certification_type_id || null,
            is_active: formData.is_active,
          })
          .eq("id", editingItem.id);

        if (updateError) throw updateError;
        toast.success("Intended use updated successfully");
      } else {
        // Insert - get max sort_order
        const { data: maxData } = await supabase
          .from("intended_uses")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1)
          .single();

        const nextSortOrder = (maxData?.sort_order || 0) + 1;

        const { error: insertError } = await supabase
          .from("intended_uses")
          .insert({
            code: formData.code,
            name: formData.name,
            description: formData.description,
            default_certification_type_id:
              formData.default_certification_type_id || null,
            is_active: formData.is_active ?? true,
            sort_order: nextSortOrder,
          });

        if (insertError) throw insertError;
        toast.success("Intended use added successfully");
      }

      setShowModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      console.error("Error saving intended use:", err);
      toast.error("Failed to save intended use");
      throw err;
    }
  };

  const formatCertification = (
    certification: CertificationType | undefined,
  ) => {
    if (!certification) return "None";
    const price =
      certification.price === 0 ? "FREE" : `$${certification.price.toFixed(2)}`;
    return `${certification.name} (${price})`;
  };

  const columns = [
    {
      key: "name",
      label: "Name",
      render: (item: IntendedUse) => item.name,
    },
    {
      key: "certification",
      label: "Default Certification",
      render: (item: IntendedUse) => formatCertification(item.certification),
    },
    {
      key: "is_active",
      label: "Active",
      render: (item: IntendedUse) => (
        <span className={item.is_active ? "text-green-600" : "text-gray-400"}>
          {item.is_active ? "✓" : "—"}
        </span>
      ),
    },
  ];

  const modalFields = [
    {
      name: "code",
      label: "Code",
      type: "text" as const,
      required: true,
      placeholder: "immigration_uscis",
      helperText: "Unique identifier (snake_case)",
    },
    {
      name: "name",
      label: "Name",
      type: "text" as const,
      required: true,
      placeholder: "Immigration (USCIS)",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea" as const,
      required: false,
      placeholder: "Optional description",
    },
    {
      name: "default_certification_type_id",
      label: "Default Certification",
      type: "select" as const,
      required: false,
      options: [
        { value: "", label: "None" },
        ...certificationTypes.map((cert) => ({
          value: cert.id,
          label: formatCertification(cert),
        })),
      ],
      helperText: "Automatically selected for this intended use",
    },
    {
      name: "is_active",
      label: "Active",
      type: "checkbox" as const,
      required: false,
    },
  ];

  return (
    <AdminSettingsLayout
      title="Intended Uses"
      description="Manage intended use categories with default certification mappings"
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Intended Uses" },
      ]}
      loading={loading}
      error={error}
      actions={
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-5 h-5"
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
          Add Intended Use
        </button>
      }
    >
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 mb-6">
        Intended uses determine the default certification type for quotes.
      </div>

      <SettingsTable
        columns={columns}
        data={intendedUses}
        onEdit={handleEdit}
        onDelete={handleDelete}
        emptyMessage="No intended uses configured. Click 'Add Intended Use' to create one."
        getRowKey={(item) => item.id}
      />

      {showModal && (
        <SettingsModal
          title={editingItem ? "Edit Intended Use" : "Add Intended Use"}
          fields={modalFields}
          initialData={
            editingItem || {
              code: "",
              name: "",
              description: "",
              default_certification_type_id: "",
              is_active: true,
            }
          }
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingItem(null);
          }}
        />
      )}
    </AdminSettingsLayout>
  );
}
