// ============================================================================
// tr-review — main review Claude call. Builds messages from conversation
// history + injects assembled system prompt. Forces structured output via
// emit_findings tool. Persists findings + items_considered_not_flagged.
//
// Input: { job_id, user_message? }
// Output: { call_id, findings_count, findings_pending: int }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";
import { callClaude, writeClaudeCallRow, ClaudeMessage } from "../_shared/tr-claude.ts";

const PROMPT_VERSION = "tr-review-v1";

const FINDINGS_TOOL = {
  name: "emit_findings",
  description: "Emit structured findings + file verifications + items considered but not flagged.",
  input_schema: {
    type: "object",
    required: ["file_verifications", "findings", "items_considered_not_flagged"],
    properties: {
      file_verifications: {
        type: "array",
        items: {
          type: "object",
          required: ["file_id", "verified"],
          properties: {
            file_id: { type: "string" },
            expected_marker: { type: ["string", "null"] },
            actual_marker: { type: ["string", "null"] },
            verified: { type: "boolean" },
          },
        },
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          required: ["pair_id", "file_id", "severity", "category", "confidence", "location", "rationale", "application_mode"],
          properties: {
            pair_id: { type: "string" },
            file_id: { type: "string" },
            severity: { enum: ["critical", "major", "minor", "info"] },
            category: { type: "string" },
            confidence: { enum: ["high", "medium", "low"] },
            location: { type: "object" },
            source_text: { type: ["string", "null"] },
            current_translation: { type: ["string", "null"] },
            proposed_change: { type: ["string", "null"] },
            english_back_translation: { type: ["string", "null"] },
            rationale: { type: "string" },
            cross_file_consistency: { type: ["object", "null"] },
            application_mode: { enum: ["tracked_change", "comment", "highlight", "cell_change", "pdf_annotation"] },
            color_hex: { type: ["string", "null"] },
          },
        },
      },
      items_considered_not_flagged: {
        type: "array",
        items: {
          type: "object",
          required: ["description", "reason"],
          properties: {
            file_id: { type: ["string", "null"] },
            description: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      overall_flags: { type: "array" },
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { job_id, user_message } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);

    const { data: job } = await tr(sb)
      .from("review_jobs")
      .select("id, status, review_round, round_color_hex")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);

    // Build messages from conversation_turns history
    const { data: turns } = await tr(sb)
      .from("conversation_turns")
      .select("role, content_json, turn_index")
      .eq("job_id", job_id)
      .order("turn_index");

    const messages: ClaudeMessage[] = (turns ?? [])
      .filter((t) => ["user", "assistant", "tool_result"].includes(t.role))
      .map((t) => ({
        role: t.role === "assistant" ? "assistant" : "user",
        content: t.content_json as ClaudeMessage["content"],
      }));

    // Build the file manifest for the new user message
    const { data: pairs } = await tr(sb).from("file_pairs").select("id, label").eq("job_id", job_id);
    const { data: files } = await tr(sb).from("job_files").select("id, pair_id, role, original_filename, verified, expected_marker, actual_marker").eq("job_id", job_id);

    const manifestText = [
      `Round ${job.review_round} review. Round colour: ${job.round_color_hex ?? "(unset)"}.`,
      "File pairs:",
      ...(pairs ?? []).map((p) => `  - Pair ${p.label} (id=${p.id})`),
      "Files:",
      ...(files ?? []).map((f) => `  - [${f.role}] ${f.original_filename} (id=${f.id}, pair=${f.pair_id ?? "-"}, verified=${f.verified})`),
      "",
      user_message ?? "Produce findings on every target file against its paired source per the locked methodology.",
    ].join("\n");

    messages.push({ role: "user", content: manifestText });

    // Build system prompt server-side (RPC lives in tr.* schema)
    const { data: systemPrompt } = await (sb as unknown as { schema: (s: string) => { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> } }).schema("tr").rpc("build_system_prompt", { p_job_id: job_id });
    const sysText = typeof systemPrompt === "string" ? systemPrompt : "(system prompt unavailable)";

    const startedAt = Date.now();
    let result = await callClaude({
      system: sysText,
      messages,
      tools: [FINDINGS_TOOL],
      tool_choice: { type: "tool", name: "emit_findings" },
      model: "claude-opus-4-7",
      max_tokens: 8192,
    });
    let latency_ms = Date.now() - startedAt;
    let outcome = result.ok ? "success" : "fatal_error";

    // Single retry on schema violation
    if (result.ok && !result.tool_input) {
      const retryStart = Date.now();
      result = await callClaude({
        system: sysText,
        messages: [...messages, { role: "user", content: "Your previous response did not include an emit_findings tool call. Emit a single emit_findings tool call now with the structured schema." }],
        tools: [FINDINGS_TOOL],
        tool_choice: { type: "tool", name: "emit_findings" },
        model: "claude-opus-4-7",
        max_tokens: 8192,
        temperature: 0,
      });
      latency_ms = Date.now() - retryStart;
      outcome = result.tool_input ? "retry_succeeded" : "schema_violation";
    }

    const callId = await writeClaudeCallRow(sb, {
      job_id,
      call_kind: "review",
      model: "claude-opus-4-7",
      prompt_version: PROMPT_VERSION,
      system_prompt: sysText,
      request_payload: { messages },
      result,
      latency_ms,
      outcome,
      error_text: result.error ?? null,
      created_by: actor.id,
    });

    if (!result.ok || !result.tool_input) {
      return json({ error: result.error ?? "claude call produced no structured output", outcome }, 502);
    }

    // Append turns
    const nextTurnIndex = (turns?.length ?? 0);
    await tr(sb).from("conversation_turns").insert([
      {
        job_id,
        turn_index: nextTurnIndex,
        role: "user",
        content_json: manifestText,
        claude_call_id: callId,
        model: "claude-opus-4-7",
        prompt_version: PROMPT_VERSION,
      },
      {
        job_id,
        turn_index: nextTurnIndex + 1,
        role: "assistant",
        content_json: result.raw,
        claude_call_id: callId,
        model: "claude-opus-4-7",
        prompt_version: PROMPT_VERSION,
        input_tokens: result.usage?.input_tokens ?? null,
        output_tokens: result.usage?.output_tokens ?? null,
        cache_read_input_tokens: result.usage?.cache_read_input_tokens ?? null,
        cache_creation_input_tokens: result.usage?.cache_creation_input_tokens ?? null,
      },
    ]);

    // Persist findings
    const toolInput = result.tool_input as {
      file_verifications: Array<Record<string, unknown>>;
      findings: Array<Record<string, unknown>>;
      items_considered_not_flagged: Array<Record<string, unknown>>;
    };

    let findingsCount = 0;
    for (const f of toolInput.findings ?? []) {
      const findingNumber = await (sb as unknown as { schema: (s: string) => { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: number | null }> } }).schema("tr").rpc("next_finding_number", { p_job_id: job_id, p_round: job.review_round });
      const n = (findingNumber.data ?? 1);
      const insertRes = await tr(sb).from("findings").insert({
        job_id,
        claude_call_id: callId,
        pair_id: f.pair_id ?? null,
        file_id: f.file_id ?? null,
        finding_number: n,
        round: job.review_round,
        severity: f.severity,
        category: f.category ?? "other",
        confidence: f.confidence,
        location_jsonb: f.location ?? {},
        source_text: f.source_text ?? null,
        current_translation: f.current_translation ?? null,
        proposed_change: f.proposed_change ?? null,
        english_back_translation: f.english_back_translation ?? null,
        rationale: f.rationale,
        cross_file_consistency_jsonb: f.cross_file_consistency ?? null,
        application_mode: f.application_mode,
        color_hex: f.color_hex ?? null,
        application_status: "pending",
      });
      if (!insertRes.error) findingsCount++;
    }

    for (const it of toolInput.items_considered_not_flagged ?? []) {
      await tr(sb).from("items_considered_not_flagged").insert({
        job_id,
        claude_call_id: callId,
        file_id: it.file_id ?? null,
        description: it.description,
        reason: it.reason,
      });
    }

    if (job.status === "in_review") {
      await tr(sb).from("review_jobs").update({ status: "findings_pending_human_review" }).eq("id", job_id);
    }

    await writeAudit(sb, {
      job_id,
      action: "claude_call_made",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: { claude_call_id: callId, kind: "review", findings_added: findingsCount, outcome },
    });

    return json({
      call_id: callId,
      outcome,
      findings_count: findingsCount,
      items_considered_not_flagged_count: (toolInput.items_considered_not_flagged ?? []).length,
    }, 201);
  } catch (err) {
    console.error("[tr-review] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
