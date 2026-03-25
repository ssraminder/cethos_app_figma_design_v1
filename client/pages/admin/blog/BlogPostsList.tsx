import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  FileText,
  PenTool,
} from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "archived";
  author_name: string;
  category_name: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  archived: "bg-gray-100 text-gray-600",
};

const POSTS_PER_PAGE = 20;

export default function BlogPostsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState(false);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");

  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("cethosweb_blog_posts")
        .select(
          `id, title, slug, status, published_at, created_at, updated_at,
           cethosweb_blog_authors(name),
           cethosweb_blog_categories(name)`,
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (searchQuery.trim()) {
        query = query.ilike("title", `%${searchQuery.trim()}%`);
      }

      const { data, count, error } = await query;

      if (error) {
        console.error("Error fetching blog posts:", error);
        setPosts([]);
        setTotalCount(0);
        return;
      }

      const mapped: BlogPost[] = (data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        author_name: p.cethosweb_blog_authors?.name || "Unknown",
        category_name: p.cethosweb_blog_categories?.name || "Uncategorized",
        published_at: p.published_at,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));

      setPosts(mapped);
      setTotalCount(count || 0);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, searchQuery]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (searchQuery) params.set("q", searchQuery);
      else params.delete("q");
      params.set("page", "1");
      setSearchParams(params, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    setSearchParams(params);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} post(s)? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("cethosweb_blog_posts").delete().in("id", Array.from(selectedIds));
      if (error) throw error;
      setSelectedIds(new Set());
      fetchPosts();
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === "published") updateData.published_at = new Date().toISOString();
      const { error } = await supabase.from("cethosweb_blog_posts").update(updateData).in("id", Array.from(selectedIds));
      if (error) throw error;
      setSelectedIds(new Set());
      fetchPosts();
    } catch (err) {
      console.error("Bulk status change failed:", err);
    }
  };

  const totalPages = Math.ceil(totalCount / POSTS_PER_PAGE);
  const startItem = (currentPage - 1) * POSTS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * POSTS_PER_PAGE, totalCount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Blog Posts</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Manage your blog content
          </p>
        </div>
        <Link
          to="/admin/blog/new"
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-md transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          New Post
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg mb-6">
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <input
              type="text"
              placeholder="Search posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] focus:border-[#0d9488] outline-none"
            />
          </div>
          <div className="flex gap-2">
            {["all", "published", "draft", "scheduled", "archived"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  const params = new URLSearchParams(searchParams);
                  if (s !== "all") params.set("status", s);
                  else params.delete("status");
                  params.set("page", "1");
                  setSearchParams(params);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-[#0d9488] text-white"
                    : "text-[#64748b] hover:bg-slate-100"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Posts Table */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
                <div className="w-5 h-5 bg-gray-200 rounded" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="h-6 bg-gray-100 rounded w-20" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center">
            <PenTool className="w-12 h-12 text-[#94a3b8] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#0f172a] mb-1">No posts yet</h3>
            <p className="text-sm text-[#64748b] mb-4">
              Create your first blog post to get started.
            </p>
            <Link
              to="/admin/blog/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-md transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Post
            </Link>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === posts.length && posts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider hidden md:table-cell">
                    Author
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider hidden lg:table-cell">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider hidden sm:table-cell">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover:bg-[#f8fafc] transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(post.id)}
                        onChange={() => toggleSelect(post.id)}
                        className="rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/blog/${post.id}/edit`}
                        className="text-sm font-medium text-[#0f172a] hover:text-[#0d9488] transition-colors"
                        title={post.title}
                      >
                        {post.title}
                      </Link>
                      <p className="text-xs text-[#94a3b8] mt-0.5 truncate max-w-xs">
                        /{post.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748b] hidden md:table-cell">
                      {post.author_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748b] hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-xs">
                        {post.category_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          STATUS_STYLES[post.status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className="text-sm text-[#64748b]"
                        title={relativeTime(post.published_at || post.created_at)}
                      >
                        {formatDate(post.published_at || post.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-[#e2e8f0] flex items-center justify-between">
                <p className="text-sm text-[#64748b]">
                  Showing {startItem}&ndash;{endItem} of {totalCount}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="p-1.5 text-[#64748b] hover:text-[#0f172a] disabled:opacity-40 disabled:cursor-not-allowed rounded hover:bg-slate-100 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setPage(page)}
                        className={`w-8 h-8 text-sm rounded transition-colors ${
                          page === currentPage
                            ? "bg-[#0d9488] text-white"
                            : "text-[#64748b] hover:bg-slate-100"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 text-[#64748b] hover:text-[#0f172a] disabled:opacity-40 disabled:cursor-not-allowed rounded hover:bg-slate-100 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0f172a] text-white rounded-lg shadow-xl px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedIds.size} post(s) selected</span>
          <div className="h-5 w-px bg-slate-600" />
          <button
            onClick={() => handleBulkStatusChange("published")}
            className="flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Publish
          </button>
          <button
            onClick={() => handleBulkStatusChange("draft")}
            className="flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            <EyeOff className="w-4 h-4" />
            Unpublish
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
