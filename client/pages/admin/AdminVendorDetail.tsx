import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  CheckCircle,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Globe,
  Edit2,
  UserPlus,
} from "lucide-react";

interface Vendor {
  id: string;
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
  rate_per_page: number | null;
  rate_currency: string;
  availability_status: string;
  rating: number | null;
  total_projects: number;
  last_project_date: string | null;
  notes: string | null;
  auth_user_id: string | null;
  xtrf_account_name: string | null;
  created_at: string;
  updated_at: string;
}

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

export default function AdminVendorDetail() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    supabase
      .from("vendors")
      .select("*")
      .eq("id", vendorId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setVendor(data as Vendor);
        setLoading(false);
      });
  }, [vendorId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f9fc] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading vendor...</p>
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

  const location = [vendor.city, vendor.province_state, vendor.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
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
          <h1 className="text-2xl font-semibold text-gray-900">
            {vendor.full_name}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[vendor.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {vendor.status.replace(/_/g, " ")}
            </span>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${AVAILABILITY_COLORS[vendor.availability_status] ?? "bg-gray-400"}`}
              />
              <span className="text-sm text-gray-500 capitalize">
                {vendor.availability_status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!vendor.auth_user_id && (
            <button
              onClick={() => showToast("Invite to Portal — coming soon")}
              className="flex items-center gap-2 px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Invite to Portal
            </button>
          )}
          <button
            onClick={() => showToast("Edit vendor — coming soon")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">
            Contact Information
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{vendor.email}</span>
            </div>
            {vendor.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">{vendor.phone}</span>
              </div>
            )}
            {location && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">{location}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">
                Portal Access:{" "}
                {vendor.auth_user_id ? (
                  <span className="text-green-600 font-medium">Yes</span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Work Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">
            Work Details
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Vendor Type</span>
              <span className="text-gray-700 capitalize">
                {vendor.vendor_type ?? "Unassigned"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total Projects</span>
              <span className="text-gray-700 font-mono">
                {vendor.total_projects}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last Project</span>
              <span className="text-gray-700">
                {vendor.last_project_date
                  ? new Date(vendor.last_project_date).toLocaleDateString()
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rate</span>
              <span className="text-gray-700">
                {vendor.rate_per_page != null
                  ? `$${vendor.rate_per_page.toFixed(2)}/page (${vendor.rate_currency})`
                  : "—"}
              </span>
            </div>
            {vendor.xtrf_account_name && (
              <div className="flex justify-between">
                <span className="text-gray-500">XTRF Account</span>
                <span className="text-gray-700">
                  {vendor.xtrf_account_name}
                </span>
              </div>
            )}
            {vendor.rating != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Rating</span>
                <span className="text-gray-700">{vendor.rating}/5</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Language Pairs */}
      {vendor.language_pairs && vendor.language_pairs.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
            Language Pairs
          </h2>
          <div className="flex flex-wrap gap-2">
            {vendor.language_pairs.map((lp, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700 font-mono"
              >
                {lp.source} → {lp.target}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {vendor.notes && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
            Notes
          </h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">
            {vendor.notes}
          </p>
        </div>
      )}

      {/* Coming Soon Banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-center">
        <p className="text-sm text-indigo-700">
          Full vendor detail page coming soon
        </p>
      </div>
    </div>
  );
}
