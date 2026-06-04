// WorkflowPipeline.tsx — extracted from OrderWorkflowSection.tsx 2026-06-02
// (R11 full split). The main per-step pipeline UI: status badges, action
// buttons (assign / offer / unassign / extend deadline / payable / counter
// response), step expand/collapse, and per-step QMS / vendor / counter cards.
// No behavior change vs the inlined version.

import { useState, useEffect, useRef } from "react";
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
  Mail,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { ADMIN_CURRENCIES } from "@/lib/currencies";
import BrevoEmailLogsModal from "./BrevoEmailLogsModal";
import ManagePayableModal from "./ManagePayableModal";
import { ConfirmDialog, useConfirmDialog } from "./ConfirmDialog";
import { type VendorFinancials, type MarginData, type FinancialStep } from "./OrderFinancialSummary";
import {
  type WorkflowStep,
  type Workflow,
  type OrderFinancials,
  type StaffUser,
  UNASSIGN_REASON_LABELS,
  STEP_STATUS_STYLES,
  WORKFLOW_STATUS_STYLES,
  STEP_STATUS_ICONS,
} from "./workflowTypes";

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


export function ActorIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
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


// Templates declare an intended actor_type (e.g. external_vendor for Editing
// on Standard TEP) but staff can fill those slots via `allowed_actor_types`.
// Rendering the template's "Vendor" label when an internal staff member
// actually filled the step makes a single staff person look like 3 different
// actors across the same workflow. We pass the whole step and resolve the
// label from `vendor_id` / `assigned_staff_id` first, falling back to
// `actor_type` only when no one is assigned yet (template-role preview).
// R9 — inline form inside the counter-offer card. Admin proposes new rate,
// total, deadline, and a note; the offer's vendor_* terms get overwritten with
// these values via admin-respond-counter-offer{action:'counter_back'} and the
// vendor's existing Accept/Negotiate buttons pick them up unchanged.
function CounterBackForm({
  offer,
  disabled,
  onSubmit,
  onCancel,
}: {
  offer: any;
  disabled: boolean;
  onSubmit: (values: { new_rate?: number; new_total?: number; new_deadline?: string; new_note?: string; new_rate_unit?: string; new_currency?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const initialRate = offer.counter_rate != null ? String(offer.counter_rate) : offer.vendor_rate != null ? String(offer.vendor_rate) : "";
  const initialTotal = offer.counter_total != null ? String(offer.counter_total) : offer.vendor_total != null ? String(offer.vendor_total) : "";
  const initialDeadline = offer.counter_deadline || offer.deadline || "";
  const [rate, setRate] = useState(initialRate);
  const [total, setTotal] = useState(initialTotal);
  const [deadline, setDeadline] = useState(initialDeadline ? new Date(initialDeadline).toISOString().slice(0, 16) : "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const rateNum = rate ? Number(rate) : undefined;
    const totalNum = total ? Number(total) : undefined;
    if ((rate && Number.isNaN(rateNum)) || (total && Number.isNaN(totalNum))) {
      toast.error("Rate and total must be numbers");
      return;
    }
    if (!rateNum && !totalNum && !deadline && !note.trim()) {
      toast.error("Provide at least one of rate, total, deadline, or note");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        new_rate: rateNum,
        new_total: totalNum,
        new_deadline: deadline ? new Date(deadline).toISOString() : undefined,
        new_note: note.trim() || undefined,
        new_rate_unit: offer.counter_rate_unit || offer.vendor_rate_unit || undefined,
        new_currency: offer.counter_currency || offer.vendor_currency || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-md space-y-2">
      <div className="text-[11px] font-semibold text-orange-800">Counter back to {offer.vendor_name}</div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-gray-700">
          Rate ({offer.counter_rate_unit || offer.vendor_rate_unit || "flat"})
          <input
            type="number" step="0.01" min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="mt-0.5 w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
            disabled={disabled || submitting}
          />
        </label>
        <label className="text-[11px] text-gray-700">
          Total ({offer.counter_currency || offer.vendor_currency || "CAD"})
          <input
            type="number" step="0.01" min="0"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="mt-0.5 w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
            disabled={disabled || submitting}
          />
        </label>
        <label className="text-[11px] text-gray-700">
          Deadline
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="mt-0.5 w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
            disabled={disabled || submitting}
          />
        </label>
      </div>
      <textarea
        className="w-full border border-gray-300 rounded p-1.5 text-xs"
        placeholder="Note to vendor (optional)…"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled || submitting}
      />
      <div className="flex gap-2">
        <button
          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs disabled:opacity-50 inline-flex items-center gap-1"
          disabled={disabled || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</> : <>Send counter back</>}
        </button>
        <button
          className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-xs"
          disabled={disabled || submitting}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActorTypeBadge({
  actorType,
  vendorId,
  assignedStaffId,
}: {
  actorType: string;
  vendorId?: string | null;
  assignedStaffId?: string | null;
}) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    external_vendor: { label: "Vendor", bg: "bg-blue-100", text: "text-blue-700" },
    internal_work: { label: "Internal (Work)", bg: "bg-purple-100", text: "text-purple-700" },
    internal_review: { label: "Internal (Review)", bg: "bg-indigo-100", text: "text-indigo-700" },
    customer: { label: "Customer", bg: "bg-green-100", text: "text-green-700" },
    automated: { label: "Auto", bg: "bg-gray-100", text: "text-gray-600" },
  };
  // Pick a key based on who is ACTUALLY assigned, not the template:
  // - vendor_id set → Vendor (blue), regardless of template
  // - staff assigned to an external_vendor slot → render the template's
  //   "Internal" flavour if it carries one; otherwise generic Internal (Work)
  // - nothing assigned → preview the template role
  let effectiveKey: string;
  if (vendorId) {
    effectiveKey = "external_vendor";
  } else if (assignedStaffId) {
    effectiveKey =
      actorType === "internal_review" ? "internal_review" : "internal_work";
  } else {
    effectiveKey = actorType;
  }
  const c = config[effectiveKey] || config.automated;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}


// ── StaffPickerDropdown ──

// Confirm-gated staff picker. Two-step UX:
//   1) admin picks a staff member from the dropdown — nothing fires yet
//   2) admin can optionally set a deadline + instructions, then clicks
//      "Confirm assignment" to commit (or "Cancel" to back out).
// Prevents the prior accidental assign-on-pick footgun and gives parity
// with the vendor assignment flow which has its own modal.
function StaffPickerDropdown({
  onConfirm,
  disabled = false,
}: {
  onConfirm: (args: { staff_id: string; deadline?: string; instructions?: string }) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [deadline, setDeadline] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  const selectedStaff = staff.find((s) => s.id === selectedId) || null;

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await onConfirm({
        staff_id: selectedId,
        deadline: deadline || undefined,
        instructions: instructions.trim() || undefined,
      });
      setSelectedId("");
      setDeadline("");
      setInstructions("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setSelectedId("");
    setDeadline("");
    setInstructions("");
  };

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <select
        className="text-sm border border-gray-300 rounded px-2 py-1"
        value={selectedId}
        onFocus={() => fetchRef.current()}
        onMouseDown={() => fetchRef.current()}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={disabled || submitting || (loading && staff.length === 0)}
      >
        <option value="">
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

      {selectedStaff && (
        <div className="border border-purple-200 bg-purple-50 rounded p-2 space-y-2 text-xs">
          <div className="text-purple-800">
            Assigning to <strong>{selectedStaff.full_name || selectedStaff.email}</strong>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-600">Deadline (optional)</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-600">Instructions (optional)</label>
            <textarea
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="What does this person need to know?"
              disabled={submitting}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="px-3 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Assigning...
                </>
              ) : (
                "Confirm assignment"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



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
  handleRespondCounter?: (
    offerId: string,
    action: 'accept' | 'reject' | 'counter_back',
    counterBack?: { new_rate?: number; new_total?: number; new_deadline?: string; new_note?: string; new_currency?: string; new_rate_unit?: string },
  ) => Promise<void>;
  rejectingOfferId?: string | null;
  rejectReason?: string;
  onSetRejectingOfferId?: (id: string | null) => void;
  onSetRejectReason?: (text: string) => void;
  counterBackOfferId?: string | null;
  onSetCounterBackOfferId?: (id: string | null) => void;
  counterLoadingId?: string | null;
  onUnassignVendor?: (step: WorkflowStep) => void;
  onExtendDeadline?: (stepId: string, newDeadline: string, reason: string) => Promise<void>;
  onAdjustPayable?: (step: WorkflowStep, newRate: number | undefined, newSubtotal: number | undefined, reason: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  minMarginPercent?: number;
  qmByStep?: Record<string, {
    job_id: string;
    job_kind: "translation_review" | "qm_certified";
    status: string;
    findings_total: number;
    findings_accepted: number;
    findings_rejected: number;
    findings_pending: number;
  }>;
  // Opens the Upload Final Deliverable modal in the parent page. Surfaced
  // on the last workflow step once it's in_progress, so the PM doesn't have
  // to scroll up to the Documents section to upload the signed certified PDF.
  onUploadFinalDeliverable?: () => void;
  // Fired after promote-step-delivery-to-draft succeeds. Parent uses
  // this to open the existing Send-to-Customer modal pre-selected with
  // the newly promoted draft file id, so admin doesn't have to scroll
  // up to Documents & Files, find the file, tick the checkbox, and
  // click Send Selected to Customer.
  onDraftPromoted?: (params: {
    stepId: string;
    quoteFileId: string;
    reviewVersion: number;
    sourceFilename: string;
  }) => Promise<void> | void;
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
  counterBackOfferId = null,
  onSetCounterBackOfferId = () => {},
  counterLoadingId = null,
  onUnassignVendor = () => {},
  onExtendDeadline,
  onAdjustPayable,
  onRefresh,
  minMarginPercent = 30,
  qmByStep = {},
  onUploadFinalDeliverable,
  onDraftPromoted,
}: WorkflowPipelineProps) {
  const [editDeadlineStepId, setEditDeadlineStepId] = useState<string | null>(null);
  // ── Manage Payable modal — opens from the step card "+ Add payable" /
  // "Manage payable" button. Stores the step the modal is targeting; the
  // modal component handles the create_payable RPC + refetch.
  const [managePayableStep, setManagePayableStep] = useState<WorkflowStep | null>(null);

  // AI negotiation recommendations — keyed by offer.id. Lazy: fetched on
  // demand when staff clicks "Get AI recommendation" on the counter card.
  type NegotiationRec = {
    decision_id: string | null;
    action: "accept" | "reject" | "counter" | "escalate";
    proposed_rate: number | null;
    proposed_total: number | null;
    proposed_deadline: string | null;
    reasoning: string;
    confidence: number;
    concerns: string[];
    data_references: Record<string, unknown>;
    context_summary: {
      client_rate: number;
      ceiling: number;
      pool: { median: number | null; n: number };
      vendor_history: { jobs_completed: number; accept_rate: number | null };
    };
  };
  const [negotiationRecs, setNegotiationRecs] = useState<Record<string, NegotiationRec>>({});
  const [negotiatingOfferId, setNegotiatingOfferId] = useState<string | null>(null);
  const [negotiationError, setNegotiationError] = useState<Record<string, string>>({});

  // Styled confirm() replacement — see ./ConfirmDialog. Rendered at the bottom
  // of the pipeline. Native window.confirm() was inconsistent with the rest
  // of the admin UI and is blocked-by-default in some browsers.
  const {
    confirm: confirmDialog,
    state: confirmState,
    handleAnswer: handleConfirmAnswer,
  } = useConfirmDialog();

  const fetchNegotiationRec = async (offerId: string) => {
    setNegotiatingOfferId(offerId);
    setNegotiationError((m) => ({ ...m, [offerId]: "" }));
    try {
      const { data, error } = await supabase.functions.invoke("vendor-negotiate-counter", {
        body: { offer_id: offerId },
      });
      if (error) throw new Error(error.message || "Negotiator failed");
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "Negotiator returned failure");
      setNegotiationRecs((s) => ({ ...s, [offerId]: data as NegotiationRec }));
    } catch (err: any) {
      setNegotiationError((m) => ({ ...m, [offerId]: err?.message || "Failed" }));
    } finally {
      setNegotiatingOfferId(null);
    }
  };
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

  // Brevo email log modal — opened from a step's vendor row to verify
  // whether Brevo actually delivered the assignment / instructions email.
  const [brevoLogVendorId, setBrevoLogVendorId] = useState<string | null>(null);
  const [brevoLogVendorName, setBrevoLogVendorName] = useState<string | null>(null);
  const [resendingStepId, setResendingStepId] = useState<string | null>(null);
  const [tmProvisioningStepId, setTmProvisioningStepId] = useState<string | null>(null);

  // Approve/Revise modal state
  const [approveModalStep, setApproveModalStep] = useState<WorkflowStep | null>(null);
  const [reviseModalStep, setReviseModalStep] = useState<WorkflowStep | null>(null);
  // Admin "upload files on behalf" modal — separate from the internal_work
  // inline deliver panel so it can be opened for any step that requires a
  // file upload, regardless of actor_type.
  const [uploadModalStep, setUploadModalStep] = useState<WorkflowStep | null>(null);
  const [uploadModalFiles, setUploadModalFiles] = useState<File[]>([]);
  const [uploadModalNotes, setUploadModalNotes] = useState("");
  const [uploadModalLoading, setUploadModalLoading] = useState(false);
  // "Delivered by email" mode: admin uploads files that were delivered outside
  // the portal (e.g. via email). Files go to Supabase Storage + Dropbox in
  // the step's folder AND the Final Deliverable folder.
  const [emailDeliveryStep, setEmailDeliveryStep] = useState<WorkflowStep | null>(null);
  const [emailDeliveryFiles, setEmailDeliveryFiles] = useState<File[]>([]);
  const [emailDeliveryNotes, setEmailDeliveryNotes] = useState("");
  const [emailDeliveryLoading, setEmailDeliveryLoading] = useState(false);
  // "Send to Client" — ships the Final Deliverable step's latest version
  // to the customer (signed download links + completes the order).
  const [sendFinalStep, setSendFinalStep] = useState<WorkflowStep | null>(null);
  const [sendFinalMessage, setSendFinalMessage] = useState("");
  const [sendFinalLoading, setSendFinalLoading] = useState(false);
  // Recipient picker for the Send Final Deliverable modal. Built when the
  // modal opens from the order's customer + the linked company PMs (if any).
  // adHoc rows let staff type one-off name+email pairs without persisting
  // them anywhere. Empty list = default to the customer's primary email.
  interface RecipientChoice { email: string; name: string | null; source: "customer" | "pm" | "adhoc"; selected: boolean; }
  const [sendFinalRecipients, setSendFinalRecipients] = useState<RecipientChoice[]>([]);
  const [sendFinalAdHocName, setSendFinalAdHocName] = useState("");
  const [sendFinalAdHocEmail, setSendFinalAdHocEmail] = useState("");

  // Tracks which step is being promoted to a customer draft file so the
  // button can spin while the watermarked PDF is generated server-side
  // and inserted into quote_files.
  const [promotingStepId, setPromotingStepId] = useState<string | null>(null);

  const handleAdminUpload = async () => {
    if (!uploadModalStep) return;
    if (uploadModalFiles.length === 0) {
      toast.error("Pick at least one file to upload");
      return;
    }
    setUploadModalLoading(true);
    try {
      const formData = new FormData();
      formData.append("step_id", uploadModalStep.id);
      if (uploadModalNotes) formData.append("notes", uploadModalNotes);
      uploadModalFiles.forEach((f) => formData.append("files", f));
      if (currentStaff?.staffId) formData.append("staff_id", currentStaff.staffId);

      // Raw fetch (not supabase.functions.invoke) — the SDK mangles multipart
      // FormData and the server sees files.length === 0, silently running the
      // no-files "Mark Delivered" path. Bypass the SDK for uploads.
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-deliver-step`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: formData,
        },
      );
      const data = await res.json().catch(() => null as any);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || `Failed to upload files (HTTP ${res.status})`);
        return;
      }
      toast.success(`Uploaded v${data.delivery_version}`);
      setUploadModalStep(null);
      setUploadModalFiles([]);
      setUploadModalNotes("");
      if (onRefresh) await onRefresh();
    } catch (err) {
      toast.error("Failed to upload");
    } finally {
      setUploadModalLoading(false);
    }
  };

  // "Delivered by email" handler: uploads files via staff-deliver-step (same
  // as the normal admin upload), but also copies them into the Final Deliverable
  // Dropbox folder via a second fire-and-forget sync.
  const handleEmailDelivery = async () => {
    if (!emailDeliveryStep) return;
    if (emailDeliveryFiles.length === 0) {
      toast.error("Pick at least one file to upload");
      return;
    }
    setEmailDeliveryLoading(true);
    try {
      const formData = new FormData();
      formData.append("step_id", emailDeliveryStep.id);
      formData.append("notes", emailDeliveryNotes || "Delivered by email");
      formData.append("delivered_by_email", "true");
      emailDeliveryFiles.forEach((f) => formData.append("files", f));
      if (currentStaff?.staffId) formData.append("staff_id", currentStaff.staffId);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-deliver-step`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: formData,
        },
      );
      const data = await res.json().catch(() => null as any);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || `Failed to upload files (HTTP ${res.status})`);
        return;
      }
      toast.success(`Email delivery recorded — v${data.delivery_version} (${emailDeliveryFiles.length} file${emailDeliveryFiles.length !== 1 ? "s" : ""})`);
      setEmailDeliveryStep(null);
      setEmailDeliveryFiles([]);
      setEmailDeliveryNotes("");
      if (onRefresh) await onRefresh();
    } catch (err) {
      toast.error("Failed to upload email delivery");
    } finally {
      setEmailDeliveryLoading(false);
    }
  };

  // Open the Send Final Deliverable modal — also load the order's
  // customer + linked company PMs so the recipient picker can render
  // them as checkboxes. Defaults: customer pre-selected, PMs unselected.
  const openSendFinalModal = async (step: WorkflowStep) => {
    setSendFinalStep(step);
    setSendFinalMessage("");
    setSendFinalRecipients([]);
    setSendFinalAdHocName("");
    setSendFinalAdHocEmail("");
    try {
      const { data: ord } = await supabase
        .from("orders")
        .select("id, customer:customers!customer_id(id, full_name, email, company_id)")
        .eq("id", (data?.workflow?.order_id) ?? "")
        .maybeSingle();
      const cust = (ord as any)?.customer ?? null;
      const choices: RecipientChoice[] = [];
      if (cust?.email) {
        choices.push({ email: cust.email, name: cust.full_name, source: "customer", selected: true });
      }
      if (cust?.company_id) {
        const { data: pms } = await supabase
          .from("company_project_managers")
          .select("email, full_name, is_active")
          .eq("company_id", cust.company_id)
          .eq("is_active", true);
        for (const pm of (pms as any[]) || []) {
          if (pm.email && !choices.some((c) => c.email.toLowerCase() === String(pm.email).toLowerCase())) {
            choices.push({ email: pm.email, name: pm.full_name, source: "pm", selected: false });
          }
        }
      }
      setSendFinalRecipients(choices);
    } catch (e: any) {
      console.warn("openSendFinalModal recipient load failed:", e?.message || e);
    }
  };

  const toggleSendFinalRecipient = (email: string) => {
    setSendFinalRecipients((prev) =>
      prev.map((r) => (r.email === email ? { ...r, selected: !r.selected } : r)),
    );
  };

  const addSendFinalAdHocRecipient = () => {
    const email = sendFinalAdHocEmail.trim().toLowerCase();
    const name = sendFinalAdHocName.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email before adding.");
      return;
    }
    if (sendFinalRecipients.some((r) => r.email.toLowerCase() === email)) {
      toast.message("That email is already in the recipient list.");
      return;
    }
    setSendFinalRecipients((prev) => [
      ...prev,
      { email, name: name || null, source: "adhoc", selected: true },
    ]);
    setSendFinalAdHocName("");
    setSendFinalAdHocEmail("");
  };

  const removeSendFinalRecipient = (email: string) => {
    setSendFinalRecipients((prev) => prev.filter((r) => r.email !== email));
  };

  // Ships the Final Deliverable step's latest version to the customer:
  // signed download links via email, approves the step, completes the
  // workflow and the order. The edge function is idempotent — a re-click
  // after success returns success without re-sending.
  const handleSendFinalDeliverable = async () => {
    if (!sendFinalStep) return;
    setSendFinalLoading(true);
    try {
      const selectedRecipients = sendFinalRecipients
        .filter((r) => r.selected && r.email)
        .map((r) => ({ email: r.email, name: r.name }));
      const { data, error } = await supabase.functions.invoke("send-final-deliverable", {
        body: {
          step_id: sendFinalStep.id,
          staff_id: currentStaff?.staffId || null,
          message: sendFinalMessage.trim() || null,
          recipients: selectedRecipients.length > 0 ? selectedRecipients : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.already_sent) {
        toast.info("Final deliverable was already sent to the client.");
      } else {
        toast.success(`Sent v${data.version} to client (${data.files_sent} file${data.files_sent !== 1 ? "s" : ""}). Order marked complete.`);
      }
      setSendFinalStep(null);
      setSendFinalMessage("");
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send to client");
    } finally {
      setSendFinalLoading(false);
    }
  };

  const [reviseFeedback, setReviseFeedback] = useState('');

  // Generates a watermarked DRAFT PDF on the server and inserts it as a
  // staff-created draft_translation file on the order's quote. From there
  // admin uses the existing 'Send Selected to Customer' flow in the
  // Documents & Files section (backed by review-draft-file). One pipeline,
  // not two.
  async function promoteStepDeliveryToDraft(step: WorkflowStep) {
    setPromotingStepId(step.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "promote-step-delivery-to-draft",
        { body: { step_id: step.id } },
      );
      if (error || !data || (data as any).error) {
        throw new Error((data as any)?.error || error?.message || "Promote failed");
      }
      const r = data as {
        review_version: number;
        was_converted_from_word: boolean;
        quote_file_id?: string;
        source_filename?: string;
      };
      // When the parent wired onDraftPromoted, surface a one-click
      // "Send to customer" action right on the toast — clicking it opens
      // the existing send modal pre-selected with this new draft, so the
      // admin doesn't have to scroll up to Documents & Files and re-tick
      // the checkbox. The toast still appears (and the file still ends
      // up in Documents & Files) for the manual path.
      const hasSendAction = !!onDraftPromoted && !!r.quote_file_id;
      toast.success(
        hasSendAction
          ? `Draft v${r.review_version} added — ready to send`
          : `Draft v${r.review_version} added to Documents & Files${
              r.was_converted_from_word ? " (Word → PDF + watermark)" : " (watermark applied)"
            }. Select it and click "Send Selected to Customer".`,
        hasSendAction
          ? {
              description: r.was_converted_from_word
                ? "Word → PDF + DRAFT watermark applied."
                : "DRAFT watermark applied.",
              action: {
                label: "Send to customer",
                onClick: () => {
                  void onDraftPromoted!({
                    stepId: step.id,
                    quoteFileId: r.quote_file_id!,
                    reviewVersion: r.review_version,
                    sourceFilename: r.source_filename ?? "",
                  });
                },
              },
              duration: 10000,
            }
          : undefined,
      );
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to promote to draft");
    } finally {
      setPromotingStepId(null);
    }
  }

  // Actor type switcher state
  const [switchingActorStepId, setSwitchingActorStepId] = useState<string | null>(null);

  const { session: currentStaff } = useAdminAuthContext();

  const handleStaffDeliver = async (
    stepId: string,
    opts: { requiresFile?: boolean } = {},
  ) => {
    if (opts.requiresFile && staffDeliveryFiles.length === 0) {
      toast.error("This step requires at least one file.");
      return;
    }
    setStaffDeliveryLoading(true);
    try {
      // With files: go through the multipart staff-deliver-step edge fn.
      // Without files: just flip the step status via update-workflow-step
      // (change_status → delivered). This is the "Mark Delivered" path.
      if (staffDeliveryFiles.length > 0) {
        const formData = new FormData();
        formData.append("step_id", stepId);
        if (staffDeliveryNotes) formData.append("notes", staffDeliveryNotes);
        staffDeliveryFiles.forEach((f) => formData.append("files", f));
        if (currentStaff?.staffId) formData.append("staff_id", currentStaff.staffId);

        // Raw fetch (not supabase.functions.invoke) — the SDK mangles
        // multipart FormData; the server sees files.length === 0 and silently
        // runs the no-files path, so the step is "delivered" with no files.
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-deliver-step`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: formData,
          },
        );
        const data = await res.json().catch(() => null as any);
        if (!res.ok || !data?.success) {
          toast.error(data?.error || `Failed to deliver files (HTTP ${res.status})`);
          return;
        }
        toast.success(`Delivered v${data.delivery_version}`);
      } else {
        const { data, error } = await supabase.functions.invoke(
          "update-workflow-step",
          { body: { step_id: stepId, action: "change_status", status: "delivered" } },
        );
        if (error || !data?.success) {
          toast.error(data?.error || "Failed to mark delivered");
          return;
        }
        toast.success("Marked delivered");
      }

      setStaffDeliveryStepId(null);
      setStaffDeliveryFiles([]);
      setStaffDeliveryNotes("");
      if (onRefresh) await onRefresh();
    } catch (err) {
      toast.error("Failed to deliver");
    } finally {
      setStaffDeliveryLoading(false);
    }
  };

  const handleDownloadFile = async (filePath: string) => {
    try {
      // Staff deliveries go to 'quote-files' under workflows/... paths.
      // Vendor deliveries go to 'vendor-deliveries' under {stepId}/v{N}/... paths.
      const bucket = filePath.startsWith('workflows/') ? 'quote-files' : 'vendor-deliveries';
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 3600);
      if (error || !data?.signedUrl) {
        // Fallback: try the other bucket in case of misrouted files
        const fallback = bucket === 'quote-files' ? 'vendor-deliveries' : 'quote-files';
        const { data: d2 } = await supabase.storage
          .from(fallback)
          .createSignedUrl(filePath, 3600);
        if (d2?.signedUrl) {
          window.open(d2.signedUrl, '_blank');
          return;
        }
        toast.error('Failed to generate download link');
        return;
      }
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('Failed to download file');
    }
  };

  // step_deliveries.file_paths stores two shapes: plain path strings (staff)
  // or JSON-stringified {storage_path, original_filename, ...} objects (vendor).
  const normalizeDeliveryPath = (entry: string): { path: string; name: string } => {
    const trimmed = (entry || '').trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.storage_path) {
          return { path: parsed.storage_path, name: parsed.original_filename || parsed.storage_path.split('/').pop() || 'file' };
        }
      } catch { /* fall through */ }
    }
    return { path: trimmed, name: trimmed.split('/').pop() || 'file' };
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
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirmDialog({
                            title: "Remove step?",
                            message: `Remove step "${step.name}"? This cannot be undone.`,
                            confirmLabel: "Remove step",
                            tone: "danger",
                          });
                          if (ok) {
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
                  <ActorTypeBadge
                    actorType={step.actor_type}
                    vendorId={step.vendor_id}
                    assignedStaffId={step.assigned_staff_id}
                  />
                  <span className="text-sm text-gray-600">
                    {step.vendor_name ||
                      step.assigned_staff_name ||
                      (step.assigned_staff_id ? (
                        "Staff assigned"
                      ) : (
                        <span className="italic text-gray-400">Not assigned</span>
                      ))}
                  </span>
                  {step.vendor_id && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBrevoLogVendorId(step.vendor_id);
                          setBrevoLogVendorName(step.vendor_name || null);
                        }}
                        className="text-xs text-gray-400 hover:text-teal-700 inline-flex items-center gap-1"
                        title="Show Brevo email log for this vendor"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Email log</span>
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (resendingStepId) return;
                          setResendingStepId(step.id);
                          try {
                            await handleStepAction(step.id, "resend_notification", {});
                            toast.success(`Re-sent assignment email to ${step.vendor_name || "vendor"}`);
                          } catch (err: any) {
                            toast.error(err?.message || "Failed to resend email");
                          } finally {
                            setResendingStepId(null);
                          }
                        }}
                        disabled={resendingStepId === step.id}
                        className="text-xs text-gray-400 hover:text-teal-700 inline-flex items-center gap-1 disabled:opacity-50"
                        title="Resend assignment email via Brevo"
                      >
                        {resendingStepId === step.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">Resend email</span>
                      </button>
                    </>
                  )}
                  {!step.vendor_id && step.assigned_staff_id && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (resendingStepId) return;
                        setResendingStepId(step.id);
                        try {
                          await handleStepAction(step.id, "resend_staff_notification", {});
                          toast.success(`Re-sent assignment email to ${step.assigned_staff_name || "staff"}`);
                        } catch (err: any) {
                          toast.error(err?.message || "Failed to resend email");
                        } finally {
                          setResendingStepId(null);
                        }
                      }}
                      disabled={resendingStepId === step.id}
                      className="text-xs text-gray-400 hover:text-purple-700 inline-flex items-center gap-1 disabled:opacity-50"
                      title="Resend assignment email to staff via Brevo"
                    >
                      {resendingStepId === step.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Resend email</span>
                    </button>
                  )}
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

                        {/* Proposed counter – pending review.
                            vendor-counter-offer writes counter_status='proposed';
                            DB convention is 'proposed', not 'pending'. */}
                        {offer.counter_status === 'proposed' && (
                          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs">
                            <div className="font-medium text-yellow-800 mb-2 flex items-center gap-1.5 flex-wrap">
                              🔔 Counter-Proposal
                              {offer.vendor_name && (
                                <span className="font-normal text-yellow-700">from {offer.vendor_name}</span>
                              )}
                              <span className="font-normal text-yellow-600">(pending)</span>
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

                            {/* AI Negotiation Recommendation (HITL Phase 1) */}
                            <div className="mt-3 pt-3 border-t border-yellow-200">
                              {!negotiationRecs[offer.id] && !negotiationError[offer.id] && (
                                <button
                                  type="button"
                                  onClick={() => fetchNegotiationRec(offer.id)}
                                  disabled={negotiatingOfferId === offer.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 rounded disabled:opacity-50"
                                >
                                  {negotiatingOfferId === offer.id ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Thinking...</>
                                  ) : (
                                    <>✨ Get AI recommendation</>
                                  )}
                                </button>
                              )}
                              {negotiationError[offer.id] && (
                                <div className="text-xs text-red-600">
                                  Negotiation failed: {negotiationError[offer.id]}{" "}
                                  <button
                                    onClick={() => fetchNegotiationRec(offer.id)}
                                    className="text-violet-700 underline hover:text-violet-900"
                                  >
                                    Retry
                                  </button>
                                </div>
                              )}
                              {negotiationRecs[offer.id] && (
                                <div className="rounded-md bg-violet-50 border border-violet-200 p-3 space-y-2 text-xs">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-violet-900">
                                        AI recommends:
                                      </span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${
                                        negotiationRecs[offer.id].action === "accept"
                                          ? "bg-green-100 text-green-800"
                                          : negotiationRecs[offer.id].action === "reject"
                                          ? "bg-red-100 text-red-800"
                                          : negotiationRecs[offer.id].action === "counter"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-gray-100 text-gray-700"
                                      }`}>
                                        {negotiationRecs[offer.id].action}
                                      </span>
                                      {negotiationRecs[offer.id].action === "counter" && negotiationRecs[offer.id].proposed_rate && (
                                        <span className="text-violet-900 font-semibold">
                                          @ ${Number(negotiationRecs[offer.id].proposed_rate).toFixed(2)}/{offer.vendor_rate_unit || "page"}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-violet-700">
                                      Confidence {Math.round(negotiationRecs[offer.id].confidence * 100)}%
                                    </span>
                                  </div>
                                  <p className="text-violet-800 leading-relaxed">
                                    {negotiationRecs[offer.id].reasoning}
                                  </p>
                                  {negotiationRecs[offer.id].concerns.length > 0 && (
                                    <div className="text-amber-800">
                                      <span className="font-semibold">Concerns:</span>{" "}
                                      {negotiationRecs[offer.id].concerns.join("; ")}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 text-violet-700 text-[11px]">
                                    <span>Client rate: ${negotiationRecs[offer.id].context_summary.client_rate.toFixed(2)}/page</span>
                                    <span>Ceiling: ${negotiationRecs[offer.id].context_summary.ceiling.toFixed(2)}</span>
                                    {negotiationRecs[offer.id].context_summary.pool.median && (
                                      <span>Pool median: ${Number(negotiationRecs[offer.id].context_summary.pool.median).toFixed(2)} (n={negotiationRecs[offer.id].context_summary.pool.n})</span>
                                    )}
                                    <span>
                                      Vendor: {negotiationRecs[offer.id].context_summary.vendor_history.jobs_completed} jobs
                                      {negotiationRecs[offer.id].context_summary.vendor_history.accept_rate != null && (
                                        <> · {Math.round((negotiationRecs[offer.id].context_summary.vendor_history.accept_rate as number) * 100)}% accept</>
                                      )}
                                    </span>
                                  </div>
                                  <div className="pt-1 flex items-center gap-2">
                                    {negotiationRecs[offer.id].action === "accept" && (
                                      <button
                                        onClick={async () => {
                                          const ok = await confirmDialog({
                                            title: "Apply AI recommendation?",
                                            message: "Accept the counter as-is per the AI recommendation?",
                                            confirmLabel: "Accept counter",
                                          });
                                          if (ok) {
                                            handleRespondCounter(offer.id, "accept");
                                          }
                                        }}
                                        disabled={counterLoadingId === offer.id}
                                        className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-medium disabled:opacity-50"
                                      >
                                        ✓ Apply: Accept
                                      </button>
                                    )}
                                    {negotiationRecs[offer.id].action === "reject" && (
                                      <button
                                        onClick={() => onSetRejectingOfferId(offer.id)}
                                        className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-medium"
                                      >
                                        ✕ Apply: Reject
                                      </button>
                                    )}
                                    {negotiationRecs[offer.id].action === "counter" && (
                                      <button
                                        onClick={() => onSetCounterBackOfferId(offer.id)}
                                        className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-medium"
                                      >
                                        ↩ Apply: Counter back
                                      </button>
                                    )}
                                    <button
                                      onClick={() => fetchNegotiationRec(offer.id)}
                                      className="ml-auto px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-100 rounded"
                                    >
                                      Re-run
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 flex gap-2">
                              <button
                                className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 disabled:opacity-50"
                                disabled={counterLoadingId === offer.id}
                                onClick={async () => {
                                  const ok = await confirmDialog({
                                    title: "Accept counter-proposal?",
                                    message: `Accept counter-proposal from ${offer.vendor_name}? This will assign them to the step at the new rate.`,
                                    confirmLabel: "Accept & assign",
                                  });
                                  if (ok) {
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
                                className="bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs px-3 py-1.5 rounded border border-orange-300 inline-flex items-center gap-1 disabled:opacity-50"
                                disabled={counterLoadingId === offer.id}
                                onClick={() => onSetCounterBackOfferId(offer.id)}
                              >
                                ↩ Counter Back
                              </button>
                              <button
                                className="bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 text-xs px-3 py-1.5 rounded border inline-flex items-center gap-1 disabled:opacity-50"
                                disabled={counterLoadingId === offer.id}
                                onClick={() => onSetRejectingOfferId(offer.id)}
                              >
                                ✕ Reject Counter
                              </button>
                            </div>
                            {counterBackOfferId === offer.id && (
                              <CounterBackForm
                                offer={offer}
                                disabled={counterLoadingId === offer.id}
                                onCancel={() => onSetCounterBackOfferId(null)}
                                onSubmit={async (values) => {
                                  await handleRespondCounter(offer.id, 'counter_back', values);
                                }}
                              />
                            )}
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

                {/* Line 3: Rate info. Target-mode steps render a Target badge
                    instead of "Rate/Unit · Total"; total may be null (TBD). */}
                {step.actor_type === "external_vendor" && (step.vendor_rate || (step as any).pricing_mode === "target") && (
                  <div className="text-sm text-gray-500 mt-1">
                    {(step as any).pricing_mode === "target" ? (
                      <>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 mr-2">
                          Target
                        </span>
                        {step.vendor_total
                          ? `${step.vendor_currency} $${step.vendor_total.toFixed(2)} (indicative)`
                          : "Pricing TBD"}
                      </>
                    ) : (
                      <>
                        ${step.vendor_rate}/{step.vendor_rate_unit} · {step.vendor_currency} $
                        {step.vendor_total?.toFixed(2)}
                      </>
                    )}
                    {/* Adjust payable link — locked once invoiced/paid (#2.4) */}
                    {step.payable && !['paid', 'invoiced', 'cancelled'].includes(step.payable.status) && onAdjustPayable && (
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

                {/* Line 5b: Activity chips — file versions + linked QM job.
                    Visible without expanding so admin can see at a glance
                    how active the step is. Each chip is clickable: file
                    chip expands the step (revealing the inline version
                    table), QM chip jumps to the QM job detail. */}
                {((step.delivery_count ?? 0) > 0 || qmByStep[step.id]) && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                    {(step.delivery_count ?? 0) > 0 && step.latest_delivery && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                        title="View delivery history"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isExpanded) onToggleExpand(step.id);
                          // After expanding, also open the version history table.
                          setTimeout(() => {
                            if (!deliveryHistoryExpandedSteps.has(step.id)) {
                              toggleDeliveryHistory(step.id);
                            }
                          }, 0);
                        }}
                      >
                        <FileText className="w-3 h-3" />
                        Latest v{step.latest_delivery.version}
                        {(step.delivery_count ?? 0) > 1 && (
                          <span className="text-blue-500">· {step.delivery_count} versions</span>
                        )}
                      </button>
                    )}
                    {qmByStep[step.id] && (() => {
                      const qm = qmByStep[step.id];
                      const tone =
                        qm.status === "complete"
                          ? "border-green-200 bg-green-50 text-green-800 hover:bg-green-100"
                          : qm.status === "cancelled"
                            ? "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                            : qm.findings_pending > 0
                              ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              : "border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100";
                      const label =
                        qm.job_kind === "qm_certified" ? "QM" : "Review";
                      const findingsLabel =
                        qm.findings_total === 0
                          ? "no findings yet"
                          : qm.findings_pending > 0
                            ? `${qm.findings_pending}/${qm.findings_total} pending translator response`
                            : `${qm.findings_accepted} accepted · ${qm.findings_rejected} declined`;
                      return (
                        <a
                          href={`/admin/tr/jobs/${qm.job_id}`}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${tone}`}
                          title="Open QM job"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-medium">{label}</span>
                          <span>· {qm.status.replace(/_/g, " ")}</span>
                          <span className="opacity-75">· {findingsLabel}</span>
                        </a>
                      );
                    })()}
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
                            disabled={actionLoading === step.id}
                            onConfirm={async ({ staff_id, deadline, instructions }) =>
                              handleStepAction(step.id, "assign_staff", {
                                staff_id,
                                deadline,
                                instructions,
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
                          onClick={async (e) => {
                            e.stopPropagation();
                            const activeCount = step.offers!.filter((o: any) => ['pending', 'accepted'].includes(o.status)).length;
                            const ok = await confirmDialog({
                              title: "Retract all offers?",
                              message: `Retract all ${activeCount} offer(s) and reset step to Pending? All associated payables will be cancelled.`,
                              confirmLabel: "Retract all",
                              tone: "danger",
                            });
                            if (ok) {
                              handleStepAction(step.id, "retract_offers", {});
                            }
                          }}
                        >
                          {actionLoading === step.id ? "..." : `Retract All (${step.offers!.filter((o: any) => ['pending', 'accepted'].includes(o.status)).length})`}
                        </button>
                      )}
                    </>
                  )}

                  {/* Manage Payable: external_vendor steps with a vendor
                      assigned, not paid/cancelled. Opens the per-step
                      payable modal (flat / per-word / per-hour / per-page /
                      CAT analysis). Button label depends on whether a
                      payable already exists. Locked once invoiced/paid
                      (#2.4) — show a small lock chip instead. */}
                  {step.vendor_id &&
                    step.actor_type === "external_vendor" &&
                    !["approved", "skipped", "cancelled"].includes(step.status) && (
                      step.payable && ["invoiced", "paid"].includes(step.payable.status) ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs px-3 py-1 border border-gray-300 text-gray-600 rounded bg-gray-50"
                          title="Payable is locked — void the vendor invoice (or refund the payment) before editing."
                        >
                          🔒 {step.payable.status === "paid" ? "Paid" : "Invoiced"} · {(step.payable.total ?? 0).toFixed(2)} {step.payable.currency}
                        </span>
                      ) : (
                        <button
                          className="text-xs px-3 py-1 border border-emerald-400 text-emerald-700 rounded hover:bg-emerald-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setManagePayableStep(step);
                          }}
                          title="Add or replace the payable for this step"
                        >
                          {step.payable && !["cancelled"].includes(step.payable.status)
                            ? `Manage Payable (${(step.payable.total ?? 0).toFixed(2)} ${step.payable.currency})`
                            : "+ Add Payable"}
                        </button>
                      )
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

                  {/* Unassign Staff: internal_work / internal_review with a staff
                      member assigned, not approved/skipped. Simpler than
                      vendor unassign (no payables / offers to clean up). */}
                  {!step.vendor_id && step.assigned_staff_id && !['approved', 'skipped'].includes(step.status) && (
                    <button
                      className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                      disabled={actionLoading === step.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const name = step.assigned_staff_name || "this staff member";
                        const hasFiles = (step.delivered_file_paths?.length ?? 0) > 0;
                        const msg = hasFiles
                          ? `Unassign ${name} from this step? Already-delivered files will be cleared. The step will reset to Pending.`
                          : `Unassign ${name} from this step? The step will reset to Pending.`;
                        const ok = await confirmDialog({
                          title: "Unassign staff?",
                          message: msg,
                          confirmLabel: "Unassign",
                          tone: "danger",
                        });
                        if (ok) {
                          handleStepAction(step.id, "unassign_staff", { reason: "reassigning" });
                        }
                      }}
                      title="Unassign staff from this step"
                    >
                      {actionLoading === step.id ? "..." : "Unassign"}
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

                  {/* Mark Delivered: in_progress / revision_requested. Only
                      available when the step doesn't require a file upload
                      (the file-upload panel owns delivery when it does). */}
                  {["in_progress", "revision_requested"].includes(step.status) &&
                    !step.requires_file_upload && (
                      <button
                        className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                        disabled={actionLoading === step.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStepAction(step.id, "change_status", {
                            status: "delivered",
                          });
                        }}
                        title="Mark delivered without a file"
                      >
                        {actionLoading === step.id ? "..." : "Mark Delivered"}
                      </button>
                    )}

                  {/* Upload Files (admin, any actor_type): visible whenever
                      the step requires files AND is in a pre-approval status.
                      Opens a dedicated modal so admin can upload on behalf
                      of a vendor / reviewer without toggling the inline
                      internal_work panel. Final Deliverable also accepts
                      uploads in 'pending' status (the step starts there). */}
                  {step.requires_file_upload &&
                    (
                      ["accepted", "in_progress", "revision_requested"].includes(step.status) ||
                      (step.name === "Final Deliverable" && !["approved", "skipped", "cancelled"].includes(step.status))
                    ) && (
                      <button
                        className="text-xs px-3 py-1 border border-purple-400 text-purple-700 rounded hover:bg-purple-50 flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadModalStep(step);
                          setUploadModalFiles([]);
                          setUploadModalNotes("");
                        }}
                        title={step.name === "Final Deliverable" ? "Upload a new version of the final deliverable" : "Upload files on behalf of the assignee"}
                      >
                        <Upload className="w-3 h-3" /> {step.name === "Final Deliverable" ? "Upload Final Version" : "Upload Files"}
                      </button>
                    )}

                  {/* Send to Client (Final Deliverable only). Enabled once
                      at least one version has been uploaded. Hidden once
                      the step is approved (already shipped). */}
                  {step.name === "Final Deliverable" && step.status !== "approved" && (
                    <button
                      className="text-xs px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
                      disabled={!(step.delivery_count && step.delivery_count > 0) && !(step.deliveries && step.deliveries.length > 0)}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openSendFinalModal(step);
                      }}
                      title={
                        !(step.delivery_count && step.delivery_count > 0) && !(step.deliveries && step.deliveries.length > 0)
                          ? "Upload at least one version before sending to the client"
                          : "Email the final files to the customer + complete the order"
                      }
                    >
                      <Mail className="w-3 h-3" /> Send to Client
                    </button>
                  )}

                  {/* Sent indicator (Final Deliverable, already shipped) */}
                  {step.name === "Final Deliverable" && step.status === "approved" && step.final_marked_at && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 inline-flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Sent to client {new Date(step.final_marked_at).toLocaleDateString()}
                    </span>
                  )}

                  {/* Delivered by Email: available on any step that is
                      in an active or delivered state. Opens a file picker
                      so admin can record files that were delivered outside
                      the portal. Files stored in Supabase Storage + synced
                      to Dropbox in both the step folder and Final Deliverable. */}
                  {["assigned", "accepted", "in_progress", "revision_requested", "delivered", "approved"].includes(step.status) && (
                    <button
                      className="text-xs px-3 py-1 border border-teal-400 text-teal-700 rounded hover:bg-teal-50 flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmailDeliveryStep(step);
                        setEmailDeliveryFiles([]);
                        setEmailDeliveryNotes("");
                      }}
                      title="Record files that were delivered via email (stores in Supabase Storage + Dropbox)"
                    >
                      <Mail className="w-3 h-3" /> Delivered by email
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
                        {/* Begin QM: open a Translation Review QM job pre-linked
                            to this step's delivery. Only useful when files were
                            actually delivered. */}
                        {(step.delivered_file_paths?.length ?? 0) > 0 && (
                          <a
                            href={`/admin/tr/jobs/new?kind=qm_certified&from_step=${step.id}`}
                            className="text-xs px-3 py-1 border border-teal-400 text-teal-700 rounded hover:bg-teal-50 inline-block"
                            onClick={(e) => e.stopPropagation()}
                            title="Open a QM (certified-translation review) job pre-linked to this delivery"
                          >
                            Begin QM
                          </a>
                        )}
                      </>
                    );
                  })()}

                  {/* Promote the workflow delivery into the order's
                      "Draft Translation" staff files so admin can send it
                      via the existing Documents & Files → Send Selected to
                      Customer pipeline. We do NOT send the email from here
                      — the existing flow handles that with its preview
                      modal + multi-file selection. */}
                  {(step.deliveries?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      className="text-xs px-3 py-1 border border-teal-600 bg-teal-50 text-teal-800 rounded hover:bg-teal-100 disabled:opacity-50"
                      disabled={promotingStepId === step.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void promoteStepDeliveryToDraft(step);
                      }}
                      title={step.final_delivery_id ? "Promote the marked final as a watermarked DRAFT in the order's draft files" : "Promote the latest delivery as a watermarked DRAFT in the order's draft files"}
                    >
                      {promotingStepId === step.id ? "Promoting..." : "📄 Promote to customer draft"}
                    </button>
                  )}

                  {/* Deliver to Customer: shown on the last step once it's
                      in_progress (after the affidavit is auto-generated,
                      step 3 lands here so the PM can print, certify, scan,
                      then upload the signed PDF as the final deliverable
                      via the existing Upload Final Deliverable modal). */}
                  {step.status === "in_progress"
                    && onUploadFinalDeliverable
                    && step.step_number === Math.max(...steps.map(s => s.step_number)) && (
                    <button
                      type="button"
                      className="text-xs px-3 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUploadFinalDeliverable();
                      }}
                      title="Upload the signed/scanned certified PDF and email it to the customer"
                    >
                      ✉️ Deliver to Customer
                    </button>
                  )}

                  {/* Skip Step: optional + not terminal */}
                  {step.is_optional && !["approved", "skipped", "cancelled"].includes(step.status) && (
                    <button
                      className="text-xs px-3 py-1 border border-gray-400 text-gray-600 rounded hover:bg-gray-50"
                      disabled={actionLoading === step.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirmDialog({
                          title: "Skip optional step?",
                          message: "Skip this optional step?",
                          confirmLabel: "Skip",
                        });
                        if (ok) {
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
                    {/* Cethos TM toggle */}
                    {(step.actor_type === "external_vendor") && (
                      <div className="flex items-center justify-between bg-gray-50 rounded p-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-600 cursor-pointer" htmlFor={`tm-toggle-${step.id}`}>
                            Use Cethos TM
                          </label>
                          {step.tm_job_reference && (
                            <>
                              <span className="text-xs text-teal-600">
                                Job: {step.tm_job_reference}
                              </span>
                              {step.tm_job_id && (
                                <a
                                  href={`https://tm.cethos.com/pm/jobs/${step.tm_job_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-teal-700 underline hover:text-teal-900"
                                >
                                  View in TM →
                                </a>
                              )}
                            </>
                          )}
                        </div>
                        <button
                          id={`tm-toggle-${step.id}`}
                          type="button"
                          disabled={tmProvisioningStepId === step.id}
                          onClick={(e) => { e.stopPropagation(); handleToggleCethosTm(step); }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            step.use_cethos_tm ? "bg-teal-500" : "bg-gray-300"
                          } ${tmProvisioningStepId === step.id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            step.use_cethos_tm ? "translate-x-4" : "translate-x-0.5"
                          }`} />
                          {tmProvisioningStepId === step.id && (
                            <Loader2 className="absolute -right-6 w-4 h-4 animate-spin text-teal-500" />
                          )}
                        </button>
                      </div>
                    )}
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
                          {step.delivered_file_paths.map((p, i) => {
                            const f = normalizeDeliveryPath(p);
                            return (
                              <button
                                key={i}
                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                                onClick={(e) => { e.stopPropagation(); handleDownloadFile(f.path); }}
                              >
                                <Download className="w-3 h-3" />
                                {f.name}
                              </button>
                            );
                          })}
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
                            {step.latest_delivery.file_paths.map((p, i) => {
                              const f = normalizeDeliveryPath(p);
                              return (
                                <button
                                  key={i}
                                  className="flex items-center gap-0.5 hover:text-blue-800 hover:underline"
                                  onClick={(e) => { e.stopPropagation(); handleDownloadFile(f.path); }}
                                >
                                  <Download className="w-3 h-3" />
                                  {f.name}
                                </button>
                              );
                            })}
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
                                  <th className="px-2 py-1 text-left font-medium">Final</th>
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
                                  const isFinal = step.final_delivery_id === d.id;
                                  return (
                                    <tr key={d.id} className={`hover:bg-gray-50 ${isFinal ? "bg-emerald-50" : ""}`}>
                                      <td className="px-2 py-1 font-medium">v{d.version}</td>
                                      <td className="px-2 py-1">
                                        <button
                                          type="button"
                                          title={isFinal ? "This is the final version — click to unmark" : "Mark this delivery as the final version"}
                                          className={`text-[11px] px-1.5 py-0.5 rounded ${isFinal ? "bg-emerald-200 text-emerald-900" : "bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-800"}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleStepAction(step.id, "mark_final", { delivery_id: isFinal ? null : d.id });
                                          }}
                                        >
                                          {isFinal ? "★ Final" : "Mark final"}
                                        </button>
                                      </td>
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

                    {/* File-upload-required toggle (always visible on expanded
                        step so admin can flip the policy mid-flight). */}
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!step.requires_file_upload}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleStepAction(step.id, "update_config", {
                              requires_file_upload: e.target.checked,
                            });
                          }}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        File upload required
                      </label>
                      {!step.requires_file_upload && (
                        <span className="text-[11px] text-gray-400">
                          — step can be marked delivered without a file
                        </span>
                      )}
                    </div>

                    {/* Staff Delivery Upload (internal_work + internal_review steps) */}
                    {(step.actor_type === 'internal_work' || step.actor_type === 'internal_review') && ['in_progress', 'revision_requested'].includes(step.status) && (
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
                                disabled={
                                  staffDeliveryLoading ||
                                  (step.requires_file_upload && staffDeliveryFiles.length === 0)
                                }
                                onClick={() =>
                                  handleStaffDeliver(step.id, {
                                    requiresFile: step.requires_file_upload,
                                  })
                                }
                                title={
                                  step.requires_file_upload && staffDeliveryFiles.length === 0
                                    ? "This step is marked as file-upload-required"
                                    : undefined
                                }
                              >
                                {staffDeliveryLoading ? (
                                  <span className="flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    {staffDeliveryFiles.length > 0 ? "Uploading..." : "Marking..."}
                                  </span>
                                ) : staffDeliveryFiles.length > 0 ? (
                                  `Submit Delivery (${staffDeliveryFiles.length} file${staffDeliveryFiles.length !== 1 ? 's' : ''})`
                                ) : (
                                  "Mark Delivered"
                                )}
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

      {/* Admin file-upload modal (available on any step that requires files) */}
      {uploadModalStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !uploadModalLoading && setUploadModalStep(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Upload files — Step {uploadModalStep.step_number}:{" "}
                {uploadModalStep.name}
              </h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => !uploadModalLoading && setUploadModalStep(null)}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500">
                Files upload against this step's delivery history as the next
                version and mark the step as <strong>delivered</strong>.
              </p>

              <label className="block border-2 border-dashed border-purple-300 rounded p-4 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors">
                <Upload className="w-5 h-5 mx-auto text-purple-500 mb-1" />
                <div className="text-sm text-purple-700">
                  Click to pick files — or drag-drop below
                </div>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    // Snapshot synchronously; React's updater may read files
                    // lazily, so we capture into a local before any reset.
                    const picked = e.target.files
                      ? Array.from(e.target.files)
                      : [];
                    if (picked.length > 0) {
                      setUploadModalFiles((prev) => [...prev, ...picked]);
                    }
                    try { e.target.value = ""; } catch {}
                  }}
                />
              </label>

              <div
                className="border border-gray-200 rounded p-3 min-h-[60px] text-xs"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length)
                    setUploadModalFiles((prev) => [...prev, ...files]);
                }}
              >
                {uploadModalFiles.length === 0 ? (
                  <span className="text-gray-400">No files selected</span>
                ) : (
                  <ul className="space-y-1">
                    {uploadModalFiles.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center gap-1 text-gray-800 truncate">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-gray-400">
                            ({(f.size / 1024).toFixed(1)} KB)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setUploadModalFiles((prev) =>
                              prev.filter((_, idx) => idx !== i),
                            )
                          }
                          className="text-gray-400 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <textarea
                className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows={2}
                placeholder="Notes (optional)…"
                value={uploadModalNotes}
                onChange={(e) => setUploadModalNotes(e.target.value)}
              />
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                onClick={() => setUploadModalStep(null)}
                disabled={uploadModalLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 flex items-center gap-2"
                disabled={
                  uploadModalLoading || uploadModalFiles.length === 0
                }
                onClick={handleAdminUpload}
              >
                {uploadModalLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Upload {uploadModalFiles.length > 0 ? `(${uploadModalFiles.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivered by Email modal */}
      {emailDeliveryStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !emailDeliveryLoading && setEmailDeliveryStep(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Mail className="w-5 h-5 text-teal-600" />
                Delivered by email — Step {emailDeliveryStep.step_number}:{" "}
                {emailDeliveryStep.name}
              </h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => !emailDeliveryLoading && setEmailDeliveryStep(null)}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500">
                Upload files that were delivered outside the portal (e.g. via email).
                They will be stored in <strong>Supabase Storage</strong> and synced to{" "}
                <strong>Dropbox</strong> in the step folder and Final Deliverable folder.
              </p>

              <label className="block border-2 border-dashed border-teal-300 rounded p-4 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors">
                <Mail className="w-5 h-5 mx-auto text-teal-500 mb-1" />
                <div className="text-sm text-teal-700">
                  Click to pick files — or drag-drop below
                </div>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files
                      ? Array.from(e.target.files)
                      : [];
                    if (picked.length > 0) {
                      setEmailDeliveryFiles((prev) => [...prev, ...picked]);
                    }
                    try { e.target.value = ""; } catch {}
                  }}
                />
              </label>

              <div
                className="border border-gray-200 rounded p-3 min-h-[60px] text-xs"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length)
                    setEmailDeliveryFiles((prev) => [...prev, ...files]);
                }}
              >
                {emailDeliveryFiles.length === 0 ? (
                  <span className="text-gray-400">No files selected</span>
                ) : (
                  <ul className="space-y-1">
                    {emailDeliveryFiles.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center gap-1 text-gray-800 truncate">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-gray-400">
                            ({(f.size / 1024).toFixed(1)} KB)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEmailDeliveryFiles((prev) =>
                              prev.filter((_, idx) => idx !== i),
                            )
                          }
                          className="text-gray-400 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <textarea
                className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={2}
                placeholder="Notes (optional — e.g. email subject, sender)…"
                value={emailDeliveryNotes}
                onChange={(e) => setEmailDeliveryNotes(e.target.value)}
              />
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                onClick={() => setEmailDeliveryStep(null)}
                disabled={emailDeliveryLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-50 flex items-center gap-2"
                disabled={
                  emailDeliveryLoading || emailDeliveryFiles.length === 0
                }
                onClick={handleEmailDelivery}
              >
                {emailDeliveryLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <Mail className="w-4 h-4" />
                Record Delivery {emailDeliveryFiles.length > 0 ? `(${emailDeliveryFiles.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Final Deliverable to Client modal */}
      {sendFinalStep && (() => {
        const latest = sendFinalStep.deliveries && sendFinalStep.deliveries.length
          ? [...sendFinalStep.deliveries].sort((a, b) => b.version - a.version)[0]
          : sendFinalStep.latest_delivery;
        const filePaths = latest?.file_paths ?? [];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !sendFinalLoading && setSendFinalStep(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-emerald-600" /> Send Final Deliverable to Client
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-700">
                  Email the customer the final files for this order. This will mark the step approved,
                  complete the workflow, and mark the order complete.
                </p>
                {latest && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-emerald-900">
                    <div className="font-medium mb-1">
                      Sending v{latest.version} — uploaded by {latest.delivered_by_name || "staff"} on{" "}
                      {new Date(latest.delivered_at).toLocaleString()}
                    </div>
                    {filePaths.length > 0 ? (
                      <ul className="space-y-0.5 mt-1">
                        {filePaths.map((p: string, i: number) => (
                          <li key={i} className="flex items-center gap-1">
                            <FileText className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{p.split("/").pop()}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-amber-700">No files attached to this version.</div>
                    )}
                  </div>
                )}
                {/* Recipient picker — primary customer + linked PMs +
                    any ad-hoc rows staff types. At least one must be
                    selected for the Send button to enable. */}
                <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Recipients
                  </div>
                  {sendFinalRecipients.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Loading customer contacts…</p>
                  ) : (
                    <ul className="space-y-1">
                      {sendFinalRecipients.map((r) => (
                        <li key={r.email} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={() => toggleSendFinalRecipient(r.email)}
                            disabled={sendFinalLoading}
                            className="w-3.5 h-3.5"
                          />
                          <span className="flex-1 truncate" title={`${r.name ?? ""} <${r.email}>`}>
                            {r.name ? <span className="font-medium">{r.name}</span> : null}
                            <span className={r.name ? "ml-1 text-gray-500" : ""}>{r.email}</span>
                          </span>
                          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            r.source === "customer" ? "bg-emerald-100 text-emerald-700"
                            : r.source === "pm" ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                          }`}>
                            {r.source === "customer" ? "Customer" : r.source === "pm" ? "PM" : "Added"}
                          </span>
                          {r.source === "adhoc" && (
                            <button
                              type="button"
                              onClick={() => removeSendFinalRecipient(r.email)}
                              disabled={sendFinalLoading}
                              className="text-gray-400 hover:text-red-600"
                              aria-label="Remove recipient"
                            >
                              ×
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-1.5 items-center pt-1 border-t border-gray-200">
                    <input
                      type="text"
                      value={sendFinalAdHocName}
                      onChange={(e) => setSendFinalAdHocName(e.target.value)}
                      placeholder="Name (optional)"
                      disabled={sendFinalLoading}
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <input
                      type="email"
                      value={sendFinalAdHocEmail}
                      onChange={(e) => setSendFinalAdHocEmail(e.target.value)}
                      placeholder="email@example.com"
                      disabled={sendFinalLoading}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSendFinalAdHocRecipient(); } }}
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={addSendFinalAdHocRecipient}
                      disabled={sendFinalLoading || !sendFinalAdHocEmail.trim()}
                      className="text-xs px-2 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                    >
                      + Add
                    </button>
                  </div>
                </div>
                <textarea
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={3}
                  placeholder="Optional message to include in the email…"
                  value={sendFinalMessage}
                  onChange={(e) => setSendFinalMessage(e.target.value)}
                  disabled={sendFinalLoading}
                />
                <p className="text-[11px] text-gray-500">
                  Download links in the email are valid for 7 days. Files are also synced to the
                  Dropbox <em>Final Deliverable</em> folder.
                </p>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <button
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  onClick={() => setSendFinalStep(null)}
                  disabled={sendFinalLoading}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 flex items-center gap-2"
                  disabled={sendFinalLoading || filePaths.length === 0 || sendFinalRecipients.filter((r) => r.selected).length === 0}
                  onClick={handleSendFinalDeliverable}
                >
                  {sendFinalLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Mail className="w-4 h-4" />
                  Send to Client
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

      <BrevoEmailLogsModal
        open={!!brevoLogVendorId}
        onClose={() => {
          setBrevoLogVendorId(null);
          setBrevoLogVendorName(null);
        }}
        vendorId={brevoLogVendorId}
        displayName={brevoLogVendorName}
      />

      {managePayableStep && (
        <ManagePayableModal
          open={true}
          onClose={() => setManagePayableStep(null)}
          workflowStepId={managePayableStep.id}
          stepNumber={managePayableStep.step_number}
          stepName={managePayableStep.name}
          vendorId={managePayableStep.vendor_id}
          vendorName={managePayableStep.vendor_name}
          existingPayable={managePayableStep.payable}
          onSaved={async () => {
            if (onRefresh) await onRefresh();
          }}
        />
      )}
      <ConfirmDialog state={confirmState} onAnswer={handleConfirmAnswer} />
    </div>
  );
}


export default WorkflowPipeline;
