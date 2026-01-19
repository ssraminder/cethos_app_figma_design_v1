import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface LanguageSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const languages = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Russian",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
  "Bengali",
  "Punjabi",
  "Urdu",
  "Vietnamese",
  "Turkish",
  "Polish",
  "Ukrainian",
  "Romanian",
  "Dutch",
  "Greek",
  "Czech",
  "Swedish",
  "Hungarian",
  "Thai",
  "Tagalog",
  "Indonesian",
  "Malay",
].sort();

export default function LanguageSelect({
  value,
  onChange,
  placeholder = "Select language",
}: LanguageSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredLanguages = languages.filter((lang) =>
    lang.toLowerCase().includes(searchQuery.toLowerCase())
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

  const handleSelect = (language: string) => {
    onChange(language);
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
          {value || placeholder}
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
                placeholder="Search languages..."
                className="flex-1 bg-transparent text-sm focus:outline-none text-cethos-slate-dark placeholder:text-cethos-slate"
                autoFocus
              />
            </div>
          </div>

          {/* Language List */}
          <div className="overflow-y-auto max-h-64">
            {filteredLanguages.length > 0 ? (
              filteredLanguages.map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => handleSelect(language)}
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-background transition-colors text-left"
                >
                  <span className="text-sm text-cethos-slate-dark">
                    {language}
                  </span>
                  {value === language && (
                    <Check className="w-4 h-4 text-cethos-blue" />
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-cethos-slate">
                No languages found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
