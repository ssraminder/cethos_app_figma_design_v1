// ============================================================================
// tr-get-signed-url — mints a 1-hour signed URL for a file in tr-review-jobs
// (or a linked file in its source bucket).
//
// Input: { file_id } — refers to tr.job_files.id
// Output: { url, expires_at }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, tr } from "../_shared/tr.ts";

const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { file_id } = await req.json();
    if (!file_id) return json({ error: "file_id required" }, 400);

    const sb = serviceClient();
    const { data: file } = await tr(sb)
      .from("job_files")
      .select("id, storage_bucket, storage_path, original_filename")
      .eq("id", file_id)
      .maybeSingle();
    if (!file) return json({ error: "file not found" }, 404);

    const { data: signed, error } = await sb.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, SIGNED_TTL_SECONDS, {
        download: file.original_filename,
      });
    if (error || !signed) return json({ error: error?.message ?? "sign failed" }, 500);

    return json({
      url: signed.signedUrl,
      expires_at: new Date(Date.now() + SIGNED_TTL_SECONDS * 1000).toISOString(),
      filename: file.original_filename,
    });
  } catch (err) {
    console.error("[tr-get-signed-url] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
