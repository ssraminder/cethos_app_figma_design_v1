// workflowTypes.ts — shared type defs + status styling for OrderWorkflowSection
// and WorkflowPipeline. Extracted from OrderWorkflowSection.tsx 2026-06-02
// (R11 full split). No behavior change.

import { type StepPayable } from "./OrderFinancialSummary";

// ── Types ──

export interface WorkflowStep {
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
  assigned_staff_name?: string | null;
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
  use_cethos_tm: boolean;
  tm_job_id: string | null;
  tm_job_reference: string | null;
  tm_provisioned_at: string | null;
  final_delivery_id?: string | null;
  final_marked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StepDelivery {
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

export interface OrderFinancials {
  service_id: string | null;
  subtotal: number;
  pre_tax: number;
  tax: number;
  total: number;
}

export interface StaffUser {
  id: string;
  full_name: string;
  email: string;
}

export interface Workflow {
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

export interface WorkflowTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  is_suggested: boolean;
  step_count: number;
  steps: { step_number: number; name: string; actor_type: string }[];
}

export interface WorkflowData {
  success: boolean;
  has_workflow: boolean;
  workflow: Workflow | null;
  steps: WorkflowStep[];
  available_templates?: WorkflowTemplate[];
}

// ── Unassign reason labels ──

export const UNASSIGN_REASON_LABELS: Record<string, string> = {
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

export const STEP_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
  offered: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Offered" },
  assigned: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Assigned" },
  accepted: { bg: "bg-blue-100", text: "text-blue-700", label: "Accepted" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  delivered: { bg: "bg-orange-100", text: "text-orange-700", label: "Delivered" },
  revision_requested: { bg: "bg-red-100", text: "text-red-700", label: "Revision Requested" },
  approved: { bg: "bg-green-100", text: "text-green-700", label: "Approved" },
  skipped: { bg: "bg-gray-100", text: "text-gray-400", label: "Skipped" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-400", label: "Cancelled" },
};

export const WORKFLOW_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-600" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  on_hold: { bg: "bg-yellow-100", text: "text-yellow-700" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-400" },
};

export const STEP_STATUS_ICONS: Record<string, string> = {
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
