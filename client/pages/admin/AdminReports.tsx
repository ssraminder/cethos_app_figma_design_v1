import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Calendar,
  DollarSign,
  Download,
  FileBarChart,
  FileText,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import {
  endOfMonth,
  format,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

type ReportType = "revenue" | "quotes" | "orders" | "conversion";
type DatePreset =
  | "today"
  | "7days"
  | "30days"
  | "this_month"
  | "last_month"
  | "custom";

interface ReportRow {
  date: string;
  count: number;
  amount?: number;
}

interface Summary {
  totalRevenue: number;
  totalQuotes: number;
  totalOrders: number;
  conversionRate: number;
}

export default function AdminReports() {
  const [reportType, setReportType] = useState<ReportType>("revenue");
  const [datePreset, setDatePreset] = useState<DatePreset>("30days");
  const [startDate, setStartDate] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalRevenue: 0,
    totalQuotes: 0,
    totalOrders: 0,
    conversionRate: 0,
  });

  useEffect(() => {
    const today = new Date();
    switch (datePreset) {
      case "today":
        setStartDate(format(today, "yyyy-MM-dd"));
        setEndDate(format(today, "yyyy-MM-dd"));
        break;
      case "7days":
        setStartDate(format(subDays(today, 7), "yyyy-MM-dd"));
        setEndDate(format(today, "yyyy-MM-dd"));
        break;
      case "30days":
        setStartDate(format(subDays(today, 30), "yyyy-MM-dd"));
        setEndDate(format(today, "yyyy-MM-dd"));
        break;
      case "this_month":
        setStartDate(format(startOfMonth(today), "yyyy-MM-dd"));
        setEndDate(format(endOfMonth(today), "yyyy-MM-dd"));
        break;
      case "last_month": {
        const lastMonth = subMonths(today, 1);
        setStartDate(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
        setEndDate(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
        break;
      }
    }
  }, [datePreset]);

  useEffect(() => {
    fetchReport();
  }, [reportType, startDate, endDate]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data: quotes, count: quoteCount } = await supabase
        .from("quotes")
        .select("*", { count: "exact" })
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");

      const { data: orders, count: orderCount } = await supabase
        .from("orders")
        .select("*", { count: "exact" })
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");

      const { data: payments } = await supabase
        .from("payments")
        .select("amount, created_at")
        .eq("status", "succeeded")
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");

      const totalRevenue = (payments || []).reduce(
        (sum, payment) => sum + (payment.amount || 0),
        0,
      );
      const conversionRate = quoteCount && quoteCount > 0 ? (orderCount || 0) / quoteCount : 0;

      setSummary({
        totalRevenue,
        totalQuotes: quoteCount || 0,
        totalOrders: orderCount || 0,
        conversionRate,
      });

      let reportData: ReportRow[] = [];

      if (reportType === "revenue") {
        const grouped = new Map<string, number>();
        (payments || []).forEach((payment) => {
          const date = format(new Date(payment.created_at), "yyyy-MM-dd");
          grouped.set(date, (grouped.get(date) || 0) + (payment.amount || 0));
        });
        reportData = Array.from(grouped.entries())
          .map(([date, amount]) => ({ date, count: 0, amount }))
          .sort((a, b) => a.date.localeCompare(b.date));
      } else if (reportType === "quotes") {
        const grouped = new Map<string, number>();
        (quotes || []).forEach((quote) => {
          const date = format(new Date(quote.created_at), "yyyy-MM-dd");
          grouped.set(date, (grouped.get(date) || 0) + 1);
        });
        reportData = Array.from(grouped.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));
      } else if (reportType === "orders") {
        const grouped = new Map<string, { count: number; amount: number }>();
        (orders || []).forEach((order) => {
          const date = format(new Date(order.created_at), "yyyy-MM-dd");
          const existing = grouped.get(date) || { count: 0, amount: 0 };
          grouped.set(date, {
            count: existing.count + 1,
            amount: existing.amount + (order.total_amount || 0),
          });
        });
        reportData = Array.from(grouped.entries())
          .map(([date, values]) => ({ date, count: values.count, amount: values.amount }))
          .sort((a, b) => a.date.localeCompare(b.date));
      } else if (reportType === "conversion") {
        const quotesByDate = new Map<string, number>();
        const ordersByDate = new Map<string, number>();
        (quotes || []).forEach((quote) => {
          const date = format(new Date(quote.created_at), "yyyy-MM-dd");
          quotesByDate.set(date, (quotesByDate.get(date) || 0) + 1);
        });
        (orders || []).forEach((order) => {
          const date = format(new Date(order.created_at), "yyyy-MM-dd");
          ordersByDate.set(date, (ordersByDate.get(date) || 0) + 1);
        });
        const allDates = new Set([...quotesByDate.keys(), ...ordersByDate.keys()]);
        reportData = Array.from(allDates)
          .map((date) => ({
            date,
            count: quotesByDate.get(date) || 0,
            amount: ordersByDate.get(date) || 0,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }

      setData(reportData);
    } catch (err) {
      console.error("Error fetching report:", err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const headers =
      reportType === "conversion"
        ? ["Date", "Quotes", "Orders"]
        : reportType === "quotes"
          ? ["Date", "Count"]
          : ["Date", "Count", "Amount"];

    const rows = data.map((row) => {
      if (reportType === "conversion") {
        return [row.date, row.count, row.amount || 0];
      }
      if (reportType === "quotes") {
        return [row.date, row.count];
      }
      return [row.date, row.count, row.amount?.toFixed(2) || "0.00"];
    });

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${reportType}-report-${startDate}-to-${endDate}.csv`;
    anchor.click();
  };

  const REPORT_TYPES = [
    { value: "revenue", label: "Revenue", icon: DollarSign },
    { value: "quotes", label: "Quotes", icon: FileText },
    { value: "orders", label: "Orders", icon: ShoppingCart },
    { value: "conversion", label: "Conversion", icon: TrendingUp },
  ];

  const DATE_PRESETS = [
    { value: "today", label: "Today" },
    { value: "7days", label: "Last 7 Days" },
    { value: "30days", label: "Last 30 Days" },
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileBarChart className="w-7 h-7 text-teal-600" />
            Reports
          </h1>
        </div>
        <button
          onClick={exportCSV}
          disabled={loading || data.length === 0}
          className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2">
            {REPORT_TYPES.map((rt) => {
              const Icon = rt.icon;
              return (
                <button
                  key={rt.value}
                  onClick={() => setReportType(rt.value as ReportType)}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                    reportType === rt.value
                      ? "bg-teal-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {rt.label}
                </button>
              );
            })}
          </div>

          <select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as DatePreset)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>

          {datePreset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Revenue</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            ${summary.totalRevenue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Quotes</span>
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {summary.totalQuotes.toLocaleString()}
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Orders</span>
            <ShoppingCart className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {summary.totalOrders.toLocaleString()}
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Conversion Rate</span>
            <TrendingUp className="w-5 h-5 text-teal-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {(summary.conversionRate * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mx-auto" />
          </div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No data for selected period
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Date
                </th>
                {reportType === "conversion" ? (
                  <>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                      Quotes
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                      Orders
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                      Rate
                    </th>
                  </>
                ) : reportType === "quotes" ? (
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                    Count
                  </th>
                ) : (
                  <>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                      Count
                    </th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                      Amount
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((row) => (
                <tr key={row.date} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {format(new Date(row.date), "MMM d, yyyy")}
                  </td>
                  {reportType === "conversion" ? (
                    <>
                      <td className="px-4 py-3 text-right">{row.count}</td>
                      <td className="px-4 py-3 text-right">{row.amount || 0}</td>
                      <td className="px-4 py-3 text-right">
                        {row.count > 0
                          ? (((row.amount || 0) / row.count) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                    </>
                  ) : reportType === "quotes" ? (
                    <td className="px-4 py-3 text-right">{row.count}</td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-right">{row.count}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        ${
                          row.amount?.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })
                        }
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
