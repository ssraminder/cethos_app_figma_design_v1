// ============================================================================
// tr-upload-file — accepts a base64 file payload, stores in tr-review-jobs
// bucket, inserts tr.job_files with source_kind='uploaded'.
//
// Input (multipart/form-data not used; everything via JSON to keep cors simple):
// {
//   job_id, role, pair_id?, category?, custom_label?,
//   filename, mime_type, expected_marker?,
//   data_base64  // raw file bytes, base64-encoded
// }
// Output: { file_id, storage_path, sha256, bytes }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr, sha256Hex, slug } from "../_shared/tr.ts";
import { decode as b64decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const BUCKET = "tr-review-jobs";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    for (const k of ["job_id", "role", "filename", "data_base64"]) {
      if (!body[k]) return json({ error: `${k} required` }, 400);
    }

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);

    // Validate job + (if source/target) pair belonging to the job
    const { data: job } = await tr(sb).from("review_jobs").select("id, status").eq("id", body.job_id).maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);
    if (["source", "target"].includes(body.role) && !body.pair_id) {
      return json({ error: "pair_id required for source/target roles" }, 400);
    }
    if (body.pair_id) {
      const { data: pair } = await tr(sb)
        .from("file_pairs")
        .select("id, job_id")
        .eq("id", body.pair_id)
        .eq("job_id", body.job_id)
        .maybeSingle();
      if (!pair) return json({ error: "pair_id does not belong to this job" }, 400);
    }

    const bytes = b64decode(body.data_base64);
    const sha = await sha256Hex(bytes);
    const fileId = crypto.randomUUID();
    const ext = (body.filename.split(".").pop() ?? "bin").toLowerCase();
    const baseSlug = slug(body.filename.replace(/\.[^.]+$/, ""));
    const path = `${body.job_id}/${body.role}/${fileId}-${baseSlug}.${ext}`;

    // Upload to storage
    const uploadRes = await sb.storage.from(BUCKET).upload(path, bytes, {
      contentType: body.mime_type || "application/octet-stream",
      upsert: false,
    });
    if (uploadRes.error) {
      console.error("[tr-upload-file] storage upload error:", uploadRes.error);
      return json({ error: uploadRes.error.message }, 500);
    }

    // Insert manifest row
    const { data: row, error: insertErr } = await tr(sb)
      .from("job_files")
      .insert({
        id: fileId,
        job_id: body.job_id,
        pair_id: body.pair_id ?? null,
        role: body.role,
        category: body.category ?? null,
        custom_label: body.custom_label ?? null,
        source_kind: "uploaded",
        storage_bucket: BUCKET,
        storage_path: path,
        original_filename: body.filename,
        mime_type: body.mime_type ?? null,
        bytes: bytes.length,
        sha256: sha,
        expected_marker: body.expected_marker ?? null,
        created_by: actor.id,
      })
      .select("id")
      .single();
    if (insertErr || !row) {
      // Best-effort cleanup of the uploaded object
      await sb.storage.from(BUCKET).remove([path]);
      console.error("[tr-upload-file] insert error:", insertErr);
      return json({ error: insertErr?.message ?? "insert failed" }, 500);
    }

    await writeAudit(sb, {
      job_id: body.job_id,
      action: "file_added",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: {
        file_id: fileId,
        role: body.role,
        filename: body.filename,
        sha256: sha,
        bytes: bytes.length,
        source_kind: "uploaded",
      },
    });

    return json({ file_id: fileId, storage_path: path, sha256: sha, bytes: bytes.length }, 201);
  } catch (err) {
    console.error("[tr-upload-file] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
