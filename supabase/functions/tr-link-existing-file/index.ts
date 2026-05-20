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
        // quote_files actually has: original_filename, mime_type, file_size,
        // storage_path. No `filename` or `storage_bucket` columns. Quote-file
        // assets all live in the public "quote-files" bucket.
        const qfId = body.link_ref.quote_file_id;
        if (!qfId) return json({ error: "link_ref.quote_file_id required" }, 400);
        const { data: qf } = await sb
          .from("quote_files")
          .select("id, original_filename, mime_type, file_size, storage_path")
          .eq("id", qfId)
          .maybeSingle();
        if (!qf) return json({ error: "quote_file not found" }, 404);
        insert.linked_quote_file_id = qfId;
        storage_bucket = "quote-files";
        storage_path = qf.storage_path;
        original_filename = qf.original_filename;
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
        // step_deliveries actually has: file_paths (TEXT[]) only — no per-row
        // filename/storage_path/mime_type/storage_bucket. Workflow deliverables
        // live in the "quote-files" bucket (see staff-deliver-step which
        // uploads to that bucket under "workflows/<order_id>/<step_id>/v..."
        // paths).
        //
        // Caller MUST specify which path to link (a delivery can contain
        // multiple files). We accept:
        //   link_ref.storage_path  — preferred, exact match
        //   link_ref.file_index    — fallback, index into file_paths array
        const { step_id, deliverable_id } = body.link_ref;
        const requestedPath: string | null = body.link_ref.storage_path ?? null;
        const fileIndex: number | null =
          typeof body.link_ref.file_index === "number"
            ? body.link_ref.file_index
            : null;

        // Look up by deliverable_id when provided; otherwise fall back to
        // the latest delivery for step_id.
        let del: { id: string; step_id: string; file_paths: string[] | null } | null = null;
        if (deliverable_id) {
          const { data } = await sb
            .from("step_deliveries")
            .select("id, step_id, file_paths")
            .eq("id", deliverable_id)
            .maybeSingle();
          del = data as typeof del;
        } else if (step_id) {
          const { data } = await sb
            .from("step_deliveries")
            .select("id, step_id, file_paths")
            .eq("step_id", step_id)
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle();
          del = data as typeof del;
        } else if (requestedPath) {
          // Caller has no delivery id but did supply the storage path —
          // try to find the delivery row that contains it for audit linkage.
          const { data } = await sb
            .from("step_deliveries")
            .select("id, step_id, file_paths")
            .contains("file_paths", [requestedPath])
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle();
          del = data as typeof del;
        }

        if (!del) return json({ error: "deliverable not found" }, 404);

        const paths = Array.isArray(del.file_paths) ? del.file_paths : [];
        let chosen: string | null = null;
        if (requestedPath && paths.includes(requestedPath)) {
          chosen = requestedPath;
        } else if (fileIndex != null && paths[fileIndex]) {
          chosen = paths[fileIndex];
        } else if (paths.length === 1) {
          chosen = paths[0];
        } else if (requestedPath) {
          // Caller gave an exact path but it isn't in this delivery row's
          // array. Trust the caller — TR is referencing by storage_path,
          // and we already verified the delivery row exists. This lets us
          // recover when delivery_id was passed but the row predates a
          // file_paths update.
          chosen = requestedPath;
        }

        if (!chosen) {
          return json({
            error:
              "Deliverable has multiple files; pass link_ref.storage_path or link_ref.file_index to pick one.",
            available: paths,
          }, 400);
        }

        // Lookup order_id from the step so callers don't have to pass it.
        let order_id: string | null = body.link_ref.order_id ?? null;
        if (!order_id) {
          const { data: stepRow } = await sb
            .from("order_workflow_steps")
            .select("order_id, workflow_id, order_workflows!workflow_id(order_id)")
            .eq("id", del.step_id)
            .maybeSingle();
          order_id =
            (stepRow as any)?.order_id ??
            (stepRow as any)?.order_workflows?.order_id ??
            null;
        }

        insert.linked_order_id = order_id;
        insert.linked_step_id = del.step_id;
        insert.linked_deliverable_id = del.id;
        storage_bucket = "quote-files";
        storage_path = chosen;
        original_filename = chosen.split("/").pop() ?? "deliverable";
        mime_type = null;
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
