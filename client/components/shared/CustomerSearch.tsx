// Reusable customer search for Fast Quote and Kiosk.
// Debounced query against the `customers` table by name, email, or phone.
// Calls onSelect with the picked customer so the parent can autofill fields.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Search, X, UserCheck, Loader2 } from "lucide-react";

export interface CustomerHit {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  customer_type: "individual" | "business" | null;
  company_name: string | null;
}

export interface CustomerSearchProps {
  onSelect: (customer: CustomerHit) => void;
  onClear?: () => void;
  pickedLabel?: string; // when a customer is already picked, show this as a chip
  placeholder?: string;
  autoFocus?: boolean;
}

export default function CustomerSearch({
  onSelect,
  onClear,
  pickedLabel,
  placeholder = "Search existing customer by name, email, or phone…",
  autoFocus,
}: CustomerSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        // Split query into terms — match any of name/email/phone/company
        const esc = q.replace(/[,%]/g, "").trim();
        const { data } = await supabase
          .from("customers")
          .select("id, full_name, email, phone, customer_type, company_name")
          .or(
            [
              `full_name.ilike.%${esc}%`,
              `email.ilike.%${esc}%`,
              `phone.ilike.%${esc}%`,
              `company_name.ilike.%${esc}%`,
            ].join(","),
          )
          .order("full_name")
          .limit(10);
        setHits((data as CustomerHit[]) || []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (pickedLabel) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-sm">
        <UserCheck className="w-4 h-4 text-teal-700 flex-shrink-0" />
        <span className="text-teal-800 flex-1">{pickedLabel}</span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-teal-700 hover:text-teal-900 text-xs underline"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setHits([]);
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (query.trim().length >= 2) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching…
            </div>
          ) : hits.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              No customers found. Fill in the form below to add a new one.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {hits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-teal-50"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {c.full_name || "(no name)"}
                      {c.customer_type === "business" && c.company_name && (
                        <span className="ml-2 text-xs text-gray-500">
                          · {c.company_name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {c.email || "—"}
                      {c.phone && ` · ${c.phone}`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
