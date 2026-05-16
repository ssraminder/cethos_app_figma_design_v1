// ============================================================================
// tr-generate-job-plan — Claude call #1 of a job.
// Produces a structured Job Plan + (if client email present) email alignment.
// Writes tr.job_plans row + tr.claude_calls audit row.
//
// Input: { job_id, client_email_text? }
// Output: { plan_id, version, plan_jsonb, email_alignment_jsonb? }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";
import { callClaude, writeClaudeCallRow } from "../_shared/tr-claude.ts";

const PROMPT_VERSION = "tr-job-plan-v1";

const JOB_PLAN_TOOL = {
  name: "emit_job_plan",
  description: "Emit the structured job plan + (optional) email alignment.",
  input_schema: {
    type: "object",
    required: ["plan"],
    properties: {
      plan: {
        type: "object",
        required: ["metadata", "file_pairs", "reference_files", "deliverable_format_spec", "methodology", "locked_decisions_in_force", "warnings", "required_confirmation_checks"],
        properties: {
          metadata: { type: "object" },
          file_pairs: { type: "array" },
          reference_files: { type: "array" },
          deliverable_format_spec: { type: "object" },
          methodology: { type: "string" },
          locked_decisions_in_force: { type: "array" },
          warnings: { type: "array" },
          required_confirmation_checks: { type: "array" },
        },
      },
      email_alignment: {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: {
              type: "object",
              required: ["field", "status"],
              properties: {
                field: { type: "string" },
                left: { type: ["string", "null"] },
                right: { type: ["string", "null"] },
                status: { enum: ["aligned", "partial", "conflict", "missing", "needs_clarification"] },
              },
            },
          },
          summary: { type: "string" },
        },
      },
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { job_id, client_email_text } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);

    // Load context
    const { data: job } = await tr(sb)
      .from("review_jobs")
      .select("id, status, project_id, customer_id, pm_contact, client_name, job_kind, source_language_id, target_language_id, methodology_template_id, review_round, round_color_hex, deliverable_format_spec, cert_type, target_authority, title")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);

    const { data: pairs } = await tr(sb).from("file_pairs").select("id, label, display_order").eq("job_id", job_id).order("display_order");
    const { data: files } = await tr(sb).from("job_files").select("id, pair_id, role, original_filename, mime_type, verified, expected_marker, actual_marker, category, custom_label").eq("job_id", job_id);

    // Build system prompt server-side (with locked decisions injected)
    const { data: systemPrompt } = await sb.rpc("build_system_prompt" as never, { p_job_id: job_id });

    // Resolve project number for plan metadata
    let projectNumber: string | null = null;
    if (job.project_id) {
      const { data: p } = await sb.from("internal_projects").select("project_number").eq("id", job.project_id).maybeSingle();
      projectNumber = p?.project_number ?? null;
    }

    const userMessage = `
Generate a Job Plan for this translation review job.

Job metadata:
- Project: ${projectNumber ?? "(none)"}
- Client: ${job.client_name ?? "(unspecified)"}
- PM contact: ${job.pm_contact ?? "(unspecified)"}
- Job kind: ${job.job_kind}
- Review round: ${job.review_round}, colour: ${job.round_color_hex ?? "(unset)"}
- Deliverable format spec (user-supplied): ${JSON.stringify(job.deliverable_format_spec ?? {})}
- Cert type: ${job.cert_type ?? "n/a"}; target authority: ${job.target_authority ?? "n/a"}

File pairs:
${(pairs ?? []).map((p) => `  - Pair "${p.label}" (id=${p.id})`).join("\n") || "  (none)"}

Files in manifest:
${(files ?? []).map((f) => `  - [${f.role}] ${f.original_filename} (id=${f.id}, pair=${f.pair_id ?? "-"}, verified=${f.verified}, expected_marker=${f.expected_marker ?? "-"}, actual_marker=${f.actual_marker ?? "-"})`).join("\n") || "  (none)"}

${client_email_text ? `Client email content:\n---\n${client_email_text}\n---\n\nProduce \`email_alignment\` comparing the email's asks against the Job Plan. Status per field: aligned / partial / conflict / missing / needs_clarification. Be conservative — anything not 100% explicit is partial or needs_clarification.` : "(No client email content supplied — omit email_alignment from the response.)"}

Required output: emit a single \`emit_job_plan\` tool call. Include any warnings in \`plan.warnings\` (e.g. terminology conflicts, format infeasibility, missing deadline, scope deviation). Include \`required_confirmation_checks\` for every item that requires staff acknowledgement on the approval gate (methodology mode, scope items, PDF annotation mode if any PDFs).
`.trim();

    const sysText = typeof systemPrompt === "string" ? systemPrompt : "(system prompt unavailable)";
    const startedAt = Date.now();
    const result = await callClaude({
      system: sysText,
      messages: [{ role: "user", content: userMessage }],
      tools: [JOB_PLAN_TOOL],
      tool_choice: { type: "tool", name: "emit_job_plan" },
      model: "claude-opus-4-7",
      max_tokens: 8192,
      temperature: 0,
    });
    const latency_ms = Date.now() - startedAt;

    const callId = await writeClaudeCallRow(sb, {
      job_id,
      call_kind: "generate_job_plan",
      model: "claude-opus-4-7",
      prompt_version: PROMPT_VERSION,
      system_prompt: sysText,
      request_payload: { messages: [{ role: "user", content: userMessage }] },
      result,
      latency_ms,
      outcome: result.ok ? "success" : "fatal_error",
      error_text: result.error ?? null,
      created_by: actor.id,
    });

    if (!result.ok || !result.tool_input) {
      return json({ error: result.error ?? "claude call failed" }, 502);
    }

    const planInput = result.tool_input as { plan: Record<string, unknown>; email_alignment?: Record<string, unknown> };

    // Determine plan version (next)
    const { data: existing } = await tr(sb).from("job_plans").select("version").eq("job_id", job_id).order("version", { ascending: false }).limit(1);
    const nextVersion = (existing?.[0]?.version ?? 0) + 1;

    const { data: planRow, error: planErr } = await tr(sb)
      .from("job_plans")
      .insert({
        job_id,
        version: nextVersion,
        plan_jsonb: planInput.plan,
        email_alignment_jsonb: planInput.email_alignment ?? null,
        approval_status: "pending_approval",
        created_by: actor.id,
      })
      .select("id, version")
      .single();
    if (planErr || !planRow) return json({ error: planErr?.message ?? "plan insert failed" }, 500);

    // Transition status: preflight or revisions_pending → plan_pending_approval
    if (["preflight", "revisions_pending"].includes(job.status)) {
      await tr(sb).from("review_jobs").update({ status: "plan_pending_approval" }).eq("id", job_id);
    }

    await writeAudit(sb, {
      job_id,
      action: "job_plan_generated",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: { plan_id: planRow.id, version: nextVersion, claude_call_id: callId },
    });

    return json({
      plan_id: planRow.id,
      version: planRow.version,
      plan_jsonb: planInput.plan,
      email_alignment_jsonb: planInput.email_alignment ?? null,
    }, 201);
  } catch (err) {
    console.error("[tr-generate-job-plan] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
