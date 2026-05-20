// Translation Review feature — shared types + edge-function API client.
// All edge-function calls go through supabase.functions.invoke so auth headers
// flow correctly (the hand-rolled fetch pitfall is documented in
// memory/preferences.md — don't use fetch here).

import { supabase } from "./supabase";

// ── Types ───────────────────────────────────────────────────────────────────

export type TRJobKind = "translation_review" | "qm_certified";

export type TRJobStatus =
  | "intake"
  | "preflight"
  | "plan_pending_approval"
  | "in_review"
  | "findings_pending_human_review"
  | "revisions_pending"
  | "blocked_open_questions"
  | "complete"
  | "cancelled";

export type TRFileRole = "source" | "target" | "reference" | "client_email" | "output" | "open_question_image";

export type TRFileSourceKind = "uploaded" | "linked_quote_file" | "linked_project_asset" | "linked_order_deliverable";

export type TRFindingSeverity = "critical" | "major" | "minor" | "info";
export type TRFindingConfidence = "high" | "medium" | "low";
export type TRFindingApplicationMode = "tracked_change" | "comment" | "highlight" | "cell_change" | "pdf_annotation";
export type TRFindingApplicationStatus = "pending" | "applied" | "withdrawn" | "rejected_by_human" | "manually_modified";

export type TRReviewJob = {
  id: string;
  project_id: string | null;
  customer_id: string | null;
  pm_contact: string | null;
  client_name: string | null;
  job_kind: TRJobKind;
  source_language_id: string;
  target_language_id: string;
  methodology_template_id: string;
  review_round: number;
  round_color_hex: string | null;
  deliverable_format_spec: Record<string, unknown>;
  status: TRJobStatus;
  cert_type: string | null;
  target_authority: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TRJobFile = {
  id: string;
  job_id: string;
  pair_id: string | null;
  role: TRFileRole;
  category: string | null;
  custom_label: string | null;
  source_kind: TRFileSourceKind;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  bytes: number | null;
  sha256: string | null;
  expected_marker: string | null;
  actual_marker: string | null;
  verified: boolean;
  verified_at: string | null;
  verification_method: string | null;
  created_at: string;
};

export type TRFilePair = {
  id: string;
  job_id: string;
  label: string;
  notes: string | null;
  display_order: number;
};

export type TRFinding = {
  id: string;
  job_id: string;
  pair_id: string | null;
  file_id: string | null;
  finding_number: number;
  round: number;
  severity: TRFindingSeverity;
  category: string;
  confidence: TRFindingConfidence;
  location_jsonb: Record<string, unknown>;
  source_text: string | null;
  current_translation: string | null;
  proposed_change: string | null;
  english_back_translation: string | null;
  rationale: string | null;
  application_mode: TRFindingApplicationMode;
  color_hex: string | null;
  application_status: TRFindingApplicationStatus;
  applied_at: string | null;
  created_at: string;
};

export type TRJobPlan = {
  id: string;
  job_id: string;
  version: number;
  plan_jsonb: Record<string, unknown>;
  email_alignment_jsonb: Record<string, unknown> | null;
  approval_status: "draft" | "pending_approval" | "approved" | "rejected" | "superseded";
  approved_by: string | null;
  approved_at: string | null;
  confirmation_checks_jsonb: Record<string, boolean>;
  created_at: string;
};

export type TRAuditLogRow = {
  id: number;
  job_id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export type TRMethodologyTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  version: number;
  active: boolean;
};

export type TRRoundColor = { round: number; label: string; color_hex: string };

// ── Edge function client ────────────────────────────────────────────────────

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw new Error(error.message ?? `${name} failed`);
  if (!data) throw new Error(`${name} returned no data`);
  return data;
}

export const trApi = {
  createJob: (args: {
    job_kind: TRJobKind;
    project_id?: string | null;
    customer_id?: string | null;
    pm_contact?: string | null;
    client_name?: string | null;
    source_language_id: string;
    target_language_id: string;
    methodology_template_code: string;
    review_round?: number;
    round_color_hex?: string;
    deliverable_format_spec?: Record<string, unknown>;
    cert_type?: string | null;
    target_authority?: string | null;
    title?: string | null;
    notes?: string | null;
  }) => invoke<{ job_id: string; status: TRJobStatus }>("tr-create-job", args),

  uploadFile: async (args: {
    job_id: string;
    role: TRFileRole;
    pair_id?: string | null;
    category?: string | null;
    custom_label?: string | null;
    expected_marker?: string | null;
    file: File;
  }) => {
    const buf = new Uint8Array(await args.file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
    }
    const data_base64 = btoa(bin);
    return invoke<{ file_id: string; storage_path: string; sha256: string; bytes: number }>("tr-upload-file", {
      job_id: args.job_id,
      role: args.role,
      pair_id: args.pair_id ?? null,
      category: args.category ?? null,
      custom_label: args.custom_label ?? null,
      expected_marker: args.expected_marker ?? null,
      filename: args.file.name,
      mime_type: args.file.type,
      data_base64,
    });
  },

  linkExistingFile: (args: {
    job_id: string;
    role: TRFileRole;
    pair_id?: string | null;
    category?: string | null;
    custom_label?: string | null;
    expected_marker?: string | null;
    source_kind: TRFileSourceKind;
    link_ref: Record<string, unknown>;
  }) => invoke<{ file_id: string; storage_path: string; storage_bucket: string }>("tr-link-existing-file", args),

  searchProjectFiles: (args: { project_id?: string | null; customer_id?: string | null; search_text?: string | null }) =>
    invoke<{
      project_assets: Array<Record<string, unknown>>;
      quote_files: Array<Record<string, unknown>>;
      order_deliverables: Array<Record<string, unknown>>;
    }>("tr-search-project-files", args),

  preflight: (args: { job_id: string }) =>
    invoke<{
      job_id: string;
      status: "preflight_passed" | "preflight_warnings" | "preflight_blocked";
      files: Array<Record<string, unknown>>;
      warnings: Array<Record<string, unknown>>;
    }>("tr-preflight", args),

  generateJobPlan: (args: { job_id: string; client_email_text?: string | null }) =>
    invoke<{ plan_id: string; version: number; plan_jsonb: Record<string, unknown>; email_alignment_jsonb: Record<string, unknown> | null }>("tr-generate-job-plan", args),

  approveJobPlan: (args: { job_id: string; plan_id: string; confirmation_checks: Record<string, boolean> }) =>
    invoke<{ plan_id: string; approved_at: string }>("tr-approve-job-plan", args),

  review: (args: { job_id: string; user_message?: string | null }) =>
    invoke<{ call_id: number; outcome: string; findings_count: number; items_considered_not_flagged_count: number }>("tr-review", args),

  applyFindings: (args: { job_id: string; pair_id?: string | null }) =>
    invoke<{ applied: number; output_files: Array<{ pair_id: string; file_id: string; storage_path: string; filename: string; counts: Record<string, number> }> }>("tr-apply-findings", args),

  getSignedUrl: (args: { file_id: string }) =>
    invoke<{ url: string; expires_at: string; filename: string }>("tr-get-signed-url", args),

  addComment: (args: {
    job_id: string;
    body: string;
    kind?: "comment" | "status_note" | "close_note" | "file_replacement";
    files_jsonb?: Array<Record<string, unknown>>;
  }) => invoke<{ comment_id: string }>("tr-add-comment", args),

  closeJob: (args: { job_id: string; outcome: "complete" | "cancelled"; reason?: string | null }) =>
    invoke<{ job_id: string; status: string; closed_at: string }>("tr-close-job", args),

  vendorShareCreate: (args: {
    job_id: string;
    recipient_email: string;
    recipient_name?: string;
    recipient_kind?: "vendor" | "customer" | "other";
    expires_in_days?: number;
    message?: string;
  }) =>
    invoke<{
      token_id: string;
      token: string;
      share_url: string;
      expires_at: string;
      email_status: "sent" | "failed" | "skipped";
    }>("tr-vendor-share-create", args),
};

export type TRJobComment = {
  id: string;
  job_id: string;
  author_type: "staff" | "vendor" | "system";
  author_id: string | null;
  author_name: string;
  author_email: string | null;
  body: string;
  kind: "comment" | "status_note" | "file_replacement" | "close_note";
  files_jsonb: unknown[];
  via_token_id: string | null;
  created_at: string;
};

export async function listJobComments(jobId: string): Promise<TRJobComment[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("job_comments")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TRJobComment[];
}

export type TRJobShareToken = {
  id: string;
  job_id: string;
  token: string;
  recipient_email: string;
  recipient_name: string | null;
  recipient_kind: string;
  expires_at: string;
  last_used_at: string | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
};

export async function listJobShareTokens(jobId: string): Promise<TRJobShareToken[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("job_share_tokens")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TRJobShareToken[];
}

// ── Direct table reads (RLS gates by tr.is_staff) ──────────────────────────

export async function listReviewJobs(): Promise<TRReviewJob[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("review_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as TRReviewJob[];
}

export async function getReviewJob(id: string): Promise<TRReviewJob | null> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("review_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as TRReviewJob | null;
}

export async function listJobFiles(job_id: string): Promise<TRJobFile[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("job_files")
    .select("*")
    .eq("job_id", job_id)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as TRJobFile[];
}

export async function listFilePairs(job_id: string): Promise<TRFilePair[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("file_pairs")
    .select("*")
    .eq("job_id", job_id)
    .order("display_order");
  if (error) throw error;
  return (data ?? []) as TRFilePair[];
}

export async function createFilePair(args: { job_id: string; label: string; display_order?: number }): Promise<TRFilePair> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("file_pairs")
    .insert({ job_id: args.job_id, label: args.label, display_order: args.display_order ?? 0 })
    .select("*")
    .single();
  if (error) throw error;
  return data as TRFilePair;
}

export async function listFindings(job_id: string): Promise<TRFinding[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("findings")
    .select("*")
    .eq("job_id", job_id)
    .order("round")
    .order("finding_number");
  if (error) throw error;
  return (data ?? []) as TRFinding[];
}

export async function listJobPlans(job_id: string): Promise<TRJobPlan[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("job_plans")
    .select("*")
    .eq("job_id", job_id)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TRJobPlan[];
}

export async function listAuditLog(job_id: string): Promise<TRAuditLogRow[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("audit_log")
    .select("*")
    .eq("job_id", job_id)
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as TRAuditLogRow[];
}

export async function listMethodologyTemplates(): Promise<TRMethodologyTemplate[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("methodology_templates")
    .select("id, code, name, description, version, active")
    .eq("active", true);
  if (error) throw error;
  return (data ?? []) as TRMethodologyTemplate[];
}

export async function listRoundColors(): Promise<TRRoundColor[]> {
  const { data, error } = await supabase
    .schema("tr" as never)
    .from("round_colors")
    .select("round, label, color_hex")
    .order("round");
  if (error) throw error;
  return (data ?? []) as TRRoundColor[];
}

// Language and project pickers reuse public-schema tables — keep these simple.

export type LanguageRow = { id: string; code: string; name: string };

export async function listLanguages(): Promise<LanguageRow[]> {
  const { data, error } = await supabase
    .from("languages")
    .select("id, code, name")
    .order("code");
  if (error) throw error;
  return (data ?? []) as LanguageRow[];
}

export type ProjectPickRow = { id: string; project_number: string; name: string | null; client_project_number: string | null };

export async function listProjects(): Promise<ProjectPickRow[]> {
  const { data, error } = await supabase
    .from("internal_projects")
    .select("id, project_number, name, client_project_number")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ProjectPickRow[];
}
