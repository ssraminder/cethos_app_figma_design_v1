import React, { useState, useEffect, useCallback } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsModal from "@/components/admin/settings/SettingsModal";

interface Service {
  id: string;
  code: string;
  name: string;
  name_fr: string | null;
  description: string | null;
  category: string;
  default_calculation_units: string[];
  customer_facing: boolean;
  vendor_facing: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ServiceFormData {
  name: string;
  name_fr: string;
  code: string;
  description: string;
  category: string;
  default_calculation_units: string[];
  sort_order: number;
  customer_facing: boolean;
  vendor_facing: boolean;
  is_active: boolean;
}

const categories = [
  { value: "all", label: "All" },
  { value: "translation", label: "Translation" },
  { value: "review_qa", label: "Review & QA" },
  { value: "interpretation", label: "Interpretation" },
  { value: "multimedia", label: "Multimedia" },
  { value: "technology", label: "Technology" },
  { value: "other", label: "Other" },
];

const categoryOptions = categories.filter((c) => c.value !== "all");

const unitLabels: Record<string, string> = {
  per_word: "wd",
  per_page: "pg",
  per_hour: "hr",
  per_project: "proj",
  flat_rate: "flat",
};

const unitOptions = [
  { value: "per_word", label: "Per Word" },
  { value: "per_page", label: "Per Page" },
  { value: "per_hour", label: "Per Hour" },
  { value: "per_project", label: "Per Project" },
  { value: "flat_rate", label: "Flat Rate" },
];

const defaultFormData: ServiceFormData = {
  name: "",
  name_fr: "",
  code: "",
  description: "",
  category: "",
  default_calculation_units: [],
  sort_order: 0,
  customer_facing: true,
  vendor_facing: true,
  is_active: true,
};

function generateCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function ServicesSettings() {
  const [services, setServices] = useState<Service[]>([]);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Service | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("services")
        .select("*")
        .order("category")
        .order("sort_order")
        .order("name");

      if (fetchError) throw fetchError;
      setServices(data || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching services:", err);
      setError(err instanceof Error ? err.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    if (selectedCategory === "all") {
      setFilteredServices(services);
    } else {
      setFilteredServices(
        services.filter((s) => s.category === selectedCategory),
      );
    }
  }, [services, selectedCategory]);

  const getCategoryCount = (categoryValue: string): number => {
    if (categoryValue === "all") return services.length;
    return services.filter((s) => s.category === categoryValue).length;
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData(defaultFormData);
    setFormErrors({});
    setShowModal(true);
  };

  const handleEdit = (service: Service) => {
    setEditingItem(service);
    setFormData({
      name: service.name,
      name_fr: service.name_fr || "",
      code: service.code,
      description: service.description || "",
      category: service.category,
      default_calculation_units: service.default_calculation_units || [],
      sort_order: service.sort_order,
      customer_facing: service.customer_facing,
      vendor_facing: service.vendor_facing,
      is_active: service.is_active,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleFormChange = (field: keyof ServiceFormData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Auto-generate code from name in add mode
      if (field === "name" && !editingItem) {
        updated.code = generateCode(value);
      }
      return updated;
    });
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleUnitToggle = (unit: string) => {
    setFormData((prev) => {
      const units = prev.default_calculation_units.includes(unit)
        ? prev.default_calculation_units.filter((u) => u !== unit)
        : [...prev.default_calculation_units, unit];
      return { ...prev, default_calculation_units: units };
    });
    if (formErrors.default_calculation_units) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.default_calculation_units;
        return next;
      });
    }
  };

  const validate = async (): Promise<boolean> => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    if (!formData.code.trim()) {
      errors.code = "Code is required";
    } else if (!/^[a-z][a-z0-9_]*$/.test(formData.code)) {
      errors.code =
        "Code must start with a letter and contain only lowercase letters, numbers, and underscores";
    } else {
      // Uniqueness check
      const query = supabase
        .from("services")
        .select("id")
        .eq("code", formData.code);

      if (editingItem) {
        query.neq("id", editingItem.id);
      }

      const { data: existing } = await query;
      if (existing && existing.length > 0) {
        errors.code = "A service with this code already exists";
      }
    }

    if (!formData.category) {
      errors.category = "Category is required";
    }

    if (formData.default_calculation_units.length === 0) {
      errors.default_calculation_units =
        "At least one calculation unit is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    const isValid = await validate();
    if (!isValid) return;

    setSaving(true);
    try {
      if (editingItem) {
        const { error: updateError } = await supabase
          .from("services")
          .update({
            name: formData.name.trim(),
            name_fr: formData.name_fr.trim() || null,
            description: formData.description.trim() || null,
            category: formData.category,
            default_calculation_units: formData.default_calculation_units,
            customer_facing: formData.customer_facing,
            vendor_facing: formData.vendor_facing,
            sort_order: formData.sort_order,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingItem.id)
          .select()
          .single();

        if (updateError) throw updateError;
        toast.success("Service updated successfully");
      } else {
        const { error: insertError } = await supabase
          .from("services")
          .insert({
            code: formData.code.trim(),
            name: formData.name.trim(),
            name_fr: formData.name_fr.trim() || null,
            description: formData.description.trim() || null,
            category: formData.category,
            default_calculation_units: formData.default_calculation_units,
            customer_facing: formData.customer_facing,
            vendor_facing: formData.vendor_facing,
            sort_order: formData.sort_order,
            is_active: formData.is_active,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        toast.success("Service added successfully");
      }

      setShowModal(false);
      setEditingItem(null);
      fetchServices();
    } catch (err) {
      console.error("Error saving service:", err);
      toast.error("Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminSettingsLayout
      title="Services"
      description="Manage translation and language services used across vendor rates and workflows."
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Services" },
      ]}
      loading={loading}
      error={error}
      actions={
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
        >
          + Add Service
        </button>
      }
    >
      <div className="space-y-6">
        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {cat.label} ({getCategoryCount(cat.value)})
            </button>
          ))}
        </div>

        {/* Services Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Units
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Flags
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-sm text-gray-500"
                    >
                      No services found
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service) => (
                    <tr key={service.id} className="hover:bg-gray-50">
                      {/* Name */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={
                            service.is_active
                              ? "font-semibold text-gray-900"
                              : "text-gray-400"
                          }
                        >
                          {service.name}
                        </span>
                        {!service.is_active && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                            Inactive
                          </span>
                        )}
                      </td>
                      {/* Code */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className="font-mono text-gray-600 truncate max-w-[180px] inline-block"
                          title={service.code}
                        >
                          {service.code}
                        </span>
                      </td>
                      {/* Units */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-1">
                          {(service.default_calculation_units || []).map(
                            (unit) => (
                              <span
                                key={unit}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                              >
                                {unitLabels[unit] || unit}
                              </span>
                            ),
                          )}
                        </div>
                      </td>
                      {/* Flags */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-1">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              service.customer_facing
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            C
                          </span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              service.vendor_facing
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            V
                          </span>
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => handleEdit(service)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit service"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Count */}
        <div className="text-sm text-gray-600">
          Showing {filteredServices.length} of {services.length} services
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <SettingsModal
          title={editingItem ? "Edit Service" : "Add Service"}
          onClose={() => {
            setShowModal(false);
            setEditingItem(null);
          }}
          onSave={handleSave}
          saving={saving}
          saveLabel="Save Service"
        >
          <div className="space-y-4">
            {/* Name (English) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name (English) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleFormChange("name", e.target.value)}
                placeholder="e.g. Certified Translation"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formErrors.name && (
                <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>
              )}
            </div>

            {/* Name (French) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name (French)
              </label>
              <input
                type="text"
                value={formData.name_fr}
                onChange={(e) => handleFormChange("name_fr", e.target.value)}
                placeholder="e.g. Traduction certifiée"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              {editingItem ? (
                <div
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 font-mono text-sm text-gray-600 cursor-not-allowed"
                  title="Code cannot be changed after creation"
                >
                  {formData.code}
                </div>
              ) : (
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleFormChange("code", e.target.value)}
                  placeholder="e.g. certified_translation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              )}
              <p className="text-xs text-gray-500 mt-1">
                {editingItem
                  ? "Code cannot be changed after creation."
                  : "Lowercase, underscores only. Auto-generated from name."}
              </p>
              {formErrors.code && (
                <p className="text-xs text-red-600 mt-1">{formErrors.code}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  handleFormChange("description", e.target.value)
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleFormChange("category", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select category —</option>
                {categoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {formErrors.category && (
                <p className="text-xs text-red-600 mt-1">
                  {formErrors.category}
                </p>
              )}
            </div>

            {/* Calculation Units */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Calculation Units <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Select all that apply
              </p>
              <div className="flex flex-wrap gap-3">
                {unitOptions.map((unit) => (
                  <label
                    key={unit.value}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={formData.default_calculation_units.includes(
                        unit.value,
                      )}
                      onChange={() => handleUnitToggle(unit.value)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    {unit.label}
                  </label>
                ))}
              </div>
              {formErrors.default_calculation_units && (
                <p className="text-xs text-red-600 mt-1">
                  {formErrors.default_calculation_units}
                </p>
              )}
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort Order
              </label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) =>
                  handleFormChange("sort_order", parseInt(e.target.value) || 0)
                }
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.customer_facing}
                  onChange={(e) =>
                    handleFormChange("customer_facing", e.target.checked)
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                Customer Facing
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.vendor_facing}
                  onChange={(e) =>
                    handleFormChange("vendor_facing", e.target.checked)
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                Vendor Facing
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) =>
                    handleFormChange("is_active", e.target.checked)
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                Active
              </label>
            </div>
          </div>
        </SettingsModal>
      )}
    </AdminSettingsLayout>
  );
}
