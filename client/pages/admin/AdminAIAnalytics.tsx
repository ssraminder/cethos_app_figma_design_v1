import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle,
  Clock,
  RefreshCw,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { format, subDays } from "date-fns";

interface Metrics {
  overall_accuracy: number;
  language_accuracy: number;
  document_type_accuracy: number;
  complexity_accuracy: number;
  hitl_trigger_rate: number;
  hitl_correction_rate: number;
  avg_hitl_time_minutes: number;
  total_documents_processed: number;
}

interface DailyMetric {
  metric_date: string;
  overall_accuracy: number;
  language_accuracy: number;
  document_type_accuracy: number;
  hitl_trigger_rate: number;
}

interface CommonError {
  field_name: string;
  ai_value: string;
  corrected_value: string;
  occurrences: number;
}

interface Recommendation {
  id: string;
  threshold_type: string;
  current_value: number;
  suggested_threshold: number;
  correction_rate: number;
  analysis_date: string;
}

export default function AdminAIAnalytics() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [commonErrors, setCommonErrors] = useState<CommonError[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: latestMetrics } = await supabase
        .from("ai_performance_metrics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(1)
        .single();

      if (latestMetrics) {
        setMetrics({
          overall_accuracy: latestMetrics.overall_accuracy || 0,
          language_accuracy: latestMetrics.language_accuracy || 0,
          document_type_accuracy: latestMetrics.document_type_accuracy || 0,
          complexity_accuracy: latestMetrics.complexity_accuracy || 0,
          hitl_trigger_rate: latestMetrics.hitl_trigger_rate || 0,
          hitl_correction_rate: latestMetrics.hitl_correction_rate || 0,
          avg_hitl_time_minutes: latestMetrics.avg_hitl_time_minutes || 0,
          total_documents_processed:
            latestMetrics.total_documents_processed || 0,
        });
      }

      const startDate = format(
        subDays(new Date(), parseInt(period, 10)),
        "yyyy-MM-dd",
      );

      const { data: daily } = await supabase
        .from("ai_performance_metrics")
        .select(
          "metric_date, overall_accuracy, language_accuracy, document_type_accuracy, hitl_trigger_rate",
        )
        .gte("metric_date", startDate)
        .order("metric_date");

      setDailyMetrics(daily || []);

      const { data: corrections } = await supabase
        .from("hitl_corrections")
        .select("field_name, ai_value, corrected_value")
        .gte("corrected_at", startDate);

      const errorMap = new Map<string, CommonError>();
      (corrections || []).forEach((correction) => {
        const key = `${correction.field_name}|${correction.ai_value}|${correction.corrected_value}`;
        const existing = errorMap.get(key);
        if (existing) {
          existing.occurrences += 1;
        } else {
          errorMap.set(key, {
            field_name: correction.field_name,
            ai_value: correction.ai_value || "—",
            corrected_value: correction.corrected_value || "—",
            occurrences: 1,
          });
        }
      });

      const sortedErrors = Array.from(errorMap.values())
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 10);
      setCommonErrors(sortedErrors);

      const { data: recs } = await supabase
        .from("ai_pattern_analysis")
        .select("*")
        .order("analysis_date", { ascending: false })
        .limit(5);

      setRecommendations(
        (recs || []).map((rec) => ({
          id: rec.id,
          threshold_type: rec.correction_type || rec.document_type || "General",
          current_value: 0.7,
          suggested_threshold: rec.suggested_threshold || 0,
          correction_rate: rec.correction_rate || 0,
          analysis_date: rec.analysis_date,
        })),
      );
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="w-7 h-7 text-teal-600" />
            AI Analytics
          </h1>
          <p className="text-gray-500 mt-1">
            {metrics?.total_documents_processed?.toLocaleString() || 0}{" "}
            documents processed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(event) =>
              setPeriod(event.target.value as "7" | "30" | "90")
            }
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button
            onClick={fetchData}
            className="p-2 text-gray-400 hover:text-teal-600"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Overall Accuracy</span>
            <Target className="w-5 h-5 text-teal-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatPercent(metrics?.overall_accuracy || 0)}
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Language Detection</span>
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatPercent(metrics?.language_accuracy || 0)}
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Document Type</span>
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatPercent(metrics?.document_type_accuracy || 0)}
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">HITL Trigger Rate</span>
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatPercent(metrics?.hitl_trigger_rate || 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            Accuracy Trend
          </h2>
          {dailyMetrics.length > 0 ? (
            <div className="h-64 flex items-end gap-1">
              {dailyMetrics.map((metric) => (
                <div
                  key={metric.metric_date}
                  className="flex-1 bg-teal-500 rounded-t hover:bg-teal-600 transition-colors"
                  style={{ height: `${(metric.overall_accuracy || 0) * 100}%` }}
                  title={`${format(new Date(metric.metric_date), "MMM d")}: ${formatPercent(metric.overall_accuracy)}`}
                />
              ))}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-gray-400" />
            HITL Performance
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Correction Rate</span>
              <span className="font-semibold">
                {formatPercent(metrics?.hitl_correction_rate || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Avg Review Time</span>
              <span className="font-semibold flex items-center gap-1">
                <Clock className="w-4 h-4 text-gray-400" />
                {metrics?.avg_hitl_time_minutes || 0} min
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Trigger Rate</span>
              <span className="font-semibold">
                {formatPercent(metrics?.hitl_trigger_rate || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-gray-400" />
          Common Errors
        </h2>
        {commonErrors.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">
                  Field
                </th>
                <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">
                  AI Predicted
                </th>
                <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">
                  Correct Value
                </th>
                <th className="text-right px-4 py-2 text-sm font-medium text-gray-500">
                  Occurrences
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {commonErrors.map((err, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium capitalize">
                    {err.field_name?.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2 text-red-600">{err.ai_value}</td>
                  <td className="px-4 py-2 text-green-600">
                    {err.corrected_value}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {err.occurrences}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-center py-8">
            No errors recorded in this period
          </p>
        )}
      </div>

      {recommendations.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            Threshold Recommendations
          </h2>
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {rec.threshold_type}
                  </p>
                  <p className="text-sm text-gray-500">
                    Correction rate: {formatPercent(rec.correction_rate)} •
                    Current: {formatPercent(rec.current_value)} → Suggested:{" "}
                    {formatPercent(rec.suggested_threshold)}
                  </p>
                </div>
                <button className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm">
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
