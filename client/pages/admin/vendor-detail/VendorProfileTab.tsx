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
import EmailLogAccordion from "@/components/admin/EmailLogAccordion";
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
  const [emailInput, setEmailInput] = useState("");
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
      additional_emails: (vendor as any).additional_emails ?? [],
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
      // vendor-update-profile is a vendor-self-service edge function
      // that authenticates by treating the bearer as a vendor_sessions
      // session_token. The admin doesn't have one, so it 401'd every
      // time. Persist directly via supabase from the admin context —
      // staff RLS already allows updates to vendors.
      const updates: Record<string, unknown> = {};

      const setIfPresent = (key: string, transform?: (v: unknown) => unknown) => {
        if (form[key] !== undefined) {
          updates[key] = transform ? transform(form[key]) : form[key];
        }
      };
      const trimOrNull = (v: unknown): string | null => {
        const s = typeof v === "string" ? v.trim() : "";
        return s || null;
      };
      const numOrNull = (v: unknown): number | null => {
        if (v === "" || v === null || v === undefined) return null;
        const n = typeof v === "number" ? v : parseFloat(String(v));
        return Number.isFinite(n) ? n : null;
      };

      if (form.full_name !== undefined) {
        const fn = String(form.full_name || "").trim();
        if (!fn) throw new Error("Full name is required");
        updates.full_name = fn;
      }
      setIfPresent("phone", trimOrNull);
      setIfPresent("country", trimOrNull);
      setIfPresent("province_state", trimOrNull);
      setIfPresent("city", trimOrNull);
      setIfPresent("vendor_type", trimOrNull);
      setIfPresent("years_experience", numOrNull);
      setIfPresent("availability_status", (v) => v || "available");
      setIfPresent("status", (v) => v || "active");
      setIfPresent("native_languages", (v) => v ?? []);
      setIfPresent("preferred_rate_currency", (v) => String(v || "CAD").trim() || "CAD");
      setIfPresent("tax_id", trimOrNull);
      setIfPresent("tax_rate", (v) => {
        const n = numOrNull(v);
        if (n !== null && (n < 0 || n > 100)) throw new Error("Tax rate must be between 0 and 100");
        return n;
      });
      setIfPresent("minimum_rate", numOrNull);
      setIfPresent("certifications", (v) => v ?? []);
      setIfPresent("specializations", (v) => v ?? []);
      setIfPresent("notes", trimOrNull);

      // When country changes away from Canada, clear province + reset tax —
      // same rule the (broken) edge function applied.
      if (typeof form.country === "string" && form.country.trim() !== "Canada") {
        updates.province_state = null;
        updates.tax_name = "N/A";
        updates.tax_rate = 0;
      }

      if (Array.isArray(form.additional_emails)) {
        updates.additional_emails = (form.additional_emails as string[])
          .map((e) => String(e || "").trim())
          .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      }

      if (Object.keys(updates).length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }

      const { error: updateErr } = await supabase
        .from("vendors")
        .update(updates)
        .eq("id", vendor.id);
      if (updateErr) throw updateErr;

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
            {renderField(
              "Additional emails (CC)",
              (() => {
                const list = ((vendor as any).additional_emails ?? []) as string[];
                return list.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((e, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 bg-teal-50 text-teal-800 text-xs px-2 py-1 rounded"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                );
              })(),
              <div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {((form.additional_emails as string[]) ?? []).map((e, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 bg-teal-50 text-teal-800 text-xs px-2 py-1 rounded"
                    >
                      {e}
                      <button
                        type="button"
                        onClick={() => removeChip("additional_emails", i)}
                        className="text-teal-600 hover:text-red-600"
                        title="Remove"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const trimmed = emailInput.trim();
                        if (
                          trimmed &&
                          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
                        ) {
                          addChip("additional_emails", trimmed, setEmailInput);
                        } else if (trimmed) {
                          toast.error("Enter a valid email address");
                        }
                      }
                    }}
                    placeholder="cc@example.com (press Enter)"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = emailInput.trim();
                      if (
                        trimmed &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
                      ) {
                        addChip("additional_emails", trimmed, setEmailInput);
                      } else if (trimmed) {
                        toast.error("Enter a valid email address");
                      }
                    }}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  CC'd on every Brevo notification (assignment, offer, instructions).
                </p>
              </div>
            )}
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

      <EmailLogAccordion email={vendor.email ?? null} />
    </div>
  );
}
