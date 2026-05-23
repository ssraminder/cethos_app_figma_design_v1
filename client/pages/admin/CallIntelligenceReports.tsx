import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Brain,
  TrendingUp,
  Users,
  MessageSquare,
  Target,
  ArrowLeft,
} from "lucide-react";
import { format, subDays } from "date-fns";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface ReportRow {
  id: string;
  period_start: string;
  period_end: string;
  trigger_type: "cron" | "manual";
  status: "pending" | "running" | "completed" | "failed";
  calls_analyzed: number;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  emailed_to: string[] | null;
  executive_summary: string | null;
  quality_score: number | null;
  sentiment_breakdown: { positive: number; neutral: number; negative: number } | null;
  created_by_name: string | null;
}

interface FullReport extends ReportRow {
  report_json: ReportJson | null;
  report_html: string | null;
}

interface ReportJson {
  executive_summary: string;
  quality_score: number;
  calls_analyzed: number;
  avg_duration_sec?: number;
  top_topics: Array<{ topic: string; count: number; sentiment: string }>;
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  training_highlights: Array<{
    type: "good_example" | "improvement";
    staff_name: string | null;
    call_date: string;
    note: string;
  }>;
  staff_performance: Array<{
    staff_name: string;
    calls: number;
    avg_quality: number;
    sentiment_positive: number;
    sentiment_neutral: number;
    sentiment_negative: number;
    notes: string;
  }>;
  action_items: string[];
  customer_patterns: Array<{
    pattern: string;
    frequency: number;
    recommendation: string;
  }>;
  label_breakdown: Array<{
    label: string;
    count: number;
    avg_duration_sec: number;
  }>;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function CallIntelligenceReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedReport, setSelectedReport] = useState<FullReport | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Date range for manual trigger
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  // Expanded report in history
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) navigate("/admin/login");
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("comms_list_intelligence_reports", {
        p_limit: 20,
        p_offset: 0,
      });
      if (error) throw error;
      setReports((data ?? []) as ReportRow[]);

      // Auto-load the latest completed report
      const latest = ((data ?? []) as ReportRow[]).find(r => r.status === "completed");
      if (latest) {
        loadReportDetail(latest.id);
      }
    } catch {
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const loadReportDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const { data, error } = await supabase.rpc("comms_get_intelligence_report", { p_id: id });
      if (error) throw error;
      setSelectedReport(data as FullReport);
    } catch {
      toast.error("Failed to load report detail");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
      const { data, error } = await supabase.functions.invoke("rc-call-intelligence-report", {
        body: {
          period_start: new Date(dateFrom).toISOString(),
          period_end: new Date(dateTo + "T23:59:59").toISOString(),
          created_by: session.staffId || null,
        },
      });

      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;

      if (result.ok) {
        toast.success(`Report generated — ${result.calls_analyzed} calls analyzed`);
        fetchReports();
      } else {
        toast.error(result.error || "Report generation failed");
      }
    } catch (err) {
      toast.error("Failed to generate report");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const rj = selectedReport?.report_json;
  const sentiment = rj?.sentiment_breakdown;
  const sentimentTotal = (sentiment?.positive ?? 0) + (sentiment?.neutral ?? 0) + (sentiment?.negative ?? 0) || 1;
  const positivePct = Math.round(((sentiment?.positive ?? 0) / sentimentTotal) * 100);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center text-sm text-gray-500 mb-2">
            <button onClick={() => navigate("/admin/calls")} className="hover:text-gray-700 font-medium">
              Calls
            </button>
            <span className="mx-2">&rsaquo;</span>
            <span className="text-gray-900">Intelligence Reports</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Brain className="w-6 h-6 text-blue-600" />
                Call Intelligence Reports
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                AI-powered weekly analysis of call transcripts for quality, training, and customer insights
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
                {generating ? "Generating..." : "Generate Report"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats Row */}
        {rj && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatBox
                value={String(rj.calls_analyzed)}
                label="Calls Analyzed"
                color="text-blue-700"
                bg="bg-blue-50"
              />
              <StatBox
                value={rj.quality_score.toFixed(1)}
                label="Quality Score"
                color={rj.quality_score >= 8 ? "text-green-700" : "text-amber-700"}
                bg={rj.quality_score >= 8 ? "bg-green-50" : "bg-amber-50"}
              />
              <StatBox
                value={rj.avg_duration_sec ? formatDuration(rj.avg_duration_sec) : "—"}
                label="Avg Duration"
                color="text-purple-700"
                bg="bg-purple-50"
              />
              <StatBox
                value={`${positivePct}%`}
                label="Positive Sentiment"
                color="text-green-700"
                bg="bg-green-50"
              />
              <StatBox
                value={String(rj.action_items?.length ?? 0)}
                label="Action Items"
                color="text-amber-700"
                bg="bg-amber-50"
              />
            </div>

            {/* Executive Summary */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Executive Summary</h3>
                  <p className="text-sm text-gray-500">
                    {formatDateRange(selectedReport!.period_start, selectedReport!.period_end)}
                  </p>
                </div>
                <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                  Completed
                </span>
              </div>
              <div className="p-6">
                <div className="flex items-start gap-6">
                  {/* Quality Gauge */}
                  <div className="flex-shrink-0">
                    <div
                      className="w-28 h-28 rounded-full flex items-center justify-center"
                      style={{
                        background: `conic-gradient(${rj.quality_score >= 8 ? '#16a34a' : '#f59e0b'} 0deg ${rj.quality_score * 36}deg, #e5e7eb ${rj.quality_score * 36}deg 360deg)`,
                      }}
                    >
                      <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
                        <span className={`text-2xl font-bold ${rj.quality_score >= 8 ? 'text-green-600' : 'text-amber-600'}`}>
                          {rj.quality_score.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-500">Quality</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line flex-1">
                    {rj.executive_summary}
                  </div>
                </div>
              </div>
            </div>

            {/* Two columns: Topics + Sentiment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Topics */}
              <Card title="Top Topics" icon={<MessageSquare className="w-4 h-4 text-blue-600" />}>
                <div className="flex flex-wrap gap-2">
                  {rj.top_topics?.map((t, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                        t.sentiment === "negative"
                          ? "bg-red-50 text-red-700"
                          : t.sentiment === "positive"
                          ? "bg-green-50 text-green-700"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {t.topic}
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-xs text-white ${
                          t.sentiment === "negative"
                            ? "bg-red-500"
                            : t.sentiment === "positive"
                            ? "bg-green-500"
                            : "bg-blue-500"
                        }`}
                      >
                        {t.count}
                      </span>
                    </span>
                  ))}
                </div>
              </Card>

              {/* Sentiment + Label Breakdown */}
              <Card title="Sentiment Analysis" icon={<TrendingUp className="w-4 h-4 text-green-600" />}>
                {/* Sentiment bar */}
                <div className="flex h-5 rounded-full overflow-hidden mb-3">
                  {sentiment && (
                    <>
                      <div className="bg-green-500" style={{ width: `${(sentiment.positive / sentimentTotal) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(sentiment.neutral / sentimentTotal) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(sentiment.negative / sentimentTotal) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="flex gap-5 text-xs text-gray-600 mb-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    Positive ({sentiment?.positive ?? 0})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    Neutral ({sentiment?.neutral ?? 0})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    Negative ({sentiment?.negative ?? 0})
                  </span>
                </div>

                {/* Label breakdown */}
                {rj.label_breakdown && rj.label_breakdown.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Label Breakdown</p>
                    <div className="space-y-1.5">
                      {rj.label_breakdown.map((lb, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-900">{lb.label}</span>
                          <span className="text-gray-500">
                            {lb.count} calls &middot; avg {formatDuration(lb.avg_duration_sec)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Two columns: Action Items + Training */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Action Items */}
              <Card title="Action Items" icon={<Target className="w-4 h-4 text-amber-600" />}>
                <div className="space-y-3">
                  {rj.action_items?.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Training Highlights */}
              <Card title="Training Highlights" icon={<Users className="w-4 h-4 text-purple-600" />}>
                <div className="space-y-2">
                  {rj.training_highlights?.map((h, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-sm ${
                        h.type === "good_example"
                          ? "bg-green-50 border-l-3 border-green-500"
                          : "bg-amber-50 border-l-3 border-amber-500"
                      }`}
                      style={{ borderLeftWidth: 3 }}
                    >
                      <p className={`text-xs font-semibold uppercase mb-1 ${
                        h.type === "good_example" ? "text-green-600" : "text-amber-600"
                      }`}>
                        {h.type === "good_example" ? "Good Example" : "Area for Improvement"}
                      </p>
                      {h.staff_name && (
                        <p className="font-medium text-gray-900">
                          {h.staff_name} {h.call_date ? `— ${h.call_date}` : ""}
                        </p>
                      )}
                      <p className="text-gray-700 mt-0.5">{h.note}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Staff Performance */}
            {rj.staff_performance && rj.staff_performance.length > 0 && (
              <Card title="Staff Performance" icon={<Users className="w-4 h-4 text-blue-600" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-gray-600 uppercase text-xs">Staff</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600 uppercase text-xs">Calls</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600 uppercase text-xs">Quality</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600 uppercase text-xs">Sentiment</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600 uppercase text-xs">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rj.staff_performance.map((sp, i) => {
                        const spTotal = sp.sentiment_positive + sp.sentiment_neutral + sp.sentiment_negative || 1;
                        return (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-3 font-medium text-gray-900">{sp.staff_name}</td>
                            <td className="py-2.5 px-3 text-gray-700">{sp.calls}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                sp.avg_quality >= 8 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                              }`}>
                                {sp.avg_quality.toFixed(1)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex gap-0.5 items-center">
                                <div className="h-1.5 rounded bg-green-500" style={{ width: `${(sp.sentiment_positive / spTotal) * 80}px` }} />
                                <div className="h-1.5 rounded bg-amber-400" style={{ width: `${(sp.sentiment_neutral / spTotal) * 80}px` }} />
                                <div className="h-1.5 rounded bg-red-500" style={{ width: `${(sp.sentiment_negative / spTotal) * 80}px` }} />
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-gray-500 text-xs">{sp.notes}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Customer Patterns */}
            {rj.customer_patterns && rj.customer_patterns.length > 0 && (
              <Card title="Customer Patterns" icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}>
                <div className="space-y-3">
                  {rj.customer_patterns.map((cp, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-gray-900">{cp.pattern}</p>
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                          {cp.frequency}x
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{cp.recommendation}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* No report yet */}
        {!rj && !loadingDetail && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Brain className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No reports yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Generate your first call intelligence report by selecting a date range and clicking "Generate Report".
            </p>
          </div>
        )}

        {loadingDetail && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading report...</p>
          </div>
        )}

        {/* Report History */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Report History</h3>
            <button onClick={fetchReports} className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs">Period</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs">Calls</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs">Quality</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs">Sentiment</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs">Trigger</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs">Generated</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      No reports generated yet
                    </td>
                  </tr>
                )}
                {reports.map(r => {
                  const qs = r.quality_score;
                  const sb = r.sentiment_breakdown;
                  const sbTotal = (sb?.positive ?? 0) + (sb?.neutral ?? 0) + (sb?.negative ?? 0) || 1;
                  const posPct = sb ? Math.round((sb.positive / sbTotal) * 100) : null;
                  const isSelected = selectedReport?.id === r.id;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => { if (r.status === "completed") loadReportDetail(r.id); }}
                      className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                        isSelected ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {formatDateRange(r.period_start, r.period_end)}
                      </td>
                      <td className="py-3 px-4 text-gray-700">{r.calls_analyzed}</td>
                      <td className="py-3 px-4">
                        {qs != null ? (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            qs >= 8 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {Number(qs).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {posPct != null ? `${posPct}% positive` : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.trigger_type === "cron"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-purple-100 text-purple-700"
                        }`}>
                          {r.trigger_type === "cron" ? "Weekly" : "Manual"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {formatTimestamp(r.created_at)}
                        {r.created_by_name && (
                          <span className="text-gray-400 ml-1">by {r.created_by_name}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────────────────────────── */

function StatBox({ value, label, color, bg }: { value: string; label: string; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-5 text-center border border-gray-100`}>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    completed: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
    running: { bg: "bg-blue-100", text: "text-blue-700", label: "Running" },
    pending: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
    failed: { bg: "bg-red-100", text: "text-red-700", label: "Failed" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

/* ── Utilities ────────────────────────────────────────────────────── */

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatDateRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    return `${format(s, "MMM d")} - ${format(e, "MMM d, yyyy")}`;
  } catch {
    return `${start} - ${end}`;
  }
}

function formatTimestamp(ts: string): string {
  try {
    return format(new Date(ts), "MMM d, h:mm a");
  } catch {
    return ts;
  }
}
