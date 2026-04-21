import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Loader2,
  X,
  CheckCircle,
  XCircle,
  User,
  Building,
  Cog,
  Users,
  Search,
  Star,
  ArrowRight,
  Zap,
  UserMinus,
  Pencil,
  ChevronDown,
  ChevronRight,
  Upload,
  FileText,
  Download,
} from "lucide-react";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import OrderFinancialSummary, {
  type VendorFinancials,
  type MarginData,
  type StepPayable,
  type FinancialStep,
} from "./OrderFinancialSummary";

// ── Types ──

interface WorkflowStep {
  id: string;
  step_number: number;
  name: string;
  actor_type: 'external_vendor' | 'internal_work' | 'internal_review' | 'customer' | 'automated';
  status: string;
  assignment_mode: string;
  auto_assign_rule: string | null;
  auto_advance: boolean;
  is_optional: boolean;
  requires_file_upload: boolean;
  allowed_actor_types?: string[];
  deliveries?: StepDelivery[];
  delivery_count?: number;
  latest_delivery?: StepDelivery | null;
  vendor_id: string | null;
  vendor_name: string | null;
  assigned_staff_id: string | null;
  assigned_by: string | null;
  preferred_vendor_id: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  deadline: string | null;
  delivered_at: string | null;
  approved_at: string | null;
  vendor_rate: number | null;
  vendor_rate_unit: string | null;
  vendor_total: number | null;
  vendor_currency: string;
  source_file_paths: string[] | null;
  delivered_file_paths: string[] | null;
  instructions: string | null;
  notes_from_vendor: string | null;
  rejection_reason: string | null;
  revision_count: number;
  source_language: string | null;
  target_language: string | null;
  service_id: string | null;
  service_name: string | null;
  order_document_id: string | null;
  offer_count: number;
  active_offer_count: number;
  has_pending_counter: boolean;
  offers: Array<{
    id: string;
    vendor_id: string;
    vendor_name: string;
    status: string;
    vendor_rate: number | null;
    vendor_rate_unit: string | null;
    vendor_total: number | null;
    vendor_currency: string;
    deadline: string | null;
    expires_at: string | null;
    offered_at: string | null;
    declined_reason: string | null;
    responded_at: string | null;
    counter_status: string | null;
    counter_rate: number | null;
    counter_rate_unit: string | null;
    counter_total: number | null;
    counter_currency: string | null;
    counter_deadline: string | null;
    counter_note: string | null;
    counter_at: string | null;
    counter_responded_at: string | null;
    counter_rejection_reason: string | null;
    negotiation_allowed: boolean;
    max_rate: number | null;
    max_total: number | null;
    latest_deadline: string | null;
    auto_accept_within_limits: boolean;
  }> | null;
  payable: StepPayable | null;
  unassigned_vendor_id: string | null;
  unassigned_vendor_name: string | null;
  unassign_reason: string | null;
  unassign_notes: string | null;
  unassigned_at: string | null;
  approval_depends_on_step: number | null;
  created_at: string;
  updated_at: string;
}

interface StepDelivery {
  id: string;
  step_id: string;
  version: number;
  actor_type: 'external_vendor' | 'internal_work' | 'customer';
  delivered_by_id: string | null;
  delivered_by_name: string | null;
  delivered_at: string;
  file_paths: string[] | null;
  notes: string | null;
  review_status: 'pending_review' | 'approved' | 'revision_requested';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_feedback: string | null;
  created_at: string;
}

interface OrderFinancials {
  service_id: string | null;
  subtotal: number;
  pre_tax: number;
  tax: number;
  total: number;
}

interface StaffUser {
  id: string;
  full_name: string;
  email: string;
}

interface Workflow {
  id: string;
  template_code: string;
  template_name: string | null;
  status: string;
  current_step_number: number;
  total_steps: number;
  progress: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    percent: number;
  };
}

interface WorkflowTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  is_suggested: boolean;
  step_count: number;
  steps: { step_number: number; name: string; actor_type: string }[];
}

interface WorkflowData {
  success: boolean;
  has_workflow: boolean;
  workflow: Workflow | null;
  steps: WorkflowStep[];
  available_templates?: WorkflowTemplate[];
}

// ── Unassign reason labels ──

const UNASSIGN_REASON_LABELS: Record<string, string> = {
  project_cancelled: "Project Cancelled",
  client_cancelled: "Client Cancelled",
  vendor_unresponsive: "Vendor Unresponsive",
  quality_issues: "Quality Issues",
  deadline_missed: "Deadline Missed",
  vendor_requested: "Vendor Requested",
  reassigning: "Reassigning to Another Vendor",
  scope_change: "Scope Change",
  other: "Other",
};

// ── Status styling ──

const STEP_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
  offered: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Offered" },
  accepted: { bg: "bg-blue-100", text: "text-blue-700", label: "Accepted" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  delivered: { bg: "bg-orange-100", text: "text-orange-700", label: "Delivered" },
  revision_requested: { bg: "bg-red-100", text: "text-red-700", label: "Revision Requested" },
  approved: { bg: "bg-green-100", text: "text-green-700", label: "Approved" },
  skipped: { bg: "bg-gray-100", text: "text-gray-400", label: "Skipped" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-400", label: "Cancelled" },
};

const WORKFLOW_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-600" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  on_hold: { bg: "bg-yellow-100", text: "text-yellow-700" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-400" },
};

const STEP_STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  offered: "📩",
  accepted: "🔵",
  in_progress: "🔵",
  delivered: "📦",
  revision_requested: "🔄",
  approved: "✅",
  skipped: "⏭️",
  cancelled: "❌",
};

function StepStatusBadge({ status }: { status: string }) {
  const style = STEP_STATUS_STYLES[status] ?? STEP_STATUS_STYLES.pending;
  const isInProgress = status === "in_progress";
  const isSkipped = status === "skipped" || status === "cancelled";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} ${isSkipped ? "line-through" : ""} ${isInProgress ? "animate-pulse" : ""}`}
    >
      {status === "approved" && <CheckCircle className="w-3 h-3" />}
      {status === "cancelled" && <XCircle className="w-3 h-3" />}
      {STEP_STATUS_ICONS[status] ?? ""} {style.label}
    </span>
  );
}

function ActorIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
  switch (type) {
    case "external_vendor":
      return <User className={className} />;
    case "internal_work":
    case "internal_review":
      return <Building className={className} />;
    case "customer":
      return <Users className={className} />;
    case "automated":
      return <Cog className={className} />;
    default:
      return <User className={className} />;
  }
}

function ActorTypeBadge({ actorType }: { actorType: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    external_vendor: { label: "Vendor", bg: "bg-blue-100", text: "text-blue-700" },
    internal_work: { label: "Internal (Work)", bg: "bg-purple-100", text: "text-purple-700" },
    internal_review: { label: "Internal (Review)", bg: "bg-indigo-100", text: "text-indigo-700" },
    customer: { label: "Customer", bg: "bg-green-100", text: "text-green-700" },
    automated: { label: "Auto", bg: "bg-gray-100", text: "text-gray-600" },
  };
  const c = config[actorType] || config.automated;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

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
}

function VendorFinderModal({
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
  }, [filterSourceLang, filterTargetLang, filterServiceId, nativeLanguages, country, minRating, maxRate, availability, searchText, sortBy]);

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
    setFilterSourceLang(sourceLanguage || "");
    setFilterTargetLang(targetLanguage || "");
    setFilterServiceId(serviceId || "");
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
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Select all + count */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={vendors.length > 0 && selectedIds.size === vendors.length}
                onChange={toggleSelectAll}
              />
              Select all (for batch offer)
            </label>
            <span className="text-sm text-gray-500">
              {searching ? "Searching..." : `${totalMatches} vendor(s) found`}
            </span>
          </div>

          {/* Vendor rows */}
          {searching ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : vendors.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">No vendors found. Adjust filters and search again.</p>
          ) : (
            <div className="space-y-2">
              {vendors.map((v: any) => (
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
                        onClick={() => onSelectVendor(v, "assign")}
                      >
                        Assign
                      </button>
                      <button
                        className="text-xs px-2.5 py-1 bg-teal-600 text-white rounded hover:bg-teal-700"
                        onClick={() => onSelectVendor(v, "offer")}
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

// ── VendorAssignModal ──

interface VendorAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: {
    action: 'direct_assign' | 'offer_vendor' | 'offer_multiple';
    vendor_id?: string;
    vendors?: Array<{ vendor_id: string; vendor_rate?: number; vendor_total?: number }>;
    vendor_rate: number;
    vendor_rate_unit: string;
    vendor_total: number;
    vendor_currency: string;
    deadline: string | null;
    instructions: string | null;
    expires_in_hours: number | null;
    negotiation_allowed: boolean;
    max_rate: number | null;
    max_total: number | null;
    latest_deadline: string | null;
    auto_accept_within_limits: boolean;
  }) => void;
  mode: 'assign' | 'offer' | 'offer_multiple';
  vendor: any | null;
  vendors: any[] | null;
  stepId: string;
  stepName: string;
  stepNumber: number;
  serviceName: string | null;
  orderFinancials: OrderFinancials | null;
  totalVendorCost: number;
  minMarginPercent: number;
}

function VendorAssignModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
  vendor,
  vendors,
  stepId,
  stepName,
  stepNumber,
  serviceName,
  orderFinancials,
  totalVendorCost,
  minMarginPercent,
}: VendorAssignModalProps) {
  const [vendorRate, setVendorRate] = useState<string>("");
  const [vendorRateUnit, setVendorRateUnit] = useState("per_word");
  const [units, setUnits] = useState<string>("1");
  const [vendorCurrency, setVendorCurrency] = useState("CAD");
  const [deadline, setDeadline] = useState("");
  const [instructions, setInstructions] = useState("");
  const [expiresInHours, setExpiresInHours] = useState<string>("24");
  const [suggestedRate, setSuggestedRate] = useState<{ rate: number; calculation_unit: string; currency: string } | null>(null);
  const [lookingUpRate, setLookingUpRate] = useState(false);
  const [negotiationAllowed, setNegotiationAllowed] = useState(false);
  const [maxRate, setMaxRate] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [latestDeadline, setLatestDeadline] = useState('');
  const [autoAccept, setAutoAccept] = useState(true);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setVendorRate("");
      setVendorRateUnit("per_word");
      setUnits("1");
      setVendorCurrency("CAD");
      setDeadline("");
      setInstructions("");
      setExpiresInHours("24");
      setSuggestedRate(null);
      setNegotiationAllowed(false);
      setMaxRate('');
      setMaxTotal('');
      setLatestDeadline('');
      setAutoAccept(true);
    }
  }, [isOpen]);

  // Lookup rate for single vendor mode
  useEffect(() => {
    if (isOpen && vendor && mode !== "offer_multiple") {
      const lookupRate = async () => {
        setLookingUpRate(true);
        try {
          const { data } = await supabase.functions.invoke("update-workflow-step", {
            body: { step_id: stepId, action: "lookup_vendor_rate", vendor_id: vendor.id },
          });
          if (data?.suggested_rate) {
            setSuggestedRate(data.suggested_rate);
            setVendorRate(String(data.suggested_rate.rate));
            setVendorRateUnit(data.suggested_rate.calculation_unit);
            setVendorCurrency(data.suggested_rate.currency);
          }
        } catch (err) {
          console.error("Rate lookup failed:", err);
        }
        setLookingUpRate(false);
      };
      lookupRate();
    }
  }, [isOpen, vendor, mode, stepId]);

  // Pre-fill rate from vendor's rate_for_service if available and no suggested rate
  useEffect(() => {
    if (isOpen && vendor && vendor.rate_for_service && !suggestedRate && !vendorRate) {
      setVendorRate(String(vendor.rate_for_service.rate));
      setVendorCurrency(vendor.rate_for_service.currency || "CAD");
    }
  }, [isOpen, vendor, suggestedRate]);

  // Auto-set units to 1 for flat rate
  useEffect(() => {
    if (vendorRateUnit === 'flat') {
      setUnits("1");
    }
  }, [vendorRateUnit]);

  // Auto-calculate total
  const calculatedTotal = useMemo(() => {
    const r = parseFloat(vendorRate) || 0;
    const u = parseFloat(units) || 0;
    return (r * u).toFixed(2);
  }, [vendorRate, units]);

  // Dynamic unit label
  const unitLabel = useMemo(() => {
    switch (vendorRateUnit) {
      case 'per_word': return 'Word Count *';
      case 'per_page': return 'Page Count *';
      case 'per_hour': return 'Hours *';
      case 'flat': return 'Units *';
      default: return 'Units *';
    }
  }, [vendorRateUnit]);

  // Display name for rate units
  const unitDisplayName = (unit: string) => {
    const map: Record<string, string> = {
      per_word: 'per word',
      per_page: 'per page',
      per_hour: 'per hour',
      flat: 'flat rate',
    };
    return map[unit] || unit;
  };

  const margin =
    orderFinancials && orderFinancials.subtotal > 0 && parseFloat(calculatedTotal) > 0
      ? ((orderFinancials.subtotal - parseFloat(calculatedTotal)) / orderFinancials.subtotal) * 100
      : null;

  const marginColor =
    margin === null ? "gray" : margin >= 50 ? "green" : margin >= minMarginPercent ? "yellow" : "red";

  const canSubmit = vendorRate !== "" && parseFloat(vendorRate) > 0 && vendorRateUnit && units !== "" && parseFloat(units) > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const isOffer = mode !== "assign";
    const baseParams = {
      vendor_rate: parseFloat(vendorRate),
      vendor_rate_unit: vendorRateUnit,
      vendor_total: parseFloat(calculatedTotal),
      vendor_currency: vendorCurrency,
      deadline: deadline || null,
      instructions: instructions || null,
      expires_in_hours: isOffer && expiresInHours !== "0" ? parseInt(expiresInHours) : null,
      // v6: Negotiation policy
      negotiation_allowed: isOffer ? negotiationAllowed : false,
      max_rate: isOffer && negotiationAllowed && maxRate ? parseFloat(maxRate) : null,
      max_total: isOffer && negotiationAllowed && maxTotal ? parseFloat(maxTotal) : null,
      latest_deadline: isOffer && negotiationAllowed && latestDeadline ? new Date(latestDeadline).toISOString() : null,
      auto_accept_within_limits: isOffer && negotiationAllowed ? autoAccept : true,
    };

    if (mode === "assign" && vendor) {
      onSubmit({ ...baseParams, action: "direct_assign", vendor_id: vendor.id });
    } else if (mode === "offer" && vendor) {
      onSubmit({ ...baseParams, action: "offer_vendor", vendor_id: vendor.id });
    } else if (mode === "offer_multiple" && vendors) {
      onSubmit({
        ...baseParams,
        action: "offer_multiple",
        vendors: vendors.map((v) => ({ vendor_id: v.id })),
      });
    }
  };

  const headerText =
    mode === "assign"
      ? `Assign Vendor — Step ${stepNumber}: ${stepName}`
      : mode === "offer"
        ? `Offer to Vendor — Step ${stepNumber}: ${stepName}`
        : `Offer to ${vendors?.length || 0} Vendors — Step ${stepNumber}: ${stepName}`;

  const submitLabel =
    mode === "assign"
      ? "Assign"
      : mode === "offer"
        ? "Send Offer"
        : `Send Offers (${vendors?.length || 0})`;

  const submitColor =
    mode === "assign" ? "bg-blue-600 hover:bg-blue-700" : "bg-teal-600 hover:bg-teal-700";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">{headerText}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Vendor display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor{mode === "offer_multiple" ? "s" : ""}</label>
            {mode === "offer_multiple" && vendors ? (
              <div className="flex flex-wrap gap-1">
                {vendors.map((v) => (
                  <span key={v.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-xs font-medium">
                    {v.full_name}
                    {v.rating != null && (
                      <span className="flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                        {v.rating}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ) : vendor ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                  {vendor.full_name}
                  {vendor.rating != null && (
                    <span className="flex items-center gap-0.5 ml-1">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      {vendor.rating}
                    </span>
                  )}
                  {vendor.rate_for_service && (
                    <span className="ml-1 text-xs text-indigo-400">
                      ${vendor.rate_for_service.rate}/{vendor.rate_for_service.unit}
                    </span>
                  )}
                </span>
                {lookingUpRate && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Looking up rate...
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {/* Service info */}
          <div className="bg-gray-50 rounded px-3 py-2 text-sm text-gray-600">
            Service: {serviceName || "N/A"}
          </div>

          {/* Rate section */}
          <div className="space-y-3">
            {/* Row 1: Rate, Rate Unit, Currency */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate *</label>
                <input
                  type="number"
                  step="0.001"
                  value={vendorRate}
                  onChange={(e) => setVendorRate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate Unit *</label>
                <select
                  value={vendorRateUnit}
                  onChange={(e) => setVendorRateUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="per_word">Per Word</option>
                  <option value="per_page">Per Page</option>
                  <option value="per_hour">Per Hour</option>
                  <option value="flat">Flat</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                <select
                  value={vendorCurrency}
                  onChange={(e) => setVendorCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
            {suggestedRate && (
              <p className="text-xs text-gray-400">
                Vendor&apos;s rate: ${suggestedRate.rate} {unitDisplayName(suggestedRate.calculation_unit)} ({suggestedRate.currency})
              </p>
            )}
            {/* Row 2: Units, Total */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{unitLabel}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  disabled={vendorRateUnit === 'flat'}
                  className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${vendorRateUnit === 'flat' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-700">
                  {vendorCurrency} ${calculatedTotal}
                </div>
              </div>
            </div>
          </div>

          {/* Margin indicator */}
          {parseFloat(calculatedTotal) > 0 && orderFinancials && orderFinancials.subtotal > 0 ? (
            <div className="border rounded p-3 text-sm">
              <div className="text-gray-600">Customer subtotal: ${orderFinancials.subtotal.toFixed(2)}</div>
              <div className="text-gray-600">This step cost: ${calculatedTotal}</div>
              <div className="flex items-center gap-1">
                <span
                  className={
                    marginColor === "green"
                      ? "text-green-600"
                      : marginColor === "yellow"
                        ? "text-yellow-600"
                        : "text-red-600"
                  }
                >
                  ●
                </span>
                <span className="text-gray-700">Step margin: {margin !== null ? `${margin.toFixed(1)}%` : "N/A"}</span>
              </div>
              {margin !== null && margin < minMarginPercent && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2 rounded text-sm mt-2">
                  Warning: Margin below minimum threshold ({minMarginPercent}%). Proceed with caution.
                </div>
              )}
            </div>
          ) : parseFloat(calculatedTotal) > 0 ? (
            <p className="text-xs text-gray-400">Margin unavailable — order has no pricing data.</p>
          ) : null}

          {/* Offer expiry (offer modes only) */}
          {mode !== "assign" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Offer expires in</label>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="0">No expiry</option>
                <option value="4">4 hours</option>
                <option value="8">8 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
              </select>
            </div>
          )}

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deadline</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Instructions for vendor</label>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Special instructions, reference materials, glossary links..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Negotiation config (offer modes only) */}
          {(mode === 'offer' || mode === 'offer_multiple') && (
            <div className="border-t pt-3 mt-3">
              {/* Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={negotiationAllowed}
                  onChange={(e) => setNegotiationAllowed(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Allow vendor to negotiate</span>
              </label>

              {/* Bounds (only when enabled) */}
              {negotiationAllowed && (
                <div className="mt-3 ml-6 space-y-3 p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="text-xs text-gray-500">
                    Set maximum acceptable terms. Counters within these bounds will be auto-accepted.
                    Counters exceeding any limit will be queued for your review.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Max Rate */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Max acceptable rate
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={maxRate}
                        onChange={(e) => setMaxRate(e.target.value)}
                        placeholder={vendorRate ? `Current: ${vendorRate}` : '0.00'}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-gray-400 mt-0.5">
                        {unitDisplayName(vendorRateUnit)}
                      </span>
                    </div>

                    {/* Max Total */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Max acceptable total
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={maxTotal}
                        onChange={(e) => setMaxTotal(e.target.value)}
                        placeholder={calculatedTotal ? `Current: ${calculatedTotal}` : '0.00'}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-gray-400 mt-0.5">{vendorCurrency}</span>
                    </div>
                  </div>

                  {/* Latest Deadline */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Latest acceptable deadline
                    </label>
                    <input
                      type="datetime-local"
                      value={latestDeadline}
                      onChange={(e) => setLatestDeadline(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>

                  {/* Auto-accept toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAccept}
                      onChange={(e) => setAutoAccept(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">
                      Auto-accept counters within limits
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">
                    {autoAccept
                      ? 'Counters within bounds will be accepted automatically — no PM action needed.'
                      : 'All counters will be queued for your review, even if within bounds.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
              canSubmit ? submitColor : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddStepModal ──

function AddStepModal({
  isOpen,
  onClose,
  onAdd,
  steps,
  availableServices,
  onLoadServices,
  servicesLoaded,
  defaultInsertAfter,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (params: any) => void;
  steps: WorkflowStep[];
  availableServices: any[];
  onLoadServices: () => void;
  servicesLoaded: boolean;
  defaultInsertAfter: number;
}) {
  const [stepName, setStepName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [actorType, setActorType] = useState("external_vendor");
  const [insertAfter, setInsertAfter] = useState(defaultInsertAfter);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [isOptional, setIsOptional] = useState(false);
  const [requiresFileUpload, setRequiresFileUpload] = useState(true);
  const [instructions, setInstructions] = useState("");

  // Load services on first open
  useEffect(() => {
    if (isOpen && !servicesLoaded) onLoadServices();
  }, [isOpen]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStepName("");
      setServiceId("");
      setActorType("external_vendor");
      setInsertAfter(defaultInsertAfter);
      setAutoAdvance(false);
      setIsOptional(false);
      setRequiresFileUpload(true);
      setInstructions("");
    }
  }, [isOpen, defaultInsertAfter]);

  // Auto-fill name from selected service
  const handleServiceChange = (id: string) => {
    setServiceId(id);
    if (id) {
      const svc = availableServices.find((s) => s.id === id);
      if (svc && !stepName) setStepName(svc.name);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Add Workflow Step</h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">

          {/* Insert position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Insert after</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              value={insertAfter}
              onChange={(e) => setInsertAfter(parseInt(e.target.value))}
            >
              <option value={0}>— At the beginning —</option>
              {steps.map((s) => (
                <option key={s.step_number} value={s.step_number}>
                  Step {s.step_number}: {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
            >
              <option value="">— Select service (optional) —</option>
              {availableServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.category})
                </option>
              ))}
            </select>
          </div>

          {/* Step name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Step name *</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="e.g., Proofreading, DTP, Client Review"
              value={stepName}
              onChange={(e) => setStepName(e.target.value)}
            />
          </div>

          {/* Actor type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Actor type</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              value={actorType}
              onChange={(e) => setActorType(e.target.value)}
            >
              <option value="external_vendor">Vendor (freelancer)</option>
              <option value="internal_work">Internal (work)</option>
              <option value="internal_review">Internal (review)</option>
              <option value="customer">Customer (review)</option>
              <option value="automated">Automated (system)</option>
            </select>
          </div>

          {/* Options row */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
              />
              Auto-advance to next step
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isOptional}
                onChange={(e) => setIsOptional(e.target.checked)}
              />
              Optional step
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requiresFileUpload}
                onChange={(e) => setRequiresFileUpload(e.target.checked)}
              />
              Requires file upload
            </label>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instructions (optional)</label>
            <textarea
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              rows={2}
              placeholder="Default instructions for this step..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={!stepName.trim()}
            onClick={() => {
              onAdd({
                insert_after: insertAfter,
                name: stepName.trim(),
                service_id: serviceId || null,
                actor_type: actorType,
                auto_advance: autoAdvance,
                is_optional: isOptional,
                requires_file_upload: requiresFileUpload,
                instructions: instructions.trim() || null,
              });
              onClose();
            }}
          >
            Add Step
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TemplateSelector (no workflow assigned) ──

function TemplateSelector({
  templates,
  orderId,
  onAssigned,
}: {
  templates: WorkflowTemplate[];
  orderId: string;
  onAssigned: () => void;
}) {
  const sortedTemplates = [...templates].sort((a, b) => {
    if (a.is_suggested && !b.is_suggested) return -1;
    if (!a.is_suggested && b.is_suggested) return 1;
    return 0;
  });
  const suggested = sortedTemplates.find((t) => t.is_suggested);
  const [selectedCode, setSelectedCode] = useState(suggested?.code ?? sortedTemplates[0]?.code ?? "");
  const [assigning, setAssigning] = useState(false);

  const selectedTemplate = sortedTemplates.find((t) => t.code === selectedCode);

  const handleAssign = async () => {
    if (!selectedCode) return;
    setAssigning(true);
    try {
      const { data, error } = await supabase.functions.invoke("assign-order-workflow", {
        body: { order_id: orderId, template_code: selectedCode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Workflow assigned");
      onAssigned();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to assign workflow";
      toast.error(message);
    }
    setAssigning(false);
  };

  if (templates.length === 0) {
    return (
      <p className="text-sm text-gray-400">No workflow templates available for this order.</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">No workflow assigned to this order. Select a template to get started.</p>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Workflow Template</label>
        <select
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {sortedTemplates.map((t) => (
            <option key={t.code} value={t.code}>
              {t.is_suggested ? "★ " : ""}{t.name} ({t.step_count} steps)
            </option>
          ))}
        </select>
      </div>

      {/* Mini preview */}
      {selectedTemplate && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">{selectedTemplate.description}</p>
          <div className="flex flex-wrap items-center gap-1">
            {selectedTemplate.steps.map((s, i) => (
              <span key={s.step_number} className="flex items-center gap-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-700">
                  <ActorIcon type={s.actor_type} className="w-3 h-3 text-gray-400" />
                  {s.name}
                </span>
                {i < selectedTemplate.steps.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-gray-300" />
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleAssign}
        disabled={assigning || !selectedCode}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
      >
        {assigning ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        Assign Workflow
      </button>
    </div>
  );
}

// ── StaffPickerDropdown ──

function StaffPickerDropdown({ onSelect }: { onSelect: (staffId: string) => void }) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const fetchStaff = async () => {
      const { data, error } = await supabase
        .from("staff_users")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      if (!cancelled) {
        if (error) {
          console.error("StaffPicker fetch error:", error.message);
        }
        setStaff(data || []);
        setLoading(false);
      }
    };

    fetchRef.current = fetchStaff;
    fetchStaff();

    // Unique channel name so multiple dropdown instances don't collide.
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(`staff_users_picker_${uniqueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_users" },
        () => {
          fetchStaff();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <select
      className="text-sm border border-gray-300 rounded px-2 py-1"
      defaultValue=""
      onFocus={() => fetchRef.current()}
      onMouseDown={() => fetchRef.current()}
      onChange={(e) => e.target.value && onSelect(e.target.value)}
      disabled={loading && staff.length === 0}
    >
      <option value="" disabled>
        {loading && staff.length === 0
          ? "Loading..."
          : staff.length === 0
          ? "No active staff"
          : "Select staff member..."}
      </option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.full_name || s.email}
        </option>
      ))}
    </select>
  );
}

// ── WorkflowPipeline (main visible component) ──

interface WorkflowPipelineProps {
  workflow: Workflow;
  steps: WorkflowStep[];
  onStepClick: (step: WorkflowStep) => void;
  expandedStepId?: string | null;
  onToggleExpand?: (stepId: string) => void;
  orderFinancials?: OrderFinancials | null;
  totalVendorCost?: number;
  onFindVendor?: (step: WorkflowStep) => void;
  handleStepAction?: (stepId: string, action: string, params: any) => Promise<void>;
  actionLoading?: string | null;
  revisionStepId?: string | null;
  revisionReason?: string;
  onSetRevisionStepId?: (id: string | null) => void;
  onSetRevisionReason?: (text: string) => void;
  handleManageSteps?: (action: string, params: any) => Promise<void>;
  onAddStepAt?: (afterPosition: number) => void;
  handleRetractSingleOffer?: (stepId: string, offerId: string, vendorName: string) => Promise<void>;
  handleRespondCounter?: (offerId: string, action: 'accept' | 'reject') => Promise<void>;
  rejectingOfferId?: string | null;
  rejectReason?: string;
  onSetRejectingOfferId?: (id: string | null) => void;
  onSetRejectReason?: (text: string) => void;
  counterLoadingId?: string | null;
  onUnassignVendor?: (step: WorkflowStep) => void;
  onExtendDeadline?: (stepId: string, newDeadline: string, reason: string) => Promise<void>;
  onAdjustPayable?: (step: WorkflowStep, newRate: number | undefined, newSubtotal: number | undefined, reason: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  minMarginPercent?: number;
}

function WorkflowPipeline({
  workflow,
  steps,
  onStepClick,
  expandedStepId = null,
  onToggleExpand = () => {},
  orderFinancials = null,
  totalVendorCost = 0,
  onFindVendor = () => {},
  handleStepAction = async () => {},
  actionLoading = null,
  revisionStepId = null,
  revisionReason = "",
  onSetRevisionStepId = () => {},
  onSetRevisionReason = () => {},
  handleManageSteps = async () => {},
  onAddStepAt = () => {},
  handleRetractSingleOffer = async () => {},
  handleRespondCounter = async () => {},
  rejectingOfferId = null,
  rejectReason = '',
  onSetRejectingOfferId = () => {},
  onSetRejectReason = () => {},
  counterLoadingId = null,
  onUnassignVendor = () => {},
  onExtendDeadline,
  onAdjustPayable,
  onRefresh,
  minMarginPercent = 30,
}: WorkflowPipelineProps) {
  const [editDeadlineStepId, setEditDeadlineStepId] = useState<string | null>(null);
  const [editDeadlineValue, setEditDeadlineValue] = useState('');
  const [editDeadlineReason, setEditDeadlineReason] = useState('');
  const [editDeadlineLoading, setEditDeadlineLoading] = useState(false);

  const [adjustPayableStepId, setAdjustPayableStepId] = useState<string | null>(null);
  const [adjustPayableRate, setAdjustPayableRate] = useState('');
  const [adjustPayableTotal, setAdjustPayableTotal] = useState('');
  const [adjustPayableReason, setAdjustPayableReason] = useState('');
  const [adjustPayableLoading, setAdjustPayableLoading] = useState(false);

  const [deliveryHistoryExpandedSteps, setDeliveryHistoryExpandedSteps] = useState<Set<string>>(new Set());
  const toggleDeliveryHistory = (stepId: string) => {
    setDeliveryHistoryExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  // Staff delivery upload state
  const [staffDeliveryStepId, setStaffDeliveryStepId] = useState<string | null>(null);
  const [staffDeliveryFiles, setStaffDeliveryFiles] = useState<File[]>([]);
  const [staffDeliveryNotes, setStaffDeliveryNotes] = useState('');
  const [staffDeliveryLoading, setStaffDeliveryLoading] = useState(false);
  const staffFileInputRef = useRef<HTMLInputElement>(null);

  // Approve/Revise modal state
  const [approveModalStep, setApproveModalStep] = useState<WorkflowStep | null>(null);
  const [reviseModalStep, setReviseModalStep] = useState<WorkflowStep | null>(null);
  const [reviseFeedback, setReviseFeedback] = useState('');

  // Actor type switcher state
  const [switchingActorStepId, setSwitchingActorStepId] = useState<string | null>(null);

  const { session: currentStaff } = useAdminAuthContext();

  const handleStaffDeliver = async (stepId: string) => {
    if (staffDeliveryFiles.length === 0) {
      toast.error('Please select at least one file');
      return;
    }
    setStaffDeliveryLoading(true);
    try {
      const formData = new FormData();
      formData.append('step_id', stepId);
      if (staffDeliveryNotes) formData.append('notes', staffDeliveryNotes);
      staffDeliveryFiles.forEach(f => formData.append('files', f));
      if (currentStaff?.id) formData.append('staff_id', currentStaff.id);

      const { data, error } = await supabase.functions.invoke('staff-deliver-step', {
        body: formData,
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to deliver files');
        return;
      }

      toast.success(`Delivered v${data.delivery_version}`);
      setStaffDeliveryStepId(null);
      setStaffDeliveryFiles([]);
      setStaffDeliveryNotes('');
      if (onRefresh) await onRefresh();
    } catch (err) {
      toast.error('Failed to deliver files');
    } finally {
      setStaffDeliveryLoading(false);
    }
  };

  const handleDownloadFile = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('vendor-deliveries')
        .createSignedUrl(filePath, 3600);
      if (error || !data?.signedUrl) {
        toast.error('Failed to generate download link');
        return;
      }
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('Failed to download file');
    }
  };

  const REVIEW_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    pending_review: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Pending Review' },
    approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
    revision_requested: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Revision Requested' },
  };
  return (
    <div className="space-y-4">
      {/* Workflow header */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        {/* Row 1: Template name + status */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                workflow.status === "completed"
                  ? "bg-green-500"
                  : workflow.status === "in_progress"
                    ? "bg-blue-500"
                    : "bg-gray-400"
              }`}
            />
            <span className="font-semibold text-gray-900 capitalize">
              {workflow.template_name || workflow.template_code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-3 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
              onClick={() => onAddStepAt(steps.length)}
            >
              + Add Step
            </button>
            <StepStatusBadge status={workflow.status} />
          </div>
        </div>

        {/* Row 2: Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${workflow.progress?.percent || 0}%` }}
            />
          </div>
          <span className="text-sm text-gray-600 whitespace-nowrap">
            {workflow.progress?.completed || 0}/{workflow.progress?.total || 0} steps (
            {workflow.progress?.percent || 0}%)
          </span>
        </div>

        {/* Row 3: Financial summary */}
        {orderFinancials && orderFinancials.subtotal > 0 && (
          <div className="mt-2 pt-2 border-t text-sm text-gray-600">
            <span>
              Customer subtotal: <strong>${orderFinancials.subtotal.toFixed(2)}</strong>
            </span>
            <span className="mx-2">·</span>
            <span>
              Vendor cost: <strong>${totalVendorCost.toFixed(2)}</strong>
            </span>
            <span className="mx-2">·</span>
            {(() => {
              const margin =
                ((orderFinancials.subtotal - totalVendorCost) / orderFinancials.subtotal) * 100;
              const color =
                margin >= 50
                  ? "text-green-600"
                  : margin >= minMarginPercent
                    ? "text-yellow-600"
                    : "text-red-600";
              return <span className={color}>Margin: {margin.toFixed(1)}%</span>;
            })()}
          </div>
        )}
      </div>

      {/* Vertical pipeline */}
      <div className="relative ml-4">
        {/* Vertical connecting line */}
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />

        {/* Insert point before first step */}
        <div className="relative flex items-center justify-center h-2 group">
          <button
            className="absolute left-0.5 w-5 h-5 rounded-full bg-white border border-dashed border-gray-300 text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:border-blue-400 hover:text-blue-500 flex items-center justify-center z-10"
            title="Add step at the beginning"
            onClick={(e) => {
              e.stopPropagation();
              onAddStepAt(0);
            }}
          >
            +
          </button>
        </div>

        {steps.map((step) => {
          const isActive = [
            "offered",
            "accepted",
            "in_progress",
            "delivered",
            "revision_requested",
          ].includes(step.status);
          const isApproved = step.status === "approved";
          const isSkipped = step.status === "skipped" || step.status === "cancelled";
          const isExpanded = expandedStepId === step.id;

          const dotClass = isApproved
            ? "border-green-500 bg-green-500"
            : isActive
              ? "border-blue-500 bg-blue-500"
              : isSkipped
                ? "border-gray-300 bg-gray-100"
                : "border-gray-300 bg-white";

          const cardClass = isApproved
            ? "border-green-200 bg-green-50"
            : isActive
              ? "border-blue-200 bg-blue-50"
              : isSkipped
                ? "border-gray-200 bg-gray-50 opacity-60"
                : "border-gray-200 bg-white";

          return (
            <div key={step.id}>
            <div className="relative flex items-start mb-3">
              {/* Dot on the vertical line */}
              <div
                className={`absolute left-1.5 top-4 w-3 h-3 rounded-full border-2 ${dotClass} z-10`}
              />

              {/* Step card */}
              <div className={`ml-10 flex-1 border rounded-lg p-3 ${cardClass}`}>
                {/* Line 1: Header row (clickable) */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => onToggleExpand(step.id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{STEP_STATUS_ICONS[step.status] || "⏳"}</span>
                    <span className="font-medium text-sm">
                      Step {step.step_number}: {step.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {step.status === 'pending' && (
                      <span className="flex gap-0.5">
                        {step.step_number > 1 && (
                          <button
                            className="text-gray-400 hover:text-blue-500 text-xs p-1"
                            title="Move up"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManageSteps("reorder_step", { step_id: step.id, new_position: step.step_number - 1 });
                            }}
                          >
                            ↑
                          </button>
                        )}
                        {step.step_number < steps.length && (
                          <button
                            className="text-gray-400 hover:text-blue-500 text-xs p-1"
                            title="Move down"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManageSteps("reorder_step", { step_id: step.id, new_position: step.step_number + 1 });
                            }}
                          >
                            ↓
                          </button>
                        )}
                      </span>
                    )}
                    <StepStatusBadge status={step.status} />
                    {step.has_pending_counter && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300 animate-pulse">
                        🔔 Counter-proposal pending
                      </span>
                    )}
                    {['pending', 'skipped', 'cancelled'].includes(step.status) && steps.length > 1 && (
                      <button
                        className="text-gray-400 hover:text-red-500 text-xs p-1"
                        title="Remove step"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove step "${step.name}"? This cannot be undone.`)) {
                            handleManageSteps("remove_step", { step_id: step.id });
                          }
                        }}
                      >
                        ✕
                      </button>
                    )}
                    <span className="text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
                  </div>
                </div>

                {/* Line 2: Actor + assignment */}
                <div className="flex items-center gap-2 mt-1">
                  <ActorTypeBadge actorType={step.actor_type} />
                  <span className="text-sm text-gray-600">
                    {step.vendor_name ||
                      (step.assigned_staff_id ? (
                        "Staff assigned"
                      ) : (
                        <span className="italic text-gray-400">Not assigned</span>
                      ))}
                  </span>
                </div>

                {/* Active offers display */}
                {step.offers && step.offers.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {step.offers.filter((o: any) => o.status === "pending").length > 0 && (
                      <div className="text-xs text-blue-600">
                        {step.offers.filter((o: any) => o.status === "pending").length} offer(s) pending
                        {step.offers
                          .filter((o: any) => o.status === "pending")
                          .map((o: any) => (
                            <span
                              key={o.id}
                              className="ml-2 inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs"
                            >
                              {o.vendor_name}
                              {o.expires_at &&
                                (() => {
                                  const diffMs = new Date(o.expires_at).getTime() - Date.now();
                                  if (diffMs <= 0) return <span className="ml-1 text-red-500">(expired)</span>;
                                  const hrs = Math.floor(diffMs / 3600000);
                                  const mins = Math.floor((diffMs % 3600000) / 60000);
                                  if (hrs > 0) return <span className="ml-1 text-blue-400">({hrs}h {mins}m left)</span>;
                                  return <span className="ml-1 text-amber-500">({mins}m left)</span>;
                                })()}
                              <button
                                className="text-xs text-red-400 hover:text-red-600 p-0.5"
                                title={`Retract offer to ${o.vendor_name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetractSingleOffer(step.id, o.id, o.vendor_name);
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        {/* Negotiation indicator */}
                        {step.offers.some((o: any) => o.negotiation_allowed) ? (
                          <span className="ml-2 text-xs text-teal-600" title="Vendors can submit counter-proposals">
                            📝 Negotiable
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-gray-400" title="Fixed terms — no negotiation">
                            🔒 Fixed
                          </span>
                        )}
                      </div>
                    )}
                    {step.offers.filter((o: any) => o.status === "declined").length > 0 && (
                      <div className="text-xs text-gray-400 space-y-0.5">
                        <span>{step.offers.filter((o) => o.status === "declined").length} declined:</span>
                        {step.offers.filter((o) => o.status === "declined").map((o) => (
                          <div key={o.id} className="ml-2">
                            <span className="text-gray-500">{o.vendor_name}</span>
                            {o.declined_reason && (
                              <span className="text-gray-400 italic"> — &ldquo;{o.declined_reason}&rdquo;</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Counter-offer details and negotiation policy for each offer */}
                    {step.offers.map((offer: any) => (
                      <div key={`counter-${offer.id}`}>
                        {/* Negotiation policy (read-only) */}
                        {offer.negotiation_allowed && (
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <span className="text-gray-400">Negotiation:</span> Allowed
                            {offer.auto_accept_within_limits && (
                              <>
                                {' · Auto-accept'}
                                {offer.max_rate != null && ` ≤ $${Number(offer.max_rate).toFixed(2)}`}
                                {offer.max_total != null && `${offer.max_rate != null ? '' : ' ≤'} / $${Number(offer.max_total).toFixed(2)} total`}
                              </>
                            )}
                            {!offer.auto_accept_within_limits && (
                              <>
                                {' · Manual review'}
                                {offer.max_rate != null && ` · Max rate $${Number(offer.max_rate).toFixed(2)}`}
                                {offer.max_total != null && ` · Max total $${Number(offer.max_total).toFixed(2)}`}
                              </>
                            )}
                            {offer.latest_deadline && (
                              <> · by {new Date(offer.latest_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                            )}
                          </div>
                        )}

                        {/* Proposed counter – pending review */}
                        {offer.counter_status === 'pending' && (
                          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs">
                            <div className="font-medium text-yellow-800 mb-2">
                              🔔 Counter-Proposal <span className="font-normal text-yellow-600">(pending)</span>
                            </div>
                            <div className="space-y-1 text-gray-700">
                              {offer.counter_rate !== null && offer.counter_rate !== offer.vendor_rate && (
                                <div>
                                  Rate: <span className="line-through text-gray-400">${Number(offer.vendor_rate).toFixed(2)} {offer.vendor_rate_unit}</span>
                                  {' → '}<span className="font-medium text-yellow-800">${Number(offer.counter_rate).toFixed(2)} {offer.counter_rate_unit || offer.vendor_rate_unit}</span>
                                </div>
                              )}
                              {offer.counter_total !== null && offer.counter_total !== offer.vendor_total && (
                                <div>
                                  Total: <span className="line-through text-gray-400">${Number(offer.vendor_total).toFixed(2)}</span>
                                  {' → '}<span className="font-medium text-yellow-800">${Number(offer.counter_total).toFixed(2)}</span>
                                </div>
                              )}
                              {offer.counter_deadline && offer.counter_deadline !== offer.deadline && (
                                <div>
                                  Deadline: <span className="line-through text-gray-400">
                                    {offer.deadline ? new Date(offer.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'none'}
                                  </span>
                                  {' → '}<span className="font-medium text-yellow-800">
                                    {new Date(offer.counter_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                              )}
                              {offer.counter_note && (
                                <div className="mt-1.5 italic text-gray-500">
                                  &ldquo;{offer.counter_note}&rdquo;
                                </div>
                              )}
                              {offer.counter_at && (
                                <div className="text-gray-400 mt-1">
                                  Submitted: {new Date(offer.counter_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(offer.counter_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 disabled:opacity-50"
                                disabled={counterLoadingId === offer.id}
                                onClick={() => {
                                  if (confirm(`Accept counter-proposal from ${offer.vendor_name}? This will assign them to the step at the new rate.`)) {
                                    handleRespondCounter(offer.id, 'accept');
                                  }
                                }}
                              >
                                {counterLoadingId === offer.id ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /> Accepting...</>
                                ) : (
                                  <>✓ Accept Counter</>
                                )}
                              </button>
                              <button
                                className="bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 text-xs px-3 py-1.5 rounded border inline-flex items-center gap-1 disabled:opacity-50"
                                disabled={counterLoadingId === offer.id}
                                onClick={() => onSetRejectingOfferId(offer.id)}
                              >
                                ✕ Reject Counter
                              </button>
                            </div>
                            {rejectingOfferId === offer.id && (
                              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                                <textarea
                                  className="w-full border border-gray-300 rounded p-1.5 text-xs"
                                  placeholder="Reason for rejection (optional, visible to vendor)..."
                                  value={rejectReason}
                                  onChange={(e) => onSetRejectReason(e.target.value)}
                                  rows={2}
                                />
                                <div className="mt-1.5 flex gap-2">
                                  <button
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs disabled:opacity-50"
                                    disabled={counterLoadingId === offer.id}
                                    onClick={() => handleRespondCounter(offer.id, 'reject')}
                                  >
                                    {counterLoadingId === offer.id ? (
                                      <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Rejecting...</>
                                    ) : (
                                      'Confirm Reject'
                                    )}
                                  </button>
                                  <button
                                    className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-xs"
                                    disabled={counterLoadingId === offer.id}
                                    onClick={() => { onSetRejectingOfferId(null); onSetRejectReason(''); }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Accepted counter */}
                        {offer.counter_status === 'accepted' && (
                          <div className="mt-1.5 p-2 bg-green-50 border border-green-200 rounded-md text-xs text-green-700 flex items-center gap-1.5">
                            <span>✅</span>
                            <span>
                              Counter accepted
                              {offer.counter_rate != null && <> · Rate: ${Number(offer.counter_rate).toFixed(2)} {offer.counter_rate_unit || offer.vendor_rate_unit}</>}
                              {offer.counter_total != null && <> · Total: ${Number(offer.counter_total).toFixed(2)}</>}
                              {offer.counter_responded_at && (
                                <> · Responded {new Date(offer.counter_responded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(offer.counter_responded_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Rejected counter */}
                        {offer.counter_status === 'rejected' && (
                          <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600 flex items-center gap-1.5">
                            <span>❌</span>
                            <span>
                              Counter rejected
                              {offer.counter_rejection_reason && <> · &ldquo;{offer.counter_rejection_reason}&rdquo;</>}
                              {offer.counter_responded_at && (
                                <> · Responded {new Date(offer.counter_responded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(offer.counter_responded_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Accepted vendor */}
                {step.offers?.find((o) => o.status === "accepted") && (
                  <div className="text-xs text-green-600 mt-0.5 inline-flex items-center gap-1">
                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                      Accepted by {step.offers!.find((o) => o.status === "accepted")?.vendor_name}
                    </span>
                    <button
                      className="text-xs text-red-400 hover:text-red-600 p-0.5"
                      title={`Retract offer to ${step.offers!.find((o) => o.status === "accepted")?.vendor_name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const accepted = step.offers!.find((o) => o.status === "accepted")!;
                        handleRetractSingleOffer(step.id, accepted.id, accepted.vendor_name);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Line 3: Rate info (vendor steps with rate) */}
                {step.actor_type === "external_vendor" && step.vendor_rate && (
                  <div className="text-sm text-gray-500 mt-1">
                    ${step.vendor_rate}/{step.vendor_rate_unit} · {step.vendor_currency} $
                    {step.vendor_total?.toFixed(2)}
                    {/* Adjust payable link */}
                    {step.payable && !['paid', 'cancelled'].includes(step.payable.status) && onAdjustPayable && (
                      <button
                        className="ml-2 text-gray-400 hover:text-blue-600 cursor-pointer text-xs"
                        title="Adjust payable"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdjustPayableRate(step.payable!.rate?.toString() || '');
                          setAdjustPayableTotal(step.payable!.subtotal?.toString() || '');
                          setAdjustPayableReason('');
                          setAdjustPayableStepId(step.id);
                        }}
                      >
                        Adjust
                      </button>
                    )}
                    {step.payable?.original_subtotal != null && step.payable.original_subtotal !== step.payable.subtotal && (
                      <span className="ml-2 text-xs text-amber-600">
                        Previously adjusted from ${step.payable.original_subtotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}

                {/* Adjust Payable Popover */}
                {adjustPayableStepId === step.id && step.payable && (
                  <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="text-sm font-medium text-gray-700 mb-3">Adjust Payable</div>
                    <div className="text-xs text-gray-500 mb-2">
                      Current: ${step.payable.subtotal?.toFixed(2)} {step.payable.currency} ({step.payable.rate_unit === 'flat' ? 'flat rate' : step.payable.rate_unit})
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">New rate</label>
                        <div className="relative mt-0.5">
                          <span className="absolute left-2 top-1.5 text-sm text-gray-400">$</span>
                          <input
                            type="number"
                            step="0.01"
                            className="text-sm border border-gray-300 rounded px-3 py-1.5 w-full pl-6"
                            value={adjustPayableRate}
                            onChange={(e) => {
                              setAdjustPayableRate(e.target.value);
                              if (step.payable!.rate_unit === 'flat') {
                                setAdjustPayableTotal(e.target.value);
                              }
                            }}
                          />
                        </div>
                      </div>
                      {step.payable.rate_unit !== 'flat' && (
                        <div>
                          <label className="text-xs text-gray-600">New total <span className="text-gray-400">(auto-calc or manual override)</span></label>
                          <div className="relative mt-0.5">
                            <span className="absolute left-2 top-1.5 text-sm text-gray-400">$</span>
                            <input
                              type="number"
                              step="0.01"
                              className="text-sm border border-gray-300 rounded px-3 py-1.5 w-full pl-6"
                              value={adjustPayableTotal}
                              onChange={(e) => setAdjustPayableTotal(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-gray-600">Reason <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className="text-sm border border-gray-300 rounded px-3 py-1.5 w-full mt-0.5"
                          placeholder="e.g. Scope increased — additional 2 pages"
                          value={adjustPayableReason}
                          onChange={(e) => setAdjustPayableReason(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                          onClick={() => setAdjustPayableStepId(null)}
                          disabled={adjustPayableLoading}
                        >
                          Cancel
                        </button>
                        <button
                          className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                          disabled={!adjustPayableReason.trim() || adjustPayableLoading}
                          onClick={async () => {
                            setAdjustPayableLoading(true);
                            try {
                              const newRate = adjustPayableRate ? parseFloat(adjustPayableRate) : undefined;
                              const newSubtotal = adjustPayableTotal ? parseFloat(adjustPayableTotal) : undefined;
                              await onAdjustPayable!(step, newRate, newSubtotal, adjustPayableReason.trim());
                              setAdjustPayableStepId(null);
                            } catch {
                              // error handled by parent
                            }
                            setAdjustPayableLoading(false);
                          }}
                        >
                          {adjustPayableLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                          Adjust Amount
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Line 4: Language pair */}
                {(step.source_language_name || step.source_language) &&
                  (step.target_language_name || step.target_language) && (
                    <div className="text-sm text-gray-500 mt-1">
                      {step.source_language_name || step.source_language} →{" "}
                      {step.target_language_name || step.target_language}
                    </div>
                  )}

                {/* Line 5: Key dates */}
                {(step.deadline || step.delivered_at || step.approved_at) && (
                  <div className="text-xs text-gray-400 mt-1">
                    {step.deadline && (
                      <span>
                        Deadline:{" "}
                        {new Date(step.deadline).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {(() => {
                          const diff = Math.ceil(
                            (new Date(step.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                          );
                          if (diff > 0)
                            return <span className="text-gray-500"> (in {diff}d)</span>;
                          if (diff < 0)
                            return (
                              <span className="text-red-500"> (overdue {Math.abs(diff)}d)</span>
                            );
                          return <span className="text-yellow-600"> (today)</span>;
                        })()}
                        {/* Edit deadline pencil icon */}
                        {step.vendor_id && !['approved', 'skipped', 'cancelled'].includes(step.status) && onExtendDeadline && (
                          <button
                            className="ml-1 text-gray-400 hover:text-blue-600 cursor-pointer inline-flex items-center"
                            title="Edit deadline"
                            onClick={(e) => {
                              e.stopPropagation();
                              const dt = new Date(step.deadline!);
                              const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setEditDeadlineValue(local);
                              setEditDeadlineReason('');
                              setEditDeadlineStepId(step.id);
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    )}
                    {step.delivered_at && (
                      <span>
                        {" "}
                        · Delivered:{" "}
                        {new Date(step.delivered_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    {step.approved_at && (
                      <span>
                        {" "}
                        · Approved:{" "}
                        {new Date(step.approved_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                )}

                {/* Edit Deadline Popover */}
                {editDeadlineStepId === step.id && (
                  <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="text-sm font-medium text-gray-700 mb-3">Edit Deadline</div>
                    <div className="text-xs text-gray-500 mb-2">
                      Current: {new Date(step.deadline!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
                      {new Date(step.deadline!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">New deadline</label>
                        <input
                          type="datetime-local"
                          className="text-sm border border-gray-300 rounded px-3 py-1.5 w-full mt-0.5"
                          value={editDeadlineValue}
                          onChange={(e) => setEditDeadlineValue(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Reason <span className="text-gray-400">(optional but recommended)</span></label>
                        <input
                          type="text"
                          className="text-sm border border-gray-300 rounded px-3 py-1.5 w-full mt-0.5"
                          placeholder="e.g. Client added 2 more pages"
                          value={editDeadlineReason}
                          onChange={(e) => setEditDeadlineReason(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                          onClick={() => setEditDeadlineStepId(null)}
                          disabled={editDeadlineLoading}
                        >
                          Cancel
                        </button>
                        <button
                          className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                          disabled={!editDeadlineValue || editDeadlineLoading}
                          onClick={async () => {
                            setEditDeadlineLoading(true);
                            try {
                              const isoDeadline = new Date(editDeadlineValue).toISOString();
                              await onExtendDeadline!(step.id, isoDeadline, editDeadlineReason);
                              setEditDeadlineStepId(null);
                            } catch {
                              // error handled by parent
                            }
                            setEditDeadlineLoading(false);
                          }}
                        >
                          {editDeadlineLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                          Update Deadline
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Line 6: Offer count */}
                {step.offer_count > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Offers: {step.offer_count} attempt(s)
                  </div>
                )}

                {/* Previous unassignment info */}
                {step.unassigned_vendor_id && (
                  <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                    <div className="flex items-center gap-1 font-medium">
                      <UserMinus className="w-3 h-3" />
                      Previously: {step.unassigned_vendor_name || 'Unknown vendor'}
                    </div>
                    <div className="mt-0.5 text-amber-700">
                      Reason: {UNASSIGN_REASON_LABELS[step.unassign_reason || ''] || step.unassign_reason || 'Not specified'}
                      {step.unassigned_at && (
                        <span className="ml-2 text-amber-600">
                          · {new Date(step.unassigned_at).toLocaleDateString('en-CA')}
                        </span>
                      )}
                    </div>
                    {step.unassign_notes && (
                      <div className="mt-0.5 text-amber-600 italic">
                        "{step.unassign_notes}"
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* Actor Type Switcher: pending + multiple allowed types */}
                  {step.status === "pending" && step.allowed_actor_types && step.allowed_actor_types.length > 1 && (
                    <button
                      className="text-xs px-3 py-1 border border-indigo-400 text-indigo-600 rounded hover:bg-indigo-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSwitchingActorStepId(step.id);
                      }}
                    >
                      Switch Type
                    </button>
                  )}

                  {/* Assign controls. We compute the set of actor types this
                      step allows; a step with allowed_actor_types populated
                      overrides the single actor_type. Vendor picker shows when
                      external_vendor is allowed; Staff picker shows when any
                      internal actor is allowed. Steps whose only type is
                      automated/customer fall through with no picker (they
                      either run themselves or wait on the customer). */}
                  {(() => {
                    if (step.status !== "pending") return null;
                    if (step.vendor_id || step.assigned_staff_id) return null;
                    const allowed: string[] =
                      (Array.isArray(step.allowed_actor_types) &&
                        step.allowed_actor_types.length > 0
                        ? step.allowed_actor_types
                        : [step.actor_type]) as string[];
                    const canVendor = allowed.includes("external_vendor");
                    const canStaff =
                      allowed.includes("internal_work") ||
                      allowed.includes("internal_review");
                    // If the step is automated/customer AND no other types
                    // are allowed, surface both pickers as an override so the
                    // step doesn't get stuck.
                    const isFallback =
                      !canVendor &&
                      !canStaff &&
                      !["external_vendor", "internal_work", "internal_review"].includes(
                        step.actor_type,
                      );
                    return (
                      <>
                        {(canVendor || isFallback) && (
                          <button
                            className="text-xs px-3 py-1 border border-blue-400 text-blue-600 rounded hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFindVendor(step);
                            }}
                          >
                            Find Vendor
                          </button>
                        )}
                        {(canStaff || isFallback) && (
                          <StaffPickerDropdown
                            onSelect={(staffId) =>
                              handleStepAction(step.id, "assign_staff", {
                                staff_id: staffId,
                              })
                            }
                          />
                        )}
                      </>
                    );
                  })()}

                  {/* Send More Offers + Retract Offers: offered */}
                  {step.status === "offered" && (
                    <>
                      <button
                        className="text-xs px-3 py-1 border border-teal-400 text-teal-600 rounded hover:bg-teal-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFindVendor(step);
                        }}
                      >
                        Send More Offers
                      </button>
                      {step.offers?.some((o: any) => ['pending', 'accepted'].includes(o.status)) && (
                        <button
                          className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                          disabled={actionLoading === step.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            const activeCount = step.offers!.filter((o: any) => ['pending', 'accepted'].includes(o.status)).length;
                            if (confirm(`Retract all ${activeCount} offer(s) and reset step to Pending? All associated payables will be cancelled.`)) {
                              handleStepAction(step.id, "retract_offers", {});
                            }
                          }}
                        >
                          {actionLoading === step.id ? "..." : `Retract All (${step.offers!.filter((o: any) => ['pending', 'accepted'].includes(o.status)).length})`}
                        </button>
                      )}
                    </>
                  )}

                  {/* Unassign Vendor: any step with vendor assigned, not approved/skipped */}
                  {step.vendor_id && !['approved', 'skipped'].includes(step.status) && (
                    <button
                      className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                      onClick={(e) => { e.stopPropagation(); onUnassignVendor(step); }}
                      title="Unassign vendor from this step"
                    >
                      Unassign
                    </button>
                  )}

                  {/* Mark In Progress: accepted */}
                  {step.status === "accepted" && (
                    <button
                      className="text-xs px-3 py-1 border border-blue-400 text-blue-600 rounded hover:bg-blue-50"
                      disabled={actionLoading === step.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStepAction(step.id, "change_status", { status: "in_progress" });
                      }}
                    >
                      {actionLoading === step.id ? "..." : "Mark In Progress"}
                    </button>
                  )}

                  {/* Approve + Request Revision: delivered */}
                  {step.status === "delivered" && (() => {
                    // Check if approval is gated by another step
                    const depStepNum = step.approval_depends_on_step;
                    const depStep = depStepNum
                      ? steps.find((s) => s.step_number === depStepNum)
                      : null;
                    const isBlocked = depStep && depStep.status !== "approved" && depStep.status !== "skipped";

                    return (
                      <>
                        {isBlocked && depStep && (
                          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            Waiting for Step {depStep.step_number}: {depStep.name}
                          </span>
                        )}
                        <button
                          className={`text-xs px-3 py-1 rounded ${
                            isBlocked
                              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                              : "bg-green-600 text-white hover:bg-green-700"
                          }`}
                          disabled={actionLoading === step.id || !!isBlocked}
                          title={isBlocked ? `Blocked: Step ${depStep!.step_number} (${depStep!.name}) must be approved first` : "Approve delivery"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setApproveModalStep(step);
                          }}
                        >
                          {actionLoading === step.id ? "..." : "Approve"}
                        </button>
                        <button
                          className="text-xs px-3 py-1 border border-amber-400 text-amber-600 rounded hover:bg-amber-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReviseFeedback('');
                            setReviseModalStep(step);
                          }}
                        >
                          Request Revision
                        </button>
                      </>
                    );
                  })()}

                  {/* Skip Step: optional + not terminal */}
                  {step.is_optional && !["approved", "skipped", "cancelled"].includes(step.status) && (
                    <button
                      className="text-xs px-3 py-1 border border-gray-400 text-gray-600 rounded hover:bg-gray-50"
                      disabled={actionLoading === step.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Skip this optional step?")) {
                          handleStepAction(step.id, "skip_step", {});
                        }
                      }}
                    >
                      {actionLoading === step.id ? "..." : "Skip Step"}
                    </button>
                  )}
                </div>

                {/* Inline revision request */}
                {revisionStepId === step.id && (
                  <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="w-full text-sm border border-amber-300 rounded p-2"
                      rows={3}
                      placeholder="Reason for revision..."
                      value={revisionReason}
                      onChange={(e) => onSetRevisionReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        className="text-xs px-3 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                        onClick={() => {
                          onSetRevisionStepId(null);
                          onSetRevisionReason("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="text-xs px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600"
                        disabled={!revisionReason.trim() || actionLoading === step.id}
                        onClick={() => {
                          handleStepAction(step.id, "change_status", {
                            status: "revision_requested",
                            rejection_reason: revisionReason.trim(),
                          });
                          onSetRevisionStepId(null);
                          onSetRevisionReason("");
                        }}
                      >
                        {actionLoading === step.id ? "Sending..." : "Send Revision Request"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded section */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm">
                    {step.instructions && (
                      <div>
                        <span className="font-medium text-gray-600">Instructions:</span>
                        <div className="mt-1 bg-gray-100 rounded p-2 text-gray-700 text-xs">
                          {step.instructions}
                        </div>
                      </div>
                    )}
                    {step.notes_from_vendor && (
                      <div>
                        <span className="font-medium text-blue-600">Vendor notes:</span>
                        <div className="mt-1 bg-blue-50 rounded p-2 text-blue-800 text-xs">
                          {step.notes_from_vendor}
                        </div>
                      </div>
                    )}
                    {step.rejection_reason && (
                      <div>
                        <span className="font-medium text-amber-600">Revision reason:</span>
                        <div className="mt-1 bg-amber-50 rounded p-2 text-amber-800 text-xs">
                          {step.rejection_reason}
                        </div>
                      </div>
                    )}
                    {step.source_file_paths && step.source_file_paths.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-600">Source files:</span>
                        <div className="text-xs text-gray-500 mt-1">
                          {step.source_file_paths.map((p, i) => (
                            <div key={i}>{p.split("/").pop()}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {step.delivered_file_paths && step.delivered_file_paths.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-600">Delivered files:</span>
                        <div className="text-xs text-gray-500 mt-1">
                          {step.delivered_file_paths.map((p, i) => (
                            <button
                              key={i}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                              onClick={(e) => { e.stopPropagation(); handleDownloadFile(p); }}
                            >
                              <Download className="w-3 h-3" />
                              {p.split("/").pop()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Current Delivery */}
                    {step.latest_delivery && (
                      <div className="bg-blue-50 rounded p-2 border border-blue-200">
                        <div className="flex items-center gap-2 text-xs font-medium text-blue-800">
                          <span>📦 Current Delivery (v{step.latest_delivery.version})</span>
                          <span className="text-blue-500">— {new Date(step.latest_delivery.delivered_at).toLocaleString()}</span>
                          {step.latest_delivery.delivered_by_name && (
                            <span className="text-blue-500">by {step.latest_delivery.delivered_by_name}</span>
                          )}
                          <span className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${REVIEW_STATUS_STYLES[step.latest_delivery.review_status]?.bg || 'bg-gray-100'} ${REVIEW_STATUS_STYLES[step.latest_delivery.review_status]?.text || 'text-gray-600'}`}>
                            {REVIEW_STATUS_STYLES[step.latest_delivery.review_status]?.label || step.latest_delivery.review_status}
                          </span>
                        </div>
                        {step.latest_delivery.file_paths && step.latest_delivery.file_paths.length > 0 && (
                          <div className="mt-1 text-xs text-blue-600 flex flex-wrap gap-2">
                            {step.latest_delivery.file_paths.map((p, i) => (
                              <button
                                key={i}
                                className="flex items-center gap-0.5 hover:text-blue-800 hover:underline"
                                onClick={(e) => { e.stopPropagation(); handleDownloadFile(p); }}
                              >
                                <Download className="w-3 h-3" />
                                {p.split("/").pop()}
                              </button>
                            ))}
                          </div>
                        )}
                        {step.latest_delivery.notes && (
                          <div className="mt-1 text-xs text-blue-700 italic">"{step.latest_delivery.notes}"</div>
                        )}
                      </div>
                    )}

                    {/* Delivery Version History */}
                    {step.deliveries && step.deliveries.length > 0 && (
                      <div>
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800"
                          onClick={(e) => { e.stopPropagation(); toggleDeliveryHistory(step.id); }}
                        >
                          {deliveryHistoryExpandedSteps.has(step.id)
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronRight className="w-3 h-3" />
                          }
                          📋 Version History ({step.delivery_count || step.deliveries.length} version{(step.delivery_count || step.deliveries.length) !== 1 ? 's' : ''})
                        </button>
                        {deliveryHistoryExpandedSteps.has(step.id) && (
                          <div className="mt-1 overflow-x-auto">
                            <table className="w-full text-xs border border-gray-200 rounded">
                              <thead>
                                <tr className="bg-gray-50 text-gray-600">
                                  <th className="px-2 py-1 text-left font-medium">Ver</th>
                                  <th className="px-2 py-1 text-left font-medium">Delivered By</th>
                                  <th className="px-2 py-1 text-left font-medium">Delivered At</th>
                                  <th className="px-2 py-1 text-left font-medium">Files</th>
                                  <th className="px-2 py-1 text-left font-medium">Review</th>
                                  <th className="px-2 py-1 text-left font-medium">Feedback</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {step.deliveries.map((d) => {
                                  const rs = REVIEW_STATUS_STYLES[d.review_status] || REVIEW_STATUS_STYLES.pending_review;
                                  return (
                                    <tr key={d.id} className="hover:bg-gray-50">
                                      <td className="px-2 py-1 font-medium">v{d.version}</td>
                                      <td className="px-2 py-1 text-gray-600">{d.delivered_by_name || '—'}</td>
                                      <td className="px-2 py-1 text-gray-500">{new Date(d.delivered_at).toLocaleString()}</td>
                                      <td className="px-2 py-1">
                                        {d.file_paths?.length ? (
                                          <span className="text-blue-600">📄 x{d.file_paths.length}</span>
                                        ) : '—'}
                                      </td>
                                      <td className="px-2 py-1">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium ${rs.bg} ${rs.text}`}>
                                          {d.review_status === 'pending_review' && '⏳'}
                                          {d.review_status === 'approved' && '✅'}
                                          {d.review_status === 'revision_requested' && '↺'}
                                          {' '}{rs.label}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1 text-gray-500 max-w-[200px] truncate">
                                        {d.review_status === 'revision_requested' && d.review_feedback
                                          ? `"${d.review_feedback}"`
                                          : '—'
                                        }
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Staff Delivery Upload (internal_work steps) */}
                    {step.actor_type === 'internal_work' && ['in_progress', 'revision_requested'].includes(step.status) && (
                      <div className="border border-purple-200 rounded p-3 bg-purple-50">
                        {staffDeliveryStepId === step.id ? (
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs font-medium text-purple-800">Deliver Files</div>
                            <div
                              className="border-2 border-dashed border-purple-300 rounded p-4 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-100 transition-colors"
                              onClick={() => staffFileInputRef.current?.click()}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const files = Array.from(e.dataTransfer.files);
                                setStaffDeliveryFiles(prev => [...prev, ...files]);
                              }}
                            >
                              <Upload className="w-5 h-5 mx-auto text-purple-400 mb-1" />
                              <div className="text-xs text-purple-600">
                                Drop files here or click to browse
                              </div>
                              <input
                                ref={staffFileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files) {
                                    setStaffDeliveryFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                  }
                                }}
                              />
                            </div>
                            {staffDeliveryFiles.length > 0 && (
                              <div className="text-xs text-purple-700 space-y-0.5">
                                {staffDeliveryFiles.map((f, i) => (
                                  <div key={i} className="flex items-center justify-between">
                                    <span className="flex items-center gap-1">
                                      <FileText className="w-3 h-3" /> {f.name}
                                      <span className="text-purple-400">({(f.size / 1024).toFixed(1)} KB)</span>
                                    </span>
                                    <button
                                      className="text-red-400 hover:text-red-600"
                                      onClick={() => setStaffDeliveryFiles(prev => prev.filter((_, idx) => idx !== i))}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <textarea
                              className="w-full text-sm border border-purple-300 rounded p-2 bg-white"
                              rows={2}
                              placeholder="Notes (optional)..."
                              value={staffDeliveryNotes}
                              onChange={(e) => setStaffDeliveryNotes(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                className="text-xs px-3 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                                onClick={() => {
                                  setStaffDeliveryStepId(null);
                                  setStaffDeliveryFiles([]);
                                  setStaffDeliveryNotes('');
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                                disabled={staffDeliveryFiles.length === 0 || staffDeliveryLoading}
                                onClick={() => handleStaffDeliver(step.id)}
                              >
                                {staffDeliveryLoading ? (
                                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</span>
                                ) : `Submit Delivery (${staffDeliveryFiles.length} file${staffDeliveryFiles.length !== 1 ? 's' : ''})`}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStaffDeliveryStepId(step.id);
                              setStaffDeliveryFiles([]);
                              setStaffDeliveryNotes('');
                            }}
                          >
                            <Upload className="w-3 h-3" /> Deliver Files
                          </button>
                        )}
                      </div>
                    )}

                    {step.revision_count > 0 && (
                      <div className="text-xs text-gray-500">
                        Revisions: {step.revision_count}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 space-y-0.5">
                      {step.created_at && (
                        <div>Created: {new Date(step.created_at).toLocaleString()}</div>
                      )}
                      {step.offered_at && (
                        <div>Offered: {new Date(step.offered_at).toLocaleString()}</div>
                      )}
                      {step.accepted_at && (
                        <div>Accepted: {new Date(step.accepted_at).toLocaleString()}</div>
                      )}
                      {step.started_at && (
                        <div>Started: {new Date(step.started_at).toLocaleString()}</div>
                      )}
                      {step.delivered_at && (
                        <div>Delivered: {new Date(step.delivered_at).toLocaleString()}</div>
                      )}
                      {step.approved_at && (
                        <div>Approved: {new Date(step.approved_at).toLocaleString()}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      Mode: {step.assignment_mode}
                      {step.auto_assign_rule ? ` (${step.auto_assign_rule})` : ""}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Insert point between steps — shows on hover */}
            <div className="relative flex items-center justify-center h-2 group">
              <button
                className="absolute left-0.5 w-5 h-5 rounded-full bg-white border border-dashed border-gray-300 text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:border-blue-400 hover:text-blue-500 flex items-center justify-center z-10"
                title={`Add step after step ${step.step_number}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddStepAt(step.step_number);
                }}
              >
                +
              </button>
            </div>
            </div>
          );
        })}
      </div>

      {/* Approve Confirmation Modal */}
      {approveModalStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setApproveModalStep(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">Approve Delivery</h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-700">
                Approve delivery{approveModalStep.latest_delivery ? ` v${approveModalStep.latest_delivery.version}` : ''} from{' '}
                <strong>{approveModalStep.latest_delivery?.delivered_by_name || approveModalStep.vendor_name || 'staff'}</strong>?
              </p>
              {approveModalStep.latest_delivery?.file_paths && approveModalStep.latest_delivery.file_paths.length > 0 && (
                <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                  <div className="font-medium mb-1">Files:</div>
                  {approveModalStep.latest_delivery.file_paths.map((p, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {p.split('/').pop()}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                className="text-xs px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                onClick={() => setApproveModalStep(null)}
              >
                Cancel
              </button>
              <button
                className="text-xs px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                disabled={actionLoading === approveModalStep.id}
                onClick={async () => {
                  await handleStepAction(approveModalStep.id, "approve", {
                    staff_id: currentStaff?.id,
                  });
                  setApproveModalStep(null);
                }}
              >
                {actionLoading === approveModalStep.id ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Revision Modal */}
      {reviseModalStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReviseModalStep(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                Request Revision — {reviseModalStep.name}
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Feedback for {reviseModalStep.actor_type === 'external_vendor' ? 'vendor' : 'staff'} <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full text-sm border border-amber-300 rounded p-2"
                  rows={4}
                  placeholder="Describe what needs to be revised (min 10 characters)..."
                  value={reviseFeedback}
                  onChange={(e) => setReviseFeedback(e.target.value)}
                />
                {reviseFeedback.length > 0 && reviseFeedback.length < 10 && (
                  <div className="text-xs text-red-500 mt-1">
                    Minimum 10 characters required ({10 - reviseFeedback.length} more)
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                className="text-xs px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                onClick={() => setReviseModalStep(null)}
              >
                Cancel
              </button>
              <button
                className="text-xs px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
                disabled={reviseFeedback.trim().length < 10 || actionLoading === reviseModalStep.id}
                onClick={async () => {
                  await handleStepAction(reviseModalStep.id, "change_status", {
                    status: "revision_requested",
                    rejection_reason: reviseFeedback.trim(),
                    staff_id: currentStaff?.id,
                  });
                  setReviseModalStep(null);
                  setReviseFeedback('');
                }}
              >
                {actionLoading === reviseModalStep.id ? "Sending..." : "Send Revision Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actor Type Switcher Modal */}
      {switchingActorStepId && (() => {
        const switchStep = steps.find(s => s.id === switchingActorStepId);
        if (!switchStep || !switchStep.allowed_actor_types || switchStep.allowed_actor_types.length <= 1) return null;
        const ACTOR_TYPE_LABELS: Record<string, string> = {
          external_vendor: 'Vendor',
          internal_work: 'Internal (Work)',
          internal_review: 'Internal (Review)',
          customer: 'Customer',
          automated: 'Automated',
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSwitchingActorStepId(null)}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-800">Switch Actor Type — {switchStep.name}</h3>
              </div>
              <div className="p-4 space-y-2">
                <p className="text-sm text-gray-600 mb-3">Select the actor type for this step:</p>
                {switchStep.allowed_actor_types.map(at => (
                  <button
                    key={at}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${
                      at === switchStep.actor_type
                        ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                    disabled={at === switchStep.actor_type || actionLoading === switchStep.id}
                    onClick={async () => {
                      await handleStepAction(switchStep.id, 'update_config', { actor_type: at });
                      setSwitchingActorStepId(null);
                    }}
                  >
                    {ACTOR_TYPE_LABELS[at] || at}
                    {at === switchStep.actor_type && ' (current)'}
                  </button>
                ))}
              </div>
              <div className="flex justify-end p-4 border-t">
                <button
                  className="text-xs px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                  onClick={() => setSwitchingActorStepId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Unassign Vendor Modal ──

interface UnassignVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: any;
  onConfirm: () => void;
}

function UnassignVendorModal({ isOpen, onClose, step, onConfirm }: UnassignVendorModalProps) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [payableAction, setPayableAction] = useState('cancel');
  const [adjustedAmount, setAdjustedAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [retractOffers, setRetractOffers] = useState(true);
  const [preserveFiles, setPreserveFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { session: currentStaff } = useAdminAuthContext();

  const reasons = [
    { value: 'project_cancelled', label: 'Project cancelled', defaultPayable: 'cancel' },
    { value: 'client_cancelled', label: 'Client cancelled order', defaultPayable: 'cancel' },
    { value: 'vendor_unresponsive', label: 'Vendor unresponsive', defaultPayable: 'cancel' },
    { value: 'quality_issues', label: 'Quality issues', defaultPayable: 'adjust' },
    { value: 'deadline_missed', label: 'Deadline missed', defaultPayable: 'adjust' },
    { value: 'vendor_requested', label: 'Vendor requested removal', defaultPayable: 'cancel' },
    { value: 'reassigning', label: 'Reassigning to another vendor', defaultPayable: 'cancel' },
    { value: 'scope_change', label: 'Scope change', defaultPayable: 'adjust' },
    { value: 'other', label: 'Other', defaultPayable: 'cancel' },
  ];

  useEffect(() => {
    const selected = reasons.find(r => r.value === reason);
    if (selected) setPayableAction(selected.defaultPayable);
  }, [reason]);

  const payableAmount = step.payable ? parseFloat(step.payable.total) || 0 : 0;
  const hasPayable = !!step.payable && step.payable.status !== 'cancelled';
  const hasDeliveredFiles = step.delivered_file_paths?.length > 0;

  const handleSubmit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    if (reason === 'other' && !notes.trim()) { toast.error('Please provide details for "Other" reason'); return; }
    if (payableAction === 'adjust' && (!adjustedAmount || parseFloat(adjustedAmount) < 0)) {
      toast.error('Please enter a valid adjustment amount'); return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-workflow-step', {
        body: {
          step_id: step.id,
          action: 'unassign_vendor',
          staff_id: currentStaff?.id,
          reason,
          notes: notes || undefined,
          payable_action: hasPayable ? payableAction : 'cancel',
          adjusted_amount: payableAction === 'adjust' ? parseFloat(adjustedAmount) : undefined,
          adjustment_reason: payableAction === 'adjust' ? (adjustmentReason || `Adjusted: ${reason}`) : undefined,
          retract_offers: retractOffers,
          preserve_files: preserveFiles,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to unassign vendor');
        return;
      }

      toast.success(`${step.vendor_name || 'Vendor'} unassigned from ${step.name}`);
      onConfirm();
      onClose();
    } catch (err) {
      toast.error('Failed to unassign vendor');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">
            Unassign Vendor — Step {step.step_number}: {step.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Current vendor info */}
          <div className="bg-gray-50 rounded p-3 text-sm">
            <div className="font-medium text-gray-700">Current vendor: {step.vendor_name}</div>
            <div className="text-gray-500 mt-1">
              Status: {step.status}
              {hasPayable && ` · Payable: $${payableAmount.toFixed(2)} (${step.payable.status})`}
              {hasDeliveredFiles && ` · ${step.delivered_file_paths.length} file(s) delivered`}
            </div>
          </div>

          {/* Reason dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select a reason...</option>
              {reasons.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional notes {reason === 'other' ? '*' : '(optional)'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide additional context..."
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Payable action (only if payable exists) */}
          {hasPayable && (
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payable Action — ${payableAmount.toFixed(2)} {step.payable.currency}
              </label>

              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="payableAction" value="cancel"
                    checked={payableAction === 'cancel'}
                    onChange={() => setPayableAction('cancel')}
                    className="mt-1" />
                  <div>
                    <div className="text-sm font-medium">Cancel payable ($0 owed)</div>
                    <div className="text-xs text-gray-500">No payment to vendor. Use when no useful work was done.</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="payableAction" value="adjust"
                    checked={payableAction === 'adjust'}
                    onChange={() => setPayableAction('adjust')}
                    className="mt-1" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Adjust payable amount</div>
                    <div className="text-xs text-gray-500">Pay a portion for partial work completed.</div>
                    {payableAction === 'adjust' && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Amount:</span>
                          <input
                            type="number" step="0.01" min="0"
                            max={payableAmount}
                            value={adjustedAmount}
                            onChange={(e) => setAdjustedAmount(e.target.value)}
                            placeholder={`Max: ${payableAmount.toFixed(2)}`}
                            className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-400">
                            was ${payableAmount.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={adjustmentReason}
                          onChange={(e) => setAdjustmentReason(e.target.value)}
                          placeholder="Reason for adjustment..."
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="payableAction" value="keep"
                    checked={payableAction === 'keep'}
                    onChange={() => setPayableAction('keep')}
                    className="mt-1" />
                  <div>
                    <div className="text-sm font-medium">Keep full payable (${payableAmount.toFixed(2)})</div>
                    <div className="text-xs text-gray-500">Pay full agreed amount despite unassignment.</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Options */}
          <div className="border-t pt-4 space-y-2">
            {step.status === 'offered' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={retractOffers}
                  onChange={(e) => setRetractOffers(e.target.checked)}
                  className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">Retract all active offers for this step</span>
              </label>
            )}

            {hasDeliveredFiles && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={preserveFiles}
                  onChange={(e) => setPreserveFiles(e.target.checked)}
                  className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">
                  Preserve delivered files as source for next vendor
                  <span className="text-gray-400 ml-1">({step.delivered_file_paths.length} files)</span>
                </span>
              </label>
            )}
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
            ⚠️ This will remove {step.vendor_name} from this step and reset it to "Pending".
             You'll need to find and assign a new vendor.
            {step.status === 'in_progress' && ' The vendor may have work in progress.'}
            {step.status === 'delivered' && ' The vendor has already delivered files.'}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Unassigning...' : 'Unassign Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Exported Section Component ──

export default function OrderWorkflowSection({ orderId, onWorkflowLoaded, refreshKey }: { orderId: string; onWorkflowLoaded?: (data: any) => void; refreshKey?: number }) {
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [finderStep, setFinderStep] = useState<WorkflowStep | null>(null);
  const [assignMode, setAssignMode] = useState<'assign' | 'offer' | 'offer_multiple'>('offer');
  const [assignVendor, setAssignVendor] = useState<any | null>(null);
  const [assignVendors, setAssignVendors] = useState<any[] | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [revisionStepId, setRevisionStepId] = useState<string | null>(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [orderFinancials, setOrderFinancials] = useState<OrderFinancials | null>(null);
  const [totalVendorCost, setTotalVendorCost] = useState(0);
  const [minMarginPercent, setMinMarginPercent] = useState(30);
  const [vendorFinancials, setVendorFinancials] = useState<VendorFinancials | null>(null);
  const [marginData, setMarginData] = useState<MarginData | null>(null);
  const [showAddStepModal, setShowAddStepModal] = useState(false);
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [addStepAfter, setAddStepAfter] = useState<number>(0);
  const [rejectingOfferId, setRejectingOfferId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [counterLoadingId, setCounterLoadingId] = useState<string | null>(null);
  const [unassignStep, setUnassignStep] = useState<any | null>(null);
  const { session: currentStaff } = useAdminAuthContext();

  const fetchWorkflow = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("get-order-workflow", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      const wfData = result as WorkflowData & {
        order_financials?: OrderFinancials;
        total_vendor_cost?: number;
        vendor_financials?: VendorFinancials;
        margin?: MarginData;
      };
      setData(wfData);
      if (wfData.order_financials) {
        setOrderFinancials(wfData.order_financials);
      }
      setTotalVendorCost(wfData.total_vendor_cost || 0);
      setVendorFinancials(wfData.vendor_financials || null);
      setMarginData(wfData.margin || null);
      onWorkflowLoaded?.(wfData);
    } catch (err: unknown) {
      console.error("Failed to load workflow:", err);
      setData({ success: true, has_workflow: false, workflow: null, steps: [], available_templates: [] });
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      fetchWorkflow();
    }
  }, [refreshKey]);

  useEffect(() => {
    const fetchMarginSetting = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "min_vendor_margin_percent")
        .single();
      if (data) setMinMarginPercent(parseFloat(data.setting_value || "30"));
    };
    fetchMarginSetting();
  }, []);

  const handleStepAction = async (stepId: string, action: string, params?: any) => {
    setActionLoading(stepId);
    try {
      const { data: result, error } = await supabase.functions.invoke("update-workflow-step", {
        body: { step_id: stepId, action, ...params },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast.success("Step updated");
      await fetchWorkflow();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update step";
      toast.error(message);
    }
    setActionLoading(null);
  };

  const handleRetractSingleOffer = async (stepId: string, offerId: string, vendorName: string) => {
    if (!confirm(`Retract offer to ${vendorName}? This will also cancel their payable if one exists.`)) return;

    try {
      const { data: result, error } = await supabase.functions.invoke('update-workflow-step', {
        body: {
          step_id: stepId,
          action: 'retract_offer',
          staff_id: currentStaff?.staffId,
          offer_id: offerId,
        },
      });

      if (error || !result?.success) {
        toast.error(result?.error || 'Failed to retract offer');
        return;
      }

      const remaining = result.remaining_offers || 0;
      if (remaining > 0) {
        toast.success(`Offer to ${vendorName} retracted. ${remaining} offer(s) still active.`);
      } else {
        toast.success(`Offer to ${vendorName} retracted. Step reset to Pending.`);
      }

      await fetchWorkflow();
    } catch (err) {
      toast.error('Failed to retract offer');
    }
  };

  const handleManageSteps = async (action: string, params: any) => {
    if (!data?.workflow?.id) return;
    try {
      const { data: result, error } = await supabase.functions.invoke("manage-order-workflow-steps", {
        body: { workflow_id: data.workflow.id, action, ...params },
      });
      if (error || !result?.success) {
        alert(result?.error || error?.message || "Action failed");
        return;
      }
      await fetchWorkflow();
    } catch (err: any) {
      alert(err.message || "Action failed");
    }
  };

  const handleRespondCounter = async (offerId: string, action: 'accept' | 'reject') => {
    setCounterLoadingId(offerId);
    try {
      const { data: result, error } = await supabase.functions.invoke('admin-respond-counter-offer', {
        body: {
          offer_id: offerId,
          action,
          staff_id: currentStaff?.staffId,
          rejection_reason: action === 'reject' ? rejectReason : undefined,
        },
      });

      if (error || !result?.success) {
        toast.error(result?.error || 'Failed to respond to counter-offer');
        return;
      }

      if (action === 'accept') {
        toast.success(
          `Counter-proposal accepted. ${result.vendor_name || 'Vendor'} assigned to ${result.step_name || 'step'}.`
        );
      } else {
        toast.success('Counter-proposal rejected.');
      }

      setRejectingOfferId(null);
      setRejectReason('');
      await fetchWorkflow();
    } catch (err) {
      toast.error('Failed to respond to counter-offer');
    } finally {
      setCounterLoadingId(null);
    }
  };

  const handleExtendDeadline = async (stepId: string, newDeadline: string, reason: string) => {
    const { data: result, error } = await supabase.functions.invoke('update-workflow-step', {
      body: {
        step_id: stepId,
        action: 'extend_deadline',
        staff_id: currentStaff?.staffId,
        new_deadline: newDeadline,
        reason: reason || undefined,
      },
    });
    if (error) { toast.error(error.message || 'Failed to update deadline'); throw error; }
    if (result?.error) { toast.error(result.error); throw new Error(result.error); }
    toast.success('Deadline updated');
    await fetchWorkflow();
  };

  const handleAdjustPayable = async (step: WorkflowStep, newRate: number | undefined, newSubtotal: number | undefined, reason: string) => {
    if (!step.payable) return;
    const previousTotal = step.payable.subtotal;
    const { data: result, error } = await supabase.functions.invoke('manage-vendor-payables', {
      body: {
        action: 'adjust_payable',
        payable_id: step.payable.id,
        new_rate: newRate,
        new_subtotal: newSubtotal,
        adjustment_reason: reason,
        staff_id: currentStaff?.staffId,
      },
    });
    if (error) { toast.error(error.message || 'Failed to adjust payable'); throw error; }
    if (result?.error) { toast.error(result.error); throw new Error(result.error); }
    const newTotal = result?.current?.subtotal ?? newSubtotal ?? newRate;
    toast.success(`Payable adjusted — $${previousTotal.toFixed(2)} → $${(newTotal as number)?.toFixed?.(2) ?? newTotal}`);
    await fetchWorkflow();
  };

  const handleAssignSubmit = async (params: any) => {
    if (!finderStep) return;
    await handleStepAction(finderStep.id, params.action, params);
    setShowAssignModal(false);
    setFinderStep(null);
    setAssignVendor(null);
    setAssignVendors(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-gray-400" />
          Workflow
        </h2>
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-gray-400" />
        Workflow
      </h2>

      {data?.has_workflow && data.workflow ? (
        <>
          <WorkflowPipeline
            workflow={data.workflow}
            steps={data.steps}
            onStepClick={() => {}}
            expandedStepId={expandedStepId}
            onToggleExpand={(id) => setExpandedStepId(expandedStepId === id ? null : id)}
            orderFinancials={orderFinancials}
            totalVendorCost={totalVendorCost}
            onFindVendor={(step) => setFinderStep(step)}
            handleStepAction={handleStepAction}
            actionLoading={actionLoading}
            revisionStepId={revisionStepId}
            revisionReason={revisionReason}
            onSetRevisionStepId={setRevisionStepId}
            onSetRevisionReason={setRevisionReason}
            handleManageSteps={handleManageSteps}
            onAddStepAt={(pos) => {
              setAddStepAfter(pos);
              setShowAddStepModal(true);
            }}
            handleRetractSingleOffer={handleRetractSingleOffer}
            handleRespondCounter={handleRespondCounter}
            rejectingOfferId={rejectingOfferId}
            rejectReason={rejectReason}
            onSetRejectingOfferId={setRejectingOfferId}
            onSetRejectReason={setRejectReason}
            counterLoadingId={counterLoadingId}
            onUnassignVendor={(step) => setUnassignStep(step)}
            onExtendDeadline={handleExtendDeadline}
            onAdjustPayable={handleAdjustPayable}
            onRefresh={fetchWorkflow}
          />
          {data.steps.some(s => s.has_pending_counter) && (
            <div className="text-xs text-orange-600 mt-1">
              ⚠ Pending counter-proposals may affect final margin
            </div>
          )}
          <OrderFinancialSummary
            orderFinancials={orderFinancials ? {
              subtotal: orderFinancials.subtotal,
              pre_tax: orderFinancials.pre_tax,
              tax: orderFinancials.tax ?? 0,
              total: orderFinancials.total,
            } : null}
            vendorFinancials={vendorFinancials}
            margin={marginData}
            steps={(data.steps || []).map((s) => ({
              step_number: s.step_number,
              name: s.name,
              actor_type: s.actor_type,
              vendor_name: s.vendor_name,
              service_name: s.service_name,
              vendor_total: s.vendor_total,
              payable: s.payable || null,
            }))}
            minMarginPercent={minMarginPercent}
            onRefresh={fetchWorkflow}
          />
        </>
      ) : (
        <TemplateSelector
          templates={data?.available_templates ?? []}
          orderId={orderId}
          onAssigned={fetchWorkflow}
        />
      )}

      {/* Vendor Finder Modal */}
      {finderStep && (
        <VendorFinderModal
          isOpen={!!finderStep}
          onClose={() => setFinderStep(null)}
          onSelectVendor={(vendor, mode) => {
            setAssignVendor(vendor);
            setAssignMode(mode);
            setShowAssignModal(true);
          }}
          onSelectMultiple={(vendors) => {
            setAssignVendors(vendors);
            setAssignMode('offer_multiple');
            setShowAssignModal(true);
          }}
          stepName={finderStep.name}
          stepNumber={finderStep.step_number}
          sourceLanguage={finderStep.source_language}
          targetLanguage={finderStep.target_language}
          serviceId={finderStep.service_id}
          serviceName={finderStep.service_name}
        />
      )}

      {/* Vendor Assign/Offer Modal (stacks on top of finder) */}
      {showAssignModal && finderStep && (
        <VendorAssignModal
          isOpen={showAssignModal}
          onClose={() => {
            setShowAssignModal(false);
            setAssignVendor(null);
            setAssignVendors(null);
          }}
          onSubmit={handleAssignSubmit}
          mode={assignMode}
          vendor={assignVendor}
          vendors={assignVendors}
          stepId={finderStep.id}
          stepName={finderStep.name}
          stepNumber={finderStep.step_number}
          serviceName={finderStep.service_name}
          orderFinancials={orderFinancials}
          totalVendorCost={totalVendorCost}
          minMarginPercent={minMarginPercent}
        />
      )}

      {unassignStep && (
        <UnassignVendorModal
          isOpen={!!unassignStep}
          onClose={() => setUnassignStep(null)}
          step={unassignStep}
          onConfirm={() => { setUnassignStep(null); fetchWorkflow(); }}
        />
      )}

      <AddStepModal
        isOpen={showAddStepModal}
        onClose={() => setShowAddStepModal(false)}
        onAdd={(params) => handleManageSteps("add_step", params)}
        steps={data?.steps || []}
        availableServices={availableServices}
        servicesLoaded={servicesLoaded}
        defaultInsertAfter={addStepAfter}
        onLoadServices={async () => {
          const { data: result } = await supabase.functions.invoke("manage-order-workflow-steps", {
            body: { workflow_id: data?.workflow?.id, action: "list_available_services" },
          });
          if (result?.services) {
            setAvailableServices(result.services);
            setServicesLoaded(true);
          }
        }}
      />
    </div>
  );
}
