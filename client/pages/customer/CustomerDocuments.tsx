import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import {
  FileText,
  Search,
  Download,
  FolderOpen,
  Trophy,
  FilePen,
  File,
} from "lucide-react";

export default function CustomerDocuments() {
  const { customer } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!customer?.id) return;
    fetchDocuments();
  }, [customer?.id]);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-customer-documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customer_id: customer!.id,
            context: "all",
          }),
        },
      );
      const data = await response.json();
      if (data.success) {
        setFiles(data.files || []);
        setQuotes(data.quotes || []);
      } else {
        setError(data.error || "Failed to load documents");
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const tabs = useMemo(() => {
    const source = files.filter((f) => f.display_category === "source");
    const completed = files.filter((f) => f.display_category === "completed");
    const drafts = files.filter((f) => f.category === "draft_translation");
    const reference = files.filter((f) => f.display_category === "reference");
    const staff = files.filter(
      (f) =>
        f.is_staff_created &&
        f.category !== "draft_translation" &&
        f.category !== "final_deliverable",
    );

    return [
      { id: "all", label: "All Files", count: files.length },
      { id: "source", label: "Source Documents", count: source.length },
      { id: "completed", label: "Completed", count: completed.length },
      { id: "drafts", label: "Drafts", count: drafts.length },
      { id: "reference", label: "Reference", count: reference.length },
      { id: "staff", label: "Staff Files", count: staff.length },
    ];
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;

    if (activeTab === "source")
      result = result.filter((f) => f.display_category === "source");
    else if (activeTab === "completed")
      result = result.filter((f) => f.display_category === "completed");
    else if (activeTab === "drafts")
      result = result.filter((f) => f.category === "draft_translation");
    else if (activeTab === "reference")
      result = result.filter((f) => f.display_category === "reference");
    else if (activeTab === "staff")
      result = result.filter(
        (f) =>
          f.is_staff_created &&
          f.category !== "draft_translation" &&
          f.category !== "final_deliverable",
      );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => f.filename.toLowerCase().includes(q));
    }

    return result;
  }, [files, activeTab, searchQuery]);

  const groupedFiles = useMemo(() => {
    const groups: Record<string, { quote: any; order: any; files: any[] }> = {};

    for (const file of filteredFiles) {
      const key = file.quote_id || "unknown";
      if (!groups[key]) {
        const quote = quotes.find((q) => q.id === file.quote_id);
        groups[key] = {
          quote: quote || { quote_number: "Unknown" },
          order: quote?.order || null,
          files: [],
        };
      }
      groups[key].files.push(file);
    }

    return Object.values(groups);
  }, [filteredFiles, quotes]);

  const getCategoryBadgeClasses = (file: any) => {
    if (file.category === "final_deliverable")
      return "bg-green-100 text-green-800";
    if (file.category === "draft_translation")
      return "bg-yellow-100 text-yellow-800";
    if (file.is_staff_created) return "bg-gray-100 text-gray-800";
    return "bg-blue-100 text-blue-800";
  };

  const getFileIcon = (file: any) => {
    if (file.category === "final_deliverable")
      return <Trophy className="w-5 h-5 text-green-600" />;
    if (file.category === "draft_translation")
      return <FilePen className="w-5 h-5 text-yellow-600" />;
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const getReviewLabel = (status: string) => {
    if (status === "pending_review") return " · Pending Review";
    if (status === "approved") return " · Approved";
    if (status === "changes_requested") return " · Changes Requested";
    return "";
  };

  return (
    <CustomerLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Documents</h1>
          <p className="text-gray-600 mt-2">
            All files across your quotes and orders
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 overflow-x-auto mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-teal-600 text-teal-700 font-semibold"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-xs">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No documents found
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery
                ? "Try a different search term"
                : "Your documents will appear here after you submit a quote"}
            </p>
            <Link
              to="/dashboard/quotes"
              className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              View Quotes
            </Link>
          </div>
        ) : (
          groupedFiles.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-6">
              {/* Group header */}
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide py-2">
                <Link
                  to={`/dashboard/quotes/${group.quote?.id}`}
                  className="text-teal-600 hover:text-teal-800 hover:underline"
                >
                  {group.quote?.quote_number || "Quote"}
                </Link>
                {group.order && (
                  <>
                    <span className="text-gray-400">&rarr;</span>
                    <Link
                      to={`/dashboard/orders/${group.order?.id}`}
                      className="text-teal-600 hover:text-teal-800 hover:underline"
                    >
                      {group.order?.order_number || "Order"}
                    </Link>
                  </>
                )}
              </div>

              {/* Files */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100">
                {group.files.map((file: any) => (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      file.review_status === "changes_requested"
                        ? "opacity-60"
                        : ""
                    }`}
                  >
                    <div className="flex-shrink-0">{getFileIcon(file)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {file.filename}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${getCategoryBadgeClasses(file)}`}
                        >
                          {file.category_name}
                          {getReviewLabel(file.review_status)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {file.size
                          ? `${(file.size / 1024).toFixed(0)} KB`
                          : ""}
                        {file.size ? " · " : ""}
                        {new Date(file.created_at).toLocaleDateString()}
                        {file.is_staff_created ? " · Staff" : ""}
                      </div>
                    </div>
                    {file.signed_url && (
                      <a
                        href={file.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-colors ${
                          file.category === "final_deliverable"
                            ? "bg-teal-600 text-white hover:bg-teal-700"
                            : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </CustomerLayout>
  );
}
