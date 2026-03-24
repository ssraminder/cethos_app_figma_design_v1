import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Edit2,
  Save,
  X,
  RefreshCw,
  Star,
  Plus,
  XCircle,
} from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import type { TabPropsWithCurrencies, Vendor } from "./types";
import {
  VENDOR_TYPE_OPTIONS,
  AVAILABILITY_OPTIONS,
  STATUS_OPTIONS,
  POPULAR_CURRENCIES,
  formatDate,
  relativeTime,
} from "./constants";
import { LANGUAGE_OPTIONS, LANGUAGE_GROUP_ORDER, getLanguageName } from "./data/languages";

export default function VendorProfileTab({
  vendorData,
  currencies,
  onRefresh,
}: TabPropsWithCurrencies) {
  const { vendor } = vendorData;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  // Chip input state
  const [certInput, setCertInput] = useState("");
  const [specInput, setSpecInput] = useState("");
  const [nativeLangSearch, setNativeLangSearch] = useState("");

  const startEditing = () => {
    setForm({
      full_name: vendor.full_name,
      phone: vendor.phone ?? "",
      country: vendor.country ?? "",
      province_state: vendor.province_state ?? "",
      city: vendor.city ?? "",
      vendor_type: vendor.vendor_type ?? "",
      years_experience: vendor.years_experience ?? "",
      availability_status: vendor.availability_status ?? "available",
      status: vendor.status ?? "active",
      native_languages: vendor.native_languages ?? [],
      preferred_rate_currency: vendor.preferred_rate_currency ?? vendor.rate_currency ?? "",
      tax_id: vendor.tax_id ?? "",
      tax_rate: vendor.tax_rate ?? "",
      minimum_rate: vendor.minimum_rate ?? "",
      certifications: vendor.certifications ?? [],
      specializations: vendor.specializations ?? [],
      notes: vendor.notes ?? "",
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForm({});
  };

  const updateField = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vendor-update-profile`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vendor_id: vendor.id,
            updates: form,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      toast.success("Profile updated");
      setEditing(false);
      setForm({});
      await onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save profile"
      );
    }
    setSaving(false);
  };

  const addChip = (field: string, value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = (form[field] as string[]) || [];
    if (!current.includes(trimmed)) {
      updateField(field, [...current, trimmed]);
    }
    setter("");
  };

  const removeChip = (field: string, index: number) => {
    const current = (form[field] as string[]) || [];
    updateField(
      field,
      current.filter((_, i) => i !== index)
    );
  };

  // Currency options for SearchableSelect
  const currencyOptions = [
    // Popular pinned at top
    ...currencies
      .filter((c) => POPULAR_CURRENCIES.includes(c.code))
      .sort(
        (a, b) =>
          POPULAR_CURRENCIES.indexOf(a.code) -
          POPULAR_CURRENCIES.indexOf(b.code)
      )
      .map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,
        group: "Popular",
      })),
    // All currencies
    ...currencies
      .filter((c) => !POPULAR_CURRENCIES.includes(c.code))
      .map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,
        group: "All Currencies",
      })),
  ];

  const renderField = (
    label: string,
    displayValue: React.ReactNode,
    input?: React.ReactNode
  ) => (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <label className="block text-sm font-medium text-gray-500 mb-1">
        {label}
      </label>
      {editing && input ? input : (
        <div className="text-sm text-gray-800">{displayValue}</div>
      )}
    </div>
  );

  const textInput = (key: string, placeholder = "") => (
    <input
      type="text"
      value={(form[key] as string) ?? ""}
      onChange={(e) => updateField(key, e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
    />
  );

  const numberInput = (key: string, placeholder = "") => (
    <input
      type="number"
      value={(form[key] as string | number) ?? ""}
      onChange={(e) => updateField(key, e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
    />
  );

  const selectInput = (
    key: string,
    options: { value: string; label: string }[]
  ) => (
    <select
      value={(form[key] as string) ?? ""}
      onChange={(e) => updateField(key, e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const chipInput = (
    field: string,
    inputValue: string,
    setter: (v: string) => void
  ) => (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {((form[field] as string[]) || []).map((chip, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-700 text-xs rounded-full"
          >
            {chip}
            <button
              type="button"
              onClick={() => removeChip(field, i)}
              className="hover:text-teal-900"
            >
              <XCircle className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip(field, inputValue, setter);
            }
          }}
          placeholder="Type and press Enter"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          type="button"
          onClick={() => addChip(field, inputValue, setter)}
          className="px-3 py-2 bg-teal-50 text-teal-700 rounded-lg text-sm hover:bg-teal-100"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderStarRating = (rating: number | null) => {
    if (rating == null)
      return <span className="text-gray-400 text-sm">Not rated</span>;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`}
          />
        ))}
        <span className="ml-1 text-sm text-gray-600">{rating}/5</span>
      </div>
    );
  };

  const chipDisplay = (items: string[] | null) =>
    items && items.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span
            key={i}
            className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
          >
            {item}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-gray-400 text-sm">None</span>
    );

  return (
    <div>
      {/* Edit / Save controls */}
      <div className="flex justify-end mb-4">
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={cancelEditing}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
          >
            <Edit2 className="w-4 h-4" /> Edit Profile
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
              Personal Information
            </h3>
            {renderField("Full Name", vendor.full_name, textInput("full_name"))}
            {renderField("Email", vendor.email)}
            {renderField("Phone", vendor.phone ?? "—", textInput("phone"))}
            {renderField("Country", vendor.country ?? "—", textInput("country"))}
            {renderField(
              "Province / State",
              vendor.province_state ?? "—",
              textInput("province_state")
            )}
            {renderField("City", vendor.city ?? "—", textInput("city"))}
            {renderField(
              "Vendor Type",
              <span className="capitalize">
                {vendor.vendor_type ?? "Unassigned"}
              </span>,
              selectInput("vendor_type", VENDOR_TYPE_OPTIONS)
            )}
            {renderField(
              "Years of Experience",
              vendor.years_experience ?? "—",
              numberInput("years_experience")
            )}
            {renderField(
              "Availability",
              <span className="capitalize">
                {vendor.availability_status?.replace(/_/g, " ") ?? "—"}
              </span>,
              selectInput("availability_status", AVAILABILITY_OPTIONS)
            )}
            {renderField(
              "Native Language(s)",
              vendor.native_languages && vendor.native_languages.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {vendor.native_languages.map((code, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs rounded-full font-medium"
                    >
                      {getLanguageName(code)}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-gray-400 text-sm">Not set</span>
              ),
              <div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {((form.native_languages as string[]) || []).map((code, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-700 text-xs rounded-full"
                    >
                      {getLanguageName(code)}
                      <button
                        type="button"
                        onClick={() => {
                          const current = (form.native_languages as string[]) || [];
                          updateField("native_languages", current.filter((_, idx) => idx !== i));
                        }}
                        className="hover:text-teal-900"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <SearchableSelect
                  options={LANGUAGE_OPTIONS}
                  value=""
                  onChange={(code) => {
                    if (!code) return;
                    const current = (form.native_languages as string[]) || [];
                    if (!current.includes(code)) {
                      updateField("native_languages", [...current, code]);
                    }
                  }}
                  placeholder="Search languages..."
                  groupOrder={LANGUAGE_GROUP_ORDER}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Financial Profile */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
              Financial Profile
            </h3>
            {renderField(
              "Preferred Rate Currency",
              vendor.preferred_rate_currency ?? vendor.rate_currency ?? "—",
              <SearchableSelect
                options={currencyOptions}
                value={(form.preferred_rate_currency as string) ?? ""}
                onChange={(v) => updateField("preferred_rate_currency", v)}
                placeholder="Search currencies..."
                groupOrder={["Popular", "All Currencies"]}
              />
            )}
            {renderField(
              "Tax ID (GST/HST/VAT)",
              vendor.tax_id ?? "—",
              textInput("tax_id")
            )}
            {renderField(
              "Tax Rate (%)",
              vendor.tax_rate != null ? `${vendor.tax_rate}%` : "—",
              numberInput("tax_rate")
            )}
            {renderField(
              "Minimum Rate",
              vendor.minimum_rate ?? "—",
              numberInput("minimum_rate")
            )}
          </div>

          {/* Additional Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
              Additional Information
            </h3>
            {renderField(
              "Certifications",
              chipDisplay(vendor.certifications),
              chipInput("certifications", certInput, setCertInput)
            )}
            {renderField(
              "Specializations",
              chipDisplay(vendor.specializations),
              chipInput("specializations", specInput, setSpecInput)
            )}
            {renderField("Rating", renderStarRating(vendor.rating))}
            {renderField(
              "Total Projects",
              <span className="font-mono">{vendor.total_projects}</span>
            )}
            {renderField(
              "Last Project Date",
              vendor.last_project_date
                ? formatDate(vendor.last_project_date)
                : "Never"
            )}
            {renderField(
              "Notes",
              <span className="whitespace-pre-wrap">
                {vendor.notes || (
                  <span className="text-gray-400 italic">No notes</span>
                )}
              </span>,
              <textarea
                value={(form.notes as string) ?? ""}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={4}
                placeholder="Add notes about this vendor..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
