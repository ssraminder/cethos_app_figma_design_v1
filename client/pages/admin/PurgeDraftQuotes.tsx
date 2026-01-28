import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

interface PurgeLog {
  action: string;
  details: {
    cutoff_date: string;
    quotes_deleted: number;
    files_deleted: number;
    analysis_deleted: number;
  };
  created_at: string;
}

export default function PurgeDraftQuotes() {
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<any>(null);
  const [purgeHistory, setPurgeHistory] = useState<PurgeLog[]>([]);
  const [oldQuotesCount, setOldQuotesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPurgeHistory();
    fetchOldQuotesCount();
  }, []);

  const fetchOldQuotesCount = async () => {
    if (!supabase) return;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14);

      const { count } = await supabase
        .from("quotes")
        .select("*", { count: "exact", head: true })
        .in("status", ["draft", "details_pending"])
        .lt("created_at", cutoffDate.toISOString())
        .is("deleted_at", null);

      setOldQuotesCount(count || 0);
    } catch (error) {
      console.error("Error fetching old quotes count:", error);
    }
  };

  const fetchPurgeHistory = async () => {
    if (!supabase) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("staff_activity_log")
        .select("action, details, created_at")
        .eq("action", "auto_purge_draft_quotes")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setPurgeHistory((data as PurgeLog[]) || []);
    } catch (error) {
      console.error("Error fetching purge history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurge = async () => {
    if (!supabase) return;

    if (
      !confirm(
        `Are you sure you want to purge draft quotes older than 2 weeks?\n\nThis will permanently delete ${oldQuotesCount} quotes and their related data.\n\nThis action cannot be undone.`,
      )
    ) {
      return;
    }

    setIsPurging(true);
    setPurgeResult(null);

    try {
      // Call the purge function via RPC
      const { data, error } = await supabase.rpc("purge_old_draft_quotes");

      if (error) throw error;

      const result = data?.[0] || {
        deleted_count: 0,
        purge_date: new Date().toISOString(),
        details: {},
      };

      setPurgeResult(result);

      // Refresh counts and history
      await fetchOldQuotesCount();
      await fetchPurgeHistory();
    } catch (error: any) {
      console.error("Error purging quotes:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Purge Draft Quotes</h1>
        <p className="text-sm text-gray-600 mt-1">
          Automatically delete old draft and incomplete quotes to keep the
          database clean
        </p>
      </div>

      {/* Stats Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Quotes Ready to Purge
            </h2>
            <p className="text-sm text-gray-600">
              Draft and incomplete quotes older than 14 days
            </p>
            <div className="mt-4">
              <div className="text-4xl font-bold text-gray-900">
                {oldQuotesCount}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Will be permanently deleted
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handlePurge}
              disabled={isPurging || oldQuotesCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isPurging ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Purging...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Run Purge Now
                </>
              )}
            </button>
            <button
              onClick={fetchOldQuotesCount}
              disabled={isPurging}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Count
            </button>
          </div>
        </div>
      </div>

      {/* Result Alert */}
      {purgeResult && (
        <div
          className={`rounded-lg border p-4 mb-6 ${
            purgeResult.deleted_count > 0
              ? "bg-green-50 border-green-200"
              : "bg-blue-50 border-blue-200"
          }`}
        >
          <div className="flex items-start gap-3">
            {purgeResult.deleted_count > 0 ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p
                className={`font-semibold ${
                  purgeResult.deleted_count > 0
                    ? "text-green-900"
                    : "text-blue-900"
                }`}
              >
                {purgeResult.deleted_count > 0
                  ? `Successfully purged ${purgeResult.deleted_count} quotes`
                  : "No quotes found to purge"}
              </p>
              <div className="mt-2 text-sm text-gray-700 space-y-1">
                <p>
                  • Quotes deleted: {purgeResult.details.quotes_deleted || 0}
                </p>
                <p>• Files deleted: {purgeResult.details.files_deleted || 0}</p>
                <p>
                  • Analysis records deleted:{" "}
                  {purgeResult.details.analysis_deleted || 0}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Cutoff date:{" "}
                  {purgeResult.details.cutoff_date
                    ? format(
                        new Date(purgeResult.details.cutoff_date),
                        "MMM d, yyyy h:mm a",
                      )
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">
                What Gets Purged?
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Draft quotes older than 14 days</li>
                <li>• Incomplete quotes (no customer info)</li>
                <li>• Related files and AI analysis</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">
                Automatic Schedule
              </h3>
              <p className="text-sm text-amber-800">
                Purge runs automatically every day at 2:00 AM UTC via GitHub
                Actions workflow.
              </p>
              <p className="text-xs text-amber-700 mt-2">
                See code/.github/workflows/purge-draft-quotes.yml
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Purge History */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Purge History</h2>
          <p className="text-sm text-gray-600 mt-1">Last 10 purge operations</p>
        </div>

        <div className="divide-y divide-gray-200">
          {loading ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading history...
            </div>
          ) : purgeHistory.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <AlertCircle className="w-6 h-6 mx-auto mb-2" />
              No purge history found
            </div>
          ) : (
            purgeHistory.map((log, index) => (
              <div key={index} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Purged {log.details.quotes_deleted || 0} quotes
                    </p>
                    <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                      <p>
                        Files: {log.details.files_deleted || 0} • Analysis:{" "}
                        {log.details.analysis_deleted || 0}
                      </p>
                      <p>
                        Cutoff:{" "}
                        {log.details.cutoff_date
                          ? format(
                              new Date(log.details.cutoff_date),
                              "MMM d, yyyy",
                            )
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm text-gray-700">
                      {format(new Date(log.created_at), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(log.created_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
