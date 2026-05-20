// ============================================================================
// tr-vendor-finding-respond — translator accepts or rejects a specific finding
// via the share-link token. LQA-style: acceptance MUST come with a new file
// version (the corrected .docx etc.), rejection MUST come with a reason.
//
// Input (JSON):
//   - decision='accepted':
//       { token, finding_id, decision: 'accepted',
//         file: { filename, mime_type, data_base64 }, note? }
//   - decision='rejected':
//       { token, finding_id, decision: 'rejected', reason }
//
// Output: { finding_id, decision, comment_id, file_id?, storage_path? }
//
// All actions also post a thread comment so the reviewer sees the response
// chronologically alongside other vendor messages.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, writeAudit, tr, sha256Hex, slug } from "../_shared/tr.ts";
import { resolveToken, touchToken } from "../_shared/tr-token.ts";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["application/", "text/", "image/"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const token = body.token as string;
    const finding_id = body.finding_id as string;
    const decision = body.decision as string;
    if (!token || !finding_id || !decision) {
      return json({ error: "token, finding_id, decision required" }, 400);
    }
    if (!["accepted", "rejected"].includes(decision)) {
      return json({ error: "decision must be 'accepted' or 'rejected'" }, 400);
    }

    const sb = serviceClient();
    const tok = await resolveToken(sb, token);
    if (!tok.ok) return json({ error: tok.reason }, tok.status);

    // Verify the finding belongs to this job.
    const { data: finding } = await tr(sb)
      .from("findings")
      .select(
        "id, job_id, finding_number, vendor_decision, source_text, current_translation, proposed_change, rationale",
      )
      .eq("id", finding_id)
      .eq("job_id", tok.data.job_id)
      .maybeSingle();
    if (!finding) return json({ error: "finding not found for this share token" }, 404);

    // Build a human-readable header used in both the audit + the comment.
    const headerLines: string[] = [
      `Finding #${finding.finding_number} — ${decision === "accepted" ? "Accepted" : "Declined"} by translator`,
    ];

    if (decision === "accepted") {
      const file = body.file as { filename?: string; mime_type?: string; data_base64?: string } | undefined;
      if (!file || !file.filename || !file.data_base64) {
        return json({ error: "Accepting a finding requires uploading the corrected file." }, 400);
      }

      // Decode + validate.
      const cleaned = String(file.data_base64).replace(/^data:[^;]+;base64,/, "");
      const binStr = atob(cleaned);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      if (bytes.length === 0) return json({ error: "empty file" }, 400);
      if (bytes.length > MAX_BYTES) {
        return json({ error: `file too large (${bytes.length} bytes; max ${MAX_BYTES})` }, 413);
      }
      const mime = file.mime_type || "application/octet-stream";
      if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
        return json({ error: `mime type not allowed: ${mime}` }, 415);
      }

      // Versioned storage path (mirrors tr-vendor-upload-new-version).
      const { data: existingTargets } = await tr(sb)
        .from("job_files")
        .select("id")
        .eq("job_id", tok.data.job_id)
        .eq("role", "target");
      const nextVer = ((existingTargets?.length as number | undefined) ?? 0) + 1;
      const safeName = slug(String(file.filename));
      const storage_bucket = "tr-review-jobs";
      const storage_path = `${tok.data.job_id}/vendor-upload/v${nextVer}-${Date.now()}-${safeName}`;
      const sha = await sha256Hex(bytes);

      const { error: uploadErr } = await sb.storage
        .from(storage_bucket)
        .upload(storage_path, bytes, { contentType: mime, upsert: false });
      if (uploadErr) return json({ error: `storage upload failed: ${uploadErr.message}` }, 500);

      const { data: fileRow, error: fileErr } = await tr(sb)
        .from("job_files")
        .insert({
          job_id: tok.data.job_id,
          role: "target",
          category: "vendor_revision",
          source_kind: "uploaded",
          storage_bucket,
          storage_path,
          original_filename: String(file.filename),
          mime_type: mime,
          bytes: bytes.length,
          sha256: sha,
          created_by: null,
        })
        .select("id")
        .single();
      if (fileErr || !fileRow) {
        try { await sb.storage.from(storage_bucket).remove([storage_path]); } catch { /* swallow */ }
        return json({ error: fileErr?.message ?? "job_files insert failed" }, 500);
      }

      // Stamp the finding.
      const { error: updateErr } = await tr(sb)
        .from("findings")
        .update({
          vendor_decision: "accepted",
          vendor_decision_reason: (body.note as string | undefined)?.trim() || null,
          vendor_decision_at: new Date().toISOString(),
          vendor_decision_via_token_id: tok.data.token_id,
          vendor_decision_by_email: tok.data.recipient_email,
          vendor_uploaded_file_id: fileRow.id,
        })
        .eq("id", finding_id);
      if (updateErr) return json({ error: updateErr.message }, 500);

      // Thread comment so the reviewer sees the response chronologically.
      const commentLines = [...headerLines];
      if (finding.source_text) commentLines.push(`Source: ${finding.source_text}`);
      if (finding.current_translation) commentLines.push(`Was: ${finding.current_translation}`);
      if (body.note) commentLines.push("", `Note: ${String(body.note).trim()}`);
      commentLines.push("", `New version uploaded: ${file.filename}`);
      const { data: commentRow } = await tr(sb)
        .from("job_comments")
        .insert({
          job_id: tok.data.job_id,
          author_type: "vendor",
          author_name: tok.data.recipient_name ?? tok.data.recipient_email,
          author_email: tok.data.recipient_email,
          body: commentLines.join("\n"),
          kind: "file_replacement",
          files_jsonb: [{ file_id: fileRow.id, original_filename: file.filename, storage_path }],
          via_token_id: tok.data.token_id,
        })
        .select("id")
        .single();

      await touchToken(sb, tok.data.token_id);
      await writeAudit(sb, {
        job_id: tok.data.job_id,
        action: "vendor_finding_accepted",
        actor_id: null,
        actor_email: tok.data.recipient_email,
        payload: {
          finding_id,
          finding_number: finding.finding_number,
          file_id: fileRow.id,
          comment_id: commentRow?.id ?? null,
          token_id: tok.data.token_id,
          bytes: bytes.length,
          sha256: sha,
        },
      });

      return json({
        finding_id,
        decision: "accepted",
        comment_id: commentRow?.id ?? null,
        file_id: fileRow.id,
        storage_path,
      }, 201);
    }

    // decision === 'rejected'
    const reason = (body.reason as string | undefined)?.trim();
    if (!reason) return json({ error: "A reason is required when declining a finding." }, 400);
    if (reason.length > 4000) return json({ error: "Reason too long (max 4000 chars)" }, 413);

    const { error: updateErr } = await tr(sb)
      .from("findings")
      .update({
        vendor_decision: "rejected",
        vendor_decision_reason: reason,
        vendor_decision_at: new Date().toISOString(),
        vendor_decision_via_token_id: tok.data.token_id,
        vendor_decision_by_email: tok.data.recipient_email,
        vendor_uploaded_file_id: null,
      })
      .eq("id", finding_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    const commentLines = [...headerLines];
    if (finding.source_text) commentLines.push(`Source: ${finding.source_text}`);
    if (finding.current_translation) commentLines.push(`Currently: ${finding.current_translation}`);
    if (finding.proposed_change) commentLines.push(`Proposed: ${finding.proposed_change}`);
    commentLines.push("", `Reason: ${reason}`);
    const { data: commentRow } = await tr(sb)
      .from("job_comments")
      .insert({
        job_id: tok.data.job_id,
        author_type: "vendor",
        author_name: tok.data.recipient_name ?? tok.data.recipient_email,
        author_email: tok.data.recipient_email,
        body: commentLines.join("\n"),
        kind: "comment",
        via_token_id: tok.data.token_id,
      })
      .select("id")
      .single();

    await touchToken(sb, tok.data.token_id);
    await writeAudit(sb, {
      job_id: tok.data.job_id,
      action: "vendor_finding_rejected",
      actor_id: null,
      actor_email: tok.data.recipient_email,
      payload: {
        finding_id,
        finding_number: finding.finding_number,
        reason,
        comment_id: commentRow?.id ?? null,
        token_id: tok.data.token_id,
      },
    });

    return json({
      finding_id,
      decision: "rejected",
      comment_id: commentRow?.id ?? null,
    }, 201);
  } catch (err) {
    console.error("[tr-vendor-finding-respond] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
