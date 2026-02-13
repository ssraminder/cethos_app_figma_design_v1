import { useState, useEffect, useRef } from "react";

interface Option {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  grouped?: boolean;
  synonyms?: boolean;
  disabled?: boolean;
}

// ════════════════════════════════════════════════════════════════
// SYNONYM MAP — expands search terms to canonical words
// ════════════════════════════════════════════════════════════════

const SYNONYMS: Record<string, string[]> = {
  // ── Driver's License variants ──
  "dl": ["driver", "license"],
  "driving": ["driver"],
  "licence": ["license"],
  "permit": ["license"],
  "learners": ["driver", "license"],
  "learner": ["driver", "license"],

  // ── Immigration variants ──
  "pr": ["permanent", "residence"],
  "immigration": ["ircc"],
  "imm": ["ircc"],
  "visa": ["visa", "temporary"],
  "pgwp": ["post", "graduation", "work", "permit"],
  "trv": ["temporary", "resident", "visa"],
  "lmia": ["work", "permit"],
  "csq": ["certificat", "selection", "quebec"],
  "h&c": ["humanitarian", "compassionate"],
  "pnp": ["provincial", "nominee"],
  "sponsorship": ["sponsorship", "spousal", "parent"],
  "refugee": ["refugee", "asylum"],
  "citizenship": ["citizenship"],

  // ── ID variants ──
  "id": ["license", "driver", "identification"],
  "identification": ["license", "driver"],

  // ── Health variants ──
  "ohip": ["health", "ontario"],
  "msp": ["health", "bc"],
  "ramq": ["health", "quebec"],
  "mcp": ["health", "newfoundland"],
  "msi": ["health", "nova"],
  "healthcare": ["health"],
  "medical": ["health", "medical"],
  "hospital": ["health"],

  // ── Workers Comp variants ──
  "wcb": ["workers", "compensation"],
  "wsib": ["workers", "compensation", "ontario"],
  "worksafe": ["workers", "compensation", "bc"],
  "cnesst": ["workers", "compensation", "quebec"],
  "workcomp": ["workers", "compensation"],
  "injury": ["workers", "compensation"],

  // ── Insurance / Auto variants ──
  "icbc": ["driver", "bc"],
  "sgi": ["driver", "saskatchewan"],
  "mpi": ["driver", "manitoba"],
  "saaq": ["driver", "quebec"],

  // ── Child & Family variants ──
  "cas": ["child", "family", "ontario"],
  "cfs": ["child", "family", "manitoba"],
  "mcfd": ["child", "family", "bc"],
  "dpj": ["child", "family", "quebec"],
  "custody": ["child", "family"],
  "children": ["child"],
  "kids": ["child", "family"],

  // ── Disability variants ──
  "aish": ["disability", "alberta"],
  "disability": ["disability", "aish", "income"],
  "pwd": ["disability"],

  // ── Education variants ──
  "school": ["education"],
  "university": ["academic", "admission", "university"],
  "college": ["academic", "admission", "college"],
  "transcript": ["education", "academic"],
  "diploma": ["education", "academic"],
  "degree": ["education", "academic"],
  "wes": ["wes", "credential"],
  "iqas": ["iqas", "evaluation"],
  "ices": ["ices", "evaluation"],

  // ── Court / Legal variants ──
  "court": ["court"],
  "lawsuit": ["court", "litigation"],
  "judge": ["court"],
  "trial": ["court"],
  "divorce": ["marriage", "divorce", "family"],
  "marriage": ["marriage"],
  "estate": ["wills", "estates", "surrogate"],
  "will": ["wills", "estates"],
  "probate": ["surrogate", "wills", "estates"],
  "landlord": ["landlord", "tenant", "tribunal"],
  "tenant": ["landlord", "tenant", "tribunal"],
  "eviction": ["landlord", "tenant"],

  // ── Birth / Death / Vital Stats ──
  "birth": ["vital", "statistics"],
  "death": ["vital", "statistics"],
  "certificate": ["vital", "statistics"],
  "vital": ["vital", "statistics"],

  // ── Property / Real Estate ──
  "property": ["property", "real", "estate"],
  "house": ["property", "real", "estate"],
  "mortgage": ["mortgage"],
  "title": ["title", "transfer"],
  "land": ["property", "title"],

  // ── Province short forms ──
  "ab": ["alberta"],
  "bc": ["bc"],
  "on": ["ontario"],
  "qc": ["quebec"],
  "sk": ["saskatchewan"],
  "mb": ["manitoba"],
  "nb": ["new", "brunswick"],
  "ns": ["nova", "scotia"],
  "pe": ["pei"],
  "pei": ["pei"],
  "nl": ["newfoundland"],
  "nwt": ["nwt"],
  "nt": ["nwt"],
  "yt": ["yukon"],
  "nu": ["nunavut"],
};

// ════════════════════════════════════════════════════════════════
// GROUPING — derive group from option name prefix
// ════════════════════════════════════════════════════════════════

const GROUP_PREFIXES: { prefix: string; group: string }[] = [
  { prefix: "IRCC", group: "IRCC / Immigration" },
  { prefix: "Immigration Canada", group: "IRCC / Immigration" },
  { prefix: "Alberta", group: "Alberta" },
  { prefix: "BC", group: "British Columbia" },
  { prefix: "Ontario", group: "Ontario" },
  { prefix: "Quebec", group: "Quebec" },
  { prefix: "Saskatchewan", group: "Saskatchewan" },
  { prefix: "Manitoba", group: "Manitoba" },
  { prefix: "New Brunswick", group: "New Brunswick" },
  { prefix: "Nova Scotia", group: "Nova Scotia" },
  { prefix: "PEI", group: "Prince Edward Island" },
  { prefix: "Newfoundland", group: "Newfoundland & Labrador" },
  { prefix: "NWT", group: "Northwest Territories" },
  { prefix: "Yukon", group: "Yukon" },
  { prefix: "Nunavut", group: "Nunavut" },
  { prefix: "Other", group: "Other" },
];

function getGroup(name: string): string {
  for (const { prefix, group } of GROUP_PREFIXES) {
    if (
      name.startsWith(prefix + " ") ||
      name.startsWith(prefix + " \u2013") ||
      name === prefix
    ) {
      return group;
    }
  }
  return "General";
}

// ════════════════════════════════════════════════════════════════
// SEARCH — multi-word with synonym expansion
// ════════════════════════════════════════════════════════════════

function expandWords(words: string[]): string[] {
  const expanded: string[] = [];
  for (const word of words) {
    const synonym = SYNONYMS[word.toLowerCase()];
    if (synonym) {
      expanded.push(...synonym);
    } else {
      expanded.push(word);
    }
  }
  return expanded;
}

function matchesSearch(
  name: string,
  search: string,
  useSynonyms: boolean,
): boolean {
  if (!search.trim()) return true;
  const nameLower = name.toLowerCase();
  const rawWords = search.toLowerCase().trim().split(/\s+/);
  const words = useSynonyms ? expandWords(rawWords) : rawWords;
  return words.every((word) => nameLower.includes(word));
}

// ════════════════════════════════════════════════════════════════
// COMPONENT
// ════════════════════════════════════════════════════════════════

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  label,
  required = false,
  error,
  grouped = false,
  synonyms = false,
  disabled = false,
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

  // Filter options
  const filtered = options.filter((opt) =>
    matchesSearch(opt.name, search, synonyms),
  );

  // Group rendering
  const renderOptions = () => {
    if (grouped && !search.trim()) {
      // Show grouped when not searching
      const groups: Record<string, Option[]> = {};
      const groupOrder: string[] = [];

      for (const opt of filtered) {
        const group = getGroup(opt.name);
        if (!groups[group]) {
          groups[group] = [];
          groupOrder.push(group);
        }
        groups[group].push(opt);
      }

      // Sort: "General" first, then alphabetical, "Other" last
      groupOrder.sort((a, b) => {
        if (a === "General") return -1;
        if (b === "General") return 1;
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      });

      return groupOrder.map((group) => (
        <div key={group}>
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
            {group}
          </div>
          {groups[group].map((opt) => (
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
          ))}
        </div>
      ));
    }

    // Flat list (when searching or not grouped)
    return filtered.map((opt) => (
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
    ));
  };

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearch("");
          }
        }}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-left text-sm bg-white transition-colors ${
          error
            ? "border-red-300 focus:ring-red-500 focus:border-red-500"
            : "border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
      >
        {selectedOption ? (
          <span className="text-gray-900 truncate block">
            {selectedOption.name}
          </span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </button>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-56">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">
                No results found
              </div>
            ) : (
              renderOptions()
            )}
          </div>

          {/* Clear button */}
          {value && !required && (
            <div className="border-t border-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                  setSearch("");
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
