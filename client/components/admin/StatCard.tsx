import * as React from "react";

const COLOR_MAP: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-600" },
  green: { bg: "bg-green-50", text: "text-green-700", icon: "text-green-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", icon: "text-purple-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-600" },
  red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-600" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700", icon: "text-indigo-600" },
  teal: { bg: "bg-teal-50", text: "text-teal-700", icon: "text-teal-600" },
  gray: { bg: "bg-gray-50", text: "text-gray-700", icon: "text-gray-400" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  count?: number;
  icon?: React.ElementType;
  color?: keyof typeof COLOR_MAP;
  loading?: boolean;
  valueColor?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  count,
  icon: Icon,
  color = "gray",
  loading = false,
  valueColor,
}: StatCardProps) {
  const c = COLOR_MAP[color] || COLOR_MAP.gray;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
        {Icon && (
          <div className={`p-2 rounded-lg ${c.bg}`}>
            <Icon className={`w-4 h-4 ${c.icon}`} />
          </div>
        )}
      </div>
      {loading ? (
        <div className="h-8 bg-gray-100 rounded-lg animate-pulse w-28" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold tabular-nums tracking-tight ${valueColor || "text-gray-900"}`}>
            {value}
          </span>
          {count !== undefined && count > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}>
              {count}
            </span>
          )}
        </div>
      )}
      {subtext && (
        <p className="text-xs text-gray-400 mt-1.5">{subtext}</p>
      )}
    </div>
  );
}
