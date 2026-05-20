// ============================================================================
// tr-vendor-share-create — staff creates a tokenized share link for a
// translator (or other recipient) to view the QM job, read comments, post
// replies, and upload a new version of the target file. Emails the link
// via Brevo and logs to notification_log.
//
// Input: { job_id, recipient_email, recipient_name?, recipient_kind?,
//          expires_in_days?, message? }
// Output: { token_id, token, share_url, expires_at }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";

const ADMIN_PORTAL_URL = Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const esc = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const job_id = body.job_id as string;
    const recipient_email = (body.recipient_email as string | undefined)?.trim().toLowerCase();
    const recipient_name = (body.recipient_name as string | undefined)?.trim() || null;
    const recipient_kind = (body.recipient_kind as string | undefined) || "vendor";
    const message = (body.message as string | undefined)?.trim() || null;
    const expires_in_days = Math.max(1, Math.min(90, Number(body.expires_in_days ?? 30)));
    // Optional CCs — accept array of strings or comma-separated string.
    const ccRaw = body.cc_emails;
    const ccCandidates: string[] = Array.isArray(ccRaw)
      ? ccRaw
      : typeof ccRaw === "string"
        ? ccRaw.split(/[,;\s]+/)
        : [];
    const cc_emails = Array.from(
      new Set(
        ccCandidates
          .map((s) => String(s || "").trim().toLowerCase())
          .filter((s) => s && s !== recipient_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
      ),
    );
    if (!job_id || !recipient_email) return json({ error: "job_id and recipient_email required" }, 400);

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);
    if (!actor.id) return json({ error: "authenticated session required" }, 401);

    const { data: staff } = await sb
      .from("staff_users")
      .select("id, full_name, email")
      .eq("auth_user_id", actor.id)
      .maybeSingle();
    if (!staff) return json({ error: "staff record not found" }, 403);

    const { data: job } = await tr(sb)
      .from("review_jobs")
      .select("id, title, client_name, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);

    const token = randomToken();
    const expires_at = new Date(Date.now() + expires_in_days * 86400 * 1000).toISOString();

    const { data: row, error: insertErr } = await tr(sb)
      .from("job_share_tokens")
      .insert({
        job_id,
        token,
        recipient_email,
        recipient_name,
        recipient_kind,
        expires_at,
        created_by: staff.id,
        created_by_name: staff.full_name ?? staff.email,
      })
      .select("id")
      .single();
    if (insertErr || !row) return json({ error: insertErr?.message ?? "token insert failed" }, 500);

    const share_url = `${ADMIN_PORTAL_URL}/tr/share/${token}`;
    const jobLabel = job.title || job.client_name || `QM job ${job_id.slice(0, 8)}`;

    // Best-effort email send. Audit + log regardless of outcome.
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    let brevoMsgId: string | null = null;
    let emailError: string | null = null;

    if (BREVO_API_KEY) {
      const subject = `Translation review: ${jobLabel}`;
      const messageBlock = message
        ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;">${esc(message)}</div>`
        : "";
      const htmlContent = `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:20px 24px;background:#6d28d9;color:#ffffff;">
        <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
        <div style="font-size:13px;opacity:0.9;margin-top:2px;">Translation review available for your input</div>
      </td></tr>
      <tr><td style="padding:24px;color:#111827;">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.5;">Hello ${esc(recipient_name || recipient_email)},</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${esc(staff.full_name ?? "Cethos")} has shared a translation review with you for <strong>${esc(jobLabel)}</strong>. You can read the reviewer's comments, reply, and upload a new version of the file using the link below.</p>
        ${messageBlock}
        <p style="margin:24px 0 0;text-align:center;">
          <a href="${esc(share_url)}" style="display:inline-block;padding:10px 20px;background:#6d28d9;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Open review</a>
        </p>
        <p style="margin:16px 0 0;font-size:11px;color:#6b7280;text-align:center;">Link expires in ${expires_in_days} day${expires_in_days === 1 ? "" : "s"}.</p>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
        You received this because a Cethos reviewer shared a QM job with you. If you didn't expect it, you can ignore the email.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim();

      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            to: [{ email: recipient_email, name: recipient_name || recipient_email }],
            ...(cc_emails.length > 0 ? { cc: cc_emails.map((e) => ({ email: e })) } : {}),
            sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
            replyTo: { email: staff.email ?? "ops@cethos.com", name: staff.full_name ?? "Cethos Ops" },
            subject,
            htmlContent,
            tags: ["tr-vendor-share", `job-${job_id}`],
          }),
        });
        const result = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          emailStatus = "failed";
          emailError = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 300)}`;
        } else {
          emailStatus = "sent";
          brevoMsgId = (result as any)?.messageId ?? null;
        }
      } catch (e: any) {
        emailStatus = "failed";
        emailError = e?.message || String(e);
      }
    }

    // Mirror the vendor-assignment pattern: log to public.notification_log.
    try {
      await sb.from("notification_log").insert({
        event_type: "tr_vendor_share",
        recipient_type: recipient_kind === "customer" ? "customer" : "vendor",
        recipient_email,
        recipient_name,
        order_id: null,
        step_id: null,
        subject: `Translation review: ${jobLabel}`,
        status: emailStatus === "sent" ? "sent" : "failed",
        error_message: emailError,
        metadata: {
          job_id,
          token_id: row.id,
          expires_at,
          brevo_message_id: brevoMsgId,
          cc_emails,
          via: "tr-vendor-share-create",
        },
      });
    } catch (e: any) {
      console.error("notification_log insert failed:", e?.message || e);
    }

    await writeAudit(sb, {
      job_id,
      action: "vendor_share_created",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: {
        token_id: row.id,
        recipient_email,
        recipient_kind,
        cc_emails,
        expires_at,
        email_status: emailStatus,
      },
    });

    return json({ token_id: row.id, token, share_url, expires_at, email_status: emailStatus, cc_emails }, 201);
  } catch (err) {
    console.error("[tr-vendor-share-create] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
