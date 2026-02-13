import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  region: string;
  is_recurring: boolean;
  recurring_month: number | null;
  recurring_day: number | null;
}

const REGIONS = [
  { value: "all", label: "All Regions" },
  { value: "CA-AB", label: "Alberta" },
  { value: "CA-BC", label: "British Columbia" },
  { value: "CA-MB", label: "Manitoba" },
  { value: "CA-NB", label: "New Brunswick" },
  { value: "CA-NL", label: "Newfoundland and Labrador" },
  { value: "CA-NS", label: "Nova Scotia" },
  { value: "CA-ON", label: "Ontario" },
  { value: "CA-PE", label: "Prince Edward Island" },
  { value: "CA-QC", label: "Quebec" },
  { value: "CA-SK", label: "Saskatchewan" },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function HolidaysSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [filteredHolidays, setFilteredHolidays] = useState<Holiday[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    fetchHolidays();
  }, [selectedYear]);

  useEffect(() => {
    filterHolidays();
  }, [holidays, selectedRegion]);

  const checkAuth = () => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) {
      navigate("/admin/login");
    }
  };

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("holidays")
        .select("*")
        .gte("holiday_date", `${selectedYear}-01-01`)
        .lte("holiday_date", `${selectedYear}-12-31`)
        .order("holiday_date");

      if (fetchError) throw fetchError;
      setHolidays(data || []);
    } catch (err) {
      console.error("Error fetching holidays:", err);
      setError(err instanceof Error ? err.message : "Failed to load holidays");
    } finally {
      setLoading(false);
    }
  };

  const filterHolidays = () => {
    if (selectedRegion === "all") {
      setFilteredHolidays(holidays);
    } else {
      setFilteredHolidays(
        holidays.filter(
          (h) => h.region === "all" || h.region === selectedRegion,
        ),
      );
    }
  };

  const groupByMonth = (holidaysList: Holiday[]) => {
    const grouped: Record<number, Holiday[]> = {};

    holidaysList.forEach((holiday) => {
      const month = new Date(holiday.holiday_date).getMonth();
      if (!grouped[month]) {
        grouped[month] = [];
      }
      grouped[month].push(holiday);
    });

    return grouped;
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingHoliday(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this holiday?")) return;

    try {
      const { error: deleteError } = await supabase
        .from("holidays")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast.success("Holiday deleted successfully");
      fetchHolidays();
    } catch (err) {
      console.error("Error deleting holiday:", err);
      toast.error("Failed to delete holiday");
    }
  };

  const handleBulkAdd = async (year: number, country: "CA" | "US") => {
    const commonHolidays =
      country === "CA"
        ? [
            { name: "New Year's Day", month: 1, day: 1, region: "all" },
            { name: "Family Day", month: 2, day: 16, region: "CA-AB" },
            { name: "Good Friday", month: 3, day: 29, region: "all" },
            { name: "Easter Monday", month: 4, day: 1, region: "all" },
            { name: "Victoria Day", month: 5, day: 19, region: "all" },
            { name: "Canada Day", month: 7, day: 1, region: "all" },
            { name: "Civic Holiday", month: 8, day: 4, region: "CA-AB" },
            { name: "Labour Day", month: 9, day: 1, region: "all" },
            { name: "Thanksgiving", month: 10, day: 13, region: "all" },
            { name: "Remembrance Day", month: 11, day: 11, region: "all" },
            { name: "Christmas Day", month: 12, day: 25, region: "all" },
            { name: "Boxing Day", month: 12, day: 26, region: "all" },
          ]
        : [
            { name: "New Year's Day", month: 1, day: 1, region: "all" },
            {
              name: "Martin Luther King Jr. Day",
              month: 1,
              day: 20,
              region: "all",
            },
            { name: "Presidents' Day", month: 2, day: 17, region: "all" },
            { name: "Memorial Day", month: 5, day: 26, region: "all" },
            { name: "Independence Day", month: 7, day: 4, region: "all" },
            { name: "Labor Day", month: 9, day: 1, region: "all" },
            { name: "Columbus Day", month: 10, day: 13, region: "all" },
            { name: "Veterans Day", month: 11, day: 11, region: "all" },
            { name: "Thanksgiving", month: 11, day: 27, region: "all" },
            { name: "Christmas Day", month: 12, day: 25, region: "all" },
          ];

    try {
      const holidaysToInsert = commonHolidays.map((h) => ({
        holiday_date: `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
        name: h.name,
        region: h.region,
        is_recurring: true,
        recurring_month: h.month,
        recurring_day: h.day,
      }));

      const { error: insertError } = await supabase
        .from("holidays")
        .insert(holidaysToInsert);

      if (insertError) throw insertError;

      toast.success(
        `Added ${commonHolidays.length} ${country} holidays for ${year}`,
      );
      fetchHolidays();
    } catch (err) {
      console.error("Error adding bulk holidays:", err);
      toast.error("Failed to add bulk holidays");
    }
  };

  const groupedHolidays = groupByMonth(filteredHolidays);
  const monthsWithHolidays = Object.keys(groupedHolidays)
    .map(Number)
    .sort((a, b) => a - b);

  const years = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() + i,
  );

  return (
    <AdminSettingsLayout
      title="Holidays"
      description="Manage holiday dates that are excluded from business days"
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Holidays" },
      ]}
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Filters and Add Button */}
        <SettingsCard
          title=""
          description="Holidays are excluded from business day calculations."
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-3">
              <div>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {REGIONS.map((region) => (
                    <option key={region.value} value={region.value}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium whitespace-nowrap"
            >
              + Add Holiday
            </button>
          </div>
        </SettingsCard>

        {/* Holidays by Month */}
        {monthsWithHolidays.map((month) => (
          <SettingsCard
            key={month}
            title={MONTHS[month].toUpperCase()}
            description=""
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Region
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedHolidays[month].map((holiday) => (
                    <tr key={holiday.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(holiday.holiday_date).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {holiday.name}
                        {holiday.is_recurring && (
                          <span className="ml-2 text-xs text-gray-500">
                            (recurring)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {holiday.region === "all"
                          ? "All"
                          : REGIONS.find((r) => r.value === holiday.region)
                              ?.label || holiday.region}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(holiday)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(holiday.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SettingsCard>
        ))}

        {filteredHolidays.length === 0 && !loading && (
          <SettingsCard title="" description="">
            <div className="text-center py-8 text-gray-500">
              No holidays found for {selectedYear}. Click "Add Holiday" or use
              Quick Add below.
            </div>
          </SettingsCard>
        )}

        {/* Quick Add */}
        <SettingsCard
          title="Quick Add: Common Holidays"
          description="Automatically add standard holidays for a year"
        >
          <div className="flex gap-3">
            <button
              onClick={() => handleBulkAdd(selectedYear + 1, "CA")}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              Add {selectedYear + 1} Canadian Holidays
            </button>
            <button
              onClick={() => handleBulkAdd(selectedYear + 1, "US")}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Add {selectedYear + 1} US Holidays
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Note: Dates are approximate. Please verify and adjust as needed.
          </p>
        </SettingsCard>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <HolidayModal
          holiday={editingHoliday}
          onClose={() => {
            setShowModal(false);
            setEditingHoliday(null);
          }}
          onSave={() => {
            setShowModal(false);
            setEditingHoliday(null);
            fetchHolidays();
          }}
        />
      )}
    </AdminSettingsLayout>
  );
}

interface HolidayModalProps {
  holiday: Holiday | null;
  onClose: () => void;
  onSave: () => void;
}

function HolidayModal({ holiday, onClose, onSave }: HolidayModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Holiday>>(
    holiday || {
      holiday_date: "",
      name: "",
      region: "all",
      is_recurring: false,
      recurring_month: null,
      recurring_day: null,
    },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const dataToSave = { ...formData };

      // If recurring, set recurring_month and recurring_day
      if (dataToSave.is_recurring && dataToSave.holiday_date) {
        const date = new Date(dataToSave.holiday_date);
        dataToSave.recurring_month = date.getMonth() + 1;
        dataToSave.recurring_day = date.getDate();
      } else {
        dataToSave.recurring_month = null;
        dataToSave.recurring_day = null;
      }

      if (holiday?.id) {
        // Update
        const { error: updateError } = await supabase
          .from("holidays")
          .update(dataToSave)
          .eq("id", holiday.id);

        if (updateError) throw updateError;
        toast.success("Holiday updated successfully");
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from("holidays")
          .insert(dataToSave);

        if (insertError) throw insertError;
        toast.success("Holiday added successfully");
      }

      onSave();
    } catch (err) {
      console.error("Error saving holiday:", err);
      toast.error("Failed to save holiday");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {holiday ? "Edit Holiday" : "Add Holiday"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Holiday Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Labour Day"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input
              type="date"
              value={formData.holiday_date}
              onChange={(e) =>
                setFormData({ ...formData, holiday_date: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Region *
            </label>
            <select
              value={formData.region}
              onChange={(e) =>
                setFormData({ ...formData, region: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {REGIONS.map((region) => (
                <option key={region.value} value={region.value}>
                  {region.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select region or "All Regions" for nationwide holidays
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_recurring}
                onChange={(e) =>
                  setFormData({ ...formData, is_recurring: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                Recurring yearly (same date each year)
              </span>
            </label>
          </div>

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
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? "Saving..." : "Save Holiday"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
