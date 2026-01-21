import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsModal from "@/components/admin/settings/SettingsModal";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface PickupLocation {
  id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  hours: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

const COUNTRIES = [
  { value: "Canada", label: "Canada" },
  { value: "United States", label: "United States" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Australia", label: "Australia" },
];

export default function PickupLocationsSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PickupLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    fetchLocations();
  }, []);

  const checkAuth = () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) {
      navigate("/admin/login");
    }
  };

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("pickup_locations")
        .select("*")
        .order("sort_order");

      if (fetchError) throw fetchError;
      setLocations(data || []);
    } catch (err) {
      console.error("Error fetching locations:", err);
      setError(err instanceof Error ? err.message : "Failed to load locations");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item: PickupLocation) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pickup location?")) return;

    try {
      const { error: deleteError } = await supabase
        .from("pickup_locations")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast.success("Pickup location deleted successfully");
      fetchLocations();
    } catch (err) {
      console.error("Error deleting location:", err);
      toast.error("Failed to delete pickup location");
    }
  };

  const handleSave = async (formData: Partial<PickupLocation>) => {
    try {
      if (editingItem?.id) {
        // Update
        const { error: updateError } = await supabase
          .from("pickup_locations")
          .update({
            name: formData.name,
            address_line1: formData.address_line1,
            address_line2: formData.address_line2 || null,
            city: formData.city,
            state: formData.state,
            postal_code: formData.postal_code,
            country: formData.country,
            phone: formData.phone || null,
            hours: formData.hours || null,
            notes: formData.notes || null,
            is_active: formData.is_active,
          })
          .eq("id", editingItem.id);

        if (updateError) throw updateError;
        toast.success("Pickup location updated successfully");
      } else {
        // Insert - get max sort_order
        const { data: maxData } = await supabase
          .from("pickup_locations")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1)
          .single();

        const nextSortOrder = (maxData?.sort_order || 0) + 1;

        const { error: insertError } = await supabase
          .from("pickup_locations")
          .insert({
            name: formData.name,
            address_line1: formData.address_line1,
            address_line2: formData.address_line2 || null,
            city: formData.city,
            state: formData.state,
            postal_code: formData.postal_code,
            country: formData.country,
            phone: formData.phone || null,
            hours: formData.hours || null,
            notes: formData.notes || null,
            is_active: formData.is_active ?? true,
            sort_order: nextSortOrder,
          });

        if (insertError) throw insertError;
        toast.success("Pickup location added successfully");
      }

      setShowModal(false);
      setEditingItem(null);
      fetchLocations();
    } catch (err) {
      console.error("Error saving location:", err);
      toast.error("Failed to save pickup location");
      throw err;
    }
  };

  const modalFields = [
    {
      name: "name",
      label: "Location Name",
      type: "text" as const,
      required: true,
      placeholder: "Cethos Calgary Office",
    },
    {
      name: "address_line1",
      label: "Address Line 1",
      type: "text" as const,
      required: true,
      placeholder: "123 Main St",
    },
    {
      name: "address_line2",
      label: "Address Line 2",
      type: "text" as const,
      required: false,
      placeholder: "Suite 100",
    },
    {
      name: "city",
      label: "City",
      type: "text" as const,
      required: true,
      placeholder: "Calgary",
    },
    {
      name: "state",
      label: "Province/State",
      type: "text" as const,
      required: true,
      placeholder: "Alberta",
    },
    {
      name: "postal_code",
      label: "Postal Code",
      type: "text" as const,
      required: true,
      placeholder: "T2P 1A1",
    },
    {
      name: "country",
      label: "Country",
      type: "select" as const,
      required: true,
      options: COUNTRIES,
    },
    {
      name: "phone",
      label: "Phone",
      type: "text" as const,
      required: false,
      placeholder: "+1 (403) 555-0100",
    },
    {
      name: "hours",
      label: "Business Hours",
      type: "text" as const,
      required: false,
      placeholder: "Mon-Fri 9:00 AM - 5:00 PM",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea" as const,
      required: false,
      placeholder: "Internal notes (not shown to customers)",
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
      title="Pickup Locations"
      description="Manage pickup addresses for in-person document collection"
      breadcrumbs={[
        { label: "Admin", href: "/admin/hitl" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Pickup Locations" },
      ]}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          Customers can select a pickup location when choosing "Pickup" as their
          physical delivery method.
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            + Add Location
          </button>
        </div>

        {locations.length === 0 && !loading ? (
          <SettingsCard title="" description="">
            <div className="text-center py-8 text-gray-500">
              No pickup locations configured. Click "Add Location" to create one.
            </div>
          </SettingsCard>
        ) : (
          <div className="space-y-4">
            {locations.map((location) => (
              <SettingsCard key={location.id} title="" description="">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="text-4xl">📍</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        {location.name}
                      </h3>

                      <div className="text-sm text-gray-600 space-y-1 mb-3">
                        <p>{location.address_line1}</p>
                        {location.address_line2 && <p>{location.address_line2}</p>}
                        <p>
                          {location.city}, {location.state} {location.postal_code}
                        </p>
                        <p>{location.country}</p>
                      </div>

                      {location.phone && (
                        <p className="text-sm text-gray-600 mb-2">
                          📞 {location.phone}
                        </p>
                      )}

                      {location.hours && (
                        <p className="text-sm text-gray-600 mb-2">
                          🕐 {location.hours}
                        </p>
                      )}

                      {location.notes && (
                        <p className="text-xs text-gray-500 italic mt-2">
                          Note: {location.notes}
                        </p>
                      )}

                      <div className="mt-3">
                        <span
                          className={`text-sm font-medium ${
                            location.is_active
                              ? "text-green-600"
                              : "text-orange-600"
                          }`}
                        >
                          Status: {location.is_active ? "✅ Active" : "⚠️ Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(location)}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(location.id)}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </SettingsCard>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <SettingsModal
          title={editingItem ? "Edit Pickup Location" : "Add Pickup Location"}
          fields={modalFields}
          initialData={
            editingItem || {
              name: "",
              address_line1: "",
              address_line2: "",
              city: "",
              state: "",
              postal_code: "",
              country: "Canada",
              phone: "",
              hours: "",
              notes: "",
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
