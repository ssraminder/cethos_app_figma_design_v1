import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  GripVertical,
  DollarSign,
  EyeOff,
  Loader2,
} from "lucide-react";

interface FileCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_billable: boolean;
  is_active: boolean;
  display_order: number;
}

interface FormData {
  name: string;
  description: string;
  is_billable: boolean;
  is_active: boolean;
}

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .substring(0, 50);
};

export default function FileCategoriesSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<FileCategory[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<FileCategory | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    description: "",
    is_billable: false,
    is_active: true,
  });

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);

  useEffect(() => {
    checkAuth();
    fetchCategories();
  }, []);

  const checkAuth = () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) {
      navigate("/admin/login");
    }
  };

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("file_categories")
        .select("*")
        .order("display_order");

      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
      toast.error("Failed to load file categories");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing(null);
    setFormData({
      name: "",
      description: "",
      is_billable: false,
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (category: FileCategory) => {
    setEditing(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      is_billable: category.is_billable,
      is_active: category.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        // Update existing
        const { error } = await supabase
          .from("file_categories")
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            is_billable: formData.is_billable,
            is_active: formData.is_active,
          })
          .eq("id", editing.id);

        if (error) throw error;
        toast.success("Category updated successfully");
      } else {
        // Create new
        const maxOrder = Math.max(0, ...categories.map((c) => c.display_order));
        const slug = generateSlug(formData.name);

        // Check for duplicate slug
        const { data: existing } = await supabase
          .from("file_categories")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();

        if (existing) {
          toast.error("A category with this name already exists");
          setSaving(false);
          return;
        }

        const { error } = await supabase.from("file_categories").insert({
          name: formData.name.trim(),
          slug,
          description: formData.description.trim() || null,
          is_billable: formData.is_billable,
          is_active: formData.is_active,
          display_order: maxOrder + 1,
        });

        if (error) throw error;
        toast.success("Category created successfully");
      }

      setShowModal(false);
      fetchCategories();
    } catch (err: any) {
      console.error("Error saving category:", err);
      toast.error(err.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // Check if category is in use
      const { count, error: countError } = await supabase
        .from("quote_files")
        .select("id", { count: "exact", head: true })
        .eq("file_category_id", id);

      if (countError) {
        // If table doesn't have the column yet, proceed with delete
        if (!countError.message.includes("file_category_id")) {
          throw countError;
        }
      }

      if (count && count > 0) {
        toast.error(`Cannot delete: ${count} file(s) using this category`);
        setDeleteConfirm(null);
        return;
      }

      const { error } = await supabase
        .from("file_categories")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Category deleted successfully");
      setDeleteConfirm(null);
      fetchCategories();
    } catch (err: any) {
      console.error("Error deleting category:", err);
      toast.error(err.message || "Failed to delete category");
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id);
    draggedRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    // Add a small delay to set the drag image
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = "0.5";
    }, 0);
  };

  const handleDragEnd = async (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    setDraggedItem(null);
    setDragOverItem(null);

    // Only save if we actually dragged somewhere
    if (!draggedRef.current) return;
    draggedRef.current = null;

    // Save new order to database
    try {
      const updates = categories.map((cat, index) => ({
        id: cat.id,
        display_order: index + 1,
      }));

      for (const update of updates) {
        await supabase
          .from("file_categories")
          .update({ display_order: update.display_order })
          .eq("id", update.id);
      }

      toast.success("Order updated");
    } catch (err) {
      console.error("Error updating order:", err);
      toast.error("Failed to update order");
      fetchCategories(); // Revert on error
    }
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    setDragOverItem(targetId);

    const draggedIndex = categories.findIndex((c) => c.id === draggedItem);
    const targetIndex = categories.findIndex((c) => c.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder the array
    const newCategories = [...categories];
    const [removed] = newCategories.splice(draggedIndex, 1);
    newCategories.splice(targetIndex, 0, removed);

    setCategories(newCategories);
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const actions = (
    <button
      onClick={handleAdd}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
    >
      + Add Category
    </button>
  );

  return (
    <AdminSettingsLayout
      title="File Categories"
      description="Categorize uploaded files in manual quotes"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "File Categories" },
      ]}
      actions={actions}
      loading={loading}
    >
      <SettingsCard
        title="File Categories"
        description="Drag to reorder categories. Billable files are priced and analyzed by AI."
      >
        {categories.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No file categories defined. Click "Add Category" to create one.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {categories.map((category) => (
              <div
                key={category.id}
                draggable
                onDragStart={(e) => handleDragStart(e, category.id)}
                onDragOver={(e) => handleDragOver(e, category.id)}
                onDragEnd={handleDragEnd}
                onDragLeave={handleDragLeave}
                className={`px-4 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-grab active:cursor-grabbing ${
                  draggedItem === category.id ? "opacity-50 bg-blue-50" : ""
                } ${dragOverItem === category.id ? "border-t-2 border-blue-500" : ""} ${
                  !category.is_active ? "opacity-60" : ""
                }`}
              >
                {/* Drag Handle */}
                <div className="text-gray-400 hover:text-gray-600">
                  <GripVertical className="w-5 h-5" />
                </div>

                {/* Category Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">
                      {category.name}
                    </span>
                    {category.is_billable && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                        <DollarSign className="w-3 h-3" />
                        Billable
                      </span>
                    )}
                    {!category.is_active && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        <EyeOff className="w-3 h-3" />
                        Inactive
                      </span>
                    )}
                  </div>
                  {category.description && (
                    <p className="text-sm text-gray-500 truncate mt-0.5">
                      {category.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="px-3 py-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded text-sm font-medium"
                  >
                    Edit
                  </button>

                  {deleteConfirm === category.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(category.id)}
                        className="px-3 py-1.5 text-white bg-red-500 hover:bg-red-600 rounded text-sm font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(category.id)}
                      className="px-3 py-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded text-sm font-medium"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <strong>Billable categories:</strong> Files in billable categories are
          analyzed by AI and included in pricing calculations. Non-billable
          files are reference materials only.
        </div>
      </SettingsCard>

      {/* Add/Edit Modal */}
      <SettingsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit File Category" : "Add File Category"}
        onSave={handleSave}
        saving={saving}
        saveLabel={editing ? "Update Category" : "Save Category"}
      >
        <div className="space-y-4">
          <SettingsInput
            label="Name"
            value={formData.name}
            onChange={(val) => setFormData({ ...formData, name: val })}
            placeholder="e.g., To Translate"
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
              placeholder="e.g., Documents requiring certified translation"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_billable}
                onChange={(e) =>
                  setFormData({ ...formData, is_billable: e.target.checked })
                }
                className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">
                  Billable
                </span>
                <p className="text-xs text-gray-500">
                  Files in this category will be priced and can be analyzed by AI
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Active</span>
                <p className="text-xs text-gray-500">
                  Show this category in dropdown menus
                </p>
              </div>
            </label>
          </div>
        </div>
      </SettingsModal>
    </AdminSettingsLayout>
  );
}
