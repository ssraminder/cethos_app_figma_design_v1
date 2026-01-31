import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";

export interface DropdownOption {
  id: string;
  label: string;
  group?: string;
}

interface SearchableDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  groupOrder?: string[];
  className?: string;
}

export default function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  label,
  required = false,
  disabled = false,
  groupOrder,
  className = "",
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get selected option label
  const selectedOption = options.find((opt) => opt.id === value);
  const displayValue = selectedOption?.label || "";

  // Filter options based on search term
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group options if they have groups
  const groupedOptions = filteredOptions.reduce<Record<string, DropdownOption[]>>(
    (acc, opt) => {
      const group = opt.group || "Other";
      if (!acc[group]) acc[group] = [];
      acc[group].push(opt);
      return acc;
    },
    {}
  );

  // Get ordered groups
  const orderedGroups = groupOrder
    ? groupOrder.filter((g) => groupedOptions[g]?.length > 0)
    : Object.keys(groupedOptions);

  // Check if options have groups
  const hasGroups = options.some((opt) => opt.group);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchTerm("");
    } else if (e.key === "Enter" && !isOpen) {
      setIsOpen(true);
    }
  };

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Label */}
      {label && (
        <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full h-12 px-4 rounded-lg border text-left flex items-center justify-between transition-all ${
          disabled
            ? "bg-gray-100 border-gray-200 cursor-not-allowed text-gray-400"
            : isOpen
              ? "border-cethos-teal ring-2 ring-cethos-teal bg-white"
              : "border-cethos-border bg-white hover:border-cethos-teal"
        }`}
      >
        <span className={`text-sm truncate ${!displayValue ? "text-gray-400" : "text-gray-900"}`}>
          {displayValue || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-cethos-border rounded-lg shadow-lg overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full h-10 pl-9 pr-4 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent"
              />
            </div>
          </div>

          {/* Options List */}
          <div ref={listRef} className="max-h-60 overflow-y-auto overscroll-contain">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">
                No options found
              </div>
            ) : hasGroups ? (
              // Grouped options
              orderedGroups.map((group) => (
                <div key={group}>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                    {group}
                  </div>
                  {groupedOptions[group].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelect(opt.id)}
                      className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between hover:bg-cethos-teal/5 transition-colors ${
                        opt.id === value ? "bg-cethos-teal/10 text-cethos-teal font-medium" : "text-gray-700"
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {opt.id === value && <Check className="w-4 h-4 text-cethos-teal flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              // Flat options
              filteredOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between hover:bg-cethos-teal/5 transition-colors ${
                    opt.id === value ? "bg-cethos-teal/10 text-cethos-teal font-medium" : "text-gray-700"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.id === value && <Check className="w-4 h-4 text-cethos-teal flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
