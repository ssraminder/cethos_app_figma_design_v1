// ============================================================================
// tr-link-existing-file — inserts a tr.job_files row referencing an existing
// file in another bucket (quote_files / project_assets / order deliverables).
// No copy — references storage_bucket + storage_path in place.
//
// Input: {
//   job_id, role, pair_id?, category?, custom_label?, expected_marker?,
//   source_kind: 'linked_quote_file'|'linked_project_asset'|'linked_order_deliverable',
//   link_ref: { quote_file_id?, project_id?, asset_kind?, order_id?, step_id?, deliverable_id? }
// }
// Output: { file_id, storage_path, sha256? }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    for (const k of ["job_id", "role", "source_kind", "link_ref"]) {
      if (!body[k]) return json({ error: `${k} required` }, 400);
    }
    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);

    let storage_bucket = "";
    let storage_path = "";
    let original_filename = "";
    let mime_type: string | null = null;
    let bytes: number | null = null;
    const insert: Record<string, unknown> = {
      job_id: body.job_id,
      role: body.role,
      pair_id: body.pair_id ?? null,
      category: body.category ?? null,
      custom_label: body.custom_label ?? null,
      expected_marker: body.expected_marker ?? null,
      source_kind: body.source_kind,
      created_by: actor.id,
    };

    switch (body.source_kind) {
      case "linked_quote_file": {
        const qfId = body.link_ref.quote_file_id;
        if (!qfId) return json({ error: "link_ref.quote_file_id required" }, 400);
        const { data: qf } = await sb
          .from("quote_files")
          .select("id, filename, mime_type, file_size, storage_path, storage_bucket")
          .eq("id", qfId)
          .maybeSingle();
        if (!qf) return json({ error: "quote_file not found" }, 404);
        insert.linked_quote_file_id = qfId;
        storage_bucket = qf.storage_bucket ?? "quote-files";
        storage_path = qf.storage_path;
        original_filename = qf.filename;
        mime_type = qf.mime_type ?? null;
        bytes = qf.file_size ?? null;
        break;
      }
      case "linked_project_asset": {
        const { project_id, asset_kind } = body.link_ref;
        if (!project_id || !asset_kind) {
          return json({ error: "link_ref.project_id and asset_kind required" }, 400);
        }
        const { data: proj } = await sb
          .from("internal_projects")
          .select("id, glossary_storage_path, style_guide_storage_path")
          .eq("id", project_id)
          .maybeSingle();
        if (!proj) return json({ error: "project not found" }, 404);
        const path = asset_kind === "glossary"
          ? proj.glossary_storage_path
          : asset_kind === "style_guide"
          ? proj.style_guide_storage_path
          : null;
        if (!path) return json({ error: `project has no ${asset_kind}` }, 404);
        insert.linked_project_id = project_id;
        insert.linked_project_asset_kind = asset_kind;
        storage_bucket = "project-assets";
        storage_path = path;
        original_filename = path.split("/").pop() ?? asset_kind;
        break;
      }
      case "linked_order_deliverable": {
        const { order_id, step_id, deliverable_id } = body.link_ref;
        if (!order_id || !deliverable_id) {
          return json({ error: "link_ref.order_id and deliverable_id required" }, 400);
        }
        const { data: del } = await sb
          .from("step_deliveries")
          .select("id, step_id, filename, storage_path, mime_type, storage_bucket")
          .eq("id", deliverable_id)
          .maybeSingle();
        if (!del) return json({ error: "deliverable not found" }, 404);
        insert.linked_order_id = order_id;
        insert.linked_step_id = step_id ?? del.step_id;
        insert.linked_deliverable_id = deliverable_id;
        storage_bucket = del.storage_bucket ?? "step-deliveries";
        storage_path = del.storage_path;
        original_filename = del.filename;
        mime_type = del.mime_type ?? null;
        break;
      }
      default:
        return json({ error: `unsupported source_kind ${body.source_kind}` }, 400);
    }

    insert.storage_bucket = storage_bucket;
    insert.storage_path = storage_path;
    insert.original_filename = original_filename;
    insert.mime_type = mime_type;
    insert.bytes = bytes;

    const { data: row, error: insertErr } = await tr(sb)
      .from("job_files")
      .insert(insert)
      .select("id")
      .single();
    if (insertErr || !row) {
      console.error("[tr-link-existing-file] insert error:", insertErr);
      return json({ error: insertErr?.message ?? "insert failed" }, 500);
    }

    await writeAudit(sb, {
      job_id: body.job_id,
      action: "file_added",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: {
        file_id: row.id,
        role: body.role,
        filename: original_filename,
        source_kind: body.source_kind,
        link_ref: body.link_ref,
      },
    });

    return json({ file_id: row.id, storage_path, storage_bucket }, 201);
  } catch (err) {
    console.error("[tr-link-existing-file] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
