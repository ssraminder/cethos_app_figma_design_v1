import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
}

const countries = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Mexico",
  "Brazil",
  "Argentina",
  "Chile",
  "Colombia",
  "Peru",
  "Venezuela",
  "China",
  "Japan",
  "South Korea",
  "India",
  "Pakistan",
  "Bangladesh",
  "Philippines",
  "Vietnam",
  "Thailand",
  "Indonesia",
  "Malaysia",
  "Singapore",
  "Russia",
  "Poland",
  "Ukraine",
  "Romania",
  "Netherlands",
  "Belgium",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Greece",
  "Turkey",
  "Egypt",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Morocco",
  "Saudi Arabia",
  "United Arab Emirates",
  "Israel",
  "Lebanon",
  "Jordan",
  "New Zealand",
].sort();

export default function CountrySelect({ value, onChange }: CountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredCountries = countries.filter((country) =>
    country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (country: string) => {
    onChange(country);
    setIsOpen(false);
    setSearchQuery("");
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
          {value || "Select country"}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-cethos-slate transition-transform ${
            isOpen ? "transform rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-cethos-border rounded-lg shadow-lg max-h-80 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-cethos-border">
            <div className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg">
              <Search className="w-4 h-4 text-cethos-slate" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search countries..."
                className="flex-1 bg-transparent text-sm focus:outline-none text-cethos-slate-dark placeholder:text-cethos-slate"
                autoFocus
              />
            </div>
          </div>

          {/* Country List */}
          <div className="overflow-y-auto max-h-64">
            {filteredCountries.length > 0 ? (
              filteredCountries.map((country) => (
                <button
                  key={country}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-background transition-colors text-left"
                >
                  <span className="text-sm text-cethos-slate-dark">
                    {country}
                  </span>
                  {value === country && (
                    <Check className="w-4 h-4 text-cethos-blue" />
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-cethos-slate">
                No countries found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
