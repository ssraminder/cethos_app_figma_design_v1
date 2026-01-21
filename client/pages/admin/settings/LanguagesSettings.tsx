import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsTable from "@/components/admin/settings/SettingsTable";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface LanguageTier {
  id: string;
  name: string;
  multiplier: number;
}

interface Language {
  id: string;
  code: string;
  name: string;
  native_name: string | null;
  tier_id: string | null;
  is_source_available: boolean;
  is_target_available: boolean;
  is_active: boolean;
  sort_order: number;
  tier?: LanguageTier;
}

export default function LanguagesSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [filteredLanguages, setFilteredLanguages] = useState<Language[]>([]);
  const [tiers, setTiers] = useState<LanguageTier[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Language | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    fetchData();
  }, []);

  useEffect(() => {
    filterLanguages();
  }, [languages, searchQuery, filterTier]);

  const checkAuth = () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) {
      navigate("/admin/login");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch languages with tier join
      const { data: langsData, error: langsError } = await supabase
        .from("languages")
        .select(
          `
          *,
          tier:language_tiers(id, name, multiplier)
        `,
        )
        .order("sort_order");

      if (langsError) throw langsError;

      // Fetch tiers for dropdown
      const { data: tiersData, error: tiersError } = await supabase
        .from("language_tiers")
        .select("id, name, multiplier")
        .eq("is_active", true)
        .order("sort_order");

      if (tiersError) throw tiersError;

      setLanguages(langsData || []);
      setTiers(tiersData || []);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const filterLanguages = () => {
    let filtered = languages;

    if (filterTier !== "all") {
      filtered = filtered.filter((lang) => lang.tier_id === filterTier);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (lang) =>
          lang.code.toLowerCase().includes(query) ||
          lang.name.toLowerCase().includes(query) ||
          (lang.native_name && lang.native_name.toLowerCase().includes(query)),
      );
    }

    setFilteredLanguages(filtered);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item: Language) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this language?")) return;

    try {
      const { error: deleteError } = await supabase
        .from("languages")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast.success("Language deleted successfully");
      fetchData();
    } catch (err) {
      console.error("Error deleting language:", err);
      toast.error("Failed to delete language");
    }
  };

  const handleSave = async (formData: Partial<Language>) => {
    try {
      if (editingItem?.id) {
        // Update
        const { error: updateError } = await supabase
          .from("languages")
          .update({
            code: formData.code,
            name: formData.name,
            native_name: formData.native_name || null,
            tier_id: formData.tier_id || null,
            is_source_available: formData.is_source_available,
            is_target_available: formData.is_target_available,
            is_active: formData.is_active,
          })
          .eq("id", editingItem.id);

        if (updateError) throw updateError;
        toast.success("Language updated successfully");
      } else {
        // Insert - get max sort_order
        const { data: maxData } = await supabase
          .from("languages")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1)
          .single();

        const nextSortOrder = (maxData?.sort_order || 0) + 1;

        const { error: insertError } = await supabase.from("languages").insert({
          code: formData.code,
          name: formData.name,
          native_name: formData.native_name || null,
          tier_id: formData.tier_id || null,
          is_source_available: formData.is_source_available ?? false,
          is_target_available: formData.is_target_available ?? false,
          is_active: formData.is_active ?? true,
          sort_order: nextSortOrder,
        });

        if (insertError) throw insertError;
        toast.success("Language added successfully");
      }

      setShowModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      console.error("Error saving language:", err);
      toast.error("Failed to save language");
      throw err;
    }
  };

  const formatTier = (tier: LanguageTier | undefined) => {
    if (!tier) return "—";
    return `${tier.name} (${tier.multiplier.toFixed(2)}x)`;
  };

  const columns = [
    {
      key: "code",
      label: "Code",
      render: (lang: Language) => (
        <span className="font-mono text-sm">{lang.code}</span>
      ),
    },
    {
      key: "name",
      label: "Name",
      render: (lang: Language) => lang.name,
    },
    {
      key: "native_name",
      label: "Native",
      render: (lang: Language) => lang.native_name || "—",
    },
    {
      key: "tier",
      label: "Tier",
      render: (lang: Language) => formatTier(lang.tier),
    },
    {
      key: "is_source_available",
      label: "Source",
      render: (lang: Language) => (
        <span
          className={
            lang.is_source_available ? "text-green-600" : "text-gray-400"
          }
        >
          {lang.is_source_available ? "✓" : "—"}
        </span>
      ),
    },
    {
      key: "is_target_available",
      label: "Target",
      render: (lang: Language) => (
        <span
          className={
            lang.is_target_available ? "text-green-600" : "text-gray-400"
          }
        >
          {lang.is_target_available ? "✓" : "—"}
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
      placeholder: "sw",
      helperText: "ISO 639-1 code (2-3 letters)",
    },
    {
      name: "name",
      label: "Name",
      type: "text" as const,
      required: true,
      placeholder: "Swahili",
      helperText: "English name",
    },
    {
      name: "native_name",
      label: "Native Name",
      type: "text" as const,
      required: false,
      placeholder: "Kiswahili",
    },
    {
      name: "tier_id",
      label: "Tier",
      type: "select" as const,
      required: true,
      options: [
        { value: "", label: "— Select Tier —" },
        ...tiers.map((tier) => ({
          value: tier.id,
          label: formatTier(tier),
        })),
      ],
    },
    {
      name: "is_source_available",
      label: "Source Available",
      type: "checkbox" as const,
      required: false,
      helperText: "Can be used as source language",
    },
    {
      name: "is_target_available",
      label: "Target Available",
      type: "checkbox" as const,
      required: false,
      helperText: "Can be used as target language",
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
      title="Languages"
      description="Manage languages and assign them to pricing tiers"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Languages" },
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
          Add Language
        </button>
      }
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1">
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Tiers</option>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {formatTier(tier)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search code, name, or native name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <SettingsTable
          columns={columns}
          data={filteredLanguages}
          onEdit={handleEdit}
          onDelete={handleDelete}
          emptyMessage="No languages found. Adjust filters or click 'Add Language' to create one."
          getRowKey={(lang) => lang.id}
        />

        <div className="text-sm text-gray-600">
          Showing {filteredLanguages.length} of {languages.length} languages
        </div>
      </div>

      {showModal && (
        <SettingsModal
          title={editingItem ? "Edit Language" : "Add Language"}
          fields={modalFields}
          initialData={
            editingItem || {
              code: "",
              name: "",
              native_name: "",
              tier_id: "",
              is_source_available: false,
              is_target_available: false,
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
