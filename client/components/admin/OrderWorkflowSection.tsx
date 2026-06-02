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
  Mail,
  RefreshCw,
} from "lucide-react";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { ADMIN_CURRENCIES } from "@/lib/currencies";
import BrevoEmailLogsModal from "./BrevoEmailLogsModal";
import ManagePayableModal from "./ManagePayableModal";
import { ConfirmDialog, useConfirmDialog } from "./ConfirmDialog";
// VendorFinderModal extracted to its own file 2026-06-02 (R11 partial).
import VendorFinderModal from "./VendorFinderModal";
// UnassignVendorModal extracted to its own file 2026-06-02 (R11 followup).
import UnassignVendorModal from "./UnassignVendorModal";
// VendorAssignModal extracted to its own file 2026-06-02 (R11 followup).
import VendorAssignModal from "./VendorAssignModal";
// WorkflowPipeline extracted to its own file 2026-06-02 (R11 full split).
import WorkflowPipeline, { ActorIcon } from "./WorkflowPipeline";
import {
  type WorkflowStep,
  type StaffUser,
  type Workflow,
  type WorkflowTemplate,
  type WorkflowData,
  type OrderFinancials,
} from "./workflowTypes";
import OrderFinancialSummary, {
  type VendorFinancials,
  type MarginData,
  type StepPayable,
  type FinancialStep,
} from "./OrderFinancialSummary";


// The label has to follow the ACTUAL assignee, not the template's actor_type.

// ── VendorAssignModal ──

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

// ── WorkflowPipeline (main visible component) ──
// ── Main Exported Section Component ──

export default function OrderWorkflowSection({ orderId, onWorkflowLoaded, refreshKey, onUploadFinalDeliverable, onDraftPromoted }: { orderId: string; onWorkflowLoaded?: (data: any) => void; refreshKey?: number; onUploadFinalDeliverable?: () => void; onDraftPromoted?: (params: { stepId: string; quoteFileId: string; reviewVersion: number; sourceFilename: string }) => Promise<void> | void }) {
  // Styled confirm() replacement — see ./ConfirmDialog. Rendered below.
  const {
    confirm: confirmDialog,
    state: confirmState,
    handleAnswer: handleConfirmAnswer,
  } = useConfirmDialog();
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
  const [counterBackOfferId, setCounterBackOfferId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [counterLoadingId, setCounterLoadingId] = useState<string | null>(null);
  const [unassignStep, setUnassignStep] = useState<any | null>(null);
  // Internal project this order belongs to. Surfaced to the VendorFinderModal
  // so prior-project contributors get a stickiness badge + score boost.
  const [internalProjectId, setInternalProjectId] = useState<string | null>(null);
  // Customer-facing delivery deadline. Two columns now:
  //   * estimated_delivery_at — TIMESTAMPTZ (instant + tz), preferred
  //   * estimated_delivery_date — DATE-only legacy fallback (orders
  //     created before the 2026-05-11 migration carry only this)
  // Surfaced to AssignVendorModal so staff can pre-fill vendor deadlines
  // against the client's expectation and warn when a vendor deadline
  // lands at/after the client one.
  const [clientDeadlineAt, setClientDeadlineAt] = useState<string | null>(null);
  const [clientDeadlineDate, setClientDeadlineDateState] = useState<string | null>(null);
  // Linked Translation Review (QM) jobs per workflow step — populated after
  // the workflow loads so each step card can show a "QM" chip surfacing
  // the linked job's status + arbitration counts without leaving the page.
  const [qmByStep, setQmByStep] = useState<Record<string, {
    job_id: string;
    job_kind: "translation_review" | "qm_certified";
    status: string;
    findings_total: number;
    findings_accepted: number;
    findings_rejected: number;
    findings_pending: number;
  }>>({});
  const { session: currentStaff } = useAdminAuthContext();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("internal_project_id, estimated_delivery_date, estimated_delivery_at")
        .eq("id", orderId)
        .maybeSingle();
      if (!cancelled) {
        setInternalProjectId((data?.internal_project_id as string | null) ?? null);
        setClientDeadlineAt((data?.estimated_delivery_at as string | null) ?? null);
        setClientDeadlineDateState((data?.estimated_delivery_date as string | null) ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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

      // Resolve linked TR (QM) jobs per step in one round-trip. Each
      // tr.job_files row with a linked_step_id points back into this
      // workflow; we summarize the job + finding arbitration counts so
      // the step card can show a chip without expanding.
      try {
        const stepIds = (wfData.steps ?? []).map((s) => s.id);
        if (stepIds.length > 0) {
          const { data: jobFiles } = await supabase
            .schema("tr" as never)
            .from("job_files")
            .select("job_id, linked_step_id")
            .in("linked_step_id", stepIds);
          const jobToStep = new Map<string, string>();
          for (const jf of (jobFiles ?? []) as Array<{ job_id: string; linked_step_id: string }>) {
            if (jf.linked_step_id && !jobToStep.has(jf.job_id)) {
              jobToStep.set(jf.job_id, jf.linked_step_id);
            }
          }
          const jobIds = Array.from(jobToStep.keys());
          if (jobIds.length > 0) {
            const [{ data: jobs }, { data: findings }] = await Promise.all([
              supabase
                .schema("tr" as never)
                .from("review_jobs")
                .select("id, job_kind, status")
                .in("id", jobIds),
              supabase
                .schema("tr" as never)
                .from("findings")
                .select("job_id, vendor_decision")
                .in("job_id", jobIds),
            ]);
            const stepMap: typeof qmByStep = {};
            const findingsByJob = new Map<string, { total: number; accepted: number; rejected: number; pending: number }>();
            for (const f of (findings ?? []) as Array<{ job_id: string; vendor_decision: string | null }>) {
              const e = findingsByJob.get(f.job_id) ?? { total: 0, accepted: 0, rejected: 0, pending: 0 };
              e.total += 1;
              if (f.vendor_decision === "accepted") e.accepted += 1;
              else if (f.vendor_decision === "rejected") e.rejected += 1;
              else e.pending += 1;
              findingsByJob.set(f.job_id, e);
            }
            for (const job of (jobs ?? []) as Array<{ id: string; job_kind: "translation_review" | "qm_certified"; status: string }>) {
              const stepId = jobToStep.get(job.id);
              if (!stepId) continue;
              const counts = findingsByJob.get(job.id) ?? { total: 0, accepted: 0, rejected: 0, pending: 0 };
              // If multiple QM jobs exist for the same step, keep the
              // first; staff can drill into the TR list for the rest.
              if (!stepMap[stepId]) {
                stepMap[stepId] = {
                  job_id: job.id,
                  job_kind: job.job_kind,
                  status: job.status,
                  findings_total: counts.total,
                  findings_accepted: counts.accepted,
                  findings_rejected: counts.rejected,
                  findings_pending: counts.pending,
                };
              }
            }
            setQmByStep(stepMap);
          } else {
            setQmByStep({});
          }
        } else {
          setQmByStep({});
        }
      } catch (e) {
        console.error("Failed to resolve linked QM jobs:", e);
      }
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
      // On non-2xx, supabase-js returns FunctionsHttpError with `error` set.
      // Its .context.response carries the raw Response; parse the JSON body
      // so we can surface the server's specific error message (e.g. the
      // "Deadline is required" check) instead of a generic
      // "Edge Function returned a non-2xx status code".
      if (error) {
        let serverMsg: string | null = null;
        try {
          const resp = (error as any)?.context?.response as Response | undefined;
          if (resp) {
            const body = await resp.clone().json().catch(() => null);
            if (body?.error) serverMsg = String(body.error);
          }
        } catch {
          /* ignore body parse errors */
        }
        throw new Error(serverMsg || (error as Error).message || "Failed to update step");
      }
      if (result?.error) throw new Error(result.error);
      toast.success("Step updated");
      await fetchWorkflow();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update step";
      toast.error(message);
    }
    setActionLoading(null);
  };

  const handleToggleCethosTm = async (step: any) => {
    const newVal = !step.use_cethos_tm;
    if (newVal && !step.tm_job_id) {
      setTmProvisioningStepId(step.id);
      try {
        const { data: result, error } = await supabase.functions.invoke("provision-tm-job", {
          body: { step_id: step.id },
        });
        if (error) {
          let msg = "Failed to provision TM job";
          try {
            const resp = (error as any)?.context?.response as Response | undefined;
            if (resp) { const b = await resp.clone().json().catch(() => null); if (b?.error) msg = b.error; }
          } catch {}
          throw new Error(msg);
        }
        if (result?.error) throw new Error(result.error);
        toast.success(result.already_provisioned
          ? "TM job already exists"
          : `TM job created (${result.words} words, ${result.segments} segments)`);
        await fetchWorkflow();
      } catch (err: any) {
        toast.error(err?.message || "Failed to provision TM job");
      } finally {
        setTmProvisioningStepId(null);
      }
    } else {
      await supabase
        .from("order_workflow_steps")
        .update({ use_cethos_tm: newVal })
        .eq("id", step.id);
      toast.success(newVal ? "Cethos TM enabled" : "Cethos TM disabled");
      await fetchWorkflow();
    }
  };

  const handleRetractSingleOffer = async (stepId: string, offerId: string, vendorName: string) => {
    const ok = await confirmDialog({
      title: "Retract offer?",
      message: `Retract offer to ${vendorName}? This will also cancel their payable if one exists.`,
      confirmLabel: "Retract offer",
      tone: "danger",
    });
    if (!ok) return;

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

  const handleRespondCounter = async (
    offerId: string,
    action: 'accept' | 'reject' | 'counter_back',
    counterBack?: { new_rate?: number; new_total?: number; new_deadline?: string; new_note?: string; new_currency?: string; new_rate_unit?: string },
  ) => {
    setCounterLoadingId(offerId);
    try {
      const { data: result, error } = await supabase.functions.invoke('admin-respond-counter-offer', {
        body: {
          offer_id: offerId,
          action,
          staff_id: currentStaff?.staffId,
          rejection_reason: action === 'reject' ? rejectReason : undefined,
          ...(action === 'counter_back' ? counterBack ?? {} : {}),
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
      } else if (action === 'counter_back') {
        toast.success(`Counter back sent to ${result.vendor_name || 'vendor'}.`);
      } else {
        toast.success('Counter-proposal rejected.');
      }

      setRejectingOfferId(null);
      setRejectReason('');
      setCounterBackOfferId(null);
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
            counterBackOfferId={counterBackOfferId}
            onSetCounterBackOfferId={setCounterBackOfferId}
            counterLoadingId={counterLoadingId}
            onUnassignVendor={(step) => setUnassignStep(step)}
            onExtendDeadline={handleExtendDeadline}
            onAdjustPayable={handleAdjustPayable}
            onRefresh={fetchWorkflow}
            onUploadFinalDeliverable={onUploadFinalDeliverable}
            onDraftPromoted={onDraftPromoted}
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
            qmByStep={qmByStep}
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
          internalProjectId={internalProjectId}
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
          clientDeadlineAt={clientDeadlineAt}
          clientDeadlineDate={clientDeadlineDate}
          orderId={orderId}
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
      <ConfirmDialog state={confirmState} onAnswer={handleConfirmAnswer} />
    </div>
  );
}
