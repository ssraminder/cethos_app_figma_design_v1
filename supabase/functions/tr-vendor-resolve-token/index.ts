// ============================================================================
// tr-vendor-resolve-token — public, no Supabase auth required. The translator's
// browser POSTs the token from /tr/share/:token URL; we return a minimal job
// summary + comments + the current target file's name/path (read-only data).
//
// All write operations on the share use separate token-auth edge functions
// (tr-vendor-comment, tr-vendor-upload-new-version).
//
// Input:  { token }
// Output: { token_id, job: {...}, comments: [...], target_file: {...} | null,
//           source_files: [...], reference_files: [...] }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, tr } from "../_shared/tr.ts";
import { resolveToken, touchToken } from "../_shared/tr-token.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { token } = await req.json();
    const sb = serviceClient();
    const tok = await resolveToken(sb, token);
    if (!tok.ok) return json({ error: tok.reason }, tok.status);

    const { data: job } = await tr(sb)
      .from("review_jobs")
      .select("id, title, client_name, job_kind, status, source_language_id, target_language_id, closed_at, close_outcome")
      .eq("id", tok.data.job_id)
      .maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);

    const [{ data: comments }, { data: files }] = await Promise.all([
      tr(sb)
        .from("job_comments")
        .select("id, author_type, author_name, body, kind, files_jsonb, created_at")
        .eq("job_id", tok.data.job_id)
        .order("created_at", { ascending: true }),
      tr(sb)
        .from("job_files")
        .select("id, role, original_filename, storage_bucket, storage_path, mime_type, bytes, pair_id, created_at")
        .eq("job_id", tok.data.job_id)
        .order("created_at", { ascending: true }),
    ]);

    const allFiles = (files ?? []) as Array<{ id: string; role: string; original_filename: string; storage_bucket: string; storage_path: string; mime_type: string | null; bytes: number | null; pair_id: string | null; created_at: string }>;
    // Target = most recent uploaded/linked target. Vendor will replace this.
    const targets = allFiles.filter((f) => f.role === "target").sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const sources = allFiles.filter((f) => f.role === "source");
    const references = allFiles.filter((f) => f.role === "reference");

    // Resolve language codes for display.
    const langIds = [job.source_language_id, job.target_language_id].filter(Boolean) as string[];
    const { data: langs } = await sb.from("languages").select("id, code, name").in("id", langIds);
    const langMap = new Map((langs ?? []).map((l: any) => [l.id, l]));

    await touchToken(sb, tok.data.token_id);

    return json({
      token_id: tok.data.token_id,
      recipient: {
        email: tok.data.recipient_email,
        name: tok.data.recipient_name,
        kind: tok.data.recipient_kind,
      },
      job: {
        id: job.id,
        title: job.title,
        client_name: job.client_name,
        job_kind: job.job_kind,
        status: job.status,
        closed_at: job.closed_at,
        close_outcome: job.close_outcome,
        source_language: langMap.get(job.source_language_id),
        target_language: langMap.get(job.target_language_id),
      },
      comments: (comments ?? []).map((c: any) => ({
        id: c.id,
        author_type: c.author_type,
        author_name: c.author_name,
        body: c.body,
        kind: c.kind,
        files_jsonb: c.files_jsonb ?? [],
        created_at: c.created_at,
      })),
      target_file: targets[0]
        ? {
            id: targets[0].id,
            original_filename: targets[0].original_filename,
            mime_type: targets[0].mime_type,
            bytes: targets[0].bytes,
          }
        : null,
      source_files: sources.map((s) => ({ id: s.id, original_filename: s.original_filename })),
      reference_files: references.map((r) => ({ id: r.id, original_filename: r.original_filename })),
    });
  } catch (err) {
    console.error("[tr-vendor-resolve-token] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
