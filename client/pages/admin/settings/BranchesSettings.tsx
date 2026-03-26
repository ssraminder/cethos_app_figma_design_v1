import React, { useState, useEffect } from "react";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Branch {
  id: number;
  code: string;
  legal_name: string;
  division: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  tax_label: string;
  tax_number: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string;
  is_default: boolean;
  is_active: boolean;
  xtrf_branch_id: number | null;
  created_at: string;
  updated_at: string;
}

interface BranchReadiness {
  branch_id: number;
  ready: boolean;
  missing: string[];
}

interface BranchFormData {
  code: string;
  legal_name: string;
  division: string;
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  tax_label: string;
  tax_number: string;
  phone: string;
  email: string;
  website: string;
  is_default: boolean;
  is_active: boolean;
}

const TAX_LABELS = ["GST", "HST", "VAT", "QST", "PST", "Other"];

const PROVINCES = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
];

const emptyForm: BranchFormData = {
  code: "",
  legal_name: "",
  division: "",
  address_line1: "",
  address_line2: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Canada",
  tax_label: "GST",
  tax_number: "",
  phone: "",
  email: "",
  website: "",
  is_default: false,
  is_active: true,
};

export default function BranchesSettings() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [readiness, setReadiness] = useState<Record<number, BranchReadiness>>({});
  const [customerCounts, setCustomerCounts] = useState<Record<number, number>>({});
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [formData, setFormData] = useState<BranchFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    loadData();
  }, []);

  const getAuthToken = (): string => {
    return localStorage.getItem("sb-access-token") || SUPABASE_ANON_KEY;
  };

  const callApi = async (body: Record<string, unknown>) => {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/manage-branches`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      },
    );
    return response.json();
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResult, readinessResult] = await Promise.all([
        callApi({ action: "list" }),
        callApi({ action: "invoice_readiness" }),
      ]);

      if (!listResult.success) {
        throw new Error(listResult.error || "Failed to load branches");
      }

      setBranches(listResult.branches || []);

      if (readinessResult.success && readinessResult.branches) {
        const readinessMap: Record<number, BranchReadiness> = {};
        for (const b of readinessResult.branches) {
          readinessMap[b.branch_id || b.id] = {
            branch_id: b.branch_id || b.id,
            ready: b.ready,
            missing: b.missing || [],
          };
        }
        setReadiness(readinessMap);
      }

      // Fetch customer counts
      const { data: customerData } = await supabase
        .from("customers")
        .select("invoicing_branch_id")
        .not("invoicing_branch_id", "is", null);

      if (customerData) {
        const counts: Record<number, number> = {};
        for (const c of customerData) {
          const bid = c.invoicing_branch_id;
          counts[bid] = (counts[bid] || 0) + 1;
        }
        setCustomerCounts(counts);
      }
    } catch (err) {
      console.error("Error loading branches:", err);
      setError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (branch: Branch) => {
    setAddingNew(false);
    setEditingBranchId(branch.id);
    setFormData({
      code: branch.code,
      legal_name: branch.legal_name,
      division: branch.division || "",
      address_line1: branch.address_line1 || "",
      address_line2: branch.address_line2 || "",
      city: branch.city || "",
      province: branch.province || "",
      postal_code: branch.postal_code || "",
      country: branch.country || "Canada",
      tax_label: branch.tax_label || "GST",
      tax_number: branch.tax_number || "",
      phone: branch.phone || "",
      email: branch.email || "",
      website: branch.website || "",
      is_default: branch.is_default,
      is_active: branch.is_active,
    });
  };

  const startAdd = () => {
    setEditingBranchId(null);
    setAddingNew(true);
    setFormData(emptyForm);
  };

  const cancelEdit = () => {
    setEditingBranchId(null);
    setAddingNew(false);
  };

  const handleSave = async () => {
    if (addingNew) {
      if (!formData.code.trim() || !formData.legal_name.trim()) {
        toast.error("Code and Legal Name are required.");
        return;
      }
    }

    setSaving(true);
    try {
      if (addingNew) {
        const payload: Record<string, unknown> = { action: "create" };
        for (const [key, value] of Object.entries(formData)) {
          if (value !== "" && value !== false) {
            payload[key] = value;
          }
        }
        const result = await callApi(payload);
        if (!result.success) {
          throw new Error(result.error || "Failed to create branch");
        }
        toast.success("Branch created successfully");
      } else if (editingBranchId !== null) {
        const branch = branches.find((b) => b.id === editingBranchId);
        if (!branch) return;

        const payload: Record<string, unknown> = {
          action: "update",
          branch_id: editingBranchId,
        };

        // Only send changed fields
        const fieldMap: Record<string, keyof Branch> = {
          code: "code",
          legal_name: "legal_name",
          division: "division",
          address_line1: "address_line1",
          address_line2: "address_line2",
          city: "city",
          province: "province",
          postal_code: "postal_code",
          country: "country",
          tax_label: "tax_label",
          tax_number: "tax_number",
          phone: "phone",
          email: "email",
          website: "website",
          is_default: "is_default",
          is_active: "is_active",
        };

        for (const [formKey, branchKey] of Object.entries(fieldMap)) {
          const formVal = formData[formKey as keyof BranchFormData];
          const branchVal = branch[branchKey];
          const normalizedBranchVal = branchVal === null ? "" : branchVal;
          if (formVal !== normalizedBranchVal) {
            payload[formKey] = formVal;
          }
        }

        const result = await callApi(payload);
        if (!result.success) {
          throw new Error(result.error || "Failed to update branch");
        }
        toast.success("Branch updated successfully");
      }

      cancelEdit();
      await loadData();
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (branchId: number) => {
    try {
      const result = await callApi({
        action: "update",
        branch_id: branchId,
        is_default: true,
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to set default");
      }
      toast.success("Default branch updated");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set default");
    }
  };

  const handleDeactivate = async (branchId: number) => {
    if (!confirm("Are you sure you want to deactivate this branch?")) return;
    try {
      const result = await callApi({
        action: "delete",
        branch_id: branchId,
      });
      if (!result.success) {
        throw new Error(
          result.error || result.message || "Failed to deactivate branch",
        );
      }
      toast.success("Branch deactivated");
      await loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to deactivate branch",
      );
    }
  };

  const updateField = (field: keyof BranchFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const renderForm = () => (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">
        {addingNew ? "Add New Branch" : `Edit: ${formData.legal_name}`}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Legal Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.legal_name}
            onChange={(e) => updateField("legal_name", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Cethos Solutions Inc."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.code}
            onChange={(e) => updateField("code", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="cethos"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Division
          </label>
          <input
            type="text"
            value={formData.division}
            onChange={(e) => updateField("division", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Certified Translations"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Address</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address Line 1 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.address_line1}
              onChange={(e) => updateField("address_line1", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123 Main St"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address Line 2
            </label>
            <input
              type="text"
              value={formData.address_line2}
              onChange={(e) => updateField("address_line2", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Suite 200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => updateField("city", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Calgary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Province <span className="text-red-500">*</span>
            </label>
            {formData.country === "Canada" ? (
              <select
                value={formData.province}
                onChange={(e) => updateField("province", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select province...</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.province}
                onChange={(e) => updateField("province", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Province / State"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Postal Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.postal_code}
              onChange={(e) => updateField("postal_code", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="T2P 1A1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => updateField("country", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Canada"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Tax & Contact
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tax Label
            </label>
            <select
              value={formData.tax_label}
              onChange={(e) => updateField("tax_label", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TAX_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tax Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.tax_number}
              onChange={(e) => updateField("tax_number", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123456789 RT0001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+1-403-555-0100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="billing@cethos.com"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website
            </label>
            <input
              type="text"
              value={formData.website}
              onChange={(e) => updateField("website", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://cethos.com"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Options</h4>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_default}
              onChange={(e) => updateField("is_default", e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Default branch (new customers get this by default)
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => updateField("is_active", e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={cancelEdit}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : addingNew ? "Create Branch" : "Save Changes"}
        </button>
      </div>
    </div>
  );

  const renderBranchCard = (branch: Branch) => {
    const branchReadiness = readiness[branch.id];
    const count = customerCounts[branch.id] || 0;
    const isEditing = editingBranchId === branch.id;

    if (isEditing) {
      return (
        <div key={branch.id} className="mb-4">
          {renderForm()}
        </div>
      );
    }

    const addressParts = [
      branch.address_line1,
      branch.address_line2,
      branch.city,
      branch.province,
      branch.postal_code,
      branch.country,
    ].filter(Boolean);

    return (
      <div
        key={branch.id}
        className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {branch.legal_name}
              </h3>
              {branch.is_default && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 text-xs rounded-full font-medium">
                  Default
                </span>
              )}
              {!branch.is_active && (
                <span className="bg-gray-100 text-gray-500 px-2 py-0.5 text-xs rounded-full font-medium">
                  Inactive
                </span>
              )}
            </div>
            {count > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {count} customer{count !== 1 ? "s" : ""} assigned
              </p>
            )}
          </div>
          <span className="text-xs text-gray-400 font-mono">{branch.code}</span>
        </div>

        <div className="space-y-1 text-sm text-gray-600">
          {branch.division && (
            <p>
              <span className="text-gray-500">Division:</span> {branch.division}
            </p>
          )}
          <p>
            <span className="text-gray-500">Address:</span>{" "}
            {addressParts.length > 0 ? addressParts.join(", ") : (
              <span className="text-gray-400 italic">(not set)</span>
            )}
          </p>
          <p>
            <span className="text-gray-500">Tax:</span> {branch.tax_label}{" "}
            {branch.tax_number || (
              <span className="text-gray-400 italic">(not set)</span>
            )}
          </p>
          <p>
            <span className="text-gray-500">Phone:</span>{" "}
            {branch.phone || (
              <span className="text-gray-400 italic">(not set)</span>
            )}
            {" · "}
            <span className="text-gray-500">Email:</span>{" "}
            {branch.email || (
              <span className="text-gray-400 italic">(not set)</span>
            )}
          </p>
        </div>

        {/* Readiness indicator */}
        <div className="mt-3">
          {branchReadiness?.ready ? (
            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 text-xs rounded-md">
              Ready for invoicing
            </span>
          ) : branchReadiness ? (
            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 text-xs rounded-md">
              Not ready for invoicing:{" "}
              {branchReadiness.missing.join(", ")} missing
            </span>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => startEdit(branch)}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
          >
            Edit
          </button>
          <div className="flex items-center gap-3">
            {!branch.is_default && branch.is_active && (
              <>
                <button
                  onClick={() => handleSetDefault(branch.id)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100"
                >
                  Set as Default
                </button>
                <button
                  onClick={() => handleDeactivate(branch.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Deactivate
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminSettingsLayout
      title="Branches / Legal Entities"
      description="These entities appear on customer invoices. Each customer is assigned to a branch for invoicing purposes."
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Branches" },
      ]}
      loading={loading}
      error={error}
      actions={
        <button
          onClick={startAdd}
          disabled={addingNew || editingBranchId !== null}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          + Add Branch
        </button>
      }
    >
      {addingNew && <div className="mb-6">{renderForm()}</div>}

      <div className="space-y-4">
        {branches.map((branch) => renderBranchCard(branch))}
      </div>

      {!loading && branches.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No branches found. Click "+ Add Branch" to create one.</p>
        </div>
      )}
    </AdminSettingsLayout>
  );
}
