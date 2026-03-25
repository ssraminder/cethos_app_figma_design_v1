import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

// ── Types ──

interface WorkflowStep {
  id: string;
  step_number: number;
  name: string;
  actor_type: 'vendor' | 'internal' | 'customer' | 'automated';
  status: string;
  assignment_mode: string;
  auto_assign_rule: string | null;
  auto_advance: boolean;
  is_optional: boolean;
  requires_file_upload: boolean;
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
  offers: Array<{
    id: string;
    vendor_id: string;
    vendor_name: string;
    status: string;
    vendor_rate: number | null;
    expires_at: string | null;
    offered_at: string | null;
    declined_reason: string | null;
    responded_at: string | null;
  }> | null;
  created_at: string;
  updated_at: string;
}

interface OrderFinancials {
  service_id: string | null;
  subtotal: number;
  pre_tax: number;
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
    case "vendor":
      return <User className={className} />;
    case "internal":
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
    vendor: { label: "Vendor", bg: "bg-blue-100", text: "text-blue-700" },
    internal: { label: "Internal", bg: "bg-purple-100", text: "text-purple-700" },
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

  // Filter state
  const [filterSourceLang, setFilterSourceLang] = useState(sourceLanguage || "");
  const [filterTargetLang, setFilterTargetLang] = useState(targetLanguage || "");
  const [filterServiceId, setFilterServiceId] = useState(serviceId || "");
  const [nativeLanguages, setNativeLanguages] = useState("");
  const [country, setCountry] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [maxRate, setMaxRate] = useState("");
  const [availability, setAvailability] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("match_score");

  const doSearch = useCallback(async () => {
    setSearching(true);
    try {
      const nativeLangs = nativeLanguages.trim()
        ? nativeLanguages.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
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
    setNativeLanguages("");
    setCountry("");
    setMinRating(0);
    setMaxRate("");
    setAvailability("");
    setSearchText("");
    setSortBy("match_score");
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
                    <input
                      type="text"
                      value={filterSourceLang}
                      onChange={(e) => setFilterSourceLang(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="e.g. FR"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Target Lang</label>
                    <input
                      type="text"
                      value={filterTargetLang}
                      onChange={(e) => setFilterTargetLang(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="e.g. EN"
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
                    <input
                      type="text"
                      value={nativeLanguages}
                      onChange={(e) => setNativeLanguages(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="en, fr"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Country</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="Country"
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
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      placeholder="Name or email..."
                    />
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
  const [vendorTotal, setVendorTotal] = useState<string>("");
  const [vendorCurrency, setVendorCurrency] = useState("CAD");
  const [deadline, setDeadline] = useState("");
  const [instructions, setInstructions] = useState("");
  const [expiresInHours, setExpiresInHours] = useState<string>("24");
  const [suggestedRate, setSuggestedRate] = useState<{ rate: number; calculation_unit: string; currency: string } | null>(null);
  const [lookingUpRate, setLookingUpRate] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setVendorRate("");
      setVendorRateUnit("per_word");
      setVendorTotal("");
      setVendorCurrency("CAD");
      setDeadline("");
      setInstructions("");
      setExpiresInHours("24");
      setSuggestedRate(null);
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

  const margin =
    orderFinancials && orderFinancials.subtotal > 0 && vendorTotal
      ? ((orderFinancials.subtotal - parseFloat(vendorTotal)) / orderFinancials.subtotal) * 100
      : null;

  const marginColor =
    margin === null ? "gray" : margin >= 50 ? "green" : margin >= minMarginPercent ? "yellow" : "red";

  const canSubmit = vendorRate !== "" && vendorRateUnit && vendorTotal !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    const baseParams = {
      vendor_rate: parseFloat(vendorRate),
      vendor_rate_unit: vendorRateUnit,
      vendor_total: parseFloat(vendorTotal),
      vendor_currency: vendorCurrency,
      deadline: deadline || null,
      instructions: instructions || null,
      expires_in_hours: mode !== "assign" && expiresInHours !== "0" ? parseInt(expiresInHours) : null,
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
          <div>
            <div className="grid grid-cols-2 gap-3">
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
                {suggestedRate && (
                  <p className="text-xs text-gray-400 mt-1">
                    Vendor&apos;s rate: ${suggestedRate.rate}/{suggestedRate.calculation_unit} {suggestedRate.currency}
                  </p>
                )}
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Total *</label>
                <input
                  type="number"
                  step="0.01"
                  value={vendorTotal}
                  onChange={(e) => setVendorTotal(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
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
          </div>

          {/* Margin indicator */}
          {vendorTotal && orderFinancials && orderFinancials.subtotal > 0 ? (
            <div className="border rounded p-3 text-sm">
              <div className="text-gray-600">Customer subtotal: ${orderFinancials.subtotal.toFixed(2)}</div>
              <div className="text-gray-600">This step cost: ${vendorTotal}</div>
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
          ) : vendorTotal ? (
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
  const [actorType, setActorType] = useState("vendor");
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
      setActorType("vendor");
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
              <option value="vendor">Vendor (freelancer)</option>
              <option value="internal">Internal (staff)</option>
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

  useEffect(() => {
    const fetchStaff = async () => {
      const { data } = await supabase
        .from("staff_users")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      setStaff(data || []);
      setLoading(false);
    };
    fetchStaff();
  }, []);

  return (
    <select
      className="text-sm border border-gray-300 rounded px-2 py-1"
      defaultValue=""
      onChange={(e) => e.target.value && onSelect(e.target.value)}
      disabled={loading}
    >
      <option value="" disabled>
        {loading ? "Loading..." : "Select staff member..."}
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
}: WorkflowPipelineProps) {
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
                    {step.offers.filter((o) => o.status === "sent").length > 0 && (
                      <div className="text-xs text-blue-600">
                        {step.offers.filter((o) => o.status === "sent").length} offer(s) pending
                        {step.offers
                          .filter((o) => o.status === "sent")
                          .map((o) => (
                            <span
                              key={o.id}
                              className="ml-2 inline-flex items-center bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs"
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
                            </span>
                          ))}
                      </div>
                    )}
                    {step.offers.filter((o) => o.status === "declined").length > 0 && (
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
                  </div>
                )}

                {/* Accepted vendor */}
                {step.offers?.find((o) => o.status === "accepted") && (
                  <div className="text-xs text-green-600 mt-0.5">
                    Accepted by {step.offers!.find((o) => o.status === "accepted")?.vendor_name}
                  </div>
                )}

                {/* Line 3: Rate info (vendor steps with rate) */}
                {step.actor_type === "vendor" && step.vendor_rate && (
                  <div className="text-sm text-gray-500 mt-1">
                    ${step.vendor_rate}/{step.vendor_rate_unit} · {step.vendor_currency} $
                    {step.vendor_total?.toFixed(2)}
                  </div>
                )}

                {/* Line 4: Language pair */}
                {step.source_language && step.target_language && (
                  <div className="text-sm text-gray-500 mt-1">
                    {step.source_language} → {step.target_language}
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

                {/* Line 6: Offer count */}
                {step.offer_count > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Offers: {step.offer_count} attempt(s)
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* Find Vendor: pending + vendor + no vendor_id */}
                  {step.status === "pending" && step.actor_type === "vendor" && !step.vendor_id && (
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

                  {/* Assign Staff: pending + internal + no assigned_staff_id */}
                  {step.status === "pending" && step.actor_type === "internal" && !step.assigned_staff_id && (
                    <StaffPickerDropdown
                      onSelect={(staffId) =>
                        handleStepAction(step.id, "direct_assign", { vendor_id: staffId })
                      }
                    />
                  )}

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
                      <button
                        className="text-xs px-3 py-1 border border-red-400 text-red-600 rounded hover:bg-red-50"
                        disabled={actionLoading === step.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const count = step.active_offer_count || 1;
                          if (confirm(`Retract ${count} active offer(s)? All pending offers will be cancelled.`)) {
                            handleStepAction(step.id, "retract_offers", {});
                          }
                        }}
                      >
                        {actionLoading === step.id ? "..." : "Retract Offers"}
                      </button>
                    </>
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
                  {step.status === "delivered" && (
                    <>
                      <button
                        className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        disabled={actionLoading === step.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Approve this deliverable?")) {
                            handleStepAction(step.id, "change_status", { status: "approved" });
                          }
                        }}
                      >
                        {actionLoading === step.id ? "..." : "Approve"}
                      </button>
                      <button
                        className="text-xs px-3 py-1 border border-amber-400 text-amber-600 rounded hover:bg-amber-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetRevisionStepId(step.id);
                        }}
                      >
                        Request Revision
                      </button>
                    </>
                  )}

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
                            <div key={i}>{p.split("/").pop()}</div>
                          ))}
                        </div>
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
    </div>
  );
}

// ── Main Exported Section Component ──

export default function OrderWorkflowSection({ orderId }: { orderId: string }) {
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
  const [showAddStepModal, setShowAddStepModal] = useState(false);
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [addStepAfter, setAddStepAfter] = useState<number>(0);

  const fetchWorkflow = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("get-order-workflow", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      const wfData = result as WorkflowData & { order_financials?: OrderFinancials; total_vendor_cost?: number };
      setData(wfData);
      if (wfData.order_financials) {
        setOrderFinancials(wfData.order_financials);
      }
      setTotalVendorCost(wfData.total_vendor_cost || 0);
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
        />
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
