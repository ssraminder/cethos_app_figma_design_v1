import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Users,
  CheckCircle,
  Globe,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  X,
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

const PAGE_SIZE = 25;

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-gray-100 text-gray-600",
    pending_review: "bg-yellow-100 text-yellow-800",
    suspended: "bg-red-100 text-red-800",
    applicant: "bg-blue-100 text-blue-800",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
};

const AvailabilityDot = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    available: "bg-green-500",
    busy: "bg-yellow-500",
    on_leave: "bg-blue-500",
    unavailable: "bg-gray-400",
  };
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${colors[status] ?? "bg-gray-400"}`}
      />
      <span className="text-sm text-gray-600 capitalize">
        {status.replace(/_/g, " ")}
      </span>
    </div>
  );
};

const LanguageBadges = ({
  languages,
}: {
  languages: string[] | null;
}) => {
  if (!languages || languages.length === 0)
    return <span className="text-gray-400">—</span>;
  const shown = languages.slice(0, 3);
  const remaining = languages.length - 3;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((lang) => (
        <span
          key={lang}
          className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded font-mono"
        >
          {lang}
        </span>
      ))}
      {remaining > 0 && (
        <span className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-xs rounded">
          +{remaining}
        </span>
      )}
    </div>
  );
};

const COUNTRY_FLAGS: Record<string, string> = {
  Canada: "🇨🇦",
  "United States": "🇺🇸",
  India: "🇮🇳",
  China: "🇨🇳",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Brazil: "🇧🇷",
  Mexico: "🇲🇽",
  Japan: "🇯🇵",
  "South Korea": "🇰🇷",
  Italy: "🇮🇹",
  Spain: "🇪🇸",
  Russia: "🇷🇺",
  "United Kingdom": "🇬🇧",
  Australia: "🇦🇺",
  Argentina: "🇦🇷",
  Pakistan: "🇵🇰",
  Bangladesh: "🇧🇩",
  Philippines: "🇵🇭",
  Iran: "🇮🇷",
  Turkey: "🇹🇷",
  Egypt: "🇪🇬",
  Vietnam: "🇻🇳",
  Colombia: "🇨🇴",
  Poland: "🇵🇱",
  Ukraine: "🇺🇦",
  Romania: "🇷🇴",
  Portugal: "🇵🇹",
  Netherlands: "🇳🇱",
  Belgium: "🇧🇪",
  Greece: "🇬🇷",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Austria: "🇦🇹",
  Morocco: "🇲🇦",
  Lebanon: "🇱🇧",
  Israel: "🇮🇱",
  "Saudi Arabia": "🇸🇦",
};

function formatLastActive(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function AdminVendorsList() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    withPortalAccess: 0,
    withJobs: 0,
  });

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [vendorTypeFilter, setVendorTypeFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [countries, setCountries] = useState<string[]>([]);

  // Fetch distinct countries and summary stats on mount
  useEffect(() => {
    supabase
      .from("vendors")
      .select("country")
      .not("country", "is", null)
      .then(({ data }) => {
        if (data) {
          const unique = [
            ...new Set(data.map((r: { country: string }) => r.country)),
          ].sort();
          setCountries(unique);
        }
      });

    Promise.all([
      supabase.from("vendors").select("*", { count: "exact", head: true }),
      supabase
        .from("vendors")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("vendors")
        .select("*", { count: "exact", head: true })
        .not("auth_user_id", "is", null),
      supabase
        .from("vendors")
        .select("*", { count: "exact", head: true })
        .gt("total_projects", 0),
    ]).then(([total, active, portal, jobs]) => {
      setStats({
        total: total.count ?? 0,
        active: active.count ?? 0,
        withPortalAccess: portal.count ?? 0,
        withJobs: jobs.count ?? 0,
      });
    });
  }, []);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("vendors")
      .select("*", { count: "exact" })
      .order("total_projects", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%,country.ilike.%${search}%`
      );
    }
    if (statusFilter) query = query.eq("status", statusFilter);
    if (availabilityFilter)
      query = query.eq("availability_status", availabilityFilter);
    if (vendorTypeFilter === "unassigned") {
      query = query.is("vendor_type", null);
    } else if (vendorTypeFilter) {
      query = query.eq("vendor_type", vendorTypeFilter);
    }
    if (languageFilter) {
      query = query.contains("target_languages", [
        languageFilter.toUpperCase(),
      ]);
    }
    if (countryFilter) query = query.eq("country", countryFilter);
    if (portalFilter === "has_access")
      query = query.not("auth_user_id", "is", null);
    if (portalFilter === "no_access") query = query.is("auth_user_id", null);

    const { data, count, error } = await query;
    if (!error) {
      setVendors((data as Vendor[]) ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [
    page,
    search,
    statusFilter,
    availabilityFilter,
    vendorTypeFilter,
    languageFilter,
    countryFilter,
    portalFilter,
  ]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [
    search,
    statusFilter,
    availabilityFilter,
    vendorTypeFilter,
    languageFilter,
    countryFilter,
    portalFilter,
  ]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setAvailabilityFilter("");
    setVendorTypeFilter("");
    setLanguageFilter("");
    setCountryFilter("");
    setPortalFilter("");
    setPage(1);
  };

  const hasActiveFilters =
    search ||
    statusFilter ||
    availabilityFilter ||
    vendorTypeFilter ||
    languageFilter ||
    countryFilter ||
    portalFilter;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage freelance translators and reviewers
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Vendor
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Vendors</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.total}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.active}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">With Portal Access</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.withPortalAccess}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Briefcase className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">With Jobs</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.withJobs}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, city, country..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending_review">Pending Review</option>
              <option value="suspended">Suspended</option>
              <option value="applicant">Applicant</option>
            </select>
          </div>

          {/* Availability */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Availability
            </label>
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="on_leave">On Leave</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>

          {/* Vendor Type */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Vendor Type
            </label>
            <select
              value={vendorTypeFilter}
              onChange={(e) => setVendorTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Types</option>
              <option value="translator">Translator</option>
              <option value="reviewer">Reviewer</option>
              <option value="both">Both</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>

          {/* Language */}
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Target Language
            </label>
            <input
              type="text"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              placeholder="e.g. FR, HI"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Country */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Country
            </label>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Portal Access */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Portal Access
            </label>
            <select
              value={portalFilter}
              onChange={(e) => setPortalFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All</option>
              <option value="has_access">Has Portal Access</option>
              <option value="no_access">No Portal Access</option>
            </select>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear Filters
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={fetchVendors}
            className="p-2 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Languages
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Country
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jobs
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Active
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Availability
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Portal
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading vendors...
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    No vendors found
                  </td>
                </tr>
              ) : (
                vendors.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => navigate(`/admin/vendors/${v.id}`)}
                    className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/vendors/${v.id}`}
                        className="font-medium text-gray-900 hover:text-indigo-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {v.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {v.email}
                    </td>
                    <td className="px-4 py-3">
                      <LanguageBadges languages={v.target_languages} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {v.country ? (
                        <span>
                          {COUNTRY_FLAGS[v.country] ?? ""}{" "}
                          {v.country}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-gray-700">
                      {v.total_projects}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatLastActive(v.last_project_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {v.rate_per_page != null
                        ? `$${v.rate_per_page.toFixed(2)}/page`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="px-4 py-3">
                      <AvailabilityDot status={v.availability_status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {v.auth_user_id ? (
                        <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/vendors/${v.id}`}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {rangeStart}–{rangeEnd} of {totalCount} vendors
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Page</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={page}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (val >= 1 && val <= totalPages) setPage(val);
                  }}
                  className="w-14 px-2 py-1 border border-gray-200 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span>of {totalPages}</span>
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Add Vendor
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              This feature is coming soon.
            </p>
            <button
              onClick={() => setShowAddModal(false)}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
