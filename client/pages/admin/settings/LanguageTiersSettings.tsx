import React, { useState, useEffect } from "react";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsTable from "@/components/admin/settings/SettingsTable";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAdminAuth } from "@/context/AdminAuthContext";

interface LanguageTier {
  id: string;
  code: string;
  name: string;
  multiplier: number;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  language_count?: number;
}

export default function LanguageTiersSettings() {
  const { session } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState<LanguageTier[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LanguageTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTiers();
  }, []);

  const fetchTiers = async () => {
    setLoading(true);
    try {
      // Fetch tiers
      const { data: tiersData, error: tiersError } = await supabase
        .from("language_tiers")
        .select("*")
        .order("sort_order");

      if (tiersError) throw tiersError;

      // Fetch language counts for each tier
      const tiersWithCounts = await Promise.all(
        (tiersData || []).map(async (tier) => {
          const { count } = await supabase
            .from("languages")
            .select("*", { count: "exact", head: true })
            .eq("tier_id", tier.id);

          return {
            ...tier,
            language_count: count || 0,
          };
        }),
      );

      setTiers(tiersWithCounts);
    } catch (err) {
      console.error("Error fetching tiers:", err);
      setError(err instanceof Error ? err.message : "Failed to load tiers");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item: LanguageTier) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    // Check language count first
    const tier = tiers.find((t) => t.id === id);
    if (tier && tier.language_count && tier.language_count > 0) {
      toast.error(
        `Cannot delete tier with ${tier.language_count} languages assigned. Reassign languages first.`,
      );
      return;
    }

    if (!confirm("Are you sure you want to delete this language tier?")) return;

    try {
      const { error: deleteError } = await supabase
        .from("language_tiers")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast.success("Language tier deleted successfully");
      fetchTiers();
    } catch (err) {
      console.error("Error deleting tier:", err);
      toast.error("Failed to delete language tier");
    }
  };

  const handleSave = async (formData: Partial<LanguageTier>) => {
    try {
      if (editingItem?.id) {
        // Update
        const { error: updateError } = await supabase
          .from("language_tiers")
          .update({
            code: formData.code,
            name: formData.name,
            multiplier: formData.multiplier,
            description: formData.description,
            is_active: formData.is_active,
          })
          .eq("id", editingItem.id);

        if (updateError) throw updateError;
        toast.success("Language tier updated successfully");
      } else {
        // Insert - get max sort_order
        const { data: maxData } = await supabase
          .from("language_tiers")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1)
          .single();

        const nextSortOrder = (maxData?.sort_order || 0) + 1;

        const { error: insertError } = await supabase
          .from("language_tiers")
          .insert({
            code: formData.code,
            name: formData.name,
            multiplier: formData.multiplier,
            description: formData.description,
            is_active: formData.is_active ?? true,
            sort_order: nextSortOrder,
          });

        if (insertError) throw insertError;
        toast.success("Language tier added successfully");
      }

      setShowModal(false);
      setEditingItem(null);
      fetchTiers();
    } catch (err) {
      console.error("Error saving tier:", err);
      toast.error("Failed to save language tier");
      throw err;
    }
  };

  const columns = [
    {
      key: "name",
      label: "Tier Name",
      render: (tier: LanguageTier) => tier.name,
    },
    {
      key: "multiplier",
      label: "Multiplier",
      render: (tier: LanguageTier) => `${tier.multiplier.toFixed(2)}x`,
    },
    {
      key: "language_count",
      label: "Languages",
      render: (tier: LanguageTier) =>
        `${tier.language_count || 0} ${tier.language_count === 1 ? "language" : "languages"}`,
    },
    {
      key: "is_active",
      label: "Active",
      render: (tier: LanguageTier) => (
        <span className={tier.is_active ? "text-green-600" : "text-gray-400"}>
          {tier.is_active ? "✓" : "—"}
        </span>
      ),
    },
  ];

  const modalFields = [
    {
      name: "name",
      label: "Name",
      type: "text" as const,
      required: true,
      placeholder: "Tier 4 - Ultra Rare",
    },
    {
      name: "code",
      label: "Code",
      type: "text" as const,
      required: true,
      placeholder: "tier_4",
      helperText: "Unique identifier (snake_case)",
    },
    {
      name: "multiplier",
      label: "Multiplier",
      type: "number" as const,
      required: true,
      step: 0.1,
      min: 1.0,
      placeholder: "1.60",
      helperText: "Must be >= 1.00",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea" as const,
      required: false,
      placeholder: "Extremely rare languages",
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
      title="Language Tiers"
      description="Manage language pricing tiers with configurable multipliers"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Language Tiers" },
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
          Add Tier
        </button>
      }
    >
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          Language tiers determine pricing multipliers. The multiplier from the
          higher tier (source or target) is applied to pricing.
        </div>

        <SettingsTable
          columns={columns}
          data={tiers}
          onEdit={handleEdit}
          onDelete={handleDelete}
          emptyMessage="No language tiers configured. Click 'Add Tier' to create one."
          getRowKey={(tier) => tier.id}
        />

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
          <p className="font-medium mb-1">Pricing Formula</p>
          <p>ℹ️ Pricing = Base Rate × Language Multiplier × Complexity</p>
          <p className="text-xs mt-2 text-gray-600">
            Example: $65 × 1.20 (Tier 2) × 1.15 (Medium) = $89.70/page
          </p>
        </div>
      </div>

      {showModal && (
        <SettingsModal
          title={editingItem ? "Edit Language Tier" : "Add Language Tier"}
          fields={modalFields}
          initialData={
            editingItem || {
              code: "",
              name: "",
              multiplier: 1.0,
              description: "",
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
