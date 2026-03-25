import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";

export interface CompactOption {
  value: string;
  label: string;
  group?: string;
}

interface CompactSearchableSelectProps {
  options: CompactOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  groupOrder?: string[];
}

export default function CompactSearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  groupOrder,
}: CompactSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  // Group if options have groups
  const hasGroups = options.some((o) => o.group);
  const grouped = filtered.reduce<Record<string, CompactOption[]>>((acc, o) => {
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

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearch("");
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
        <span className={`truncate ${value ? "text-gray-900" : "text-gray-400"}`}>
          {selectedOption?.label || placeholder}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
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
          <div className="max-h-52 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-gray-400 text-xs">No results</div>
            ) : hasGroups ? (
              orderedGroups.map((group) => (
                <div key={group}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 bg-gray-50 sticky top-0 uppercase tracking-wide">
                    {group}
                  </div>
                  {grouped[group].map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => handleSelect(o.value)}
                      className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between hover:bg-blue-50 ${
                        o.value === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.value === value && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between hover:bg-blue-50 ${
                    o.value === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
