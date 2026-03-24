import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Star,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Mail,
  Phone,
  Clock,
  RefreshCw,
  Shield,
  Key,
} from "lucide-react";

interface Vendor {
  id: string;
  xtrf_vendor_id: number | null;
  xtrf_account_name: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  vendor_type: string | null;
  country: string | null;
  province_state: string | null;
  city: string | null;
  source_languages: string[] | null;
  target_languages: string[] | null;
  language_pairs: { source: string; target: string }[] | null;
  specializations: string[] | null;
  certifications: string[] | null;
  years_experience: number | null;
  rate_per_page: number | null;
  rate_currency: string;
  payment_method: string | null;
  payment_details: object | null;
  notes: string | null;
  rating: number | null;
  total_projects: number;
  last_project_date: string | null;
  availability_status: string;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface VendorAuth {
  vendor_id: string;
  password_set_at: string;
  must_reset: boolean;
}

const EDITABLE_FIELDS = [
  "full_name",
  "phone",
  "country",
  "province_state",
  "city",
  "status",
  "vendor_type",
  "availability_status",
  "rate_per_page",
  "rate_currency",
  "payment_method",
  "years_experience",
  "notes",
] as const;

type EditableFields = Pick<Vendor, (typeof EDITABLE_FIELDS)[number]>;

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-600",
  pending_review: "bg-yellow-100 text-yellow-800",
  suspended: "bg-red-100 text-red-800",
  applicant: "bg-blue-100 text-blue-800",
};

const AVAILABILITY_COLORS: Record<string, string> = {
  available: "bg-green-500",
  busy: "bg-yellow-500",
  on_leave: "bg-blue-500",
  unavailable: "bg-gray-400",
};

function formatDate(dateStr: string | null, style: "short" | "long" = "short"): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (style === "long") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ── Shared small components ──

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function AvailabilityDot({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${AVAILABILITY_COLORS[status] ?? "bg-gray-400"}`} />
      <span className="text-sm text-gray-600 capitalize">{status.replace(/_/g, " ")}</span>
    </div>
  );
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-gray-400 text-sm">Not rated</span>;
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
}

// ── Card wrapper ──

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <h2 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Field row helper ──

function FieldRow({
  label,
  value,
  editing,
  input,
}: {
  label: string;
  value: React.ReactNode;
  editing: boolean;
  input?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 w-36">{label}</span>
      <div className="text-sm text-gray-800 text-right">
        {editing && input ? input : value}
      </div>
    </div>
  );
}

// ── Confirmation modal ──

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════

export default function AdminVendorDetail() {
  const { vendorId } = useParams<{ vendorId: string }>();

  // Data
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendorAuth, setVendorAuth] = useState<VendorAuth | null>(null);
  const [activeSessions, setActiveSessions] = useState(0);
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<"revoke" | "force_reset" | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Invitation sending
  const [sendingInvite, setSendingInvite] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Fetch data ──

  const fetchData = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);

    const [vendorRes, authRes, sessionsRes] = await Promise.all([
      supabase.from("vendors").select("*").eq("id", vendorId).single(),
      supabase
        .from("vendor_auth")
        .select("vendor_id, password_set_at, must_reset")
        .eq("vendor_id", vendorId)
        .single(),
      supabase
        .from("vendor_sessions")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId)
        .gte("expires_at", new Date().toISOString()),
    ]);

    if (vendorRes.data) setVendor(vendorRes.data as Vendor);
    // authRes may 404 if no row — that's fine
    if (authRes.data) setVendorAuth(authRes.data as VendorAuth);
    else setVendorAuth(null);
    setActiveSessions(sessionsRes.count ?? 0);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Edit helpers ──

  const startEditing = () => {
    if (!vendor) return;
    const form: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      form[key] = vendor[key];
    }
    setEditForm(form as EditableFields);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm(null);
  };

  const updateField = <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveChanges = async () => {
    if (!vendor || !editForm) return;
    setSaving(true);

    const updates: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      const val = editForm[key];
      updates[key] = val === "" ? null : val;
    }
    // Ensure rate_per_page is numeric or null
    if (updates.rate_per_page != null) {
      updates.rate_per_page = parseFloat(String(updates.rate_per_page));
      if (isNaN(updates.rate_per_page as number)) updates.rate_per_page = null;
    }
    if (updates.years_experience != null) {
      updates.years_experience = parseInt(String(updates.years_experience), 10);
      if (isNaN(updates.years_experience as number)) updates.years_experience = null;
    }

    const { error } = await supabase.from("vendors").update(updates).eq("id", vendor.id);
    setSaving(false);

    if (error) {
      showToast(`Error: ${error.message}`, "error");
    } else {
      showToast("Vendor updated");
      setEditing(false);
      setEditForm(null);
      fetchData();
    }
  };

  // ── Portal actions ──

  const sendInvitation = async () => {
    if (!vendor) return;
    setSendingInvite(true);
    try {
      const { error } = await supabase.functions.invoke("vendor-auth-otp-send", {
        body: { email: vendor.email, channel: "email" },
      });
      if (error) throw error;
      showToast(`Invitation sent to ${vendor.email}`);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send invitation";
      showToast(message, "error");
    }
    setSendingInvite(false);
  };

  const forcePasswordReset = async () => {
    if (!vendorId) return;
    setConfirmLoading(true);
    const { error } = await supabase
      .from("vendor_auth")
      .update({ must_reset: true })
      .eq("vendor_id", vendorId);
    setConfirmLoading(false);
    setConfirmAction(null);
    if (error) {
      showToast(`Error: ${error.message}`, "error");
    } else {
      showToast("Password reset flag set — vendor must reset on next login");
      fetchData();
    }
  };

  const revokeAccess = async () => {
    if (!vendorId) return;
    setConfirmLoading(true);
    // Delete sessions first, then auth row
    await supabase.from("vendor_sessions").delete().eq("vendor_id", vendorId);
    const { error } = await supabase.from("vendor_auth").delete().eq("vendor_id", vendorId);
    setConfirmLoading(false);
    setConfirmAction(null);
    if (error) {
      showToast(`Error: ${error.message}`, "error");
    } else {
      showToast("Portal access revoked");
      fetchData();
    }
  };

  // ── Loading / Not found ──

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f9fc] p-6 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-[#f6f9fc] p-6">
        <Link
          to="/admin/vendors"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Vendors
        </Link>
        <p className="text-gray-500">Vendor not found.</p>
      </div>
    );
  }

  // Derived
  const ef = editForm ?? ({} as EditableFields);
  const locationParts = [vendor.city, vendor.province_state, vendor.country].filter(Boolean);
  const subtitle = [vendor.email, locationParts.join(", "), vendor.xtrf_account_name]
    .filter(Boolean)
    .join(" · ");
  const hasPortalAuth = vendorAuth !== null || vendor.auth_user_id !== null;

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2 ${
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-gray-900 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <XCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction === "force_reset" && (
        <ConfirmDialog
          title="Force Password Reset"
          description="This will require the vendor to reset their password on next login. Continue?"
          confirmLabel="Force Reset"
          onConfirm={forcePasswordReset}
          onCancel={() => setConfirmAction(null)}
          loading={confirmLoading}
        />
      )}
      {confirmAction === "revoke" && (
        <ConfirmDialog
          title="Revoke Portal Access"
          description="This will log the vendor out and remove their portal access. Are you sure?"
          confirmLabel="Revoke Access"
          onConfirm={revokeAccess}
          onCancel={() => setConfirmAction(null)}
          loading={confirmLoading}
        />
      )}

      {/* Back link */}
      <Link
        to="/admin/vendors"
        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Vendors
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{vendor.full_name}</h1>
            <StatusBadge status={vendor.status} />
            <AvailabilityDot status={vendor.availability_status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <button
                onClick={cancelEditing}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
            </>
          ) : (
            <button
              onClick={startEditing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT — 3/5 */}
        <div className="lg:col-span-3 space-y-6">
          {/* Card 1 — Profile */}
          <Card title="Profile">
            <div className="divide-y divide-gray-50">
              <FieldRow
                label="Full Name"
                value={vendor.full_name}
                editing={editing}
                input={
                  <input
                    type="text"
                    value={ef.full_name ?? ""}
                    onChange={(e) => updateField("full_name", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
              <FieldRow label="Email" value={vendor.email} editing={false} />
              <FieldRow
                label="Phone"
                value={vendor.phone ?? "—"}
                editing={editing}
                input={
                  <input
                    type="text"
                    value={ef.phone ?? ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
              <FieldRow
                label="Country"
                value={vendor.country ?? "—"}
                editing={editing}
                input={
                  <input
                    type="text"
                    value={ef.country ?? ""}
                    onChange={(e) => updateField("country", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
              <FieldRow
                label="Province / State"
                value={vendor.province_state ?? "—"}
                editing={editing}
                input={
                  <input
                    type="text"
                    value={ef.province_state ?? ""}
                    onChange={(e) => updateField("province_state", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
              <FieldRow
                label="City"
                value={vendor.city ?? "—"}
                editing={editing}
                input={
                  <input
                    type="text"
                    value={ef.city ?? ""}
                    onChange={(e) => updateField("city", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
              <FieldRow
                label="Years Experience"
                value={vendor.years_experience ?? "—"}
                editing={editing}
                input={
                  <input
                    type="number"
                    value={ef.years_experience ?? ""}
                    onChange={(e) =>
                      updateField(
                        "years_experience",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
            </div>
          </Card>

          {/* Card 2 — Languages */}
          <Card title="Languages">
            {vendor.language_pairs && vendor.language_pairs.length > 0 ? (
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-left border-b border-gray-100">
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase">Source</th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase"></th>
                    <th className="pb-2 text-xs font-medium text-gray-500 uppercase">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {vendor.language_pairs.map((lp, i) => (
                    <tr key={i}>
                      <td className="py-1.5 font-mono text-gray-700">{lp.source}</td>
                      <td className="py-1.5 text-gray-400">→</td>
                      <td className="py-1.5 font-mono text-gray-700">{lp.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 mb-4">No language pairs on file</p>
            )}

            {/* Source / Target badges */}
            {vendor.source_languages && vendor.source_languages.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase">Sources</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {vendor.source_languages.map((lang) => (
                    <span
                      key={lang}
                      className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded font-mono"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {vendor.target_languages && vendor.target_languages.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase">Targets</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {vendor.target_languages.map((lang) => (
                    <span
                      key={lang}
                      className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded font-mono"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {editing && (
              <p className="text-xs text-gray-400 mt-2 italic">
                Language data synced from XTRF
              </p>
            )}
          </Card>

          {/* Card 3 — Notes */}
          <Card title="Internal Notes">
            {editing ? (
              <textarea
                value={ef.notes ?? ""}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Add notes about this vendor..."
                rows={5}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            ) : (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {vendor.notes || (
                  <span className="text-gray-400 italic">No notes</span>
                )}
              </p>
            )}
          </Card>
        </div>

        {/* RIGHT — 2/5 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 4 — Status & Availability */}
          <Card title="Status & Availability">
            <div className="divide-y divide-gray-50">
              <FieldRow
                label="Status"
                value={<StatusBadge status={vendor.status} />}
                editing={editing}
                input={
                  <select
                    value={ef.status ?? ""}
                    onChange={(e) => updateField("status", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="suspended">Suspended</option>
                    <option value="applicant">Applicant</option>
                  </select>
                }
              />
              <FieldRow
                label="Vendor Type"
                value={
                  <span className="capitalize">{vendor.vendor_type ?? "Unassigned"}</span>
                }
                editing={editing}
                input={
                  <select
                    value={ef.vendor_type ?? ""}
                    onChange={(e) =>
                      updateField("vendor_type", e.target.value || null)
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Unassigned</option>
                    <option value="translator">Translator</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="both">Both</option>
                  </select>
                }
              />
              <FieldRow
                label="Availability"
                value={<AvailabilityDot status={vendor.availability_status} />}
                editing={editing}
                input={
                  <select
                    value={ef.availability_status ?? ""}
                    onChange={(e) => updateField("availability_status", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="available">Available</option>
                    <option value="busy">Busy</option>
                    <option value="on_leave">On Leave</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                }
              />
            </div>
          </Card>

          {/* Card 5 — Rate & Payment */}
          <Card title="Rate & Payment">
            <div className="divide-y divide-gray-50">
              <FieldRow
                label="Rate per page"
                value={
                  vendor.rate_per_page != null
                    ? `$${vendor.rate_per_page.toFixed(2)} ${vendor.rate_currency}/page`
                    : "—"
                }
                editing={editing}
                input={
                  <input
                    type="number"
                    step="0.01"
                    value={ef.rate_per_page ?? ""}
                    onChange={(e) =>
                      updateField(
                        "rate_per_page",
                        e.target.value === "" ? null : parseFloat(e.target.value)
                      )
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
              <FieldRow
                label="Currency"
                value={vendor.rate_currency}
                editing={editing}
                input={
                  <select
                    value={ef.rate_currency ?? "CAD"}
                    onChange={(e) => updateField("rate_currency", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="CAD">CAD</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                }
              />
              <FieldRow
                label="Payment method"
                value={vendor.payment_method ?? "—"}
                editing={editing}
                input={
                  <input
                    type="text"
                    value={ef.payment_method ?? ""}
                    onChange={(e) => updateField("payment_method", e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-sm w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                }
              />
            </div>
          </Card>

          {/* Card 6 — Activity (read-only) */}
          <Card title="Activity">
            <div className="divide-y divide-gray-50">
              <FieldRow
                label="Total Projects"
                value={<span className="font-mono">{formatNumber(vendor.total_projects)}</span>}
                editing={false}
              />
              <FieldRow
                label="Last Project"
                value={vendor.last_project_date ? formatDate(vendor.last_project_date) : "Never"}
                editing={false}
              />
              <FieldRow
                label="Rating"
                value={<StarRating rating={vendor.rating} />}
                editing={false}
              />
              <FieldRow
                label="Member Since"
                value={formatDate(vendor.created_at, "long")}
                editing={false}
              />
              <FieldRow
                label="Last Updated"
                value={relativeTime(vendor.updated_at)}
                editing={false}
              />
            </div>
          </Card>

          {/* Card 7 — Portal Access */}
          <Card title="Portal Access">
            {hasPortalAuth ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Active</span>
                </div>

                <div className="text-sm text-gray-600 space-y-1">
                  {vendorAuth?.password_set_at && (
                    <div className="flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-gray-400" />
                      <span>Password set on {formatDate(vendorAuth.password_set_at)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>Active sessions: {activeSessions}</span>
                  </div>
                  {vendorAuth?.must_reset && (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Must reset password on next login</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => setConfirmAction("force_reset")}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-sm border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Force Password Reset
                  </button>
                  <button
                    onClick={() => setConfirmAction("revoke")}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Revoke Portal Access
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                  <span className="text-sm text-gray-500">Not invited</span>
                </div>
                <p className="text-sm text-gray-400">This vendor has no portal account.</p>
                <button
                  onClick={sendInvitation}
                  disabled={sendingInvite}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {sendingInvite ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5" />
                  )}
                  Send Invitation Email
                </button>
              </div>
            )}
          </Card>

          {/* Card 8 — XTRF Info */}
          <Card title="XTRF Info">
            <div className="divide-y divide-gray-50">
              <FieldRow
                label="XTRF Vendor ID"
                value={
                  vendor.xtrf_vendor_id != null ? (
                    <span className="font-mono">{vendor.xtrf_vendor_id}</span>
                  ) : (
                    "—"
                  )
                }
                editing={false}
              />
              <FieldRow
                label="XTRF Account"
                value={vendor.xtrf_account_name ?? "—"}
                editing={false}
              />
            </div>
            <p className="text-xs text-gray-400 mt-3 italic">
              Data synced from XTRF. Edit in XTRF directly.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
