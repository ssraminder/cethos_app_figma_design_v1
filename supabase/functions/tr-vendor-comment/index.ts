// ============================================================================
// tr-vendor-comment — public, token-authenticated. Posts a comment on a TR
// review job as the token's recipient (typically the translator).
//
// Input:  { token, body }
// Output: { comment_id, created_at }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, writeAudit, tr } from "../_shared/tr.ts";
import { resolveToken, touchToken } from "../_shared/tr-token.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { token, body } = await req.json();
    const text = (body as string | undefined)?.trim();
    if (!text) return json({ error: "body required" }, 400);
    if (text.length > 8000) return json({ error: "body too long" }, 413);

    const sb = serviceClient();
    const tok = await resolveToken(sb, token);
    if (!tok.ok) return json({ error: tok.reason }, tok.status);

    const { data: row, error: insertErr } = await tr(sb)
      .from("job_comments")
      .insert({
        job_id: tok.data.job_id,
        author_type: "vendor",
        author_id: null,
        author_name: tok.data.recipient_name ?? tok.data.recipient_email,
        author_email: tok.data.recipient_email,
        body: text,
        kind: "comment",
        via_token_id: tok.data.token_id,
      })
      .select("id, created_at")
      .single();
    if (insertErr || !row) return json({ error: insertErr?.message ?? "insert failed" }, 500);

    await touchToken(sb, tok.data.token_id);
    await writeAudit(sb, {
      job_id: tok.data.job_id,
      action: "vendor_comment_added",
      actor_id: null,
      actor_email: tok.data.recipient_email,
      payload: { comment_id: row.id, token_id: tok.data.token_id, recipient_kind: tok.data.recipient_kind },
    });

    return json({ comment_id: row.id, created_at: row.created_at }, 201);
  } catch (err) {
    console.error("[tr-vendor-comment] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
