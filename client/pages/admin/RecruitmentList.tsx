import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  UserPlus,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ---------- Constants ----------

const TAB_STATUSES: Record<string, string[]> = {
  attention: ["staff_review", "info_requested"],
  in_progress: [
    "submitted",
    "prescreening",
    "prescreened",
    "test_pending",
    "test_sent",
    "test_in_progress",
    "test_submitted",
    "test_assessed",
    "negotiation",
  ],
  decided: ["approved", "rejected", "archived"],
  waitlist: ["waitlisted"],
};

const TAB_LABELS: Record<string, string> = {
  attention: "Needs Attention",
  in_progress: "In Progress",
  decided: "Decided",
  waitlist: "Waitlist",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  prescreening: "Pre-screening",
  prescreened: "Pre-screened",
  test_pending: "Test Pending",
  test_sent: "Test Sent",
  test_in_progress: "Test In Progress",
  test_submitted: "Test Submitted",
  test_assessed: "Test Assessed",
  negotiation: "Negotiation",
  staff_review: "Staff Review",
  approved: "Approved",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
  archived: "Archived",
  info_requested: "Info Requested",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-100 text-gray-700",
  prescreening: "bg-blue-100 text-blue-700",
  prescreened: "bg-blue-100 text-blue-700",
  test_pending: "bg-yellow-100 text-yellow-700",
  test_sent: "bg-yellow-100 text-yellow-700",
  test_in_progress: "bg-yellow-100 text-yellow-700",
  test_submitted: "bg-indigo-100 text-indigo-700",
  test_assessed: "bg-indigo-100 text-indigo-700",
  negotiation: "bg-purple-100 text-purple-700",
  staff_review: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  waitlisted: "bg-cyan-100 text-cyan-700",
  archived: "bg-gray-100 text-gray-500",
  info_requested: "bg-amber-100 text-amber-700",
};

const TIER_LABELS: Record<string, string> = {
  standard: "Standard",
  senior: "Senior",
  expert: "Expert",
};

const TIER_COLORS: Record<string, string> = {
  standard: "bg-gray-100 text-gray-600",
  senior: "bg-blue-100 text-blue-700",
  expert: "bg-purple-100 text-purple-700",
};

// ---------- Types ----------

interface Application {
  id: string;
  application_number: string;
  full_name: string;
  email: string;
  role_type: string;
  status: string;
  ai_prescreening_score: number | null;
  assigned_tier: string | null;
  country: string;
  created_at: string;
  updated_at: string;
}

type SortField = "full_name" | "ai_prescreening_score" | "created_at";

const PAGE_SIZE = 25;

// ---------- Component ----------

export default function RecruitmentList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [applications, setApplications] = useState<Application[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({
    attention: 0,
    in_progress: 0,
    decided: 0,
    waitlist: 0,
  });

  // URL-driven state
  const activeTab = searchParams.get("tab") || "attention";
  const search = searchParams.get("search") || "";
  const sortField = (searchParams.get("sort") || "created_at") as SortField;
  const sortAsc = searchParams.get("asc") === "true";
  const page = parseInt(searchParams.get("page") || "1", 10);

  const [searchInput, setSearchInput] = useState(search);

  // Fetch tab counts
  const fetchTabCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    await Promise.all(
      Object.entries(TAB_STATUSES).map(async ([tab, statuses]) => {
        const { count, error } = await supabase
          .from("cvp_applications")
          .select("*", { count: "exact", head: true })
          .in("status", statuses);
        counts[tab] = error ? 0 : (count ?? 0);
      })
    );
    setTabCounts(counts);
  }, []);

  // Fetch applications for current tab
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = TAB_STATUSES[activeTab] || [];
      let query = supabase
        .from("cvp_applications")
        .select(
          "id, application_number, full_name, email, role_type, status, ai_prescreening_score, assigned_tier, country, created_at, updated_at",
          { count: "exact" }
        )
        .in("status", statuses);

      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,email.ilike.%${search}%,application_number.ilike.%${search}%`
        );
      }

      query = query.order(sortField, { ascending: sortAsc });

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      setApplications((data as Application[]) || []);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error("Failed to fetch applications:", err);
      setApplications([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, sortField, sortAsc, page]);

  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // URL update helpers
  const setParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab, ...(search ? { search } : {}) });
  };

  const handleSearch = () => {
    setParam("search", searchInput);
    setParam("page", "");
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setParam("asc", sortAsc ? "" : "true");
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("sort", field);
        next.delete("asc");
        return next;
      });
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (field !== sortField)
      return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return sortAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
    );
  };

  const getAiScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-400";
    if (score >= 70) return "text-green-600 font-semibold";
    if (score >= 50) return "text-yellow-600 font-semibold";
    return "text-red-600 font-semibold";
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserPlus className="w-6 h-6 text-teal-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Vendor Recruitment
            </h1>
            <p className="text-sm text-gray-500">
              Manage freelance translator and cognitive debriefing applications
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            fetchTabCounts();
            fetchApplications();
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {Object.entries(TAB_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === key
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {label}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === key
                  ? "bg-teal-100 text-teal-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {tabCounts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or application number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            onClick={() => {
              setSearchInput("");
              setParam("search", "");
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
            <span className="ml-2 text-gray-500">Loading applications...</span>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <UserPlus className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium">No applications found</p>
            <p className="text-sm mt-1">
              {search
                ? "Try adjusting your search terms"
                : "No applications in this category yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Application #
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                    onClick={() => handleSort("full_name")}
                  >
                    <span className="flex items-center gap-1">
                      Name & Email
                      <SortIcon field="full_name" />
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Country
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                    onClick={() => handleSort("ai_prescreening_score")}
                  >
                    <span className="flex items-center gap-1">
                      AI Score
                      <SortIcon field="ai_prescreening_score" />
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">Tier</th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Status
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                    onClick={() => handleSort("created_at")}
                  >
                    <span className="flex items-center gap-1">
                      Applied
                      <SortIcon field="created_at" />
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Last Update
                  </th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/recruitment/${app.id}`}
                        className="font-mono text-teal-600 hover:text-teal-800 hover:underline"
                      >
                        {app.application_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/recruitment/${app.id}`}
                        className="hover:text-teal-700"
                      >
                        <div className="font-medium text-gray-900">
                          {app.full_name}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {app.email}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          app.role_type === "translator"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {app.role_type === "translator"
                          ? "Translator"
                          : "Cog. Debrief"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{app.country}</td>
                    <td className="px-4 py-3">
                      <span className={getAiScoreColor(app.ai_prescreening_score)}>
                        {app.ai_prescreening_score !== null
                          ? app.ai_prescreening_score
                          : "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {app.assigned_tier ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            TIER_COLORS[app.assigned_tier] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {TIER_LABELS[app.assigned_tier] || app.assigned_tier}
                        </span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[app.status] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {STATUS_LABELS[app.status] || app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {format(new Date(app.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(app.updated_at), {
                        addSuffix: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-600">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setParam("page", String(page - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setParam("page", String(page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
