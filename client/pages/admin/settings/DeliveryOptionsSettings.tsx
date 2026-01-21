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

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  estimated_days: number;
  is_physical: boolean;
  requires_address: boolean;
  delivery_group: "digital" | "physical";
  delivery_type: "online" | "email" | "ship" | "pickup";
  is_default_selected: boolean;
  is_active: boolean;
  sort_order: number;
}

const deliveryTypeIcons: Record<string, string> = {
  online: "💻",
  email: "📧",
  ship: "📦",
  pickup: "📍",
};

export default function DeliveryOptionsSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DeliveryOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<DeliveryOption | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    price: 0,
    estimated_days: 0,
    delivery_group: "physical" as "digital" | "physical",
    delivery_type: "ship" as "online" | "email" | "ship" | "pickup",
    requires_address: false,
    is_default_selected: false,
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
      const { data: options, error } = await supabase
        .from("delivery_options")
        .select("*")
        .order("delivery_group", { ascending: false })
        .order("sort_order");

      if (error) throw error;
      setData(options || []);
    } catch (err) {
      console.error("Error fetching delivery options:", err);
      toast.error("Failed to load delivery options");
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
      estimated_days: 0,
      delivery_group: "physical",
      delivery_type: "ship",
      requires_address: false,
      is_default_selected: false,
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (item: DeliveryOption) => {
    setEditing(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || "",
      price: item.price,
      estimated_days: item.estimated_days,
      delivery_group: item.delivery_group,
      delivery_type: item.delivery_type,
      requires_address: item.requires_address,
      is_default_selected: item.is_default_selected,
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
      const is_physical = formData.delivery_group === "physical";
      const requires_address = formData.delivery_type === "ship";

      if (editing) {
        const { error } = await supabase
          .from("delivery_options")
          .update({
            name: formData.name,
            description: formData.description || null,
            price: formData.price,
            estimated_days: formData.estimated_days,
            delivery_group: formData.delivery_group,
            delivery_type: formData.delivery_type,
            is_physical,
            requires_address,
            is_default_selected: formData.is_default_selected,
            is_active: formData.is_active,
          })
          .eq("id", editing.id);

        if (error) throw error;
        toast.success("Delivery option updated successfully");
      } else {
        const { error } = await supabase.from("delivery_options").insert({
          code: formData.code,
          name: formData.name,
          description: formData.description || null,
          price: formData.price,
          estimated_days: formData.estimated_days,
          delivery_group: formData.delivery_group,
          delivery_type: formData.delivery_type,
          is_physical,
          requires_address,
          is_default_selected: formData.is_default_selected,
          is_active: formData.is_active,
          sort_order: data.filter(
            (d) => d.delivery_group === formData.delivery_group,
          ).length,
        });

        if (error) throw error;
        toast.success("Delivery option created successfully");
      }

      setShowModal(false);
      fetchData();
    } catch (err: any) {
      console.error("Error saving delivery option:", err);
      toast.error(err.message || "Failed to save delivery option");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: DeliveryOption) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("delivery_options")
        .delete()
        .eq("id", item.id);

      if (error) throw error;
      toast.success("Delivery option deleted successfully");
      fetchData();
    } catch (err: any) {
      console.error("Error deleting delivery option:", err);
      toast.error(err.message || "Failed to delete delivery option");
    }
  };

  const digitalOptions = data.filter((d) => d.delivery_group === "digital");
  const physicalOptions = data.filter((d) => d.delivery_group === "physical");

  const createColumns = (): Column<DeliveryOption>[] => [
    {
      key: "name",
      label: "Name",
      render: (item) => (
        <div className="flex items-center gap-2">
          <span>{deliveryTypeIcons[item.delivery_type]}</span>
          <span className="font-medium text-gray-900">{item.name}</span>
        </div>
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
      key: "delivery_type",
      label: "Type",
      render: (item) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
          {item.delivery_type}
        </span>
      ),
    },
    {
      key: "is_default_selected",
      label: "Default",
      render: (item) =>
        item.is_default_selected ? (
          <span className="text-blue-600">✓</span>
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
      + Add Option
    </button>
  );

  return (
    <AdminSettingsLayout
      title="Delivery Options"
      description="Manage digital and physical delivery methods"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings" },
        { label: "Delivery" },
      ]}
      actions={actions}
      loading={loading}
    >
      <div className="space-y-6">
        {/* Digital Delivery */}
        <SettingsCard
          title="DIGITAL DELIVERY"
          description="Customers can select multiple digital options"
        >
          <SettingsTable
            columns={createColumns()}
            data={digitalOptions}
            onEdit={handleEdit}
            onDelete={handleDelete}
            getRowKey={(item) => item.id}
            emptyMessage="No digital delivery options found"
          />
        </SettingsCard>

        {/* Physical Delivery */}
        <SettingsCard
          title="PHYSICAL DELIVERY"
          description="Customers can select ONE physical option (or none)"
        >
          <SettingsTable
            columns={createColumns()}
            data={physicalOptions}
            onEdit={handleEdit}
            onDelete={handleDelete}
            getRowKey={(item) => item.id}
            emptyMessage="No physical delivery options found"
          />
        </SettingsCard>
      </div>

      {/* Add/Edit Modal */}
      <SettingsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit Delivery Option" : "Add Delivery Option"}
        onSave={handleSave}
        saving={saving}
        saveLabel={editing ? "Update Option" : "Save Option"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SettingsInput
              label="Code"
              value={formData.code}
              onChange={(val) => setFormData({ ...formData, code: val })}
              placeholder="regular_post"
              helperText="Unique identifier (snake_case)"
              required
              disabled={!!editing}
            />

            <SettingsInput
              label="Name"
              value={formData.name}
              onChange={(val) => setFormData({ ...formData, name: val })}
              placeholder="Regular Post"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SettingsInput
              label="Delivery Group"
              value={formData.delivery_group}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  delivery_group: val as "digital" | "physical",
                })
              }
              type="select"
              options={[
                { value: "digital", label: "Digital" },
                { value: "physical", label: "Physical" },
              ]}
              required
            />

            <SettingsInput
              label="Delivery Type"
              value={formData.delivery_type}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  delivery_type: val as "online" | "email" | "ship" | "pickup",
                })
              }
              type="select"
              options={[
                { value: "online", label: "Online Portal" },
                { value: "email", label: "Email" },
                { value: "ship", label: "Ship" },
                { value: "pickup", label: "Pickup" },
              ]}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              required
            />

            <SettingsInput
              label="Estimated Days"
              value={formData.estimated_days}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  estimated_days: parseInt(val) || 0,
                })
              }
              type="number"
              min={0}
              helperText="Additional delivery days"
            />
          </div>

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
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default_selected"
                checked={formData.is_default_selected}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    is_default_selected: e.target.checked,
                  })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="is_default_selected"
                className="text-sm font-medium text-gray-700"
              >
                Default selected (cannot be unchecked by customer)
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
