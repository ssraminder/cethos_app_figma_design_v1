import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";

interface PurposeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const purposes = [
  "Immigration USCIS",
  "Immigration IRCC",
  "Legal",
  "Academic",
  "Personal",
  "Business",
];

export default function PurposeSelect({ value, onChange }: PurposeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (purpose: string) => {
    onChange(purpose);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-12 px-4 flex items-center justify-between rounded-lg border border-cethos-border bg-white hover:border-cethos-blue focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent transition-all"
      >
        <span
          className={value ? "text-cethos-slate-dark" : "text-cethos-slate"}
        >
          {value || "Select purpose"}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-cethos-slate transition-transform ${
            isOpen ? "transform rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-cethos-border rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-y-auto max-h-64">
            {purposes.map((purpose) => (
              <button
                key={purpose}
                type="button"
                onClick={() => handleSelect(purpose)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-background transition-colors text-left"
              >
                <span className="text-sm text-cethos-slate-dark">{purpose}</span>
                {value === purpose && (
                  <Check className="w-4 h-4 text-cethos-blue" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
