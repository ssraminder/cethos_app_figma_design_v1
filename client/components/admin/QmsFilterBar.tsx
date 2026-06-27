/**
 * QmsFilterBar — one reusable search/filter bar for every QMS-hub list page.
 *
 * A search input plus any number of select dropdowns and checkbox toggles, with
 * a live "showing X of Y" count and a Clear button that resets every control.
 * Filtering itself stays in the host page (client-side over the loaded set, or
 * fed into the host's query) — this component is presentation + wiring only, so
 * each page keeps its own data shape while sharing one consistent look.
 */

import { Search, X } from "lucide-react";

export interface FilterSelectDef {
  id: string;
  /** Short label shown as the "all" option, e.g. "All statuses". */
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export interface FilterToggleDef {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface QmsFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  selects?: FilterSelectDef[];
  toggles?: FilterToggleDef[];
  /** Number of rows after filtering — shown as "X of Y" when totalCount given. */
  resultCount?: number;
  totalCount?: number;
  /** Extra controls rendered at the right of the bar (e.g. a refresh button). */
  rightSlot?: React.ReactNode;
  className?: string;
}

export function QmsFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  selects = [],
  toggles = [],
  resultCount,
  totalCount,
  rightSlot,
  className = "",
}: QmsFilterBarProps) {
  const anyActive =
    search.trim().length > 0 ||
    selects.some((s) => s.value) ||
    toggles.some((t) => t.checked);

  const clearAll = () => {
    onSearchChange("");
    selects.forEach((s) => s.onChange(""));
    toggles.forEach((t) => t.onChange(false));
  };

  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>

        {selects.map((s) => (
          <select
            key={s.id}
            value={s.value}
            onChange={(e) => s.onChange(e.target.value)}
            aria-label={s.label}
            className={`rounded-lg border bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none ${
              s.value ? "border-teal-400 text-slate-800" : "border-slate-300 text-slate-600"
            }`}
          >
            <option value="">{s.label}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}

        {toggles.map((t) => (
          <label
            key={t.id}
            className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600"
          >
            <input
              type="checkbox"
              checked={t.checked}
              onChange={(e) => t.onChange(e.target.checked)}
              className="rounded border-slate-300"
            />
            {t.label}
          </label>
        ))}

        {anyActive && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}

        {rightSlot}
      </div>

      {totalCount != null && (
        <p className="mt-2 text-xs text-slate-400">
          Showing {resultCount ?? totalCount} of {totalCount}
          {anyActive ? " (filtered)" : ""}
        </p>
      )}
    </div>
  );
}
