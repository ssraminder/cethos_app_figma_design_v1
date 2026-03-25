import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";

export interface MultiOption {
  value: string;
  label: string;
  group?: string;
}

interface CompactMultiSearchableSelectProps {
  options: MultiOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  groupOrder?: string[];
}

export default function CompactMultiSearchableSelect({
  options,
  values,
  onChange,
  placeholder = "Select...",
  groupOrder,
}: CompactMultiSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabels = values
    .map((v) => options.find((o) => o.value === v)?.value || v)
    .join(", ");

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const hasGroups = options.some((o) => o.group);
  const grouped = filtered.reduce<Record<string, MultiOption[]>>((acc, o) => {
    const g = o.group || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(o);
    return acc;
  }, {});
  const orderedGroups = groupOrder
    ? groupOrder.filter((g) => grouped[g]?.length > 0)
    : Object.keys(grouped);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  const renderOption = (o: MultiOption) => {
    const selected = values.includes(o.value);
    return (
      <button
        key={o.value}
        type="button"
        onClick={() => toggleValue(o.value)}
        className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between hover:bg-blue-50 ${
          selected ? "bg-blue-50 text-blue-700" : "text-gray-700"
        }`}
      >
        <span className="truncate">{o.label}</span>
        {selected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
      </button>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-1.5 border rounded text-sm text-left flex items-center justify-between gap-1 ${
          isOpen ? "border-blue-400 ring-1 ring-blue-400" : "border-gray-200"
        } bg-white`}
      >
        <span className={`truncate ${values.length > 0 ? "text-gray-900" : "text-gray-400"}`}>
          {values.length > 0 ? selectedLabels : placeholder}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {values.length > 0 && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="hover:bg-gray-100 rounded p-0.5"
            >
              <X className="w-3 h-3 text-gray-400" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-[60] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[220px]">
          <div className="p-1.5 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setIsOpen(false); setSearch(""); }
                }}
              />
            </div>
          </div>
          {values.length > 0 && (
            <div className="px-2 py-1.5 border-b border-gray-100 flex flex-wrap gap-1">
              {values.map((v) => {
                const opt = options.find((o) => o.value === v);
                return (
                  <span key={v} className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded">
                    {opt?.value || v}
                    <button type="button" onClick={() => toggleValue(v)} className="hover:text-blue-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="max-h-52 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-gray-400 text-xs">No results</div>
            ) : hasGroups ? (
              orderedGroups.map((group) => (
                <div key={group}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 bg-gray-50 sticky top-0 uppercase tracking-wide">
                    {group}
                  </div>
                  {grouped[group].map(renderOption)}
                </div>
              ))
            ) : (
              filtered.map(renderOption)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
