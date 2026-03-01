import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Calendar } from "lucide-react";

export interface DateRangeOption {
  label: string;
  value: string;
  from?: string;
  to?: string;
  isSeparator?: boolean;
}

interface InvoiceDateFilterProps {
  dateField: string;
  dateFieldOptions: { value: string; label: string }[];
  onDateFieldChange: (field: string) => void;
  selectedRange: string;
  onRangeChange: (range: string, from: string, to: string) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (val: string) => void;
  onCustomToChange: (val: string) => void;
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getQuarterRange(
  year: number,
  quarter: number,
): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3;
  return {
    from: new Date(year, startMonth, 1),
    to: new Date(year, startMonth + 3, 0),
  };
}

function getCurrentQuarter(d: Date): number {
  return Math.floor(d.getMonth() / 3) + 1;
}

function generateDateRangeOptions(): DateRangeOption[] {
  const today = new Date();
  const options: DateRangeOption[] = [];

  // ── Quick ranges ──────────────────────────────────────────────────
  options.push({
    label: "Today",
    value: "today",
    from: fmt(today),
    to: fmt(today),
  });

  const monday = getMondayOfWeek(today);
  options.push({
    label: "This Week",
    value: "this_week",
    from: fmt(monday),
    to: fmt(today),
  });

  const d7 = new Date(today);
  d7.setDate(d7.getDate() - 7);
  options.push({
    label: "Last 7 Days",
    value: "last_7",
    from: fmt(d7),
    to: fmt(today),
  });

  const d30 = new Date(today);
  d30.setDate(d30.getDate() - 30);
  options.push({
    label: "Last 30 Days",
    value: "last_30",
    from: fmt(d30),
    to: fmt(today),
  });

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  options.push({
    label: "This Month",
    value: "this_month",
    from: fmt(thisMonthStart),
    to: fmt(today),
  });

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  options.push({
    label: "Last Month",
    value: "last_month",
    from: fmt(lastMonthStart),
    to: fmt(lastMonthEnd),
  });

  const currentQ = getCurrentQuarter(today);
  const thisQ = getQuarterRange(today.getFullYear(), currentQ);
  options.push({
    label: "This Quarter",
    value: "this_quarter",
    from: fmt(thisQ.from),
    to: fmt(thisQ.to),
  });

  const prevQYear = currentQ === 1 ? today.getFullYear() - 1 : today.getFullYear();
  const prevQNum = currentQ === 1 ? 4 : currentQ - 1;
  const lastQ = getQuarterRange(prevQYear, prevQNum);
  options.push({
    label: "Last Quarter",
    value: "last_quarter",
    from: fmt(lastQ.from),
    to: fmt(lastQ.to),
  });

  const thisYearStart = new Date(today.getFullYear(), 0, 1);
  options.push({
    label: "This Year",
    value: "this_year",
    from: fmt(thisYearStart),
    to: fmt(today),
  });

  const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
  options.push({
    label: "Last Year",
    value: "last_year",
    from: fmt(lastYearStart),
    to: fmt(lastYearEnd),
  });

  // ── Separator ─────────────────────────────────────────────────────
  options.push({ label: "", value: "sep1", isSeparator: true });

  // ── Monthly options from Jan 2023 to current month ────────────────
  const startYear = 2023;
  const startMonth = 0;
  const endYear = today.getFullYear();
  const endMonth = today.getMonth();

  for (let y = endYear; y >= startYear; y--) {
    const mStart = y === endYear ? endMonth : 11;
    const mEnd = y === startYear ? startMonth : 0;
    for (let m = mStart; m >= mEnd; m--) {
      const monthStart = new Date(y, m, 1);
      const monthEnd = new Date(y, m + 1, 0);
      const monthName = monthStart.toLocaleString("en-US", { month: "long" });
      options.push({
        label: `${monthName} ${y}`,
        value: `month_${y}_${m}`,
        from: fmt(monthStart),
        to: fmt(monthEnd),
      });
    }
  }

  // ── Separator ─────────────────────────────────────────────────────
  options.push({ label: "", value: "sep2", isSeparator: true });

  // ── Yearly options ────────────────────────────────────────────────
  for (let y = endYear; y >= startYear; y--) {
    const yearStart = new Date(y, 0, 1);
    const yearEnd = new Date(y, 11, 31);
    options.push({
      label: String(y),
      value: `year_${y}`,
      from: fmt(yearStart),
      to: fmt(yearEnd),
    });
  }

  // ── Separator ─────────────────────────────────────────────────────
  options.push({ label: "", value: "sep3", isSeparator: true });

  // ── Custom ────────────────────────────────────────────────────────
  options.push({ label: "Custom", value: "custom" });

  return options;
}

const ALL_OPTIONS = generateDateRangeOptions();

export default function InvoiceDateFilter({
  dateField,
  dateFieldOptions,
  onDateFieldChange,
  selectedRange,
  onRangeChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: InvoiceDateFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!searchTerm) return ALL_OPTIONS;
    const lower = searchTerm.toLowerCase();
    return ALL_OPTIONS.filter(
      (opt) => opt.isSeparator || opt.label.toLowerCase().includes(lower),
    );
  }, [searchTerm]);

  const selectedLabel =
    ALL_OPTIONS.find((o) => o.value === selectedRange)?.label || "Last 30 Days";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={dateField}
          onChange={(e) => onDateFieldChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
        >
          {dateFieldOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 bg-white min-w-[180px]"
          >
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="flex-1 text-left truncate">{selectedLabel}</span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 flex flex-col">
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search dates..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                {filtered.map((opt) => {
                  if (opt.isSeparator) {
                    return (
                      <div
                        key={opt.value}
                        className="border-t border-gray-100 my-1"
                      />
                    );
                  }
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (opt.value === "custom") {
                          onRangeChange("custom", customFrom, customTo);
                        } else {
                          onRangeChange(
                            opt.value,
                            opt.from || "",
                            opt.to || "",
                          );
                        }
                        setOpen(false);
                        setSearchTerm("");
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        selectedRange === opt.value
                          ? "bg-teal-50 text-teal-700 font-medium"
                          : "text-gray-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {filtered.filter((o) => !o.isSeparator).length === 0 && (
                  <p className="px-3 py-4 text-sm text-gray-400 text-center">
                    No matches
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedRange === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
      )}
    </div>
  );
}
