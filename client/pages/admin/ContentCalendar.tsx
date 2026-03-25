import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
} from "lucide-react";

interface CalendarPost {
  id: string;
  title: string;
  status: "draft" | "published" | "scheduled" | "archived";
  published_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  published: "bg-[#16a34a]",
  draft: "bg-[#d97706]",
  scheduled: "bg-[#2563eb]",
  archived: "bg-gray-400",
};

const STATUS_BG: Record<string, string> = {
  published: "bg-green-50 border-green-200 text-green-800",
  draft: "bg-amber-50 border-amber-200 text-amber-800",
  scheduled: "bg-blue-50 border-blue-200 text-blue-800",
  archived: "bg-gray-50 border-gray-200 text-gray-600",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ContentCalendar() {
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("month");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchPosts();
  }, [year, month]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(year, month, 1).toISOString();
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from("cethosweb_blog_posts")
        .select("id, title, status, published_at, created_at")
        .or(`published_at.gte.${startOfMonth},created_at.gte.${startOfMonth}`)
        .or(`published_at.lte.${endOfMonth},created_at.lte.${endOfMonth}`)
        .order("published_at", { ascending: true });

      if (error) throw error;
      setPosts(data || []);
    } catch (err) {
      console.error("Failed to fetch calendar posts:", err);
    } finally {
      setLoading(false);
    }
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: { date: number; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: prevMonthDays - i, isCurrentMonth: false });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: i, isCurrentMonth: true });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: i, isCurrentMonth: false });
    }

    return days;
  }, [year, month]);

  const getPostsForDay = (day: number) => {
    return posts.filter((p) => {
      const date = new Date(p.published_at || p.created_at);
      return date.getDate() === day && date.getMonth() === month && date.getFullYear() === year;
    });
  };

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const navigate = (dir: number) => {
    setCurrentDate(new Date(year, month + dir, 1));
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Content Calendar</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Plan and schedule your blog content
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

      {/* Calendar Controls */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg">
        <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-md transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-[#0f172a] min-w-[200px] text-center">
              {MONTHS[month]} {year}
            </h2>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-md transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1 text-xs font-medium text-[#0d9488] border border-[#0d9488] rounded-md hover:bg-teal-50 transition-colors"
            >
              Today
            </button>
          </div>
          <div className="flex gap-1 bg-[#f8fafc] rounded-md p-0.5">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                view === "month" ? "bg-white shadow-sm text-[#0f172a]" : "text-[#64748b]"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                view === "week" ? "bg-white shadow-sm text-[#0f172a]" : "text-[#64748b]"
              }`}
            >
              Week
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-[#64748b] py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 border-l border-t border-[#e2e8f0]">
            {calendarDays.map((day, i) => {
              const dayPosts = day.isCurrentMonth ? getPostsForDay(day.date) : [];
              return (
                <div
                  key={i}
                  className={`min-h-[100px] border-r border-b border-[#e2e8f0] p-1.5 ${
                    day.isCurrentMonth ? "bg-white" : "bg-[#f8fafc]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday(day.date) && day.isCurrentMonth
                          ? "bg-[#0d9488] text-white"
                          : day.isCurrentMonth
                            ? "text-[#0f172a]"
                            : "text-[#94a3b8]"
                      }`}
                    >
                      {day.date}
                    </span>
                    {day.isCurrentMonth && (
                      <Link
                        to={`/admin/blog/new?date=${year}-${String(month + 1).padStart(2, "0")}-${String(day.date).padStart(2, "0")}`}
                        className="opacity-0 hover:opacity-100 p-0.5 text-[#94a3b8] hover:text-[#0d9488] transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map((post) => (
                      <Link
                        key={post.id}
                        to={`/admin/blog/${post.id}/edit`}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border truncate ${
                          STATUS_BG[post.status] || "bg-gray-50 border-gray-200 text-gray-600"
                        } hover:opacity-80 transition-opacity`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[post.status]}`} />
                        <span className="truncate">{post.title}</span>
                      </Link>
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-[10px] text-[#64748b] pl-1">
                        +{dayPosts.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 border-t border-[#e2e8f0] flex items-center gap-4">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-xs text-[#64748b] capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
