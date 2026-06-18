// VendorFinderModal — extracted from OrderWorkflowSection.tsx 2026-06-02
// (audit R11 partial). The full file was ~6000 lines and adding the
// counter-back UI on top would compound the monolith problem; this
// extraction isolates the highest-traffic modal (700 lines) into its
// own file with no behaviour change.
//
// SearchableSelect is kept local — it's only used by VendorFinderModal.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X, Search, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── SearchableSelect (reusable dropdown for VendorFinderModal) ──

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  allowClear?: boolean;
}

function SearchableSelect({ value, onChange, options, placeholder, allowClear = true }: SearchableSelectProps) {
  const [search, setSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
        placeholder={placeholder}
        value={isDropdownOpen ? search : (selectedLabel || '')}
        onChange={(e) => { setSearch(e.target.value); setIsDropdownOpen(true); }}
        onFocus={() => { setIsDropdownOpen(true); setSearch(''); }}
      />
      {value && allowClear && !isDropdownOpen && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
          onClick={(e) => { e.stopPropagation(); onChange(''); }}
        >✕</button>
      )}
      {isDropdownOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
          {allowClear && (
            <div
              className="px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer"
              onClick={() => { onChange(''); setIsDropdownOpen(false); setSearch(''); }}
            >
              — Clear —
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
          ) : (
            filtered.slice(0, 50).map(o => (
              <div
                key={o.value}
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${o.value === value ? 'bg-blue-100 font-medium' : ''}`}
                onClick={() => { onChange(o.value); setIsDropdownOpen(false); setSearch(''); }}
              >
                {o.label}
                {o.value !== o.label && (
                  <span className="text-gray-400 ml-1 text-xs">({o.value})</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── VendorFinderModal ──

interface VendorFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVendor: (vendor: any, mode: 'assign' | 'offer') => void;
  onSelectMultiple: (vendors: any[]) => void;
  stepName: string;
  stepNumber: number;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  serviceId: string | null;
  serviceName: string | null;
  // When set, vendors who delivered prior tasks on the same internal
  // project get a badge + match-score boost so they surface first.
  internalProjectId?: string | null;
}

export default function VendorFinderModal({
  isOpen,
  onClose,
  onSelectVendor,
  onSelectMultiple,
  stepName,
  stepNumber,
  sourceLanguage,
  targetLanguage,
  serviceId,
  serviceName,
  internalProjectId,
}: VendorFinderModalProps) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Services for dropdown
  const [services, setServices] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);

  // Reference data for searchable dropdowns
  const [languageOptions, setLanguageOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [vendorNameOptions, setVendorNameOptions] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  // Native lang multi-select state
  const [nativeLangSearch, setNativeLangSearch] = useState('');
  const [nativeLangOpen, setNativeLangOpen] = useState(false);
  const nativeLangRef = useRef<HTMLDivElement>(null);

  // Name search autocomplete state
  const [nameSearchOpen, setNameSearchOpen] = useState(false);
  const nameSearchRef = useRef<HTMLDivElement>(null);

  // Resolved ISO codes for source/target language props (UUIDs resolved on options load)
  const [resolvedSourceLang, setResolvedSourceLang] = useState(sourceLanguage || "");
  const [resolvedTargetLang, setResolvedTargetLang] = useState(targetLanguage || "");

  // Filter state
  const [filterSourceLang, setFilterSourceLang] = useState(sourceLanguage || "");
  const [filterTargetLang, setFilterTargetLang] = useState(targetLanguage || "");
  const [filterServiceId, setFilterServiceId] = useState(serviceId || "");
  const [nativeLanguages, setNativeLanguages] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [maxRate, setMaxRate] = useState("");
  const [availability, setAvailability] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("match_score");
  // Hide vendors who explicitly failed the ISO 17100 / QMS competence check
  // for this service + language pair. Vendors with an unknown check (null —
  // e.g. no service selected) are kept. Policy is warn-with-override, so this
  // is a view filter, not a hard gate.
  const [onlyQualified, setOnlyQualified] = useState(false);

  // Eligible-first ordering + optional "qualified only" filter, applied on top
  // of the server sort so QMS-passing vendors always surface first.
  const displayVendors = useMemo(() => {
    const rank = (v: any) => (v?.qms_eligible === true ? 0 : v?.qms_eligible == null ? 1 : 2);
    const filtered = onlyQualified ? vendors.filter((v) => v?.qms_eligible !== false) : vendors;
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [vendors, onlyQualified]);

  // Assign/offer with a warn-and-override guard: if the vendor failed the QMS
  // check for this service/language pair, confirm before proceeding. The check
  // itself is already audit-logged server-side (qms.assignment_eligibility_events).
  const handleSelectVendor = useCallback(
    (v: any, mode: "assign" | "offer") => {
      if (v?.qms_eligible === false) {
        const reason = v.qms_reason ? `\n\nReason: ${v.qms_reason}` : "";
        const role = v.qms_required_role ? ` as ${v.qms_required_role}` : "";
        const ok = window.confirm(
          `${v.full_name} is NOT QMS-qualified${role} for this service / language pair (ISO 17100 §6.1).${reason}\n\n${mode === "assign" ? "Assign" : "Send an offer to"} this vendor anyway?`,
        );
        if (!ok) return;
      }
      onSelectVendor(v, mode);
    },
    [onSelectVendor],
  );

  const doSearch = useCallback(async () => {
    setSearching(true);
    try {
      const nativeLangs = nativeLanguages.length > 0
        ? nativeLanguages.map((s) => s.toLowerCase())
        : null;
      const { data } = await supabase.functions.invoke("find-matching-vendors", {
        body: {
          source_language: filterSourceLang || null,
          target_language: filterTargetLang || null,
          service_id: filterServiceId || null,
          native_languages: nativeLangs,
          country: country || null,
          min_rating: minRating || null,
          max_rate: maxRate ? parseFloat(maxRate) : null,
          availability: availability || null,
          search_text: searchText || null,
          sort_by: sortBy,
          limit: 30,
          offset: 0,
          internal_project_id: internalProjectId || null,
        },
      });
      setVendors(data?.vendors || []);
      setTotalMatches(data?.total_matches || 0);
    } catch (err) {
      console.error("Vendor search failed:", err);
      setVendors([]);
      setTotalMatches(0);
    }
    setSearching(false);
  }, [filterSourceLang, filterTargetLang, filterServiceId, nativeLanguages, country, minRating, maxRate, availability, searchText, sortBy, internalProjectId]);

  // Fetch services for dropdown
  useEffect(() => {
    if (isOpen && !servicesLoaded) {
      const fetchServices = async () => {
        const { data } = await supabase
          .from("services")
          .select("id, name, category")
          .eq("is_active", true)
          .order("category")
          .order("name");
        setServices(data || []);
        setServicesLoaded(true);
      };
      fetchServices();
    }
  }, [isOpen]);

  // Fetch language and country options on modal open
  useEffect(() => {
    if (isOpen && !optionsLoaded) {
      const loadOptions = async () => {
        const { data: langs } = await supabase
          .from("languages")
          .select("code, name")
          .order("name");
        setLanguageOptions(langs || []);

        // Resolve UUID language props → ISO codes so the filter dropdowns display correctly
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const uuidsToResolve = ([sourceLanguage, targetLanguage] as (string | undefined)[])
          .filter((l): l is string => !!l && UUID_RE.test(l));
        if (uuidsToResolve.length > 0) {
          const { data: langRows } = await supabase
            .from("languages")
            .select("id, code")
            .in("id", uuidsToResolve);
          const codeMap = new Map(
            (langRows || []).map((r: any) => [r.id as string, (r.code as string).toUpperCase()])
          );
          if (sourceLanguage && UUID_RE.test(sourceLanguage)) {
            const code = codeMap.get(sourceLanguage) ?? sourceLanguage;
            setResolvedSourceLang(code);
            setFilterSourceLang(code);
          }
          if (targetLanguage && UUID_RE.test(targetLanguage)) {
            const code = codeMap.get(targetLanguage) ?? targetLanguage;
            setResolvedTargetLang(code);
            setFilterTargetLang(code);
          }
        }

        const { data: vendors } = await supabase
          .from("vendors")
          .select("country")
          .not("country", "is", null)
          .neq("country", "")
          .eq("status", "active");
        const uniqueCountries = [...new Set((vendors || []).map((v: any) => v.country))]
          .filter(Boolean)
          .sort() as string[];
        setCountryOptions(uniqueCountries);

        setOptionsLoaded(true);
      };
      loadOptions();
    }
  }, [isOpen]);

  // Outside click handlers for custom dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (nativeLangRef.current && !nativeLangRef.current.contains(e.target as Node)) setNativeLangOpen(false);
      if (nameSearchRef.current && !nameSearchRef.current.contains(e.target as Node)) setNameSearchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced vendor name search
  const debouncedNameSearch = useMemo(() => {
    let timer: any;
    return (query: string) => {
      clearTimeout(timer);
      if (!query || query.length < 2) { setVendorNameOptions([]); setNameSearchOpen(false); return; }
      timer = setTimeout(async () => {
        const { data } = await supabase
          .from("vendors")
          .select("id, full_name, email")
          .eq("status", "active")
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(10);
        setVendorNameOptions((data || []).map((v: any) => ({ id: v.id, name: v.full_name, email: v.email })));
        setNameSearchOpen(true);
      }, 300);
    };
  }, []);

  // Auto-search on open
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      doSearch();
    }
  }, [isOpen]);

  const handleReset = () => {
    setFilterSourceLang("");
    setFilterTargetLang("");
    setFilterServiceId("");
    setNativeLanguages([]);
    setNativeLangSearch('');
    setCountry("");
    setMinRating(0);
    setMaxRate("");
    setAvailability("");
    setSearchText("");
    setSortBy("match_score");
    setVendorNameOptions([]);
    setNameSearchOpen(false);
    // Auto-search with cleared filters so the user immediately sees the full pool
    setTimeout(() => { doSearch(); }, 0);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === vendors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(vendors.map((v) => v.id)));
    }
  };

  const selectedVendors = vendors.filter((v) => selectedIds.has(v.id));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            Find Vendors — Step {stepNumber}: {stepName}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Filters bar */}
          <div className="border rounded-lg">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              <span>Filters</span>
              <span className="text-xs text-gray-400">{filtersExpanded ? "▼" : "▶"}</span>
            </button>
            {filtersExpanded && (
              <div className="px-3 pb-3 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Source Lang</label>
                    <SearchableSelect
                      value={filterSourceLang}
                      onChange={(val) => setFilterSourceLang(val)}
                      options={languageOptions.map(l => ({
                        value: l.code.toUpperCase(),
                        label: `${l.name} (${l.code.toUpperCase()})`,
                      }))}
                      placeholder="Search language..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Target Lang</label>
                    <SearchableSelect
                      value={filterTargetLang}
                      onChange={(val) => setFilterTargetLang(val)}
                      options={languageOptions.map(l => ({
                        value: l.code.toUpperCase(),
                        label: `${l.name} (${l.code.toUpperCase()})`,
                      }))}
                      placeholder="Search language..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Service</label>
                    <select
                      value={filterServiceId}
                      onChange={(e) => setFilterServiceId(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      <option value="">All Services</option>
                      {Array.from(new Set(services.map(s => s.category))).map(cat => (
                        <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}>
                          {services.filter(s => s.category === cat).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Native Lang</label>
                    <div className="relative" ref={nativeLangRef}>
                      {nativeLanguages.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {nativeLanguages.map(code => {
                            const lang = languageOptions.find(l => l.code.toUpperCase() === code);
                            return (
                              <span key={code} className="inline-flex items-center bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                                {lang?.name || code}
                                <button className="ml-1 text-blue-500 hover:text-blue-700"
                                  onClick={() => setNativeLanguages(nativeLanguages.filter(c => c !== code))}
                                >✕</button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <input
                        type="text"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                        placeholder={nativeLanguages.length > 0 ? "Add more..." : "Search native language..."}
                        value={nativeLangSearch}
                        onChange={(e) => { setNativeLangSearch(e.target.value); setNativeLangOpen(true); }}
                        onFocus={() => setNativeLangOpen(true)}
                      />
                      {nativeLangOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                          {languageOptions
                            .filter(l => !nativeLanguages.includes(l.code.toUpperCase()))
                            .filter(l => l.name.toLowerCase().includes(nativeLangSearch.toLowerCase()) || l.code.toLowerCase().includes(nativeLangSearch.toLowerCase()))
                            .slice(0, 30)
                            .map(l => (
                              <div key={l.code}
                                className="px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50"
                                onClick={() => {
                                  setNativeLanguages([...nativeLanguages, l.code.toUpperCase()]);
                                  setNativeLangSearch('');
                                  setNativeLangOpen(false);
                                }}
                              >
                                {l.name} <span className="text-gray-400 text-xs">({l.code.toUpperCase()})</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Country</label>
                    <SearchableSelect
                      value={country}
                      onChange={(val) => setCountry(val)}
                      options={countryOptions.map(c => ({ value: c, label: c }))}
                      placeholder="Search country..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Min Rating</label>
                    <select
                      value={minRating}
                      onChange={(e) => setMinRating(parseInt(e.target.value))}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      <option value={0}>Any</option>
                      <option value={1}>1+</option>
                      <option value={2}>2+</option>
                      <option value={3}>3+</option>
                      <option value={4}>4+</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Max Rate</label>
                    <input
                      type="number"
                      step="0.01"
                      value={maxRate}
                      onChange={(e) => setMaxRate(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Availability</label>
                    <select
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      <option value="">All</option>
                      <option value="available">Available</option>
                      <option value="busy">Busy</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Search</label>
                    <div className="relative" ref={nameSearchRef}>
                      <input
                        type="text"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                        placeholder="Name or email..."
                        value={searchText}
                        onChange={(e) => {
                          setSearchText(e.target.value);
                          debouncedNameSearch(e.target.value);
                        }}
                      />
                      {nameSearchOpen && vendorNameOptions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                          {vendorNameOptions.map(v => (
                            <div key={v.id}
                              className="px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50"
                              onClick={() => {
                                setSearchText(v.name);
                                setNameSearchOpen(false);
                              }}
                            >
                              <span className="font-medium">{v.name}</span>
                              <span className="text-gray-400 ml-1 text-xs">{v.email}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Sort by</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      <option value="match_score">Match Score</option>
                      <option value="rating">Rating</option>
                      <option value="rate_asc">Rate (low to high)</option>
                      <option value="rate_desc">Rate (high to low)</option>
                      <option value="projects">Projects</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={doSearch}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Search
                    </button>
                    <button
                      onClick={() => { handleReset(); }}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
                      title="Clear every filter and search the full vendor pool"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Select all + count */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={vendors.length > 0 && selectedIds.size === vendors.length}
                  onChange={toggleSelectAll}
                />
                Select all (for batch offer)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600" title="Hide vendors who failed the ISO 17100 / QMS competence check for this service + language pair">
                <input
                  type="checkbox"
                  checked={onlyQualified}
                  onChange={(e) => setOnlyQualified(e.target.checked)}
                />
                Qualified only
              </label>
            </div>
            <span className="text-sm text-gray-500 flex items-center gap-3">
              {searching ? "Searching..." : `${totalMatches} vendor(s) found${onlyQualified && displayVendors.length !== vendors.length ? ` · ${displayVendors.length} shown` : ""}`}
              {/* R19 — source new vendor: link to recruitment with the
                  current language pair + service pre-filled so staff can
                  prioritise the applicant pipeline for this exact gap. */}
              {!searching && (
                <a
                  href={`/admin/recruitment?source=${encodeURIComponent(sourceLanguage || "")}&target=${encodeURIComponent(targetLanguage || "")}&service=${encodeURIComponent(serviceId || "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-0.5 border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50"
                  title="Open Recruitment filtered to this language pair + service so you can source a new vendor for it"
                >
                  Source new vendor →
                </a>
              )}
            </span>
          </div>

          {/* Vendor rows */}
          {searching ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : displayVendors.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-gray-400">{onlyQualified && vendors.length > 0 ? "No QMS-qualified vendors in these results. Uncheck “Qualified only” to see all matches, or:" : "No vendors found. Adjust filters and search again, or:"}</p>
              <a
                href={`/admin/recruitment?source=${encodeURIComponent(sourceLanguage || "")}&target=${encodeURIComponent(targetLanguage || "")}&service=${encodeURIComponent(serviceId || "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50"
              >
                Source a new vendor for {sourceLanguage} → {targetLanguage} →
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {displayVendors.map((v: any) => (
                <div key={v.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {v.rating != null && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-600">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            {v.rating}
                          </span>
                        )}
                        <span className="font-medium text-sm text-gray-900">{v.full_name}</span>
                        <span className="text-xs text-gray-400">· {v.email}</span>
                        {v.prior_project_tasks > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-teal-100 text-teal-800 border border-teal-200">
                            ↪ {v.prior_project_tasks} prior task{v.prior_project_tasks === 1 ? "" : "s"} on this project
                          </span>
                        )}
                        {v.qms_eligible === false && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800 border border-amber-200"
                            title={v.qms_reason ? `ISO 17100 check: ${v.qms_reason}` : "ISO 17100 competence check did not pass"}
                          >
                            ⚠ QMS {v.qms_required_role ? `(${v.qms_required_role})` : ""}
                          </span>
                        )}
                        {v.qms_eligible === true && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-emerald-100 text-emerald-800 border border-emerald-200"
                            title={`ISO 17100 ${v.qms_required_role || "competence"} check passed`}
                          >
                            ✓ QMS
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                        {v.matching_pairs && v.matching_pairs.length > 0 && (
                          <span>{v.matching_pairs.map((p: any) => `${p.source}→${p.target}`).join(", ")}</span>
                        )}
                        {v.rate_for_service && (
                          <span>· ${v.rate_for_service.rate}/{v.rate_for_service.unit} {v.rate_for_service.currency}</span>
                        )}
                        <span>
                          · {v.availability_status === "available" ? (
                            <span className="text-green-600">Available</span>
                          ) : (
                            <span className="text-yellow-600">Busy</span>
                          )}
                        </span>
                        <span>· {v.total_projects || 0} jobs</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                        {v.native_languages && v.native_languages.length > 0 && (
                          <span className="text-gray-400">
                            Native: {v.native_languages.map((l: string) => (
                              <span key={l} className="inline-block bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-1">{l.toUpperCase()}</span>
                            ))}
                          </span>
                        )}
                        {v.active_jobs != null && (
                          <span className="text-gray-400">· Active jobs: {v.active_jobs}</span>
                        )}
                        {v.match_score != null && (
                          <span className="text-gray-400">· Score: {v.match_score}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        onClick={() => handleSelectVendor(v, "assign")}
                      >
                        Assign
                      </button>
                      <button
                        className="text-xs px-2.5 py-1 bg-teal-600 text-white rounded hover:bg-teal-700"
                        onClick={() => handleSelectVendor(v, "offer")}
                      >
                        Offer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelectMultiple(selectedVendors)}
            disabled={selectedIds.size === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
              selectedIds.size > 0
                ? "bg-teal-600 hover:bg-teal-700"
                : "bg-teal-600 opacity-50 cursor-not-allowed"
            }`}
          >
            Offer to Selected ({selectedIds.size})
          </button>
        </div>
      </div>
    </div>
  );
}
