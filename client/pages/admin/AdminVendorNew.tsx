import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Loader2, Info } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_GROUP_ORDER,
} from "./vendor-detail/data/languages";

// ── Dropdown options ──

const vendorTypeOptions = [
  { value: "", label: "Select type" },
  { value: "individual", label: "Individual" },
  { value: "lsp", label: "LSP" },
  { value: "in_house", label: "In-House" },
];

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "applicant", label: "Applicant" },
];

const COUNTRY_OPTIONS = [
  "Argentina",
  "Australia",
  "Bangladesh",
  "Belgium",
  "Brazil",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Denmark",
  "Egypt",
  "Ethiopia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "India",
  "Indonesia",
  "Israel",
  "Italy",
  "Japan",
  "Jordan",
  "Kenya",
  "Lebanon",
  "Malaysia",
  "Mexico",
  "Morocco",
  "Netherlands",
  "New Zealand",
  "Nigeria",
  "Norway",
  "Pakistan",
  "Peru",
  "Philippines",
  "Poland",
  "Romania",
  "Russia",
  "Rwanda",
  "Saudi Arabia",
  "Singapore",
  "South Africa",
  "South Korea",
  "Spain",
  "Sweden",
  "Thailand",
  "Turkey",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Venezuela",
  "Vietnam",
].map((c) => ({ value: c, label: c }));

// ── Types ──

interface FormState {
  full_name: string;
  email: string;
  phone: string;
  vendor_type: string;
  status: string;
  country: string;
  province_state: string;
  city: string;
  notes: string;
}

interface LanguagePair {
  source_language: string;
  target_language: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialFormState: FormState = {
  full_name: "",
  email: "",
  phone: "",
  vendor_type: "",
  status: "active",
  country: "",
  province_state: "",
  city: "",
  notes: "",
};

// ── Component ──

export default function AdminVendorNew() {
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(initialFormState);
  const [languagePairs, setLanguagePairs] = useState<LanguagePair[]>([
    { source_language: "", target_language: "" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateVendorName, setDuplicateVendorName] = useState<string | null>(
    null
  );
  const [duplicateVendorId, setDuplicateVendorId] = useState<string | null>(
    null
  );

  // ── Helpers ──

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (field === "email") {
      setDuplicateVendorName(null);
      setDuplicateVendorId(null);
    }
  };

  const updateLanguagePair = (
    index: number,
    field: "source_language" | "target_language",
    value: string
  ) => {
    setLanguagePairs((prev) =>
      prev.map((lp, i) => (i === index ? { ...lp, [field]: value } : lp))
    );
  };

  const addLanguagePair = () => {
    setLanguagePairs((prev) => [
      ...prev,
      { source_language: "", target_language: "" },
    ]);
  };

  const removeLanguagePair = (index: number) => {
    setLanguagePairs((prev) => prev.filter((_, i) => i !== index));
  };

  // Check for duplicate language pairs
  const getDuplicatePairIndices = (): Set<number> => {
    const seen = new Map<string, number>();
    const dupes = new Set<number>();
    languagePairs.forEach((lp, i) => {
      if (!lp.source_language || !lp.target_language) return;
      const key = `${lp.source_language}|${lp.target_language}`;
      if (seen.has(key)) {
        dupes.add(seen.get(key)!);
        dupes.add(i);
      } else {
        seen.set(key, i);
      }
    });
    return dupes;
  };

  const duplicatePairIndices = getDuplicatePairIndices();

  // ── Validation ──

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.full_name.trim()) {
      newErrors.full_name = "Full name is required";
    }

    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit ──

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});
    setDuplicateVendorId(null);

    // Build request body — only include non-empty fields
    const body: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      status: form.status,
    };

    if (form.phone.trim()) body.phone = form.phone.trim();
    if (form.vendor_type) body.vendor_type = form.vendor_type;
    if (form.country) body.country = form.country;
    if (form.province_state.trim())
      body.province_state = form.province_state.trim();
    if (form.city.trim()) body.city = form.city.trim();
    if (form.notes.trim()) body.notes = form.notes.trim();

    // Filter to only complete language pairs, excluding duplicates
    const completePairs = languagePairs.filter(
      (lp, i) =>
        lp.source_language && lp.target_language && !duplicatePairIndices.has(i)
    );
    if (completePairs.length > 0) {
      body.language_pairs = completePairs;
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-vendor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify(body),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409 && result.existing_vendor) {
          setErrors({
            email: `A vendor with this email already exists: "${result.existing_vendor.full_name}"`,
          });
          setDuplicateVendorName(result.existing_vendor.full_name);
          setDuplicateVendorId(result.existing_vendor.id);
          return;
        }
        toast.error(result.error || "Failed to create vendor");
        return;
      }

      toast.success("Vendor created successfully");
      navigate(`/admin/vendors/${result.vendor.id}`);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        to="/admin/vendors"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Vendors
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Add New Vendor
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Create a vendor record for project assignment.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Contact Information ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Contact Information
          </h2>

          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                placeholder="Enter full name"
                className={`w-full px-3 py-2 border rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                  errors.full_name
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:ring-teal-500"
                }`}
              />
              {errors.full_name && (
                <p className="mt-1 text-sm text-red-500">{errors.full_name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="vendor@example.com"
                className={`w-full px-3 py-2 border rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                  errors.email
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:ring-teal-500"
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.email}
                  {duplicateVendorName && (
                    <>
                      {" "}
                      <Link
                        to={`/admin/vendors/${duplicateVendorId}`}
                        className="text-indigo-600 hover:text-indigo-800 underline"
                      >
                        View existing vendor
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+1-555-1234"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>
        </div>

        {/* ── Classification ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Classification
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Vendor Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor Type
              </label>
              <select
                value={form.vendor_type}
                onChange={(e) => updateField("vendor_type", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
              >
                {vendorTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Location ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Location
          </h2>

          <div className="space-y-4">
            {/* Country */}
            <SearchableSelect
              options={COUNTRY_OPTIONS}
              value={form.country}
              onChange={(val) => updateField("country", val)}
              label="Country"
              placeholder="Search countries..."
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Province / State */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Province / State
                </label>
                <input
                  type="text"
                  value={form.province_state}
                  onChange={(e) =>
                    updateField("province_state", e.target.value)
                  }
                  placeholder="e.g. Ontario"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="e.g. Toronto"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Language Pairs ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Language Pairs
          </h2>

          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg mb-4 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Add at least one language pair so this vendor can be matched to
              projects.
            </span>
          </div>

          <div className="space-y-3">
            {languagePairs.map((lp, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={LANGUAGE_OPTIONS}
                    value={lp.source_language}
                    onChange={(val) =>
                      updateLanguagePair(index, "source_language", val)
                    }
                    placeholder="Source language"
                    label={index === 0 ? "Source Language" : undefined}
                    groupOrder={LANGUAGE_GROUP_ORDER}
                    error={
                      duplicatePairIndices.has(index)
                        ? "Duplicate pair"
                        : undefined
                    }
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={LANGUAGE_OPTIONS}
                    value={lp.target_language}
                    onChange={(val) =>
                      updateLanguagePair(index, "target_language", val)
                    }
                    placeholder="Target language"
                    label={index === 0 ? "Target Language" : undefined}
                    groupOrder={LANGUAGE_GROUP_ORDER}
                    error={
                      duplicatePairIndices.has(index)
                        ? "Duplicate pair"
                        : undefined
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeLanguagePair(index)}
                  className={`flex-shrink-0 p-2 text-gray-400 hover:text-red-500 transition-colors ${
                    index === 0 ? "mt-7" : "mt-1"
                  }`}
                  title="Remove language pair"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addLanguagePair}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Language Pair
          </button>
        </div>

        {/* ── Notes ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Notes</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Internal Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Any internal notes about this vendor..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors resize-vertical"
            />
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex items-center justify-end gap-3 pt-2 pb-8">
          <button
            type="button"
            onClick={() => navigate("/admin/vendors")}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? "Creating..." : "Create Vendor"}
          </button>
        </div>
      </form>
    </div>
  );
}
