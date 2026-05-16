// ============================================================================
// tr-create-job — creates a tr.review_jobs row + initial audit_log entry.
//
// Input: {
//   job_kind: 'translation_review'|'qm_certified',
//   project_id?, customer_id?, pm_contact?, client_name?,
//   source_language_id, target_language_id,           // required
//   methodology_template_code,                        // looked up
//   review_round?: int (default 1),
//   round_color_hex?: string,                         // defaults from tr.round_colors
//   deliverable_format_spec?: object,
//   cert_type?: 'regulated'|'internal_qa'|'both',
//   target_authority?: string,
//   title?: string, notes?: string
// }
// Output: { job_id, status }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const required = ["job_kind", "source_language_id", "target_language_id", "methodology_template_code"];
    for (const k of required) {
      if (!body[k]) return json({ error: `${k} required` }, 400);
    }

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);

    // Resolve methodology template by code
    const { data: tmpl, error: tmplErr } = await tr(sb)
      .from("methodology_templates")
      .select("id, code, active")
      .eq("code", body.methodology_template_code)
      .maybeSingle();
    if (tmplErr || !tmpl) return json({ error: "methodology_template not found" }, 404);
    if (!tmpl.active) return json({ error: "methodology_template inactive" }, 400);

    // Resolve default round color if missing
    let round_color_hex = body.round_color_hex as string | undefined;
    const review_round = Number(body.review_round ?? 1);
    if (!round_color_hex) {
      const { data: rc } = await tr(sb)
        .from("round_colors")
        .select("color_hex")
        .eq("round", review_round)
        .maybeSingle();
      round_color_hex = rc?.color_hex ?? "#000000";
    }

    // Validate languages exist
    const { data: srcLang } = await sb
      .from("languages")
      .select("id, code")
      .eq("id", body.source_language_id)
      .maybeSingle();
    const { data: tgtLang } = await sb
      .from("languages")
      .select("id, code")
      .eq("id", body.target_language_id)
      .maybeSingle();
    if (!srcLang || !tgtLang) {
      return json({ error: "source_language_id or target_language_id invalid" }, 400);
    }

    const insertPayload: Record<string, unknown> = {
      job_kind: body.job_kind,
      project_id: body.project_id ?? null,
      customer_id: body.customer_id ?? null,
      pm_contact: body.pm_contact ?? null,
      client_name: body.client_name ?? null,
      source_language_id: body.source_language_id,
      target_language_id: body.target_language_id,
      methodology_template_id: tmpl.id,
      review_round,
      round_color_hex,
      deliverable_format_spec: body.deliverable_format_spec ?? {},
      cert_type: body.cert_type ?? null,
      target_authority: body.target_authority ?? null,
      title: body.title ?? null,
      notes: body.notes ?? null,
      created_by: actor.id,
      updated_by: actor.id,
    };

    const { data: job, error: insertErr } = await tr(sb)
      .from("review_jobs")
      .insert(insertPayload)
      .select("id, status")
      .single();
    if (insertErr || !job) {
      console.error("[tr-create-job] insert error:", insertErr);
      return json({ error: insertErr?.message ?? "insert failed" }, 500);
    }

    await writeAudit(sb, {
      job_id: job.id,
      action: "job_created",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: {
        job_kind: body.job_kind,
        project_id: body.project_id,
        customer_id: body.customer_id,
        source_language: srcLang.code,
        target_language: tgtLang.code,
        methodology: tmpl.code,
        round: review_round,
      },
    });

    return json({ job_id: job.id, status: job.status }, 201);
  } catch (err) {
    console.error("[tr-create-job] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
