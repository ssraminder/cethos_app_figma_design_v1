import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Loader2,
  X,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Building,
  Cog,
  Users,
  ChevronRight,
  Search,
  Star,
  SkipForward,
  Play,
  RotateCcw,
  ArrowRight,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

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

interface VendorSearchResult {
  id: string;
  full_name: string;
  email: string;
  rating: number | null;
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

// ── VendorPickerModal ──

interface VendorPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (params: {
    vendor_id: string;
    vendor_rate: number;
    vendor_rate_unit: string;
    vendor_total: number;
    vendor_currency: string;
    deadline: string | null;
    instructions: string | null;
  }) => void;
  stepId: string;
  stepName: string;
  stepNumber: number;
  serviceName: string | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  orderFinancials: OrderFinancials | null;
  offerCount: number;
}

function VendorPickerModal({
  isOpen,
  onClose,
  onAssign,
  stepId,
  stepName,
  stepNumber,
  serviceName,
  sourceLanguage,
  targetLanguage,
  orderFinancials,
  offerCount,
}: VendorPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<{ id: string; name: string } | null>(null);
  const [suggestedRate, setSuggestedRate] = useState<{ rate: number; calculation_unit: string; currency: string } | null>(null);
  const [lookingUpRate, setLookingUpRate] = useState(false);
  const [vendorRate, setVendorRate] = useState<string>("");
  const [vendorRateUnit, setVendorRateUnit] = useState("per_word");
  const [vendorTotal, setVendorTotal] = useState<string>("");
  const [vendorCurrency, setVendorCurrency] = useState("CAD");
  const [deadline, setDeadline] = useState("");
  const [instructions, setInstructions] = useState("");

  const resetState = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    setSelectedVendor(null);
    setSuggestedRate(null);
    setLookingUpRate(false);
    setVendorRate("");
    setVendorRateUnit("per_word");
    setVendorTotal("");
    setVendorCurrency("CAD");
    setDeadline("");
    setInstructions("");
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  // Debounced vendor search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("vendors")
        .select("id, full_name, email, rating")
        .eq("status", "active")
        .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);
      setSearchResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const lookupRate = async (vendorId: string) => {
    setLookingUpRate(true);
    setSuggestedRate(null);
    try {
      const { data } = await supabase.functions.invoke("update-workflow-step", {
        body: { step_id: stepId, action: "lookup_vendor_rate", vendor_id: vendorId },
      });
      if (data?.suggested_rate) {
        setSuggestedRate(data.suggested_rate);
        setVendorRate(String(data.suggested_rate.rate));
        setVendorRateUnit(data.suggested_rate.calculation_unit);
        setVendorCurrency(data.suggested_rate.currency);
      }
    } catch (err) {
      console.error("Rate lookup failed:", err);
    } finally {
      setLookingUpRate(false);
    }
  };

  const handleSelectVendor = (vendor: { id: string; full_name: string }) => {
    setSelectedVendor({ id: vendor.id, name: vendor.full_name });
    setSearchResults([]);
    setSearchQuery("");
    lookupRate(vendor.id);
  };

  const handleDeselectVendor = () => {
    setSelectedVendor(null);
    setSuggestedRate(null);
    setVendorRate("");
    setVendorRateUnit("per_word");
    setVendorTotal("");
    setVendorCurrency("CAD");
  };

  const canSubmit = selectedVendor && vendorRate !== "" && vendorRateUnit && vendorTotal !== "";

  const handleSubmit = () => {
    if (!canSubmit || !selectedVendor) return;
    onAssign({
      vendor_id: selectedVendor.id,
      vendor_rate: parseFloat(vendorRate),
      vendor_rate_unit: vendorRateUnit,
      vendor_total: parseFloat(vendorTotal),
      vendor_currency: vendorCurrency,
      deadline: deadline || null,
      instructions: instructions || null,
    });
  };

  const margin =
    orderFinancials && orderFinancials.subtotal > 0 && vendorTotal
      ? ((orderFinancials.subtotal - parseFloat(vendorTotal)) / orderFinancials.subtotal) * 100
      : null;

  const marginColor =
    margin === null ? "gray" : margin >= 50 ? "green" : margin >= 30 ? "yellow" : "red";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">
            Assign Vendor — Step {stepNumber}: {stepName}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Info bar */}
          <div className="bg-gray-50 rounded px-3 py-2 text-sm text-gray-600">
            <div>Service: {serviceName || "N/A"} · LP: {sourceLanguage && targetLanguage ? `${sourceLanguage} → ${targetLanguage}` : "Not set"}</div>
            <div>Offer attempt #{offerCount + 1}</div>
          </div>

          {/* Vendor search section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            {selectedVendor ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                  {selectedVendor.name}
                  <button onClick={handleDeselectVendor} className="ml-1 hover:text-indigo-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
                {lookingUpRate && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Looking up rate...
                  </span>
                )}
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto mt-1">
                  {searching ? (
                    <div className="text-center py-4 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                      <p className="text-xs">Searching...</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <p className="text-center py-4 text-sm text-gray-400">
                      {searchQuery.length < 2 ? "Type to search vendors" : "No vendors found"}
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                      {searchResults.map((v: any) => (
                        <button
                          key={v.id}
                          onClick={() => handleSelectVendor(v)}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{v.full_name}</p>
                              <p className="text-xs text-gray-500">{v.email}</p>
                            </div>
                            {v.rating != null && (
                              <div className="flex items-center gap-0.5 text-xs text-gray-500">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                {v.rating}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Rate section */}
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate</label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate Unit</label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
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
              {margin !== null && margin < 30 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2 rounded text-sm mt-2">
                  ⚠️ Margin below minimum threshold (30%). Proceed with caution.
                </div>
              )}
            </div>
          ) : vendorTotal ? (
            <p className="text-xs text-gray-400">Margin unavailable — order has no pricing data.</p>
          ) : null}

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
              canSubmit
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-indigo-600 opacity-50 cursor-not-allowed"
            }`}
          >
            Assign & Offer
          </button>
        </div>
      </div>
    </div>
  );
}

// Thin compatibility wrapper for existing parent calls (will be removed in Part 5)
function VendorPickerModalCompat({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (vendorId: string, vendorName: string) => void;
}) {
  return (
    <VendorPickerModal
      isOpen={isOpen}
      onClose={onClose}
      onAssign={(params) => onSelect(params.vendor_id, "")}
      stepId=""
      stepName=""
      stepNumber={0}
      serviceName={null}
      sourceLanguage={null}
      targetLanguage={null}
      orderFinancials={null}
      offerCount={0}
    />
  );
}

// ── StepDetailPanel (modal) ──

function StepDetailPanel({
  step,
  onClose,
  onAction,
  actionLoading,
}: {
  step: WorkflowStep;
  onClose: () => void;
  onAction: (stepId: string, action: string, params?: Record<string, unknown>) => Promise<void>;
  actionLoading: boolean;
}) {
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState(step.assignment_mode);
  const [autoAdvance, setAutoAdvance] = useState(step.auto_advance);
  const [deadline, setDeadline] = useState(step.deadline?.slice(0, 10) ?? "");
  const [vendorRate, setVendorRate] = useState(step.vendor_rate?.toString() ?? "");
  const [vendorRateUnit, setVendorRateUnit] = useState(step.vendor_rate_unit ?? "per_page");

  const style = STEP_STATUS_STYLES[step.status] ?? STEP_STATUS_STYLES.pending;

  const handleAssignVendor = async (vendorId: string, _vendorName: string) => {
    setShowVendorPicker(false);
    const params: Record<string, unknown> = { vendor_id: vendorId };
    if (vendorRate) params.vendor_rate = parseFloat(vendorRate);
    if (vendorRateUnit) params.vendor_rate_unit = vendorRateUnit;
    if (deadline) params.deadline = deadline;
    await onAction(step.id, "assign_vendor", params);
  };

  const handleUpdateConfig = async () => {
    await onAction(step.id, "update_config", {
      assignment_mode: assignmentMode,
      auto_advance: autoAdvance,
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Step {step.step_number}: {step.name}
              </h2>
              <div className="mt-1">
                <StepStatusBadge status={step.status} />
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-5">
            {/* Info section */}
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Actor</span>
                  <div className="flex items-center gap-1.5 mt-0.5 text-gray-800 capitalize">
                    <ActorIcon type={step.actor_type} className="w-3.5 h-3.5 text-gray-400" />
                    {step.actor_type}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Service</span>
                  <p className="mt-0.5 text-gray-800">{step.service_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Assignment Mode</span>
                  <select
                    value={assignmentMode}
                    onChange={(e) => setAssignmentMode(e.target.value as "manual" | "auto" | "auto_offer")}
                    className="mt-0.5 w-full px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="manual">Manual</option>
                    <option value="auto">Auto</option>
                    <option value="auto_offer">Auto Offer</option>
                  </select>
                </div>
                <div>
                  <span className="text-gray-500">Auto-Advance</span>
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoAdvance}
                        onChange={(e) => setAutoAdvance(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">{autoAdvance ? "Yes" : "No"}</span>
                    </label>
                  </div>
                </div>
              </div>
              {(assignmentMode !== step.assignment_mode || autoAdvance !== step.auto_advance) && (
                <button
                  onClick={handleUpdateConfig}
                  disabled={actionLoading}
                  className="mt-2 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
                >
                  Save Config
                </button>
              )}
            </div>

            {/* Vendor section (for vendor steps) */}
            {step.actor_type === "vendor" && (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Vendor</h3>
                {step.vendor_id ? (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{step.vendor_name}</span>
                    </div>
                    {step.vendor_rate != null && (
                      <p className="text-gray-600">
                        Rate: ${step.vendor_rate.toFixed(2)}/{step.vendor_rate_unit?.replace("per_", "") ?? "unit"}
                      </p>
                    )}
                    {step.offered_at && (
                      <p className="text-xs text-gray-500">Offered: {format(new Date(step.offered_at), "MMM d, h:mm a")}</p>
                    )}
                    {step.accepted_at && (
                      <p className="text-xs text-gray-500">Accepted: {format(new Date(step.accepted_at), "MMM d, h:mm a")}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Rate</label>
                        <input
                          type="number"
                          step="0.01"
                          value={vendorRate}
                          onChange={(e) => setVendorRate(e.target.value)}
                          placeholder="25.00"
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Unit</label>
                        <select
                          value={vendorRateUnit}
                          onChange={(e) => setVendorRateUnit(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="per_page">Per Page</option>
                          <option value="per_word">Per Word</option>
                          <option value="per_hour">Per Hour</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Deadline</label>
                      <input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      onClick={() => setShowVendorPicker(true)}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      <User className="w-3.5 h-3.5" />
                      Assign Vendor
                    </button>
                  </div>
                )}
                {step.deadline && (
                  <p className="text-xs text-gray-500">
                    Deadline: {format(new Date(step.deadline), "MMM d, yyyy")}
                  </p>
                )}
              </div>
            )}

            {/* Timestamps */}
            {(step.delivered_at || step.approved_at) && (
              <div className="space-y-1 text-xs text-gray-500">
                {step.delivered_at && <p>Delivered: {format(new Date(step.delivered_at), "MMM d, h:mm a")}</p>}
                {step.approved_at && <p>Approved: {format(new Date(step.approved_at), "MMM d, h:mm a")}</p>}
              </div>
            )}

            {/* Actions based on status */}
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {/* pending + vendor → assign vendor already shown above */}
                {step.status === "pending" && step.actor_type !== "vendor" && (
                  <button
                    onClick={() => onAction(step.id, "change_status", { status: "in_progress" })}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start
                  </button>
                )}
                {step.status === "offered" && (
                  <button
                    onClick={() => onAction(step.id, "change_status", { status: "pending" })}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retract Offer
                  </button>
                )}
                {step.status === "delivered" && (
                  <>
                    <button
                      onClick={() => onAction(step.id, "change_status", { status: "approved" })}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    {showRevisionInput ? (
                      <div className="w-full space-y-2">
                        <textarea
                          value={revisionReason}
                          onChange={(e) => setRevisionReason(e.target.value)}
                          placeholder="Revision reason..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              onAction(step.id, "change_status", {
                                status: "revision_requested",
                                reason: revisionReason,
                              });
                              setShowRevisionInput(false);
                              setRevisionReason("");
                            }}
                            disabled={actionLoading || !revisionReason.trim()}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            Request Revision
                          </button>
                          <button
                            onClick={() => {
                              setShowRevisionInput(false);
                              setRevisionReason("");
                            }}
                            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRevisionInput(true)}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Request Revision
                      </button>
                    )}
                  </>
                )}
                {step.status === "revision_requested" && (
                  <button
                    onClick={() => onAction(step.id, "change_status", { status: "in_progress" })}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Mark In Progress
                  </button>
                )}
                {/* Skip always available for non-terminal states */}
                {!["approved", "skipped", "cancelled"].includes(step.status) && (
                  <button
                    onClick={() => onAction(step.id, "skip_step")}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    Skip
                  </button>
                )}
              </div>
              {actionLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Processing...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <VendorPickerModalCompat
        isOpen={showVendorPicker}
        onClose={() => setShowVendorPicker(false)}
        onSelect={handleAssignVendor}
      />
    </>
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
  const suggested = templates.find((t) => t.is_suggested);
  const [selectedCode, setSelectedCode] = useState(suggested?.code ?? templates[0]?.code ?? "");
  const [assigning, setAssigning] = useState(false);

  const selectedTemplate = templates.find((t) => t.code === selectedCode);

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
          {templates.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name} ({t.step_count} steps){t.is_suggested ? " — Suggested" : ""}
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

// ── WorkflowPipeline (main visible component) ──

interface WorkflowPipelineProps {
  workflow: Workflow;
  steps: WorkflowStep[];
  onStepClick: (step: WorkflowStep) => void;
  expandedStepId?: string | null;
  onToggleExpand?: (stepId: string) => void;
  orderFinancials?: OrderFinancials | null;
  totalVendorCost?: number;
}

function WorkflowPipeline({
  workflow,
  steps,
  onStepClick,
  expandedStepId = null,
  onToggleExpand = () => {},
  orderFinancials = null,
  totalVendorCost = 0,
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
              {workflow.template_code.replace(/_/g, " ")}
            </span>
          </div>
          <StepStatusBadge status={workflow.status} />
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
                  : margin >= 30
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
            <div key={step.id} className="relative flex items-start mb-3">
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
                    <StepStatusBadge status={step.status} />
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
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchWorkflow = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("get-order-workflow", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      setData(result as WorkflowData);
    } catch (err: unknown) {
      console.error("Failed to load workflow:", err);
      // Don't toast on initial load — workflow may just not exist
      setData({ success: true, has_workflow: false, workflow: null, steps: [], available_templates: [] });
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  const handleStepAction = async (stepId: string, action: string, params?: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("update-workflow-step", {
        body: { step_id: stepId, action, ...params },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast.success("Step updated");
      setSelectedStep(null);
      await fetchWorkflow();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update step";
      toast.error(message);
    }
    setActionLoading(false);
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
          onStepClick={setSelectedStep}
        />
      ) : (
        <TemplateSelector
          templates={data?.available_templates ?? []}
          orderId={orderId}
          onAssigned={fetchWorkflow}
        />
      )}

      {/* Step Detail Modal */}
      {selectedStep && (
        <StepDetailPanel
          step={selectedStep}
          onClose={() => setSelectedStep(null)}
          onAction={handleStepAction}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}
