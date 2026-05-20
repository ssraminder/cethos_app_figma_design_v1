// ============================================================================
// tr-add-comment — staff posts a comment on a TR review job. The same edge
// function handles status notes and close notes (kind param). For vendor /
// token-authored comments see tr-vendor-comment.
//
// Input: { job_id, body, kind?, files_jsonb? }
// Output: { comment_id }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const job_id = body.job_id as string;
    const text = (body.body as string | undefined)?.trim();
    if (!job_id || !text) return json({ error: "job_id and body required" }, 400);
    const kind = (body.kind as string) || "comment";
    if (!["comment", "status_note", "close_note", "file_replacement"].includes(kind)) {
      return json({ error: `unsupported kind: ${kind}` }, 400);
    }

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);
    if (!actor.id) return json({ error: "authenticated session required" }, 401);

    const { data: staff } = await sb
      .from("staff_users")
      .select("id, full_name, email")
      .eq("auth_user_id", actor.id)
      .maybeSingle();
    if (!staff) return json({ error: "staff record not found" }, 403);

    const { data: row, error: insertErr } = await tr(sb)
      .from("job_comments")
      .insert({
        job_id,
        author_type: "staff",
        author_id: staff.id,
        author_name: staff.full_name ?? staff.email,
        author_email: staff.email,
        body: text,
        kind,
        files_jsonb: body.files_jsonb ?? [],
      })
      .select("id")
      .single();
    if (insertErr || !row) return json({ error: insertErr?.message ?? "insert failed" }, 500);

    await writeAudit(sb, {
      job_id,
      action: "comment_added",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: { comment_id: row.id, kind, has_files: (body.files_jsonb ?? []).length > 0 },
    });

    return json({ comment_id: row.id }, 201);
  } catch (err) {
    console.error("[tr-add-comment] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
