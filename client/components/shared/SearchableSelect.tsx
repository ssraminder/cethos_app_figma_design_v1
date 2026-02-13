import React, { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectOption {
  id: string;
  name: string;
}

export interface OptionGroup {
  label: string;
  options: SelectOption[];
}

export interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  required?: boolean;
  error?: string;
  /** If provided, options are rendered in groups. Search filters across all groups. */
  groups?: OptionGroup[];
}

// ---------------------------------------------------------------------------
// SearchableSelect
// ---------------------------------------------------------------------------

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
  required,
  error,
  groups,
}: SearchableSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const lowerSearch = search.toLowerCase();

  // Render a single option button
  const renderOption = (opt: SelectOption) => (
    <button
      key={opt.id}
      type="button"
      onClick={() => {
        onChange(opt.id);
        setIsOpen(false);
        setSearch("");
      }}
      className={`w-full text-left px-3 py-2 text-sm hover:bg-teal-50 ${
        opt.id === value
          ? "bg-teal-50 text-teal-700 font-medium"
          : "text-gray-700"
      }`}
    >
      {opt.name}
    </button>
  );

  // Build the dropdown content
  const renderDropdownContent = () => {
    if (groups && groups.length > 0) {
      // Grouped mode
      let anyVisible = false;

      const groupElements = groups.map((group) => {
        const filtered = group.options.filter((opt) =>
          opt.name.toLowerCase().includes(lowerSearch)
        );
        if (filtered.length === 0) return null;
        anyVisible = true;

        return (
          <div key={group.label}>
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
              {group.label}
            </div>
            {filtered.map(renderOption)}
          </div>
        );
      });

      if (!anyVisible) {
        return (
          <div className="px-3 py-2 text-sm text-gray-400">
            No results found
          </div>
        );
      }

      return groupElements;
    }

    // Flat mode
    const filtered = options.filter((opt) =>
      opt.name.toLowerCase().includes(lowerSearch)
    );

    if (filtered.length === 0) {
      return (
        <div className="px-3 py-2 text-sm text-gray-400">
          No results found
        </div>
      );
    }

    return filtered.map(renderOption);
  };

  const hasError = !!error;

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch("");
        }}
        className={`w-full px-3 py-2 border rounded-lg text-left text-sm bg-white hover:border-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
          hasError ? "border-red-400" : "border-gray-300"
        }`}
      >
        {selectedOption ? (
          <span className="text-gray-900">{selectedOption.name}</span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </button>

      {hasError && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {renderDropdownContent()}
          </div>
          {value && (
            <div className="border-t border-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping helper for intended uses
// ---------------------------------------------------------------------------

const PREFIX_TO_GROUP: Record<string, string> = {
  "IRCC": "IRCC / Immigration",
  "Alberta": "Alberta",
  "BC": "British Columbia",
  "Ontario": "Ontario",
  "Saskatchewan": "Saskatchewan",
  "Manitoba": "Manitoba",
  "Quebec": "Quebec",
  "Nova Scotia": "Nova Scotia",
  "New Brunswick": "New Brunswick",
  "PEI": "Prince Edward Island",
  "Newfoundland": "Newfoundland & Labrador",
};

/**
 * Groups intended-use options by their prefix (text before " – ").
 * Items without a recognized prefix are placed in a "General" group.
 */
export function groupIntendedUses(
  uses: SelectOption[]
): OptionGroup[] {
  const groupMap = new Map<string, SelectOption[]>();
  const generalItems: SelectOption[] = [];

  for (const use of uses) {
    const dashIdx = use.name.indexOf(" – ");
    if (dashIdx === -1) {
      // Also check for regular dash
      const simpleDashIdx = use.name.indexOf(" - ");
      if (simpleDashIdx !== -1) {
        const prefix = use.name.substring(0, simpleDashIdx).trim();
        const groupLabel = PREFIX_TO_GROUP[prefix];
        if (groupLabel) {
          const list = groupMap.get(groupLabel) || [];
          list.push(use);
          groupMap.set(groupLabel, list);
          continue;
        }
      }
      generalItems.push(use);
      continue;
    }

    const prefix = use.name.substring(0, dashIdx).trim();
    const groupLabel = PREFIX_TO_GROUP[prefix];
    if (groupLabel) {
      const list = groupMap.get(groupLabel) || [];
      list.push(use);
      groupMap.set(groupLabel, list);
    } else {
      generalItems.push(use);
    }
  }

  const result: OptionGroup[] = [];

  // Add General group first if it has items
  if (generalItems.length > 0) {
    result.push({ label: "General", options: generalItems });
  }

  // Add remaining groups in alphabetical order
  const sortedGroups = Array.from(groupMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [label, options] of sortedGroups) {
    result.push({ label, options });
  }

  return result;
}
