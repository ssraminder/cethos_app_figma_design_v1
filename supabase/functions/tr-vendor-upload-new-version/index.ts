// ============================================================================
// tr-vendor-upload-new-version — public, token-auth. Translator uploads a
// revised target file. Stored in the tr-review-jobs bucket alongside the
// other job files, registered as a new role='target' job_file row, and a
// `file_replacement` comment is posted so the thread reflects the action.
//
// Input (JSON):  { token, filename, mime_type, data_base64, note? }
// Output:        { file_id, comment_id, storage_path }
//
// Limits: 100 MB (bucket cap). MIME allowlist mirrors tr-upload-file.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, writeAudit, tr, sha256Hex, slug } from "../_shared/tr.ts";
import { resolveToken, touchToken } from "../_shared/tr-token.ts";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = [
  "application/",
  "text/",
  "image/",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const { token, filename, mime_type, data_base64, note } = body;
    if (!token) return json({ error: "token required" }, 400);
    if (!filename || !data_base64) return json({ error: "filename and data_base64 required" }, 400);

    const sb = serviceClient();
    const tok = await resolveToken(sb, token);
    if (!tok.ok) return json({ error: tok.reason }, tok.status);

    // Decode base64
    const cleaned = String(data_base64).replace(/^data:[^;]+;base64,/, "");
    const binStr = atob(cleaned);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    if (bytes.length === 0) return json({ error: "empty file" }, 400);
    if (bytes.length > MAX_BYTES) return json({ error: `file too large (${bytes.length} bytes; max ${MAX_BYTES})` }, 413);

    const mime = (mime_type as string | undefined) || "application/octet-stream";
    if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
      return json({ error: `mime type not allowed: ${mime}` }, 415);
    }

    // Determine next version index for naming.
    const { data: existingTargets } = await tr(sb)
      .from("job_files")
      .select("id")
      .eq("job_id", tok.data.job_id)
      .eq("role", "target");
    const nextVer = ((existingTargets?.length as number | undefined) ?? 0) + 1;

    const safeName = slug(String(filename));
    const storage_bucket = "tr-review-jobs";
    const storage_path = `${tok.data.job_id}/vendor-upload/v${nextVer}-${Date.now()}-${safeName}`;
    const sha = await sha256Hex(bytes);

    const { error: uploadErr } = await sb.storage
      .from(storage_bucket)
      .upload(storage_path, bytes, { contentType: mime, upsert: false });
    if (uploadErr) {
      console.error("[tr-vendor-upload-new-version] storage upload:", uploadErr);
      return json({ error: `storage upload failed: ${uploadErr.message}` }, 500);
    }

    // Insert job_files row as the new target. (We don't tear down the prior
    // target — comparing revisions is part of the QM thread.)
    const { data: fileRow, error: fileErr } = await tr(sb)
      .from("job_files")
      .insert({
        job_id: tok.data.job_id,
        role: "target",
        category: "vendor_revision",
        source_kind: "uploaded",
        storage_bucket,
        storage_path,
        original_filename: String(filename),
        mime_type: mime,
        bytes: bytes.length,
        sha256: sha,
        created_by: null,
      })
      .select("id")
      .single();
    if (fileErr || !fileRow) {
      // Clean the orphaned object so we don't accumulate dangling uploads.
      try { await sb.storage.from(storage_bucket).remove([storage_path]); } catch { /* swallow */ }
      return json({ error: fileErr?.message ?? "job_files insert failed" }, 500);
    }

    // System comment so the thread records the upload.
    const commentBody = note && String(note).trim().length > 0
      ? `Uploaded new version: ${filename}\n\n${String(note).trim()}`
      : `Uploaded new version: ${filename}`;
    const { data: commentRow } = await tr(sb)
      .from("job_comments")
      .insert({
        job_id: tok.data.job_id,
        author_type: "vendor",
        author_name: tok.data.recipient_name ?? tok.data.recipient_email,
        author_email: tok.data.recipient_email,
        body: commentBody,
        kind: "file_replacement",
        files_jsonb: [{ file_id: fileRow.id, original_filename: filename, storage_path }],
        via_token_id: tok.data.token_id,
      })
      .select("id")
      .single();

    await touchToken(sb, tok.data.token_id);
    await writeAudit(sb, {
      job_id: tok.data.job_id,
      action: "vendor_uploaded_new_version",
      actor_id: null,
      actor_email: tok.data.recipient_email,
      payload: {
        file_id: fileRow.id,
        comment_id: commentRow?.id ?? null,
        storage_path,
        bytes: bytes.length,
        sha256: sha,
        token_id: tok.data.token_id,
      },
    });

    return json({ file_id: fileRow.id, comment_id: commentRow?.id ?? null, storage_path }, 201);
  } catch (err) {
    console.error("[tr-vendor-upload-new-version] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
