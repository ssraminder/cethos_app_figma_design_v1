import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface VendorNameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface VendorSuggestion {
  id: string;
  full_name: string;
  email: string;
}

export default function VendorNameAutocomplete({
  value,
  onChange,
  placeholder = "Name or email...",
}: VendorNameAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<VendorSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("vendors")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      setSuggestions(data || []);
      setIsOpen((data || []).length > 0);
    } catch {
      setSuggestions([]);
    }
    setLoading(false);
  }, []);

  const handleChange = (newValue: string) => {
    onChange(newValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(newValue), 300);
  };

  const handleSelect = (vendor: VendorSuggestion) => {
    onChange(vendor.full_name);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
          className="w-full pl-7 pr-7 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          placeholder={placeholder}
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setSuggestions([]); setIsOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-gray-100 rounded p-0.5"
          >
            <X className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-[60] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[220px]">
          <div className="max-h-48 overflow-y-auto">
            {suggestions.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => handleSelect(v)}
                className="w-full px-3 py-2 text-left hover:bg-blue-50 text-sm"
              >
                <span className="font-medium text-gray-900">{v.full_name}</span>
                <span className="text-gray-400 ml-1.5 text-xs">{v.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {isOpen && loading && (
        <div className="absolute z-[60] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-xs text-gray-400">
          Searching...
        </div>
      )}
    </div>
  );
}
