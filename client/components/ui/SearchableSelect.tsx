import React, { useState, useRef, useEffect, useCallback } from "react";

interface Option {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  groupOrder?: string[];
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Search...",
  label,
  required = false,
  disabled = false,
  error,
  groupOrder,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Find selected option label
  const selectedOption = options.find((o) => o.value === value);
  const displayValue = isOpen ? search : selectedOption?.label || "";

  // Filter options based on search
  const filteredOptions = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Group filtered options
  const groupedOptions = useCallback(() => {
    if (!filteredOptions.some((o) => o.group)) {
      return [{ group: null, items: filteredOptions }];
    }

    const groups: Map<string, Option[]> = new Map();
    for (const opt of filteredOptions) {
      const g = opt.group || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }

    // Sort groups by groupOrder if provided
    const sortedKeys = groupOrder
      ? [...groups.keys()].sort((a, b) => {
          const ai = groupOrder.indexOf(a);
          const bi = groupOrder.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
      : [...groups.keys()];

    return sortedKeys.map((g) => ({ group: g, items: groups.get(g)! }));
  }, [filteredOptions, groupOrder]);

  // Flat list for keyboard navigation
  const flatOptions = filteredOptions;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
        setHighlightIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-option-index]");
      items[highlightIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const handleSelect = (opt: Option) => {
    onChange(opt.value);
    setIsOpen(false);
    setSearch("");
    setHighlightIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < flatOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : flatOptions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < flatOptions.length) {
          handleSelect(flatOptions[highlightIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearch("");
        setHighlightIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={isOpen ? "Type to search..." : placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-lg text-gray-900 bg-white
            ${error ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:ring-teal-500"}
            focus:outline-none focus:ring-2 focus:border-transparent
            disabled:bg-gray-100 disabled:cursor-not-allowed
            transition-colors`}
          style={{ fontSize: "16px" }}
          /* 16px prevents iOS zoom */
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        />

        {/* Chevron icon */}
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
          aria-hidden="true"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={isOpen ? "M4 10L8 6L12 10" : "M4 6L8 10L12 6"} />
          </svg>
        </div>

        {/* Clear button when value is selected and dropdown closed */}
        {value && !isOpen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setSearch("");
              inputRef.current?.focus();
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            aria-label="Clear selection"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3L11 11M3 11L11 3" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto"
          style={{ maxHeight: "250px" }}
          role="listbox"
        >
          {flatOptions.length === 0 ? (
            <li className="px-3 py-3 text-sm text-gray-400 text-center">
              No results found
            </li>
          ) : (
            groupedOptions().map((group, gIdx) => (
              <React.Fragment key={group.group || gIdx}>
                {/* Group header */}
                {group.group && (
                  <li
                    className="sticky top-0 z-10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-100"
                    role="presentation"
                  >
                    {group.group}
                  </li>
                )}

                {/* Options */}
                {group.items.map((opt) => {
                  const flatIdx = flatOptions.indexOf(opt);
                  const isHighlighted = flatIdx === highlightIndex;
                  const isSelected = opt.value === value;

                  return (
                    <li
                      key={opt.value}
                      data-option-index={flatIdx}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setHighlightIndex(flatIdx)}
                      className={`px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between
                        ${isHighlighted ? "bg-teal-50" : ""}
                        ${isSelected ? "font-medium text-teal-700" : "text-gray-800"}
                        hover:bg-teal-50 transition-colors`}
                      style={{ minHeight: "44px" }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span>{opt.label}</span>
                      {isSelected && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-teal-600 flex-shrink-0 ml-2"
                        >
                          <path d="M3 8L6.5 11.5L13 4.5" />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </ul>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export default SearchableSelect;
